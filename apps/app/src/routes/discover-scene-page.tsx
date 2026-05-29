import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { msg } from "@lingui/macro";
import {
  BookOpen,
  Building2,
  Coffee,
  Dumbbell,
  FlaskConical,
  GraduationCap,
  Home,
  Landmark,
  Laptop,
  Library,
  LoaderCircle,
  MapPin,
  Moon,
  NotebookPen,
  Plane,
  Theater,
  Trees,
  UserPlus,
  Utensils,
} from "lucide-react";
import {
  acceptFriendRequest,
  declineFriendRequest,
  isApiRequestError,
  triggerSceneFriendRequest,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  Button,
  InlineNotice,
  cn,
} from "@yinjie/ui";

type MessageDescriptor = Parameters<ReturnType<typeof useRuntimeTranslator>>[0];
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
import { translateAppErrorCode } from "../lib/error-translate";
import { invalidateFriendDisplayQueries } from "../features/contacts/invalidate-friend-display";
import { parseMobileDiscoverToolRouteState } from "../features/discover/mobile-discover-tool-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { MOBILE_EXPLORE_HOME_PATH } from "../lib/explore-home";
import { isDesktopOnlyPath, navigateBackOrFallback } from "../lib/history-back";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

type Scene = {
  id: string;
  label: MessageDescriptor;
  icon: typeof Coffee;
};

const scenes: Scene[] = [
  { id: "coffee_shop", label: msg`咖啡馆`, icon: Coffee },
  { id: "gym", label: msg`健身房`, icon: Dumbbell },
  { id: "library", label: msg`图书馆`, icon: BookOpen },
  { id: "park", label: msg`公园`, icon: Trees },
  { id: "classroom", label: msg`教室`, icon: GraduationCap },
  { id: "lab", label: msg`实验室`, icon: FlaskConical },
  { id: "office", label: msg`办公室`, icon: Building2 },
  { id: "coworking", label: msg`联合办公空间`, icon: Laptop },
  { id: "study_room", label: msg`自习室`, icon: NotebookPen },
  { id: "restaurant", label: msg`餐厅`, icon: Utensils },
  { id: "museum", label: msg`博物馆`, icon: Landmark },
  { id: "bookstore", label: msg`书店`, icon: Library },
  { id: "travel", label: msg`旅途`, icon: Plane },
  { id: "night_walk", label: msg`夜晚的街道`, icon: Moon },
  { id: "theater", label: msg`剧场`, icon: Theater },
  { id: "home", label: msg`居家场景`, icon: Home },
];

const COOLDOWN_MS = 2500;

type EncounterRecord = {
  scene: string;
  characterName: string;
  characterId: string;
  ts: number;
};

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function encountersStorageKey(baseUrl: string | undefined) {
  // i18n-ignore-line: storage key, not user-facing
  return `discover-scene-encounters:${baseUrl ?? "default"}:${todayKey()}`;
}

function loadEncounters(baseUrl: string | undefined): EncounterRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(encountersStorageKey(baseUrl));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EncounterRecord[]) : [];
  } catch {
    return [];
  }
}

// 走查 R1：以前 onSuccess 里先 saveEncounter()（内部 load 一次写一次）再
// setEncounterCount(loadEncounters().length)（再 load 一次），总共 3 次
// JSON.parse 50 条记录 + 1 次写 + 1 次 read。返回新长度让调用端直接用，
// 省两次读，并把"已经存在该 characterId / 静默失败"分支也能给出准确长度。
// 走查 R-new1：以前 catch 兜底返回 0；但 catch 多半是 setItem quota 超了，
// loadEncounters 已经拿到了 existing。调用端拿 0 后 setEncounterCount(0)，
// hero 立刻从"今日已偶遇 N 人"塌成"挑一个常去的地方..."，即使本次相遇
// 服务端已成功落库、且之前的 N 条 encounter 在 localStorage 里还在。
// 改成 catch 时返回 existing.length（保持 UI 跟实际持久化状态一致）。
function saveEncounter(
  baseUrl: string | undefined,
  record: EncounterRecord,
): number {
  if (typeof window === "undefined") return 0;
  const existing = loadEncounters(baseUrl);
  if (existing.some((e) => e.characterId === record.characterId)) {
    return existing.length;
  }
  const next = [...existing, record].slice(-50);
  try {
    window.localStorage.setItem(
      encountersStorageKey(baseUrl),
      JSON.stringify(next),
    );
    return next.length;
  } catch {
    // setItem 失败（quota / private mode 等），写不进去就保持现有 length，
    // 别把 hero 计数倒回 0 让用户误以为今日还没相遇。
    return existing.length;
  }
}

export function DiscoverScenePage() {
  const t = useRuntimeTranslator();
  const isDesktopLayout = useDesktopLayout();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });

  useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    void navigate({
      to: "/tabs/discover",
      hash: hash || undefined,
      replace: true,
    });
  }, [hash, isDesktopLayout, navigate]);

  if (isDesktopLayout) {
    return (
      <RouteRedirectState
        title={t(msg`正在切换到桌面发现页`)}
        description={t(msg`桌面端的场景相遇入口已经收口到桌面发现，先回到主发现页。`)}
        loadingLabel={t(msg`正在切换到桌面发现页...`)}
      />
    );
  }

  return <MobileDiscoverScenePage />;
}

function MobileDiscoverScenePage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const hash = useRouterState({
    select: (state) => state.location.hash,
  });
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"info" | "success" | "warning">("info");
  // 匹配到人后的「待确认相遇」：此刻后端已建了一条 pending 好友申请，但是否
  // 加为好友交给用户在卡片上点「加为好友」/「跳过」就地决定（对齐摇一摇），
  // 不再跳去好友申请页。null = 当前没有待确认相遇。
  const [pendingEncounter, setPendingEncounter] = useState<{
    requestId: string;
    characterName: string;
    characterAvatar: string;
    greeting: string;
    matchSource: "scene" | "fallback";
    sceneLabel: string;
  } | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [encounterCount, setEncounterCount] = useState(
    () => loadEncounters(baseUrl).length,
  );

  const routeState = useMemo(
    () => parseMobileDiscoverToolRouteState(hash),
    [hash],
  );

  // 冷却倒计时刷新：display 只显示整秒（`Math.ceil((remain)/1000)`），所以 1Hz
  // 已经够。以前是 200ms 一跳，2.5s 冷却内白白 12 次 re-render，每次都会重排
  // 16 个 64px 按钮 grid + 重算 disabled / busy，毫无视觉收益。
  // 走查 R1：把第一跳对齐到剩余毫秒的"下一个秒边界"，避免 1s setInterval 跟
  // setCooldownUntil 那一刻偏移 ~999ms 让第一秒倒计时显示停留过久。
  useEffect(() => {
    const remain = cooldownUntil - Date.now();
    if (remain <= 0) {
      return;
    }
    const firstDelay = remain % 1000 || 1000;
    let intervalId = 0;
    const timeoutId = window.setTimeout(() => {
      setNow(Date.now());
      intervalId = window.setInterval(() => {
        const next = Date.now();
        setNow(next);
        if (next >= cooldownUntil) {
          window.clearInterval(intervalId);
        }
      }, 1000);
    }, firstDelay);
    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [cooldownUntil]);

  // 用户点「加为好友」= 就地通过这条 pending 好友申请（与好友申请页「通过」
  // 同口径：激活 friendship + 把开场白落进会话 + 刷新好友/会话/朋友圈缓存）。
  const acceptMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const result = await acceptFriendRequest(requestId, baseUrl);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-friend-requests", baseUrl],
        }),
        invalidateFriendDisplayQueries(queryClient, baseUrl),
      ]);
      return result;
    },
    onSuccess: () => {
      const characterName =
        pendingEncounter?.characterName?.trim() || t(msg`世界角色`);
      setPendingEncounter(null);
      setTone("success");
      setMessage(t(msg`${characterName} 已加入通讯录`));
    },
  });

  // 用户点「跳过」= 就地忽略这条申请（置 declined，不残留在好友申请收件箱）。
  const declineMutation = useMutation({
    mutationFn: async (requestId: string) => {
      await declineFriendRequest(requestId, baseUrl);
      await queryClient.invalidateQueries({
        queryKey: ["app-friend-requests", baseUrl],
      });
    },
    onMutate: () => {
      // 乐观清掉卡片：跳过是「不要这个人」，无论后端成功与否都不该再看到它。
      setPendingEncounter(null);
      setTone("info");
      setMessage(t(msg`已跳过这次相遇。`));
    },
  });

  const sceneMutation = useMutation({
    mutationFn: async (scene: string) => {
      // 走查 R2-Round2：把 mutate 触发那一刻的 baseUrl 一起带回 onSuccess，
      // 用来识别"AI 4-20s 等 greeting 期间用户切了 world"的脏 settle —
      // 否则旧 world 的好友申请会写到新 world 的 localStorage encounter 里、
      // 给新 world 上一个 2.5s 莫名冷却、并把 app-friend-requests 缓存按新
      // baseUrl 失效（实际上请求落在旧 baseUrl，新 world 缓存里没这条）。
      const capturedBaseUrl = baseUrl;
      const result = await triggerSceneFriendRequest({ scene }, baseUrl);
      return { ...result, scene, capturedBaseUrl };
    },
    // 走查 R2：点新场景时把上一轮的成功 / 提示 notice 立刻清掉。否则在
    // AI 出 greeting 那 4-20s 里，旧条目"X 在咖啡馆里注意到了你"还挂着，
    // 等下方"正在前往健身房…"按钮 spinner 一起出现，用户分不清新一次是
    // 真的在跑还是已经回来了；并且如果新这次后续 onError，错误条目会
    // 叠在旧成功条目之下，UI 一团乱。
    // 走查 R6：把 capturedBaseUrl 也通过 mutation context 带到 onError，跟
    // onSuccess 的 R2-Round2 守门对齐——否则 AI await 期间切 world，旧 world
    // 的 SOCIAL_SCENE_COOLDOWN 错误会在新 world 把 cooldownUntil 顶到
    // Date.now()+2.5s，让新 world 第一次就背着一条幽灵冷却 ban。
    onMutate: () => {
      setMessage(""); // i18n-ignore-line: clearing state
      setPendingEncounter(null);
      acceptMutation.reset();
      declineMutation.reset();
      return { capturedBaseUrl: baseUrl };
    },
    onError: (error, _scene, context) => {
      if (context?.capturedBaseUrl !== baseUrl) {
        // 走查 R6：旧 world 的错误已经跟当前这一屏没关系了，丢掉避免污染。
        return;
      }
      // 走查 R1-Round1：server 端 SOCIAL_SCENE_COOLDOWN（1.5s 间隔）和客户端
      // 2.5s cooldown 不对齐：服务端先于客户端给出 cooldown（用户跨设备 / 跨
      // 标签页 / 客户端时钟回拨），grid 不灰，用户继续点 → 每次都是 429。
      // 这里把客户端冷却条手动顶起来 2.5s，让用户看到倒计时而不是错误条循环。
      if (
        isApiRequestError(error) &&
        error.errorCode === "SOCIAL_SCENE_COOLDOWN"
      ) {
        setCooldownUntil(Date.now() + COOLDOWN_MS);
        setNow(Date.now());
      }
    },
    onSuccess: ({ request, matchSource, scene, capturedBaseUrl }) => {
      if (capturedBaseUrl !== baseUrl) {
        // 走查 R2-Round2：在 await 期间用户切了 world，settle 已经不属于当前
        // 这一屏的语义，全部丢弃。请求本身已经在旧 world 落库，登回旧 world
        // 的好友请求列表里仍会看到，不会丢数据。
        return;
      }
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      setNow(Date.now());

      const sceneEntry = scenes.find((item) => item.id === scene);
      const sceneLabel = sceneEntry ? t(sceneEntry.label) : scene;

      if (!request || matchSource === "none") {
        setTone("warning");
        setMessage(t(msg`${sceneLabel}里和别处都暂时没有新的相遇了。`));
        setPendingEncounter(null);
        return;
      }

      const greeting = request.greeting ?? t(msg`对你产生了兴趣。`);

      // 匹配到人：清掉提示文案，改为在当前页展示待确认卡片，等用户点
      // 「加为好友」/「跳过」就地处理（对齐摇一摇），不再跳好友申请页。
      setMessage(""); // i18n-ignore-line: clearing state
      setTone(matchSource === "fallback" ? "info" : "success");
      setPendingEncounter({
        requestId: request.id,
        characterName: request.characterName,
        characterAvatar: request.characterAvatar ?? "",
        greeting,
        matchSource,
        sceneLabel,
      });

      const nextCount = saveEncounter(baseUrl, {
        scene,
        characterName: request.characterName,
        characterId: request.characterId,
        ts: Date.now(),
      });
      setEncounterCount(nextCount);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
    },
  });

  useEffect(() => {
    setMessage(""); // i18n-ignore-line: clearing state
    setPendingEncounter(null);
    acceptMutation.reset();
    declineMutation.reset();
    setEncounterCount(loadEncounters(baseUrl).length);
    // 走查 R2：切 world 时也要把冷却清掉。前 world 设置的 cooldownUntil 跟新
    // world 没关系（服务端按 owner 维度独立限频），残留会让人无法立即试新 world。
    setCooldownUntil(0);
    // 走查 R2-Round2：切 world 时也把上一次 mutation 的 isError/error 残留
    // 一并 reset 掉。否则上一 world 因为 SOCIAL_SCENE_DAILY_LIMIT 弹的红条
    // 会一直跟到新 world，并且页面 onMount 后用户在新 world 第一次还没点
    // 就看到「今天的场景相遇次数已经用完」——非常误导。
    sceneMutation.reset();
  // sceneMutation 是 useMutation 返回的稳定对象，不放进依赖避免每次 mutate
  // 都 reset。仅 baseUrl 真正变更时执行清理。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  function navigateToRouteStateReturn() {
    if (
      !routeState.returnPath ||
      isDesktopOnlyPath(routeState.returnPath)
    ) {
      return false;
    }

    void navigate({
      to: routeState.returnPath,
      ...(routeState.returnHash ? { hash: routeState.returnHash } : {}),
    });
    return true;
  }

  const handleErrorNoticeBack = () => {
    if (navigateToRouteStateReturn()) {
      return;
    }

    void navigate({ to: MOBILE_EXPLORE_HOME_PATH });
  };

  const cooldownActive = cooldownUntil > now;
  const cooldownRemainSec = cooldownActive
    ? Math.max(1, Math.ceil((cooldownUntil - now) / 1000))
    : 0;
  // 走查 R1-Round1：DAILY_LIMIT 是 owner 级硬墙（30/天，跨 16 个场景共享），
  // 一旦撞墙再点任何按钮服务端都返回 429 不会再生成相遇。grid 必须整体灰掉，
  // 否则用户会把剩下 15 个按钮也戳一遍各扣一次 API（实测 4 个按钮全部 429），
  // server 端每次仍会跑 owner / count / cooldown 三条 DB 查询白白消耗。
  const dailyLimitHit =
    sceneMutation.isError &&
    isApiRequestError(sceneMutation.error) &&
    sceneMutation.error.errorCode === "SOCIAL_SCENE_DAILY_LIMIT";
  const disabled =
    sceneMutation.isPending || cooldownActive || dailyLimitHit;

  return (
    <MobileDiscoverToolShell
      title={t(msg`场景相遇`)}
      subtitle={t(msg`在熟悉的场景里偶遇世界居民`)}
      heroTitle={t(msg`选择一个地点`)}
      heroVisual={<MapPin size={28} />}
      heroDescription={
        encounterCount > 0
          ? t(msg`今日已偶遇 ${encounterCount} 人`)
          : t(msg`挑一个常去的地方，附近的居民会主动打招呼。`)
      }
      notice={
        message ? (
          <InlineNotice
            className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[length:var(--text-eyebrow)] leading-[1.35rem] shadow-none"
            tone={tone}
            // 走查 R1（移动端发现-场景相遇）：success / fallback / "暂时没有新相遇了"
            // 三种 notice 是异步 mutation 4-20s 后才 settle 的反馈，屏幕阅读器用户
            // 没法靠视觉感知；挂一个 role=status 让 AT 至少能 polite 朗读到。
            role="status"
            aria-live="polite"
          >
            {message}
          </InlineNotice>
        ) : null
      }
      onBack={() =>
        navigateBackOrFallback(
          () => {
            if (navigateToRouteStateReturn()) {
              return;
            }

            void navigate({ to: MOBILE_EXPLORE_HOME_PATH });
          },
          (routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
            ? routeState.returnPath
            : undefined) ?? MOBILE_EXPLORE_HOME_PATH,
        )
      }
    >
      {/*
        走查 R2-Round2：以前冷却倒计时贴在 button grid 下面，但 16 个 64px 高的
        按钮在 2 列 8 行布局下整组占 ~870px，加上顶上 hero + notice 200+px，
        冷却条整体落到 y≈1175，标准移动端 viewport (844) 看不见。用户点完按钮
        看到全 16 个按钮齐刷刷灰掉但找不到原因。把冷却条搬到 button grid 之上，
        紧跟 notice 后面，第一屏直接可见。
      */}
      {/*
        走查 R1-Round1：DAILY_LIMIT 命中后，整面 grid 灰掉，单独在头部贴一条
        "明天再来"的提示。下面 InlineNotice (danger) 已经写过同样意思 + 一个
        "回发现页"按钮；但灰掉的 grid 第一屏要先告诉用户"为什么灰"，否则
        2 列 8 行 870px 的灰按钮把 danger notice 推到屏幕外，用户只看到一大坨
        灰按钮一脸懵。比 cooldown 提示优先级更高（同时存在时只显示这条）。
      */}
      {/*
        走查 R1（移动端发现-场景相遇）：DAILY_LIMIT 是稳定文案，挂 role=status
        让屏幕阅读器朗读一次"今天用完"，否则反复点 disabled 按钮没反馈。
        走查 R4：cooldown banner 当时同款挂了 role=status aria-live=polite，但
        文案每秒都变（"稍等 3/2/1 秒再出发吧"）—— 在 2.5s 冷却里 AT 会被打断
        三次，spam。AT 在 cooldown 场景已经有兜底：
          a) 由 success/info 反馈触发的 cooldown：上面的 success notice 本身就是
             role=status，"X 在咖啡馆里注意到了你..." 已经朗读一遍；
          b) 由 SOCIAL_SCENE_COOLDOWN 错误触发的 cooldown：下面的错误条目是
             role=alert，"别走太急..." 已经 assertive 朗读。
        cooldown banner 本身只用来给 sighted 用户一个倒计时数字，不必再做 live
        region —— 撤掉 aria-live，AT 不再被秒级 spam。
      */}
      {dailyLimitHit ? (
        <div
          role="status"
          aria-live="polite"
          className="text-center text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]"
        >
          {t(msg`今天的场景相遇次数已经用完，明天再试试。`)}
        </div>
      ) : cooldownActive && !sceneMutation.isPending ? (
        <div
          aria-hidden="true"
          className="text-center text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]"
        >
          {t(msg`稍等 ${cooldownRemainSec} 秒再出发吧。`)}
        </div>
      ) : null}

      {pendingEncounter ? (
        // 待确认相遇卡片：匹配到人后在当前页展示对方信息，用户点「加为好友」
        // 才就地通过这条 pending 申请（入通讯录），点「跳过」就地忽略——对齐
        // [[discover-encounter-page]] 摇一摇的同意闸，不再跳去好友申请页。
        // role=status + aria-live=polite，让 SR 在 AI 跑完一刻读出结果。
        <section
          role="status"
          aria-live="polite"
          className="rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3.5 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)]/12 text-[length:var(--text-section)]">
              {pendingEncounter.characterAvatar.trim() || "🙂"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[length:var(--text-body)] font-semibold text-[color:var(--text-primary)]">
                {pendingEncounter.characterName.trim() || t(msg`世界角色`)}
              </div>
              <div className="mt-0.5 truncate text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                {pendingEncounter.matchSource === "fallback"
                  ? t(msg`不在${pendingEncounter.sceneLabel}，但顺路碰到了你`)
                  : t(msg`在${pendingEncounter.sceneLabel}里注意到了你`)}
              </div>
            </div>
          </div>

          {pendingEncounter.greeting.trim() ? (
            <div className="mt-2.5 whitespace-pre-line break-words rounded-[var(--radius-sm)] bg-[color:var(--surface-card-hover)] px-3 py-2 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
              {pendingEncounter.greeting}
            </div>
          ) : null}

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              disabled={acceptMutation.isPending || declineMutation.isPending}
              onClick={() => declineMutation.mutate(pendingEncounter.requestId)}
              variant="secondary"
              size="sm"
              className="h-9 min-w-[4rem] rounded-[var(--radius-sm)] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 text-[length:var(--text-caption)] shadow-none hover:bg-[color:var(--surface-card-hover)]"
            >
              {t(msg`跳过`)}
            </Button>
            <Button
              type="button"
              disabled={acceptMutation.isPending || declineMutation.isPending}
              aria-busy={acceptMutation.isPending || undefined}
              onClick={() => acceptMutation.mutate(pendingEncounter.requestId)}
              variant="primary"
              size="sm"
              className="h-9 min-w-[5.5rem] rounded-full bg-[color:var(--brand-primary)] px-3 text-[length:var(--text-caption)] text-[color:var(--text-on-brand)] shadow-none hover:bg-[color:var(--brand-primary)] [background-image:none]"
            >
              {acceptMutation.isPending ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <UserPlus size={14} />
              )}
              {acceptMutation.isPending ? t(msg`添加中...`) : t(msg`加为好友`)}
            </Button>
          </div>

          {acceptMutation.isError && acceptMutation.error instanceof Error ? (
            <div className="mt-2 rounded-[var(--radius-sm)] border border-[color:var(--border-danger)] bg-[color:var(--state-danger-bg)] px-2.5 py-1.5 text-[length:var(--text-eyebrow)] leading-4 text-[color:var(--state-danger-text)]">
              {(isApiRequestError(acceptMutation.error)
                ? translateAppErrorCode(acceptMutation.error)
                : null) ?? acceptMutation.error.message}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]">
        <div className="grid grid-cols-2 gap-0.5 bg-black/5 p-0.5">
          {scenes.map((scene) => {
            const Icon = scene.icon;
            const busy =
              sceneMutation.isPending && sceneMutation.variables === scene.id;

            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => sceneMutation.mutate(scene.id)}
                disabled={disabled}
                // 走查 R5：跟 [[discover-encounter-page]] 摇一摇按钮的 aria-busy
                // 收口一致——busy 的那个按钮挂 aria-busy=true 让 SR 朗读"忙碌"，
                // disabled 单独没法告诉 AT "正在干活"。AI 4-20s 期间只有一个
                // scene 是 busy，其余 15 个是普通 disabled。
                aria-busy={busy || undefined}
                className={cn(
                  "bg-[color:var(--surface-card)] px-4 py-4 text-left transition active:bg-[color:var(--bg-canvas)]",
                  disabled && !busy && "opacity-60",
                )}
              >
                {/*
                  走查 R2-Round1：scene 按钮 busy 时只有文字变成"正在前往咖啡馆..."，
                  绿色 Coffee/Gym 图标原样不动。但 AI greeting 端到端 4-20s（推理
                  + sanitize + DB 写入），中间用户在公网隧道 + 移动端经常以为页面
                  卡死，戳同一个按钮没反应又怀疑断网。对齐 [[shake]] 即
                  discover-encounter-page 的视觉：busy 时把场景图标替成 LoaderCircle
                  自旋，明确告诉用户"正在跑、不要乱点"。
                */}
                <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--brand-primary)]/12 text-[color:var(--brand-primary)]">
                  {busy ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <Icon size={18} />
                  )}
                </div>
                <div className="mt-3 text-[length:var(--text-base)] font-medium text-[color:var(--text-primary)]">
                  {busy
                    ? t(msg`正在前往${t(scene.label)}...`)
                    : t(scene.label)}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {sceneMutation.isError && sceneMutation.error instanceof Error ? (
        <InlineNotice
          className="rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[length:var(--text-eyebrow)] leading-[1.35rem] shadow-none"
          tone="danger"
          // 走查 R1（移动端发现-场景相遇）：错误条目是阻塞用户继续动作的硬反馈
          // （DAILY_LIMIT / INVALID / 网络异常），用 role=alert 让屏幕阅读器
          // 立即朗读，比 polite status 更紧迫，符合其它走查 R1-R6 的统一处理。
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-center justify-between gap-2">
            {/*
              走查 R5：以前直接显示 error.message，但 AppError 抛出来的
              SOCIAL_SCENE_COOLDOWN / SOCIAL_SCENE_DAILY_LIMIT 的 legacyMessage
              是硬编码中文。en-US 用户看到的就是一段中文。统一走 translateAppErrorCode
              命中已知 code → 本地化文案；命中不到才退到 message。
            */}
            <span className="min-w-0 flex-1">
              {(isApiRequestError(sceneMutation.error)
                ? translateAppErrorCode(sceneMutation.error)
                : null) ?? sceneMutation.error.message}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {/*
                走查 R6：DAILY_LIMIT 是"今天用完"的硬墙，立即重试只会再吃一次
                429 闪一下错误条目，明天再来才有意义；这一种情况不应出"重试"
                按钮，避免用户疯点。
                走查 R7：SOCIAL_SCENE_INVALID 是入参根本没被服务端识别（前端
                按钮 scene.id 跟服务端 SCENE_SYNONYMS 表不一致，或被中间件改写
                成奇怪字符串），立即重试只会再吃一次 400，没意义；同样隐藏重试。
                走查 R2：以前 COOLDOWN 也保留了"重试场景相遇"按钮，但服务端
                cooldown=1500ms 且按钮没接 disabled，用户在 2.5s 客户端 cooldown
                banner 期间疯点 retry 会循环吃 429 + onError 把 cooldownUntil
                顶到 Date.now()+2.5s，banner 永远清不掉变成 retry loop。COOLDOWN
                语义本身就是"等"，已经有顶上的倒计时 banner 驱动恢复，retry
                按钮在这里没意义还会反复扣 server 端 owner / count / cooldown
                三条 DB 查询，一并隐藏。
                其它错误（网络 / 服务异常 / AI 不可用）保留重试。
              */}
              {sceneMutation.variables &&
              !(
                isApiRequestError(sceneMutation.error) &&
                (sceneMutation.error.errorCode === "SOCIAL_SCENE_DAILY_LIMIT" ||
                  sceneMutation.error.errorCode === "SOCIAL_SCENE_INVALID" ||
                  sceneMutation.error.errorCode === "SOCIAL_SCENE_COOLDOWN")
              ) ? (
                <button
                  type="button"
                  onClick={() => sceneMutation.mutate(sceneMutation.variables)}
                  className="rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {t(msg`重试场景相遇`)}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleErrorNoticeBack}
                className="rounded-full border border-[color:var(--state-danger-bg)] bg-[color:var(--surface-card)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
              >
                {routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
                  ? t(msg`返回上一页`)
                  : t(msg`回发现页`)}
              </button>
            </div>
          </div>
        </InlineNotice>
      ) : null}
    </MobileDiscoverToolShell>
  );
}

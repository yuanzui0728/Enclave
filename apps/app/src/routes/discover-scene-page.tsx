import { useCallback, useEffect, useMemo, useState } from "react";
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
  Utensils,
} from "lucide-react";
import { isApiRequestError, triggerSceneFriendRequest } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  InlineNotice,
  cn,
} from "@yinjie/ui";

type MessageDescriptor = Parameters<ReturnType<typeof useRuntimeTranslator>>[0];
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
import { translateAppErrorCode } from "../lib/error-translate";
import { buildMobileFriendRequestsRouteHash } from "../features/contacts/mobile-friend-requests-route-state";
import { parseMobileDiscoverToolRouteState } from "../features/discover/mobile-discover-tool-route-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
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

function saveEncounter(baseUrl: string | undefined, record: EncounterRecord) {
  if (typeof window === "undefined") return;
  try {
    const existing = loadEncounters(baseUrl);
    if (existing.some((e) => e.characterId === record.characterId)) {
      return;
    }
    const next = [...existing, record].slice(-50);
    window.localStorage.setItem(
      encountersStorageKey(baseUrl),
      JSON.stringify(next),
    );
  } catch {
    // localStorage 不可用就静默吃掉
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
        description={t(msg`桌面端的场景相遇入口已经收口到桌面发现工作区，先回到主发现页。`)}
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
  const [lastRequestId, setLastRequestId] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [encounterCount, setEncounterCount] = useState(
    () => loadEncounters(baseUrl).length,
  );

  const routeState = useMemo(
    () => parseMobileDiscoverToolRouteState(hash),
    [hash],
  );

  // 冷却倒计时刷新：每 200ms 推一次 now，到点立刻清掉自己，避免空转。
  useEffect(() => {
    if (cooldownUntil <= Date.now()) {
      return;
    }
    const id = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= cooldownUntil) {
        window.clearInterval(id);
      }
    }, 200);
    return () => {
      window.clearInterval(id);
    };
  }, [cooldownUntil]);

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
    onMutate: () => {
      setMessage(""); // i18n-ignore-line: clearing state
      setLastRequestId(null);
    },
    onError: (error) => {
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
        setLastRequestId(null);
        return;
      }

      const greeting = request.greeting ?? t(msg`对你产生了兴趣。`);

      if (matchSource === "fallback") {
        setTone("info");
        setMessage(
          t(
            msg`${request.characterName} 不在${sceneLabel}，但顺路碰到了你：${greeting}`,
          ),
        );
      } else {
        setTone("success");
        setMessage(
          t(
            msg`${request.characterName} 在${sceneLabel}里注意到了你：${greeting}`,
          ),
        );
      }

      setLastRequestId(request.id);
      saveEncounter(baseUrl, {
        scene,
        characterName: request.characterName,
        characterId: request.characterId,
        ts: Date.now(),
      });
      setEncounterCount(loadEncounters(baseUrl).length);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
    },
  });

  useEffect(() => {
    setMessage(""); // i18n-ignore-line: clearing state
    setLastRequestId(null);
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

  const handleGoToRequests = useCallback(() => {
    const requestHash = buildMobileFriendRequestsRouteHash({
      returnPath: "/discover/scene",
    });
    void navigate({
      to: "/friend-requests",
      ...(requestHash ? { hash: requestHash } : {}),
    });
  }, [navigate]);

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

    void navigate({ to: "/tabs/discover" });
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
            className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
            tone={tone}
          >
            {lastRequestId ? (
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1">{message}</span>
                <button
                  type="button"
                  onClick={handleGoToRequests}
                  className="shrink-0 rounded-full border border-[rgba(7,193,96,0.24)] bg-white px-2 py-0.5 text-[10px] font-medium text-[#07c160]"
                >
                  {t(msg`去通过`)}
                </button>
              </div>
            ) : (
              message
            )}
          </InlineNotice>
        ) : null
      }
      onBack={() =>
        navigateBackOrFallback(
          () => {
            if (navigateToRouteStateReturn()) {
              return;
            }

            void navigate({ to: "/tabs/discover" });
          },
          (routeState.returnPath && !isDesktopOnlyPath(routeState.returnPath)
            ? routeState.returnPath
            : undefined) ?? "/tabs/discover",
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
      {dailyLimitHit ? (
        <div className="text-center text-[11px] text-[color:var(--text-secondary)]">
          {t(msg`今天的场景相遇次数已经用完，明天再试试。`)}
        </div>
      ) : cooldownActive && !sceneMutation.isPending ? (
        <div className="text-center text-[11px] text-[color:var(--text-secondary)]">
          {t(msg`稍等 ${cooldownRemainSec} 秒再出发吧。`)}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-[16px] border border-black/5 bg-white">
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
                className={cn(
                  "bg-white px-4 py-4 text-left transition active:bg-[#f5f5f5]",
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
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.12)] text-[#07c160]">
                  {busy ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <Icon size={18} />
                  )}
                </div>
                <div className="mt-3 text-[15px] font-medium text-[#111827]">
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
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="danger"
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
                其它错误（网络 / cooldown / 服务异常 / AI 不可用）保留重试。
              */}
              {sceneMutation.variables &&
              !(
                isApiRequestError(sceneMutation.error) &&
                (sceneMutation.error.errorCode === "SOCIAL_SCENE_DAILY_LIMIT" ||
                  sceneMutation.error.errorCode === "SOCIAL_SCENE_INVALID")
              ) ? (
                <button
                  type="button"
                  onClick={() => sceneMutation.mutate(sceneMutation.variables)}
                  className="rounded-full border border-[rgba(15,23,42,0.08)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--text-secondary)]"
                >
                  {t(msg`重试场景相遇`)}
                </button>
              ) : null}
              <button
                type="button"
                onClick={handleErrorNoticeBack}
                className="rounded-full border border-[rgba(220,38,38,0.14)] bg-white px-2 py-0.5 text-[10px] font-medium text-[color:var(--state-danger-text)]"
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

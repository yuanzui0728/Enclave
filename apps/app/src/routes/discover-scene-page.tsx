import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MapPin,
  Moon,
  NotebookPen,
  Plane,
  Theater,
  Trees,
  Utensils,
} from "lucide-react";
import { triggerSceneFriendRequest } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  InlineNotice,
  cn,
} from "@yinjie/ui";

type MessageDescriptor = Parameters<ReturnType<typeof useRuntimeTranslator>>[0];
import { MobileDiscoverToolShell } from "../components/mobile-discover-tool-shell";
import { RouteRedirectState } from "../components/route-redirect-state";
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
  const cooldownTimerRef = useRef<number | null>(null);

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
        if (cooldownTimerRef.current === id) {
          cooldownTimerRef.current = null;
        }
      }
    }, 200);
    cooldownTimerRef.current = id;
    return () => {
      window.clearInterval(id);
      if (cooldownTimerRef.current === id) {
        cooldownTimerRef.current = null;
      }
    };
  }, [cooldownUntil]);

  const sceneMutation = useMutation({
    mutationFn: async (scene: string) => {
      const result = await triggerSceneFriendRequest({ scene }, baseUrl);
      return { ...result, scene };
    },
    onSuccess: ({ request, matchSource, scene }) => {
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
  const disabled = sceneMutation.isPending || cooldownActive;

  return (
    <MobileDiscoverToolShell
      title={t(msg`场景相遇`)}
      heroTitle={t(msg`选择一个地点`)}
      heroVisual={<MapPin size={28} />}
      heroDescription={
        encounterCount > 0
          ? t(msg`今日已偶遇 ${encounterCount} 人`)
          : undefined
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
        navigateBackOrFallback(() => {
          if (navigateToRouteStateReturn()) {
            return;
          }

          void navigate({ to: "/tabs/discover" });
        })
      }
    >
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
                <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[rgba(7,193,96,0.12)] text-[#07c160]">
                  <Icon size={18} />
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

      {cooldownActive && !sceneMutation.isPending ? (
        <div className="text-center text-[11px] text-[color:var(--text-secondary)]">
          {t(msg`稍等 ${cooldownRemainSec} 秒再出发吧。`)}
        </div>
      ) : null}

      {sceneMutation.isError && sceneMutation.error instanceof Error ? (
        <InlineNotice
          className="rounded-[11px] px-2.5 py-1.5 text-[11px] leading-[1.35rem] shadow-none"
          tone="danger"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 flex-1">{sceneMutation.error.message}</span>
            <div className="flex shrink-0 items-center gap-1.5">
              {sceneMutation.variables ? (
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

import { useEffect, useState, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Clock3,
  CornerDownLeft,
  Mic,
  Search,
  Square,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@yinjie/ui";
import { useSpeechInput } from "../chat/use-speech-input";
import { useAppRuntimeConfig } from "../../runtime/runtime-config-store";
import { buildSearchRouteHash, type SearchRouteSource } from "./search-route-state";
import {
  hydrateSearchHistoryFromNative,
  loadSearchHistory,
  pushSearchHistory,
} from "./search-history";
import type { SearchHistoryItem } from "./search-types";

type UseDesktopSearchLauncherOptions = {
  keyword: string;
  source: SearchRouteSource;
};

type DesktopSearchDropdownPanelProps = {
  className?: string;
  history: SearchHistoryItem[];
  keyword: string;
  onKeywordChange: (keyword: string) => void;
  onOpenSearch: (keyword?: string) => void;
};

export function useDesktopSearchLauncher({
  keyword,
  source,
}: UseDesktopSearchLauncherOptions) {
  const navigate = useNavigate();
  const runtimeConfig = useAppRuntimeConfig();
  const nativeDesktopSearchHistory = runtimeConfig.appPlatform === "desktop";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState(() => loadSearchHistory());

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const syncSearchHistory = async () => {
      const nextHistory = nativeDesktopSearchHistory
        ? await hydrateSearchHistoryFromNative()
        : loadSearchHistory();

      if (cancelled) {
        return;
      }

      setHistory((current) =>
        JSON.stringify(current) === JSON.stringify(nextHistory)
          ? current
          : nextHistory,
      );
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsOpen(false);
    };
    const handleFocus = () => {
      void syncSearchHistory();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncSearchHistory();
    };

    void syncSearchHistory();

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isOpen, nativeDesktopSearchHistory]);

  function openSearch(nextKeyword = keyword) {
    const normalizedKeyword = nextKeyword.trim();

    if (normalizedKeyword) {
      setHistory(pushSearchHistory(normalizedKeyword));
    }

    setIsOpen(false);
    void navigate({
      to: "/tabs/search",
      hash: buildSearchRouteHash({
        category: "all",
        keyword: normalizedKeyword,
        source,
      }),
    });
  }

  return {
    containerRef,
    history,
    isOpen,
    openSearch,
    setIsOpen,
  };
}

export function DesktopSearchDropdownPanel({
  className,
  history,
  keyword,
  onKeywordChange,
  onOpenSearch,
}: DesktopSearchDropdownPanelProps) {
  const runtimeConfig = useAppRuntimeConfig();
  const trimmedKeyword = keyword.trim();
  const speech = useSpeechInput({
    baseUrl: runtimeConfig.apiBaseUrl,
    conversationId: "",
    enabled: true,
    mode: "dictation",
  });

  useEffect(() => {
    if (speech.status !== "ready" || !speech.canCommit) {
      return;
    }

    onKeywordChange(speech.commitToInput(keyword));
  }, [keyword, onKeywordChange, speech.canCommit, speech.commitToInput, speech.status]);

  const speechBusy =
    speech.status === "requesting-permission" || speech.status === "processing";
  const speechListening = speech.status === "listening";
  const speechButtonDisabled = speechBusy && !speechListening;

  return (
    <div
      className={cn(
        "absolute left-0 right-0 top-[calc(100%+0.45rem)] z-30 overflow-hidden rounded-[16px] border border-[color:var(--border-faint)] bg-white/98 p-2.5 shadow-[var(--shadow-overlay)] backdrop-blur-xl",
        className,
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
        <button
          type="button"
          onClick={() => onOpenSearch(keyword)}
          className="flex min-w-0 items-center gap-3 rounded-[12px] bg-[rgba(7,193,96,0.08)] px-3.5 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[rgba(7,193,96,0.13)]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white text-[color:var(--brand-primary)]">
            <Search size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[color:var(--text-primary)]">
              搜一搜
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
              {trimmedKeyword ? `搜索“${trimmedKeyword}”` : "打开全局搜索工作区"}
            </div>
          </div>
          <CornerDownLeft
            size={14}
            className="shrink-0 text-[color:var(--text-dim)]"
          />
        </button>

        <button
          type="button"
          disabled={speechButtonDisabled || !speech.supported}
          onClick={() => {
            if (speechListening) {
              speech.stop();
              return;
            }

            if (speech.status !== "idle") {
              speech.cancel();
            }
            void speech.start();
          }}
          className={cn(
            "flex items-center gap-2 rounded-[12px] border px-3 py-3 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
            speechListening
              ? "border-[rgba(225,29,72,0.24)] bg-[rgba(225,29,72,0.07)] text-[#be123c]"
              : "border-[color:var(--border-faint)] bg-[color:var(--surface-console)] text-[color:var(--text-primary)] hover:bg-white",
            speechButtonDisabled || !speech.supported
              ? "cursor-not-allowed opacity-60"
              : "",
          )}
          aria-label={speechListening ? "结束语音输入" : "开始语音输入"}
          title={!speech.supported ? "当前浏览器不支持语音输入" : undefined}
        >
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
              speechListening
                ? "bg-white text-[#be123c]"
                : "bg-white text-[color:var(--brand-primary)]",
            )}
          >
            {speech.status === "requesting-permission" ||
            speech.status === "processing" ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : speechListening ? (
              <Square size={14} fill="currentColor" />
            ) : (
              <Mic size={16} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {speechListening ? "结束输入" : "语音输入"}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[color:var(--text-muted)]">
              {speechListening
                ? "点击结束并写入搜索框"
                : "说出搜索内容"}
            </div>
          </div>
        </button>
      </div>

      {speech.status !== "idle" || speech.error ? (
        <div
          className={cn(
            "mt-2 rounded-[12px] px-3 py-2.5 text-xs leading-6",
            speech.error
              ? "bg-[rgba(225,29,72,0.08)] text-[#be123c]"
              : "bg-[color:var(--surface-console)] text-[color:var(--text-secondary)]",
          )}
        >
          {speech.error
            ? speech.error
            : speech.status === "requesting-permission"
              ? "正在请求麦克风权限..."
              : speech.status === "listening"
                ? "正在听你说，完成后再点一次“结束输入”。"
                : speech.status === "processing"
                  ? "正在整理语音内容..."
                  : speech.displayText
                    ? `识别结果：${speech.displayText}`
                    : "语音输入已完成。"}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-[color:var(--text-primary)]">
          历史搜索
        </span>
        <span className="text-[10px] text-[color:var(--text-dim)]">
          {history.length ? `最近 ${history.length} 条` : "暂无记录"}
        </span>
      </div>

      {history.length ? (
        <div className="mt-2 space-y-1.5">
          {history.map((item) => (
            <button
              key={item.keyword}
              type="button"
              onClick={() => onOpenSearch(item.keyword)}
              className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-sm text-[color:var(--text-secondary)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:bg-[color:var(--surface-console)] hover:text-[color:var(--text-primary)]"
            >
              <Clock3
                size={14}
                className="shrink-0 text-[color:var(--text-dim)]"
              />
              <span className="truncate">{item.keyword}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-[12px] bg-[color:var(--surface-console)] px-3 py-3 text-xs leading-6 text-[color:var(--text-muted)]">
          进入搜一搜并完成一次搜索后，历史关键词会出现在这里。
        </div>
      )}
    </div>
  );
}

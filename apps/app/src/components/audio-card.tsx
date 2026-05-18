import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { Pause, Play } from "lucide-react";
import { cn } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { resolveAppMediaUrl } from "../lib/media-url";

type AudioCardProps = {
  url: string;
  posterUrl?: string;
  title?: string;
  durationMs?: number;
  variant?: "moment" | "feed";
  // 视频号桌面工作区把多张 slide 同时挂在 DOM 里；离开当前 slide 时把音频暂停 + 复位，
  // 否则下一张 slide 已经显示出来、上一张的音乐还在背景里继续放。undefined = 不做处理，
  // 兼容 moments 这类不在 snap-scroll 容器里的用法。
  isActive?: boolean;
};

const audioRegistry = new Set<HTMLAudioElement>();

function pauseOthers(active: HTMLAudioElement) {
  for (const audio of audioRegistry) {
    if (audio !== active && !audio.paused) {
      audio.pause();
    }
  }
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const total = Math.floor(value);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioCard({
  url,
  posterUrl,
  title,
  durationMs,
  variant = "moment",
  isActive,
}: AudioCardProps) {
  const t = useRuntimeTranslator();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number>(
    durationMs ? durationMs / 1000 : 0,
  );

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    audioRegistry.add(el);
    return () => {
      audioRegistry.delete(el);
      // 走查新一轮：朋友圈 audio_card 类型动态在以下场景下 AudioCard unmount —
      //   1) 屏蔽该角色 / 删除该 moment → 卡片被 filter 出 visibleMoments
      //   2) 切账户 / 离开页 → 整页 unmount
      // React 把 <audio> 从 DOM 摘掉后 Chromium / Firefox 不会自动 pause（webkit
      // 实测会），音轨会一直 loop 到刷新整页。和 51b8980a (ChannelAudioPictorial)
      // 同模式：unmount cleanup 主动 pause。
      if (!el.paused) {
        el.pause();
      }
    };
  }, []);

  // 仅当 isActive 明确为 false 时才介入：调用方主动声明"我这张 slide 已经不可见了"。
  // isActive===undefined 的旧用法（moments 等）行为不变。
  useEffect(() => {
    if (isActive !== false) return;
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused) el.pause();
    if (el.currentTime !== 0) el.currentTime = 0;
  }, [isActive]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setProgress(el.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    // 通过 pauseOthers 被外部暂停时，audio 元素状态变了但本组件 React 状态不会自动同步。
    // 监听 play/pause 让按钮图标跟着 audio 元素走。
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onLoaded);
    el.addEventListener("ended", onEnded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onLoaded);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, []);

  const handleToggle = (event: React.MouseEvent) => {
    event.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      pauseOthers(el);
      el.play().catch((err) => {
        console.warn("[audio-card] play() rejected:", err);
      });
    } else {
      el.pause();
    }
    // playing 状态由 onPlay/onPause 监听器更新，不在这里同步。
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    const el = audioRef.current;
    if (!el || !duration) return;
    const next = Number(event.target.value);
    el.currentTime = next;
    setProgress(next);
  };

  const cardSize = variant === "feed" ? "max-w-[360px]" : "max-w-[320px]";

  const resolvedAudioUrl = resolveAppMediaUrl(url);
  const resolvedPosterUrl = posterUrl ? resolveAppMediaUrl(posterUrl) : undefined;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-zinc-900/90 p-3 text-zinc-100 shadow-md",
        cardSize,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative h-16 w-16 flex-none overflow-hidden rounded-xl bg-zinc-800">
        {resolvedPosterUrl ? (
          <img
            src={resolvedPosterUrl}
            alt={title ?? "music cover"}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            ♫
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="truncate text-sm font-medium">
          {title ?? t(msg`音乐`)}
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={handleToggle}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
            aria-label={playing ? t(msg`暂停`) : t(msg`播放`)}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="ml-[2px] h-4 w-4" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(progress, duration || 0)}
            onChange={handleSeek}
            className="h-1 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/20 accent-white"
            disabled={!duration}
          />
          <span className="flex-none whitespace-nowrap text-right font-mono text-[11px] leading-none text-white/70">
            {formatSeconds(progress)}/{formatSeconds(duration)}
          </span>
        </div>
      </div>
      {/* preload="none"：feed 上一屏出现多张 audio_card（朋友圈一次拉 20 条，
          有 18 条 audio_card 时 metadata 探针就是 18 个 HTTP；Chromium / Safari 对
          短 mp3 还会把整文件抓回来）。我们已经从 moment 数据里拿到 durationMs，
          首屏不需要再去探 metadata。第一次 play 时再开始拉流。 */}
      <audio ref={audioRef} src={resolvedAudioUrl} preload="none" />
    </div>
  );
}

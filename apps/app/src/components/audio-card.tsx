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
      //
      // 走查移动端朋友圈/最新一轮 R2 (perf/mem)：仅 pause() 不够 —— controls 已经播过
      // 的 audio_card 把整段音轨 demux 后的 decoded PCM 缓冲（≈300KB / 60s）一直挂到
      // GC 才释放，WKWebView 下 GC 时机不可预测；用户在朋友圈连续刷过 N 张 audio_card
      // moment（每条都自动 mount + 用户拨过 progress 触发 decode），切账户 / 屏蔽 / 翻
      // 页让卡片陆续 unmount 后 decoded buffer 累积。和 wechat-moment-card 朗读 audio
      // cleanup (line 197-204) / MomentVideoViewerOverlay (moment-media-gallery line
      // 698-702) / readVideoMetadata cleanup 同模板：removeAttribute("src") + load()
      // 把 <audio> 切回空 media，立刻断音轨 + 释放 buffer，不依赖 GC 时机。
      if (!el.paused) {
        el.pause();
      }
      el.removeAttribute("src");
      el.load();
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

  // 走查 2026-05-19 第五轮 R6：AudioCard 的 64×64 封面 <img> 历来 eager + 无
  // onError —— channels workspace 一次性挂 20 张 audio slide 时 20 张封面全
  // 并发拉公网公网隧道（每张 10-50KB，累计 ~200KB-1MB 浪费首屏带宽），同时
  // 单张 cover 404（minimax 资源回收 / cloud-api 反代 401 边界）时浏览器原
  // 生 broken-image 占位糊在播放区里看着像"卡坏了"。同 BackgroundCoverImage
  // / ChannelFallbackImage / AvatarChip 已经用熟的 lazy + onError + decoding
  // 模板：isActive 明确为 true 时 eager（保证当前 slide 立刻可见）；其它情
  // 况（active=false / undefined）lazy 让浏览器按需拉取；onError 切换到 ♫
  // fallback；decoding=async 避免主线程同步解码大图。
  const [coverFailed, setCoverFailed] = useState(false);
  // posterUrl 换新（home refetch / 切角色 / 切 moment 等）时清 failed，给
  // 新 URL 一次尝试。同 BackgroundCoverImage 新会话 R3 修复。
  useEffect(() => {
    setCoverFailed(false);
  }, [resolvedPosterUrl]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-zinc-900/90 p-3 text-zinc-100 shadow-md",
        cardSize,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="relative h-16 w-16 flex-none overflow-hidden rounded-xl bg-zinc-800">
        {resolvedPosterUrl && !coverFailed ? (
          <img
            src={resolvedPosterUrl}
            alt={title ?? "music cover"}
            loading={isActive === true ? "eager" : "lazy"}
            decoding="async"
            onError={() => setCoverFailed(true)}
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
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[color:var(--surface-card)]/15 text-[color:var(--text-on-brand)] transition hover:bg-[color:var(--surface-card)]/25"
            aria-label={playing ? t(msg`暂停`) : t(msg`播放`)}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="ml-[2px] h-4 w-4" />
            )}
          </button>
          {/* 走查 2026-05-19 第十五轮 R1：seek slider 历来裸 <input type="range">，
              无 aria-label —— SR 用户 Tab 到这条 slider 只能听到 "slider, 5, min
              0, max 30"，不知道是音频进度还是其它什么的；更没 aria-valuetext，
              所以 0-300 这种秒数读出来也毫无语义（"5 of 30" 不带单位）。同
              卡顶部的 play/pause 按钮早就有 aria-label，这条 slider 一直漏。
              channels 视频号 audio slide 在 yuanzui0728 测试库占 80%+，盲用
              用户每打开一个音乐贴都摸不到进度条用途。
              修法：aria-label="音频进度"；aria-valuetext 用 formatSeconds 把秒
              数渲成 mm:ss 让 SR 念出 "0:05 / 0:30 共" 这种可读形式，对齐可视
              用户看到的 right-side 文本 "0:05/0:30"。 */}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(progress, duration || 0)}
            onChange={handleSeek}
            aria-label={t(msg`音频进度`)}
            aria-valuetext={
              duration
                ? `${formatSeconds(progress)} / ${formatSeconds(duration)}`
                : undefined
            }
            className="h-1 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-[color:var(--surface-card)]/20 accent-[color:var(--text-on-brand)]"
            disabled={!duration}
          />
          <span className="flex-none whitespace-nowrap text-right font-mono text-[length:var(--text-eyebrow)] leading-none text-[color:var(--text-on-brand)]/70">
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

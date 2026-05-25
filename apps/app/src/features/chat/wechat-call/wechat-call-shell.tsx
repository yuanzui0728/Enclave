import type { ReactNode } from "react";
import { AppPage, cn } from "@yinjie/ui";
import { resolveAppMediaUrl } from "../../../lib/media-url";

// 微信通话整屏外壳：近黑背景 + 可选模糊头像背景 + 暗 scrim + 安全区。
// 三个插槽 topBar / stage / controls 三屏共用；fullBleed（视频）下 stage 铺满、
// 顶栏与控制条浮在上层。children 用来挂 <audio> 和错误 toast。
type WeChatCallShellProps = {
  topBar?: ReactNode;
  stage: ReactNode;
  controls?: ReactNode;
  children?: ReactNode;
  /** 模糊放大的头像作背景（单聊语音） */
  backdropAvatar?: string;
  /** 视频通话：stage 铺满，顶栏/控制条浮层 */
  fullBleed?: boolean;
};

export function WeChatCallShell({
  topBar,
  stage,
  controls,
  children,
  backdropAvatar,
  fullBleed = false,
}: WeChatCallShellProps) {
  const backdrop =
    backdropAvatar && !fullBleed ? (
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <img
          src={resolveAppMediaUrl(backdropAvatar)}
          alt=""
          className="h-full w-full scale-125 object-cover blur-3xl saturate-150"
        />
        <div className="absolute inset-0 bg-[#0b0b0c]/82" />
      </div>
    ) : null;

  if (fullBleed) {
    return (
      <AppPage className="relative min-h-[100dvh] space-y-0 overflow-hidden bg-black px-0 py-0 text-white">
        <div className="absolute inset-0">{stage}</div>
        {children}
        {topBar ? (
          <div className="yj-safe-top yj-safe-left yj-safe-right absolute inset-x-0 top-0 z-20">
            {topBar}
          </div>
        ) : null}
        {controls ? (
          <div className="yj-safe-bottom absolute inset-x-0 bottom-0 z-20 pb-4">
            {controls}
          </div>
        ) : null}
      </AppPage>
    );
  }

  return (
    <AppPage className="relative flex min-h-[100dvh] flex-col space-y-0 overflow-hidden bg-[#0b0b0c] px-0 py-0 text-white">
      {backdrop}
      {children}
      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        {topBar ? (
          <div className="yj-safe-top yj-safe-left yj-safe-right">{topBar}</div>
        ) : null}
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          {stage}
        </div>
        {controls ? (
          <div className={cn("yj-safe-bottom pb-4")}>{controls}</div>
        ) : null}
      </div>
    </AppPage>
  );
}

import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

// 公网隧道 HTTP/1.1 + RTT ~760ms 下，路由切换的 lazy chunk 拉取 / loader 跑
// 数百毫秒内用户没任何反馈 = "点了没反应"。这里订阅 router.isLoading，loading
// 时在视口顶部画一条 2px 高的渐变进度条，给即时反馈。空载零渲染开销。
//
// 不引入 nprogress 这类整包依赖（多一个 chunk），纯 CSS keyframe 几行搞定。
const HIDE_DELAY_MS = 180;

export function RouteTransitionIndicator() {
  const isLoading = useRouterState({
    select: (state) => state.isLoading || state.isTransitioning,
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setVisible(true);
      return;
    }
    const id = window.setTimeout(() => setVisible(false), HIDE_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 9999,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, transparent 0%, #07c160 30%, #34c759 50%, #07c160 70%, transparent 100%)",
          animation: "yinjie-route-progress 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        }}
      />
      <style>{`
        @keyframes yinjie-route-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

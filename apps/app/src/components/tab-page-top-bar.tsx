import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@yinjie/ui";

type TabPageTopBarProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  leftActions?: ReactNode;
  rightActions?: ReactNode;
  titleAlign?: "left" | "center";
  titleClassName?: string;
  // 顶部栏内部控件行的附加 class（背景/边框仍走外层全宽）。默认空 = 行为不变。
  // 大视口下正文限宽居中时，传 max-w + mx-auto 让返回/标题/操作与正文列对齐，
  // 不被甩到屏幕两边。
  innerClassName?: string;
};

export function TabPageTopBar({
  className,
  title,
  eyebrow,
  subtitle,
  leftActions,
  rightActions,
  titleAlign = "left",
  titleClassName,
  innerClassName,
  children,
  ...props
}: TabPageTopBarProps) {
  const leftActionsRef = useRef<HTMLDivElement | null>(null);
  const rightActionsRef = useRef<HTMLDivElement | null>(null);
  const [centerInset, setCenterInset] = useState(48);

  useEffect(() => {
    if (titleAlign !== "center") {
      return;
    }

    const syncCenterInset = () => {
      const leftWidth = leftActionsRef.current?.offsetWidth ?? 36;
      const rightWidth = rightActionsRef.current?.offsetWidth ?? 36;
      const nextInset = Math.max(leftWidth, rightWidth) + 12;
      setCenterInset((currentInset) =>
        currentInset === nextInset ? currentInset : nextInset,
      );
    };

    syncCenterInset();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncCenterInset);
      return () => window.removeEventListener("resize", syncCenterInset);
    }

    const observer = new ResizeObserver(syncCenterInset);

    if (leftActionsRef.current) {
      observer.observe(leftActionsRef.current);
    }

    if (rightActionsRef.current) {
      observer.observe(rightActionsRef.current);
    }

    return () => observer.disconnect();
    // 不要把 leftActions / rightActions 放进依赖——它们是 inline JSX，
    // 每次父组件 render 引用都换，effect 跟着重跑、re-attach observer，
    // observer 初始 fire → setState → 又 render → 又跑 effect……即便有
    // currentInset === nextInset 守卫，也会被 React 的 "Maximum update
    // depth exceeded" 兜底拍掉（channels-page 上稳定复现）。observer 真正
    // 观察的是上面 `<div ref={leftActionsRef}>` 这个固定容器，children
    // 换不换都不影响——容器自己 resize 时 observer 已经会触发。
  }, [titleAlign]);

  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 -mt-6 mb-4 overflow-hidden border-b border-[color:var(--border-brand)] bg-[color:var(--surface-overlay)] bg-[image:var(--topbar-bg)] px-4 py-3 backdrop-blur-xl sm:-mx-5 sm:px-5",
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          "relative flex min-h-11 items-center justify-between gap-3",
          innerClassName,
        )}
      >
        {titleAlign === "center" ? (
          <div ref={leftActionsRef} className="shrink-0">
            {leftActions ? leftActions : <div className="w-9 shrink-0" aria-hidden="true" />}
          </div>
        ) : leftActions ? (
          <div className="shrink-0">{leftActions}</div>
        ) : null}
        <div
          className={cn(
            "min-w-0",
            titleAlign === "center"
              ? "pointer-events-none absolute text-center"
              : undefined,
          )}
          style={
            titleAlign === "center"
              ? {
                  left: `${centerInset}px`,
                  right: `${centerInset}px`,
                }
              : undefined
          }
        >
          {eyebrow ? <div className="truncate text-[length:var(--text-eyebrow)] uppercase tracking-[0.26em] text-[color:var(--brand-primary)]">{eyebrow}</div> : null}
          <h1
            className={cn(
              "truncate tracking-[0.01em] text-current",
              // 标题字号/字重统一：center 与 left 都用 --text-section(22)/semibold，
              // titleAlign 只保留定位几何（下方居中绝对定位），切 tab 时标题不再跳大小
              "text-[length:var(--text-section)] font-semibold",
              eyebrow ? "mt-1" : undefined,
              titleClassName,
            )}
          >
            {title}
          </h1>
          {subtitle ? <div className="mt-1 truncate text-[length:var(--text-caption)] text-[color:var(--text-muted)]">{subtitle}</div> : null}
        </div>
        {rightActions ? (
          <div
            ref={titleAlign === "center" ? rightActionsRef : undefined}
            className={cn("shrink-0", titleAlign === "center" ? "ml-auto" : undefined)}
          >
            {rightActions}
          </div>
        ) : titleAlign === "center" ? (
          <div ref={rightActionsRef} className="w-9 shrink-0" aria-hidden="true" />
        ) : null}
      </div>
      {children}
    </div>
  );
}

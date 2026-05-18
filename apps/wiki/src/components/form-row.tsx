import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";

type FormRowProps = {
  label: ReactNode;
  hint?: ReactNode;
  badge?: ReactNode;
  /** 该字段对 AI 行为的影响。原本渲染在输入下方，现合并进 ? 气泡的"影响"块。 */
  effect?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
};

export function FormRow({
  label,
  hint,
  badge,
  effect,
  required,
  children,
  className,
}: FormRowProps) {
  const t = translateRuntimeMessage;
  return (
    <label className={`block space-y-1.5 ${className ?? ""}`}>
      <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-[color:var(--text-primary)]">
        <span>
          {label}
          {required && (
            <span className="ml-1 text-[color:var(--state-danger-text)]">
              *
            </span>
          )}
        </span>
        {badge}
        {(hint || effect) && (
          <HintTooltip>
            {hint && <span className="block">{hint}</span>}
            {effect && (
              <span className="mt-1 block text-[color:var(--text-secondary)]">
                <span className="font-semibold">{t(msg`影响：`)}</span>
                {effect}
              </span>
            )}
          </HintTooltip>
        )}
      </span>
      {children}
    </label>
  );
}

function HintTooltip({ children }: { children: ReactNode }) {
  const t = translateRuntimeMessage;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);

  // 外部点击 / Escape → 关闭（主要服务触屏 tap 的关闭路径）
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const node = wrapRef.current;
      if (!node || !(event.target instanceof Node)) return;
      if (node.contains(event.target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 自适应位置：fixed 定位，默认 ? 右下；若超视口右边则向左推到刚好贴右边距
  // tooltip 初始 inline style 已经是 fixed + 屏外，所以它不会污染 wrap 的 boundingRect
  useLayoutEffect(() => {
    if (!open) return;
    const tip = tipRef.current;
    const wrap = wrapRef.current;
    if (!tip || !wrap) return;
    const wr = wrap.getBoundingClientRect();
    const margin = 8;
    tip.style.top = `${wr.bottom + 4}px`;
    tip.style.left = `${wr.right + 4}px`;
    tip.style.right = "auto";
    const tr = tip.getBoundingClientRect();
    if (tr.right > window.innerWidth - margin) {
      tip.style.left = `${Math.max(margin, window.innerWidth - margin - tr.width)}px`;
    }
  }, [open]);

  const isHoverDevice = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: hover)").matches;

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={t(msg`说明`)}
        aria-expanded={open}
        onMouseEnter={() => {
          if (isHoverDevice()) setOpen(true);
        }}
        onMouseLeave={() => {
          if (isHoverDevice()) setOpen(false);
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[color:var(--text-muted)]/40 text-[10px] font-semibold leading-none text-[color:var(--text-muted)] transition hover:border-[color:var(--text-secondary)] hover:text-[color:var(--text-secondary)] sm:h-[14px] sm:w-[14px]"
      >
        ?
      </button>
      {open && (
        <span
          ref={tipRef}
          role="tooltip"
          // 初始就是 fixed + 屏外，避免一帧 flash 到 (0,0) 同时不影响 wrap 的 boundingRect
          style={{ position: "fixed", top: -9999, left: -9999 }}
          className="pointer-events-none z-20 w-max max-w-[min(280px,calc(100vw-1rem))] whitespace-normal rounded-md border border-[color:var(--border-subtle)] bg-[color:var(--surface-overlay)] px-2.5 py-1.5 text-xs font-normal leading-relaxed text-[color:var(--text-primary)] shadow-md"
        >
          {children}
        </span>
      )}
    </span>
  );
}

import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../cn";

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          // 走查新一轮 R6：原本固定 text-sm (14px)，iOS Safari/WKWebView focus
          // 时 <16px 阈值会强制 viewport zoom-in；TextField 是 welcome 登录、
          // 改密、改昵称、改头像 URL、笔记搜会话、账户安全改密等关键路径里
          // 用得最多的共用 input，挨着点过去整页反复弹缩。viewport meta 也没
          // 禁 user-scale，所以会触发。手机/平板宽度 (<lg=1024px) 给 16px，
          // 桌面继续 text-sm(14px) 维持紧凑视觉密度——desktop 没 zoom 问题。
          "w-full rounded-[var(--radius-lg)] border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3.5 text-[16px] text-[color:var(--text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-[#cfc4bc] hover:border-[color:var(--border-subtle)] hover:bg-white focus:-translate-y-0.5 focus:border-[color:var(--border-brand)] focus:bg-white focus:shadow-[var(--shadow-focus)] lg:text-sm",
          className,
        )}
        {...props}
      />
    );
  },
);

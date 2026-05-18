import { useCallback, type KeyboardEvent } from "react";

// WAI-ARIA Authoring Practices "Tabs (with Automatic Activation)" 推荐用 roving
// tabindex：tablist 只暴露一个 tab stop（当前选中的 tab），方向键在组内移动焦点
// 并自动激活对应 panel。否则键盘用户每个 tab 都占一个 Tab stop，盲用户屏读会
// 反复念 "selected, tab 1 of 4"、"tab 2 of 4"，以为页面切了。
//
// 用法：
//   const onKeyDown = useTablistKeyboard({ count, onActivate });
//   <div role="tablist" onKeyDown={onKeyDown}>
//     {items.map((item, i) =>
//       <button role="tab" tabIndex={i === active ? 0 : -1}>...</button>)}
//   </div>
//
// orientation 默认 horizontal（ArrowLeft/ArrowRight）；垂直 tablist 传
// "vertical" 使用 ArrowUp/ArrowDown。Home/End 跳首尾。
export function useTablistKeyboard({
  count,
  onActivate,
  orientation = "horizontal",
}: {
  count: number;
  onActivate: (index: number) => void;
  orientation?: "horizontal" | "vertical";
}) {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (count <= 0) return;
      const target = event.target;
      if (
        !(target instanceof HTMLElement) ||
        target.getAttribute("role") !== "tab"
      ) {
        return;
      }
      const list = event.currentTarget;
      const tabs = Array.from(
        list.querySelectorAll<HTMLElement>('[role="tab"]'),
      );
      const current = tabs.indexOf(target);
      if (current < 0) return;
      const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      let nextIndex: number | null = null;
      if (event.key === nextKey) {
        nextIndex = (current + 1) % tabs.length;
      } else if (event.key === prevKey) {
        nextIndex = (current - 1 + tabs.length) % tabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      }
      if (nextIndex !== null) {
        event.preventDefault();
        const next = tabs[nextIndex];
        if (next) next.focus();
        onActivate(nextIndex);
      }
    },
    [count, onActivate, orientation],
  );
}

import { useCallback, useEffect, useState } from "react";

export type ManagementScreen =
  | { type: "root" }
  | { type: "blacklist" }
  | { type: "permissions" }
  | { type: "permissions-detail"; characterId: string };

function isSameScreen(a: ManagementScreen, b: ManagementScreen): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "permissions-detail" && b.type === "permissions-detail") {
    return a.characterId === b.characterId;
  }
  return true;
}

export function useManagementScreenStack(open: boolean) {
  const [stack, setStack] = useState<ManagementScreen[]>([{ type: "root" }]);

  const reset = useCallback(() => setStack([{ type: "root" }]), []);
  // 新一轮走查：dedupe 连续重复 push。原写法无条件 append → 用户在手机端
  // 双击好友 / 双击"朋友权限"行（屏切换有一帧延迟，手指就习惯多按一下），
  // 同一个 screen 会被压两次，stack = [..., permissions-detail:X, permissions-detail:X]，
  // 视觉无变化但回退要按两次 Back，第一次看着像"卡住没反应"。栈顶等于目标屏
  // 时直接忽略，跟 React Router / WeChat navigation 的去重语义对齐。
  const push = useCallback(
    (screen: ManagementScreen) =>
      setStack((cur) => {
        const top = cur[cur.length - 1];
        if (top && isSameScreen(top, screen)) {
          return cur;
        }
        return [...cur, screen];
      }),
    [],
  );
  const pop = useCallback(
    () => setStack((cur) => (cur.length > 1 ? cur.slice(0, -1) : cur)),
    [],
  );

  // 关闭弹窗后清栈，下次打开从根屏开始；原实现在 render 里调 queueMicrotask
  // 是 side-effect-in-render（StrictMode / concurrent 渲染下会多次入队、违反
  // React render 纯函数前提），改成 useEffect 才是正经写法。
  useEffect(() => {
    if (!open && stack.length > 1) {
      reset();
    }
  }, [open, reset, stack.length]);

  return {
    stack,
    current: stack[stack.length - 1],
    canGoBack: stack.length > 1,
    push,
    pop,
    reset,
  };
}

// 云鉴权失效（401）/ 账号封禁注销（403）被全局错误处理器命中后，要把用户静默
// 送回登录页。错误处理器是非 React 模块，直接 import router.tsx 会绕成循环依赖
// (runtime-config → cloud-auth-expired → router → root-layout → desktop-runtime-guard
// → runtime-config)，所以这里用「注册回调」解耦：main.tsx 在 router 就绪后注入
// SPA 软跳转；未注册时回落硬跳 /welcome（与 stale-asset-recovery 的 full-reload
// 同类做法，保证拿不到 router 单例时也能脱困）。
type LoginRedirect = () => void;

let handler: LoginRedirect | null = null;

export function setLoginRedirectHandler(fn: LoginRedirect | null) {
  handler = fn;
}

export function triggerLoginRedirect() {
  if (handler) {
    handler();
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign("/welcome");
  }
}

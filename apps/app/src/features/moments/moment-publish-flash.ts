const MOMENT_PUBLISH_FLASH_KEY = "yinjie:moment-publish-flash";

// 新一轮走查 R4：和 feed-publish-flash 同款 SecurityError / QuotaExceededError
// 兜底。Safari iOS 隐私模式 / 部分 webview / 严格 iframe context 下
// sessionStorage 的 setItem / getItem / removeItem 全可能抛 SecurityError；
// 本模块在 mobile-moments-publish-page onSuccess 链路里被调用，未捕获异常会
// 顺着 react-query onSuccess 冒到顶层被 TanStack 静默吞，但 storeMomentPublishFlash
// 之后的 composeDraft.reset() / navigate() 都跑不到，体感「moment 发出去了
// 但 publish 页一直停在那里 + 顶栏还是发表中样式」。静默吞掉，丢一条 flash
// 提示远比让 publish 主流程崩好。

export function storeMomentPublishFlash(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(MOMENT_PUBLISH_FLASH_KEY, message);
  } catch {
    // 静默
  }
}

export function consumeMomentPublishFlash() {
  if (typeof window === "undefined") {
    return null;
  }

  let value: string | null;
  try {
    value = window.sessionStorage.getItem(MOMENT_PUBLISH_FLASH_KEY);
  } catch {
    return null;
  }
  if (!value) {
    return null;
  }

  try {
    window.sessionStorage.removeItem(MOMENT_PUBLISH_FLASH_KEY);
  } catch {
    // 静默——下次 consume 会再读一次，弹两次比让 publish 流程崩好
  }
  return value;
}

const FEED_PUBLISH_FLASH_KEY = "yinjie:feed-publish-flash";

// Safari iOS 隐私模式 / 部分浏览器禁用 storage 时 sessionStorage 的 setItem /
// removeItem 会抛 SecurityError；本模块在发布 onSuccess 链路里被调用，未捕获
// 异常会顺着 react-query onSuccess 冒到顶层，让 composeDraft.reset() / navigate
// 等收尾逻辑被跳过——用户视感是"发表成功了但页面卡在 publish 屏不动"。
// 与 note-drafts-storage / favorites-storage R17-R23 同款降级：静默吞，flash
// 提示丢失对体验影响极小，但发布主流程不能因为 storage 噪音被打断。

export function storeFeedPublishFlash(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(FEED_PUBLISH_FLASH_KEY, message);
  } catch {
    // 静默
  }
}

export function consumeFeedPublishFlash() {
  if (typeof window === "undefined") {
    return null;
  }

  let value: string | null;
  try {
    value = window.sessionStorage.getItem(FEED_PUBLISH_FLASH_KEY);
  } catch {
    return null;
  }
  if (!value) {
    return null;
  }

  try {
    window.sessionStorage.removeItem(FEED_PUBLISH_FLASH_KEY);
  } catch {
    // 静默——下一次 consume 还会拿到同条消息，弹两次比让 publish 流程崩好得多
  }
  return value;
}

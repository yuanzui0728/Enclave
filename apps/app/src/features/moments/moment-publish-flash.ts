const MOMENT_PUBLISH_FLASH_KEY = "yinjie:moment-publish-flash";

export function storeMomentPublishFlash(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(MOMENT_PUBLISH_FLASH_KEY, message);
}

export function consumeMomentPublishFlash() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(MOMENT_PUBLISH_FLASH_KEY);
  if (!value) {
    return null;
  }

  window.sessionStorage.removeItem(MOMENT_PUBLISH_FLASH_KEY);
  return value;
}

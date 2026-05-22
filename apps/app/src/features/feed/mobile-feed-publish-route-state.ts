import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileFeedPublishRouteState = {
  returnPath?: string;
  returnHash?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  // 走查移动端发现-广场动态走查/Round 1：和 channels-route-state R4 (b169dd7a) /
  // moments-route-state R1 / mobile-moments-publish-route-state R1 同款 open-redirect
  // 修法。/discover/feed/publish#returnPath=//evil.com 落进来后，发表成功 onSuccess
  // 走 navigate({ to: safeReturnPath ?? "/discover/feed" })、取消按钮 handleBack 也
  // 走 performBack → safeReturnPath，都会把 "//evil.com" 当 protocol-relative URL
  // 拼成 "https://evil.com" 跳走。!nextValue.startsWith("/") 拦掉 https://… 这种
  // 绝对 URL，但 "//host" 同样以 "/" 起头能漏过现有检查；显式追加 startsWith("//")
  // 二次拦截。
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    nextValue.startsWith("//") ||
    isDesktopOnlyPath(nextValue)
  ) {
    return undefined;
  }

  return nextValue;
}

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

export function parseMobileFeedPublishRouteState(
  hash: string,
): MobileFeedPublishRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  };
}

export function buildMobileFeedPublishRouteHash(
  state: MobileFeedPublishRouteState,
) {
  const params = new URLSearchParams();
  const returnPath = normalizeReturnPath(state.returnPath);

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  const returnHash = normalizeHash(state.returnHash);
  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  return params.toString() || undefined;
}

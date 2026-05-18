import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileMomentsPublishRouteState = {
  returnPath?: string;
  returnHash?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  // 走查 R1：和 channels-route-state R4 (b169dd7a) / character-detail-route-state /
  // mobile-group-route-state 同款 open-redirect 修法。/discover/moments/publish
  // 的 cancel / 发表成功后 navigate({ to: safeReturnPath })，浏览器 history
  // replaceState 接受 "//host" 拼出 "https://evil.com" 跳走。攻击者诱导用户点
  // /discover/moments/publish#returnPath=//evil.com 在发完表后/取消时跳第三方站。
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

export function parseMobileMomentsPublishRouteState(
  hash: string,
): MobileMomentsPublishRouteState {
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

export function buildMobileMomentsPublishRouteHash(
  state: MobileMomentsPublishRouteState,
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

import { isDesktopOnlyPath } from "../../lib/history-back";
import { normalizePathname } from "../../lib/normalize-pathname";

export type DesktopMomentsRouteState = {
  authorId?: string;
  momentId?: string;
  returnHash?: string;
  returnPath?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  // 走查 R1：和 channels-route-state R4 (b169dd7a) / character-detail-route-state /
  // mobile-group-route-state 同款 open-redirect 修法。浏览器 history.replaceState
  // 接受 "//host" 形式 → 浏览器拼成 "https://evil.com"，攻击者诱导用户点
  // /tabs/moments#returnPath=//evil.com 后按"返回上一页"就跳第三方站。
  // 桌面 moments 用，但这条 desktop parse 路径也会被 mobile coerce 转回去
  // （见 coerceToMobileFriendMomentsRouteHash 同模式），所以 desktop 这条
  // normalize 也必须把 "//" 拦掉。
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    nextValue.startsWith("//") ||
    isDesktopOnlyPath(nextValue)
  ) {
    return undefined;
  }

  const normalizedPath = normalizePathname(nextValue);

  if (normalizedPath === "/moments" || normalizedPath === "/discover/moments") {
    return "/tabs/moments";
  }

  return normalizedPath;
}

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

export function parseDesktopMomentsRouteState(
  hash: string,
): DesktopMomentsRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const authorId = params.get("authorId")?.trim();
  const momentId = params.get("moment")?.trim();
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    ...(authorId ? { authorId } : {}),
    ...(momentId ? { momentId } : {}),
    ...(returnPath ? { returnPath } : {}),
    ...(returnPath && normalizeHash(params.get("returnHash"))
      ? { returnHash: normalizeHash(params.get("returnHash")) }
      : {}),
  };
}

export function buildDesktopMomentsRouteHash(state: DesktopMomentsRouteState) {
  const params = new URLSearchParams();

  if (state.authorId?.trim()) {
    params.set("authorId", state.authorId.trim());
  }

  if (state.momentId?.trim()) {
    params.set("moment", state.momentId.trim());
  }

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

import { isDesktopOnlyPath } from "../../lib/history-back";

export type DesktopMomentsRouteState = {
  authorId?: string;
  momentId?: string;
  returnHash?: string;
  returnPath?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    isDesktopOnlyPath(nextValue)
  ) {
    return undefined;
  }

  if (nextValue === "/moments" || nextValue === "/discover/moments") {
    return "/tabs/moments";
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

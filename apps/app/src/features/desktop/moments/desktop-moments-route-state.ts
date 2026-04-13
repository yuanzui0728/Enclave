export type DesktopMomentsRouteState = {
  authorId?: string;
  momentId?: string;
};

export function parseDesktopMomentsRouteState(
  hash: string,
): DesktopMomentsRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const authorId = params.get("authorId")?.trim();
  const momentId = params.get("moment")?.trim();

  return {
    ...(authorId ? { authorId } : {}),
    ...(momentId ? { momentId } : {}),
  };
}

export function buildDesktopMomentsRouteHash(
  state: DesktopMomentsRouteState,
) {
  const params = new URLSearchParams();

  if (state.authorId?.trim()) {
    params.set("authorId", state.authorId.trim());
  }

  if (state.momentId?.trim()) {
    params.set("moment", state.momentId.trim());
  }

  return params.toString() || undefined;
}

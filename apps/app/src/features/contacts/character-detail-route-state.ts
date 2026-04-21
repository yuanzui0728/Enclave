export type CharacterDetailRouteState = {
  recommendationId?: string;
  returnPath?: string;
  returnHash?: string;
};

function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue || !nextValue.startsWith("/")) {
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

export function parseCharacterDetailRouteState(
  hash: string,
): CharacterDetailRouteState {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return {};
  }

  const params = new URLSearchParams(normalizedHash);
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    recommendationId: params.get("recommendationId")?.trim() || undefined,
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  };
}

export function buildCharacterDetailRouteHash(
  state: CharacterDetailRouteState,
) {
  const params = new URLSearchParams();

  if (state.recommendationId?.trim()) {
    params.set("recommendationId", state.recommendationId.trim());
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

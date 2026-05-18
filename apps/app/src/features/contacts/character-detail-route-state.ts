export type CharacterDetailRouteState = {
  recommendationId?: string;
  returnPath?: string;
  returnHash?: string;
};

// 走查 新 R3：和 mobile-group-route-state / create-group-route-state /
// mobile-group-call-route-state 同款修法。character-detail-page 在 移动端
// 通讯录-群聊/群信息 点群成员头像时被打开，returnPath 会被用作"返回上一页"
// navigate target，浏览器 history.replaceState 接受 "//host" 会拼成
// "https://evil.com" —— 攻击者只需要诱导用户点一条 /character/x#returnPath=//evil.com
// 的链接即可在 character detail 页"返回"按钮后跳到第三方站。
function normalizeReturnPath(value?: string | null) {
  const nextValue = value?.trim();
  if (
    !nextValue ||
    !nextValue.startsWith("/") ||
    nextValue.startsWith("//")
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

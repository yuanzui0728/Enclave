export type CreateGroupRouteSource =
  | "chat-details"
  | "desktop-chat"
  | "group-contacts";

export type CreateGroupRouteState = {
  source?: CreateGroupRouteSource;
  conversationId?: string;
  returnPath?: string;
  returnHash?: string;
  seedMemberIds: string[];
};

// 走查 R2：同 mobile-group-route-state 同款补"//"协议无关 URL 校验。原版
// "/group/new#returnPath=//evil.com" 通过 startsWith("/")，create-group-page
// 的 onSuccess / handleBack 直接 navigate({to:safeReturnPath})，落到浏览器
// history.replaceState 上会拼出 "https://evil.com"，把用户带到第三方站。
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

export function buildCreateGroupRouteHash(input?: {
  source?: CreateGroupRouteSource;
  conversationId?: string | null;
  returnPath?: string | null;
  returnHash?: string | null;
  seedMemberIds?: string[] | null;
}) {
  const params = new URLSearchParams();
  const returnPath = normalizeReturnPath(input?.returnPath);

  if (input?.source) {
    params.set("source", input.source);
  }

  if (
    (input?.source === "chat-details" || input?.source === "desktop-chat") &&
    input.conversationId?.trim()
  ) {
    params.set("conversation", input.conversationId.trim());
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  const returnHash = normalizeHash(input?.returnHash);
  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  const seedMemberIds = dedupeIds(input?.seedMemberIds ?? []);
  if (seedMemberIds.length) {
    params.set("members", seedMemberIds.join(","));
  }

  const hash = params.toString();
  return hash || undefined;
}

export function parseCreateGroupRouteHash(hash: string): CreateGroupRouteState {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return { seedMemberIds: [] };
  }

  const params = new URLSearchParams(normalizedHash);
  const rawSource = params.get("source");
  const source =
    rawSource === "chat-details" ||
    rawSource === "desktop-chat" ||
    rawSource === "group-contacts"
      ? rawSource
      : undefined;
  const conversationId =
    source === "chat-details" || source === "desktop-chat"
      ? params.get("conversation")?.trim() || undefined
      : undefined;
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    source,
    conversationId,
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
    seedMemberIds: parseSeedMemberIds(params.get("members")),
  };
}

function parseSeedMemberIds(value: string | null) {
  if (!value) {
    return [];
  }

  return dedupeIds(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function dedupeIds(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

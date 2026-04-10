export type CreateGroupRouteSource = "chat-details" | "group-contacts";

export type CreateGroupRouteState = {
  source?: CreateGroupRouteSource;
  conversationId?: string;
  seedMemberIds: string[];
};

export function buildCreateGroupRouteHash(input?: {
  source?: CreateGroupRouteSource;
  conversationId?: string | null;
  seedMemberIds?: string[] | null;
}) {
  const params = new URLSearchParams();

  if (input?.source) {
    params.set("source", input.source);
  }

  if (input?.source === "chat-details" && input.conversationId?.trim()) {
    params.set("conversation", input.conversationId.trim());
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
    rawSource === "chat-details" || rawSource === "group-contacts"
      ? rawSource
      : undefined;
  const conversationId =
    source === "chat-details"
      ? params.get("conversation")?.trim() || undefined
      : undefined;

  return {
    source,
    conversationId,
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

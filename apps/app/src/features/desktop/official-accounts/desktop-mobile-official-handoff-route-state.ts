export type DesktopMobileOfficialHandoffState = {
  surface: "directory" | "service" | "subscription";
  accountId?: string;
  articleId?: string;
  accountName?: string;
  articleTitle?: string;
  accountType?: "service" | "subscription";
};

export function buildDesktopMobileOfficialHandoffHash(
  input: DesktopMobileOfficialHandoffState,
) {
  const params = new URLSearchParams();
  params.set("handoff", "official");
  params.set("surface", input.surface);

  if (input.accountId?.trim()) {
    params.set("accountId", input.accountId.trim());
  }

  if (input.articleId?.trim()) {
    params.set("articleId", input.articleId.trim());
  }

  if (input.accountName?.trim()) {
    params.set("accountName", input.accountName.trim());
  }

  if (input.articleTitle?.trim()) {
    params.set("articleTitle", input.articleTitle.trim());
  }

  if (input.accountType) {
    params.set("accountType", input.accountType);
  }

  return params.toString();
}

export function parseDesktopMobileOfficialHandoffHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  if (params.get("handoff") !== "official") {
    return null;
  }

  const surface = params.get("surface");
  if (
    surface !== "directory" &&
    surface !== "service" &&
    surface !== "subscription"
  ) {
    return null;
  }

  const accountId = params.get("accountId")?.trim() || undefined;
  const articleId = params.get("articleId")?.trim() || undefined;
  const accountName = params.get("accountName")?.trim() || undefined;
  const articleTitle = params.get("articleTitle")?.trim() || undefined;
  const accountType = params.get("accountType");

  if (
    accountType !== null &&
    accountType !== "service" &&
    accountType !== "subscription"
  ) {
    return null;
  }

  if (!accountId && !articleId && surface !== "subscription") {
    return null;
  }

  return {
    surface,
    accountId,
    articleId,
    accountName,
    articleTitle,
    accountType: accountType ?? undefined,
  } satisfies DesktopMobileOfficialHandoffState;
}

export function resolveDesktopMobileOfficialHandoffPath(
  state: DesktopMobileOfficialHandoffState,
) {
  if (state.articleId) {
    return `/official-accounts/articles/${state.articleId}`;
  }

  if (state.surface === "service" && state.accountId) {
    return `/official-accounts/service/${state.accountId}`;
  }

  if (state.surface === "subscription") {
    return "/chat/subscription-inbox";
  }

  return state.accountId
    ? `/official-accounts/${state.accountId}`
    : "/contacts/official-accounts";
}

export type MobilePushTargetKind = "route" | "conversation" | "group";

export interface MobilePushLaunchTarget {
  kind: MobilePushTargetKind;
  route?: string;
  conversationId?: string;
  groupId?: string;
  source?: string;
}

export interface MobilePushPayload extends MobilePushLaunchTarget {
  title?: string;
  body?: string;
}

type RawMobilePushLaunchTarget = {
  kind?: string | null;
  route?: string | null;
  conversationId?: string | null;
  groupId?: string | null;
  source?: string | null;
} | null;

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeMobilePushLaunchTarget(target: RawMobilePushLaunchTarget): MobilePushLaunchTarget | null {
  if (!target) {
    return null;
  }

  const route = normalizeText(target.route);
  const conversationId = normalizeText(target.conversationId);
  const groupId = normalizeText(target.groupId);
  const source = normalizeText(target.source) ?? undefined;
  const kind = normalizeText(target.kind);

  if ((kind === "conversation" || (!kind && conversationId)) && conversationId) {
    return {
      kind: "conversation",
      conversationId,
      source,
    };
  }

  if ((kind === "group" || (!kind && groupId)) && groupId) {
    return {
      kind: "group",
      groupId,
      source,
    };
  }

  if ((kind === "route" || (!kind && route)) && route?.startsWith("/")) {
    return {
      kind: "route",
      route,
      source,
    };
  }

  return null;
}

export function buildMobilePushPayload(payload: {
  kind?: MobilePushTargetKind | null;
  route?: string | null;
  conversationId?: string | null;
  groupId?: string | null;
  title?: string | null;
  body?: string | null;
  source?: string | null;
}): MobilePushPayload | null {
  const target = normalizeMobilePushLaunchTarget(payload);
  if (!target) {
    return null;
  }

  const title = normalizeText(payload.title) ?? undefined;
  const body = normalizeText(payload.body) ?? undefined;

  return {
    ...target,
    title,
    body,
  };
}

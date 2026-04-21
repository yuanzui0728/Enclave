import { isDesktopOnlyPath } from "../../lib/history-back";
import type { CallInviteSource } from "./group-call-message";

export type MobileGroupCallRouteState = {
  source: CallInviteSource | null;
  activeCount: number | null;
  totalCount: number | null;
  recordedAt?: string;
  snapshotRecordedAt?: string;
  highlightedMessageId?: string;
  returnPath?: string;
  returnHash?: string;
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

  return nextValue;
}

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

export function buildMobileGroupCallRouteHash(
  input: MobileGroupCallRouteState,
) {
  const params = new URLSearchParams();
  const highlightedMessageId = input.highlightedMessageId?.trim();
  const returnPath = normalizeReturnPath(input.returnPath);
  const returnHash = normalizeHash(input.returnHash);
  params.set("groupCall", "resume");

  if (input.source) {
    params.set("source", input.source);
  }

  if (input.activeCount !== null && input.totalCount !== null) {
    params.set("activeCount", String(input.activeCount));
    params.set("totalCount", String(input.totalCount));
  }

  if (input.recordedAt?.trim()) {
    params.set("recordedAt", input.recordedAt.trim());
  }

  if (input.snapshotRecordedAt?.trim()) {
    params.set("snapshotRecordedAt", input.snapshotRecordedAt.trim());
  }

  if (highlightedMessageId) {
    params.set("message", highlightedMessageId);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  return params.toString();
}

export function parseMobileGroupCallRouteHash(hash: string) {
  const normalizedHash = normalizeHash(hash);
  if (!normalizedHash) {
    return null;
  }

  const params = new URLSearchParams(normalizedHash);
  if (params.get("groupCall") !== "resume") {
    return null;
  }

  const sourceValue = params.get("source");
  const source =
    sourceValue === "desktop" || sourceValue === "mobile" ? sourceValue : null;
  const activeCount = parseCountValue(params.get("activeCount"));
  const totalCount = parseCountValue(params.get("totalCount"));
  const hasValidCounts =
    activeCount !== null && totalCount !== null && activeCount <= totalCount;
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    source,
    activeCount: hasValidCounts ? activeCount : null,
    totalCount: hasValidCounts ? totalCount : null,
    recordedAt: params.get("recordedAt")?.trim() || undefined,
    snapshotRecordedAt:
      params.get("snapshotRecordedAt")?.trim() || undefined,
    highlightedMessageId: params.get("message")?.trim() || undefined,
    returnPath,
    returnHash: returnPath
      ? normalizeHash(params.get("returnHash"))
      : undefined,
  } satisfies MobileGroupCallRouteState;
}

function parseCountValue(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

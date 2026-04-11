import type { CallInviteSource } from "./group-call-message";

export type MobileGroupCallRouteState = {
  source: CallInviteSource | null;
  activeCount: number | null;
  totalCount: number | null;
  recordedAt?: string;
  snapshotRecordedAt?: string;
};

export function buildMobileGroupCallRouteHash(
  input: MobileGroupCallRouteState,
) {
  const params = new URLSearchParams();
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

  return params.toString();
}

export function parseMobileGroupCallRouteHash(hash: string) {
  const normalizedHash = hash.startsWith("#") ? hash.slice(1) : hash;
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

  return {
    source,
    activeCount: hasValidCounts ? activeCount : null,
    totalCount: hasValidCounts ? totalCount : null,
    recordedAt: params.get("recordedAt")?.trim() || undefined,
    snapshotRecordedAt:
      params.get("snapshotRecordedAt")?.trim() || undefined,
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

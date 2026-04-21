import { getMiniProgramEntry } from "./mini-programs-data";
import { isDesktopOnlyPath } from "../../lib/history-back";

export type MobileMiniProgramsRouteState = {
  miniProgramId?: string;
  returnHash?: string;
  returnPath?: string;
  sourceGroupId?: string;
  sourceGroupName?: string;
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

export function parseMobileMiniProgramsRouteSearch(
  search: unknown,
): MobileMiniProgramsRouteState {
  const searchString = typeof search === "string" ? search : "";
  const normalizedSearch = searchString.startsWith("?")
    ? searchString.slice(1)
    : searchString;
  if (!normalizedSearch) {
    return {};
  }

  const params = new URLSearchParams(normalizedSearch);
  const miniProgramId = params.get("miniProgram")?.trim() ?? "";
  const sourceGroupId = params.get("sourceGroupId")?.trim() ?? "";
  const sourceGroupName = params.get("sourceGroupName")?.trim() ?? "";
  const returnPath = normalizeReturnPath(params.get("returnPath"));

  return {
    ...(miniProgramId && getMiniProgramEntry(miniProgramId)
      ? { miniProgramId }
      : {}),
    ...(sourceGroupId ? { sourceGroupId } : {}),
    ...(sourceGroupId && sourceGroupName ? { sourceGroupName } : {}),
    ...(returnPath ? { returnPath } : {}),
    ...(returnPath && normalizeHash(params.get("returnHash"))
      ? { returnHash: normalizeHash(params.get("returnHash")) }
      : {}),
  };
}

export function buildMobileMiniProgramsRouteSearch(
  state: MobileMiniProgramsRouteState,
) {
  const params = new URLSearchParams();
  const miniProgramId = state.miniProgramId?.trim() ?? "";
  const sourceGroupId = state.sourceGroupId?.trim() ?? "";
  const sourceGroupName = state.sourceGroupName?.trim() ?? "";
  const returnPath = normalizeReturnPath(state.returnPath);
  const returnHash = normalizeHash(state.returnHash);

  if (miniProgramId && getMiniProgramEntry(miniProgramId)) {
    params.set("miniProgram", miniProgramId);
  }

  if (sourceGroupId) {
    params.set("sourceGroupId", sourceGroupId);
  }

  if (sourceGroupId && sourceGroupName) {
    params.set("sourceGroupName", sourceGroupName);
  }

  if (returnPath) {
    params.set("returnPath", returnPath);
  }

  if (returnPath && returnHash) {
    params.set("returnHash", returnHash);
  }

  const search = params.toString();
  return search ? `?${search}` : undefined;
}

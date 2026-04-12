import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type MobileHandoffRecord = {
  id: string;
  label: string;
  description: string;
  path: string;
  sentAt: string;
};

const MOBILE_HANDOFF_STORAGE_KEY = "yinjie-desktop-mobile-handoff-history";
const MAX_HANDOFF_RECORDS = 8;
let mobileHandoffNativeWriteQueue: Promise<void> = Promise.resolve();

function readLocalStorageHistory() {
  if (typeof window === "undefined") {
    return [] as MobileHandoffRecord[];
  }

  const raw = window.localStorage.getItem(MOBILE_HANDOFF_STORAGE_KEY);
  if (!raw) {
    return [] as MobileHandoffRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as MobileHandoffRecord[];
    if (!Array.isArray(parsed)) {
      return [] as MobileHandoffRecord[];
    }

    return parsed.filter(
      (item): item is MobileHandoffRecord =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.description === "string" &&
        typeof item?.path === "string" &&
        typeof item?.sentAt === "string",
    );
  } catch {
    return [] as MobileHandoffRecord[];
  }
}

function writeLocalStorageHistory(history: MobileHandoffRecord[]) {
  if (typeof window === "undefined") {
    return history;
  }

  if (history.length) {
    window.localStorage.setItem(
      MOBILE_HANDOFF_STORAGE_KEY,
      JSON.stringify(history),
    );
  } else {
    window.localStorage.removeItem(MOBILE_HANDOFF_STORAGE_KEY);
  }

  queueNativeMobileHandoffWrite(history);
  return history;
}

function queueNativeMobileHandoffWrite(history: MobileHandoffRecord[]) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(history);
  mobileHandoffNativeWriteQueue = mobileHandoffNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_mobile_handoff_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function getLatestMobileHandoffTimestamp(history: MobileHandoffRecord[]) {
  return history.reduce((latest, item) => {
    const sentAt = Date.parse(item.sentAt);
    return Number.isFinite(sentAt) && sentAt > latest ? sentAt : latest;
  }, 0);
}

function parseMobileHandoffHistory(raw: string | null | undefined) {
  if (!raw) {
    return [] as MobileHandoffRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [] as MobileHandoffRecord[];
    }

    return parsed.filter(
      (item): item is MobileHandoffRecord =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.description === "string" &&
        typeof item?.path === "string" &&
        typeof item?.sentAt === "string",
    );
  } catch {
    return [] as MobileHandoffRecord[];
  }
}

export function readMobileHandoffHistory() {
  return readLocalStorageHistory();
}

export async function hydrateMobileHandoffHistoryFromNative() {
  const localHistory = readLocalStorageHistory();
  if (!isDesktopRuntimeAvailable()) {
    return localHistory;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_mobile_handoff_store");

    if (!result.exists) {
      if (localHistory.length) {
        queueNativeMobileHandoffWrite(localHistory);
      }
      return localHistory;
    }

    const nativeHistory = parseMobileHandoffHistory(result.contents ?? null);
    if (
      getLatestMobileHandoffTimestamp(localHistory) >
      getLatestMobileHandoffTimestamp(nativeHistory)
    ) {
      if (localHistory.length) {
        queueNativeMobileHandoffWrite(localHistory);
      }
      return localHistory;
    }

    if (typeof window !== "undefined") {
      if (nativeHistory.length) {
        window.localStorage.setItem(
          MOBILE_HANDOFF_STORAGE_KEY,
          JSON.stringify(nativeHistory),
        );
      } else {
        window.localStorage.removeItem(MOBILE_HANDOFF_STORAGE_KEY);
      }
    }
    return nativeHistory;
  } catch {
    return localHistory;
  }
}

export function pushMobileHandoffRecord(input: {
  description: string;
  label: string;
  path: string;
}) {
  if (typeof window === "undefined") {
    return [] as MobileHandoffRecord[];
  }

  const nextRecord: MobileHandoffRecord = {
    id: `mobile-handoff-${input.path}`,
    label: input.label,
    description: input.description,
    path: input.path,
    sentAt: new Date().toISOString(),
  };

  const nextHistory = [
    nextRecord,
    ...readMobileHandoffHistory().filter((item) => item.path !== input.path),
  ].slice(0, MAX_HANDOFF_RECORDS);

  writeLocalStorageHistory(nextHistory);
  return nextHistory;
}

export function resolveMobileHandoffLink(path: string) {
  return typeof window === "undefined"
    ? path
    : `${window.location.origin}${path}`;
}

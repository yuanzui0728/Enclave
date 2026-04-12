import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type DesktopLockSnapshot = {
  passcodeDigest: string | null;
  passcodeLength: number | null;
  isLocked: boolean;
  lockedAt: string | null;
};

const DESKTOP_LOCK_STORAGE_KEY = "yinjie-desktop-lock-state";
const defaultDesktopLockSnapshot: DesktopLockSnapshot = {
  passcodeDigest: null,
  passcodeLength: null,
  isLocked: false,
  lockedAt: null,
};
let desktopLockNativeWriteQueue: Promise<void> = Promise.resolve();

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function hashPasscode(passcode: string) {
  let hash = 2166136261;

  for (let index = 0; index < passcode.length; index += 1) {
    hash ^= passcode.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `lock-${(hash >>> 0).toString(16)}`;
}

function normalizeDesktopLockSnapshot(
  snapshot: Partial<DesktopLockSnapshot> | null | undefined,
): DesktopLockSnapshot {
  return {
    passcodeDigest:
      typeof snapshot?.passcodeDigest === "string"
        ? snapshot.passcodeDigest
        : null,
    passcodeLength:
      typeof snapshot?.passcodeLength === "number"
        ? snapshot.passcodeLength
        : null,
    isLocked: snapshot?.isLocked === true,
    lockedAt: typeof snapshot?.lockedAt === "string" ? snapshot.lockedAt : null,
  };
}

function parseDesktopLockSnapshot(raw: string | null | undefined) {
  if (!raw) {
    return { ...defaultDesktopLockSnapshot };
  }

  try {
    return normalizeDesktopLockSnapshot(
      JSON.parse(raw) as Partial<DesktopLockSnapshot>,
    );
  } catch {
    return { ...defaultDesktopLockSnapshot };
  }
}

function hasDesktopLockSnapshotData(snapshot: DesktopLockSnapshot) {
  return Boolean(
    snapshot.passcodeDigest ||
      snapshot.passcodeLength !== null ||
      snapshot.isLocked ||
      snapshot.lockedAt,
  );
}

function getDesktopLockSnapshotTimestamp(snapshot: DesktopLockSnapshot) {
  if (!snapshot.lockedAt) {
    return 0;
  }

  const parsed = Date.parse(snapshot.lockedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function queueNativeDesktopLockSnapshotWrite(snapshot: DesktopLockSnapshot) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(snapshot);
  desktopLockNativeWriteQueue = desktopLockNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_lock_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeSnapshot(
  snapshot: DesktopLockSnapshot,
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return snapshot;
  }

  if (hasDesktopLockSnapshotData(snapshot)) {
    storage.setItem(DESKTOP_LOCK_STORAGE_KEY, JSON.stringify(snapshot));
  } else {
    storage.removeItem(DESKTOP_LOCK_STORAGE_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeDesktopLockSnapshotWrite(snapshot);
  }

  return snapshot;
}

export function readDesktopLockSnapshot(): DesktopLockSnapshot {
  const storage = getStorage();
  if (!storage) {
    return { ...defaultDesktopLockSnapshot };
  }

  const raw = storage.getItem(DESKTOP_LOCK_STORAGE_KEY);
  return parseDesktopLockSnapshot(raw);
}

export async function hydrateDesktopLockSnapshotFromNative() {
  const localSnapshot = readDesktopLockSnapshot();
  if (!isDesktopRuntimeAvailable()) {
    return localSnapshot;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_lock_store");

    if (!result.exists) {
      if (hasDesktopLockSnapshotData(localSnapshot)) {
        queueNativeDesktopLockSnapshotWrite(localSnapshot);
      }
      return localSnapshot;
    }

    const nativeSnapshot = parseDesktopLockSnapshot(result.contents ?? null);
    const shouldPreferLocal =
      (!hasDesktopLockSnapshotData(nativeSnapshot) &&
        hasDesktopLockSnapshotData(localSnapshot)) ||
      getDesktopLockSnapshotTimestamp(localSnapshot) >
        getDesktopLockSnapshotTimestamp(nativeSnapshot);

    if (shouldPreferLocal) {
      if (hasDesktopLockSnapshotData(localSnapshot)) {
        queueNativeDesktopLockSnapshotWrite(localSnapshot);
      }
      return localSnapshot;
    }

    writeSnapshot(nativeSnapshot, {
      syncNative: false,
    });
    return nativeSnapshot;
  } catch {
    return localSnapshot;
  }
}

export function saveDesktopLockPasscode(passcode: string) {
  const current = readDesktopLockSnapshot();
  const nextSnapshot: DesktopLockSnapshot = {
    ...current,
    passcodeDigest: hashPasscode(passcode),
    passcodeLength: passcode.length,
  };

  writeSnapshot(nextSnapshot);
  return nextSnapshot;
}

export function setDesktopLocked(locked: boolean) {
  const current = readDesktopLockSnapshot();
  const nextSnapshot: DesktopLockSnapshot = {
    ...current,
    isLocked: locked,
    lockedAt: locked ? new Date().toISOString() : current.lockedAt,
  };

  writeSnapshot(nextSnapshot);
  return nextSnapshot;
}

export function clearDesktopLocked() {
  const current = readDesktopLockSnapshot();
  const nextSnapshot: DesktopLockSnapshot = {
    ...current,
    isLocked: false,
  };

  writeSnapshot(nextSnapshot);
  return nextSnapshot;
}

export function verifyDesktopLockPasscode(passcode: string) {
  const current = readDesktopLockSnapshot();
  if (!current.passcodeDigest) {
    return false;
  }

  return current.passcodeDigest === hashPasscode(passcode);
}

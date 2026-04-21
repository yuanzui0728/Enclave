import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export type GroupInviteDeliveryRecord = {
  conversationId: string;
  conversationPath: string;
  conversationTitle: string;
  deliveredAt: string;
  groupName?: string;
  inviteRouteHash?: string;
};

export type GroupInviteRouteContext = {
  actionLabel: string;
  description: string;
  groupId: string;
  groupName?: string;
  returnPath: string;
};

export type GroupInviteDeliveryTarget = {
  conversationId: string;
  conversationPath: string;
  conversationTitle: string;
  deliveredAt: string;
  batchId: string;
  batchStartedAt: string;
};

export type GroupInviteReopenRecord = {
  conversationPath: string;
  conversationTitle: string;
  reopenedAt: string;
};

type GroupInviteDeliveryStore = {
  deliveryRecords: Record<string, GroupInviteDeliveryRecord>;
  deliveryTargets: Record<string, GroupInviteDeliveryTarget[]>;
  reopenRecords: Record<string, GroupInviteReopenRecord[]>;
};

const GROUP_INVITE_DELIVERY_STORAGE_KEY = "yinjie-group-invite-delivery";
const GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY =
  "yinjie-group-invite-delivery-targets";
const GROUP_INVITE_REOPEN_STORAGE_KEY = "yinjie-group-invite-reopen";
let groupInviteNativeWriteQueue: Promise<void> = Promise.resolve();

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isGroupInviteDeliveryRecord(
  value: unknown,
): value is GroupInviteDeliveryRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as GroupInviteDeliveryRecord).conversationId === "string" &&
      typeof (value as GroupInviteDeliveryRecord).conversationPath === "string" &&
      typeof (value as GroupInviteDeliveryRecord).conversationTitle === "string" &&
      typeof (value as GroupInviteDeliveryRecord).deliveredAt === "string" &&
      ((value as GroupInviteDeliveryRecord).groupName === undefined ||
        typeof (value as GroupInviteDeliveryRecord).groupName === "string") &&
      ((value as GroupInviteDeliveryRecord).inviteRouteHash === undefined ||
        typeof (value as GroupInviteDeliveryRecord).inviteRouteHash === "string"),
  );
}

function isGroupInviteDeliveryTarget(
  value: unknown,
): value is GroupInviteDeliveryTarget {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as GroupInviteDeliveryTarget).conversationId === "string" &&
      typeof (value as GroupInviteDeliveryTarget).conversationPath === "string" &&
      typeof (value as GroupInviteDeliveryTarget).conversationTitle === "string" &&
      typeof (value as GroupInviteDeliveryTarget).deliveredAt === "string" &&
      typeof (value as GroupInviteDeliveryTarget).batchId === "string" &&
      typeof (value as GroupInviteDeliveryTarget).batchStartedAt === "string",
  );
}

function isGroupInviteReopenRecord(
  value: unknown,
): value is GroupInviteReopenRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as GroupInviteReopenRecord).conversationPath === "string" &&
      typeof (value as GroupInviteReopenRecord).conversationTitle === "string" &&
      typeof (value as GroupInviteReopenRecord).reopenedAt === "string",
  );
}

function normalizeGroupInviteDeliveryRecords(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, GroupInviteDeliveryRecord>;
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, GroupInviteDeliveryRecord] => {
      const [groupId, record] = entry;
      return typeof groupId === "string" && isGroupInviteDeliveryRecord(record);
    }),
  );
}

function normalizeGroupInviteDeliveryTargets(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, GroupInviteDeliveryTarget[]>;
  }

  return Object.fromEntries(
    Object.entries(value).map(([groupId, records]) => [
      groupId,
      Array.isArray(records)
        ? records.filter(isGroupInviteDeliveryTarget)
        : ([] as GroupInviteDeliveryTarget[]),
    ]),
  ) as Record<string, GroupInviteDeliveryTarget[]>;
}

function normalizeGroupInviteReopenRecords(value: unknown) {
  if (!value || typeof value !== "object") {
    return {} as Record<string, GroupInviteReopenRecord[]>;
  }

  return Object.fromEntries(
    Object.entries(value).map(([groupId, records]) => [
      groupId,
      Array.isArray(records)
        ? records.filter(isGroupInviteReopenRecord)
        : ([] as GroupInviteReopenRecord[]),
    ]),
  ) as Record<string, GroupInviteReopenRecord[]>;
}

function normalizeGroupInviteDeliveryStore(
  value: unknown,
): GroupInviteDeliveryStore {
  if (!value || typeof value !== "object") {
    return {
      deliveryRecords: {} as Record<string, GroupInviteDeliveryRecord>,
      deliveryTargets: {} as Record<string, GroupInviteDeliveryTarget[]>,
      reopenRecords: {} as Record<string, GroupInviteReopenRecord[]>,
    };
  }

  const parsed = value as {
    deliveryRecords?: unknown;
    deliveryTargets?: unknown;
    reopenRecords?: unknown;
  };

  return {
    deliveryRecords: normalizeGroupInviteDeliveryRecords(parsed.deliveryRecords),
    deliveryTargets: normalizeGroupInviteDeliveryTargets(parsed.deliveryTargets),
    reopenRecords: normalizeGroupInviteReopenRecords(parsed.reopenRecords),
  };
}

function parseJsonMap<T>(
  raw: string | null,
  normalize: (value: unknown) => T,
  fallback: T,
) {
  if (!raw) {
    return fallback;
  }

  try {
    return normalize(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

function parseGroupInviteDeliveryStore(raw: string | null | undefined) {
  if (!raw) {
    return {
      deliveryRecords: {} as Record<string, GroupInviteDeliveryRecord>,
      deliveryTargets: {} as Record<string, GroupInviteDeliveryTarget[]>,
      reopenRecords: {} as Record<string, GroupInviteReopenRecord[]>,
    } satisfies GroupInviteDeliveryStore;
  }

  try {
    return normalizeGroupInviteDeliveryStore(JSON.parse(raw));
  } catch {
    return {
      deliveryRecords: {} as Record<string, GroupInviteDeliveryRecord>,
      deliveryTargets: {} as Record<string, GroupInviteDeliveryTarget[]>,
      reopenRecords: {} as Record<string, GroupInviteReopenRecord[]>,
    } satisfies GroupInviteDeliveryStore;
  }
}

function readLocalGroupInviteDeliveryStore(): GroupInviteDeliveryStore {
  const storage = getStorage();
  if (!storage) {
    return {
      deliveryRecords: {} as Record<string, GroupInviteDeliveryRecord>,
      deliveryTargets: {} as Record<string, GroupInviteDeliveryTarget[]>,
      reopenRecords: {} as Record<string, GroupInviteReopenRecord[]>,
    };
  }

  return {
    deliveryRecords: parseJsonMap(
      storage.getItem(GROUP_INVITE_DELIVERY_STORAGE_KEY),
      normalizeGroupInviteDeliveryRecords,
      {} as Record<string, GroupInviteDeliveryRecord>,
    ),
    deliveryTargets: parseJsonMap(
      storage.getItem(GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY),
      normalizeGroupInviteDeliveryTargets,
      {} as Record<string, GroupInviteDeliveryTarget[]>,
    ),
    reopenRecords: parseJsonMap(
      storage.getItem(GROUP_INVITE_REOPEN_STORAGE_KEY),
      normalizeGroupInviteReopenRecords,
      {} as Record<string, GroupInviteReopenRecord[]>,
    ),
  };
}

function hasGroupInviteDeliveryStoreData(store: GroupInviteDeliveryStore) {
  return (
    Object.keys(store.deliveryRecords).length > 0 ||
    Object.keys(store.deliveryTargets).length > 0 ||
    Object.keys(store.reopenRecords).length > 0
  );
}

function getLatestGroupInviteDeliveryStoreTimestamp(
  store: GroupInviteDeliveryStore,
) {
  const timestamps = [
    ...Object.values(store.deliveryRecords).map((record) =>
      Date.parse(record.deliveredAt),
    ),
    ...Object.values(store.deliveryTargets).flatMap((records) =>
      records.map((record) => Math.max(
        Date.parse(record.deliveredAt),
        Date.parse(record.batchStartedAt),
      )),
    ),
    ...Object.values(store.reopenRecords).flatMap((records) =>
      records.map((record) => Date.parse(record.reopenedAt)),
    ),
  ];

  return timestamps.reduce(
    (latest, current) =>
      Number.isFinite(current) && current > latest ? current : latest,
    0,
  );
}

function queueNativeGroupInviteDeliveryStoreWrite(
  store: GroupInviteDeliveryStore,
) {
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  const contents = JSON.stringify(store);
  groupInviteNativeWriteQueue = groupInviteNativeWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("desktop_write_group_invite_store", {
        contents,
      });
    })
    .catch(() => undefined);
}

function writeGroupInviteDeliveryStoreToLocal(
  store: GroupInviteDeliveryStore,
  options?: {
    syncNative?: boolean;
  },
) {
  const storage = getStorage();
  if (!storage) {
    return store;
  }

  if (Object.keys(store.deliveryRecords).length) {
    storage.setItem(
      GROUP_INVITE_DELIVERY_STORAGE_KEY,
      JSON.stringify(store.deliveryRecords),
    );
  } else {
    storage.removeItem(GROUP_INVITE_DELIVERY_STORAGE_KEY);
  }

  if (Object.keys(store.deliveryTargets).length) {
    storage.setItem(
      GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY,
      JSON.stringify(store.deliveryTargets),
    );
  } else {
    storage.removeItem(GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY);
  }

  if (Object.keys(store.reopenRecords).length) {
    storage.setItem(
      GROUP_INVITE_REOPEN_STORAGE_KEY,
      JSON.stringify(store.reopenRecords),
    );
  } else {
    storage.removeItem(GROUP_INVITE_REOPEN_STORAGE_KEY);
  }

  if (options?.syncNative !== false) {
    queueNativeGroupInviteDeliveryStoreWrite(store);
  }

  return store;
}

function readAllGroupInviteDeliveryRecords() {
  return readLocalGroupInviteDeliveryStore().deliveryRecords;
}

function readAllGroupInviteDeliveryTargets() {
  return readLocalGroupInviteDeliveryStore().deliveryTargets;
}

function readAllGroupInviteReopenRecords() {
  return readLocalGroupInviteDeliveryStore().reopenRecords;
}

export async function hydrateGroupInviteDeliveryFromNative() {
  const localStore = readLocalGroupInviteDeliveryStore();
  if (!isDesktopRuntimeAvailable()) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      exists: boolean;
      contents?: string | null;
    }>("desktop_read_group_invite_store");

    if (!result.exists) {
      if (hasGroupInviteDeliveryStoreData(localStore)) {
        queueNativeGroupInviteDeliveryStoreWrite(localStore);
      }
      return;
    }

    const nativeStore = parseGroupInviteDeliveryStore(result.contents ?? null);
    const shouldPreferLocal =
      (!hasGroupInviteDeliveryStoreData(nativeStore) &&
        hasGroupInviteDeliveryStoreData(localStore)) ||
      getLatestGroupInviteDeliveryStoreTimestamp(localStore) >
        getLatestGroupInviteDeliveryStoreTimestamp(nativeStore);

    if (shouldPreferLocal) {
      if (hasGroupInviteDeliveryStoreData(localStore)) {
        queueNativeGroupInviteDeliveryStoreWrite(localStore);
      }
      return;
    }

    writeGroupInviteDeliveryStoreToLocal(nativeStore, {
      syncNative: false,
    });
  } catch {
    return;
  }
}

export function readGroupInviteDeliveryRecord(groupId: string) {
  return readAllGroupInviteDeliveryRecords()[groupId] ?? null;
}

export function writeGroupInviteDeliveryRecord(
  groupId: string,
  input: {
    conversationId: string;
    conversationPath: string;
    conversationTitle: string;
    groupName?: string;
    inviteRouteHash?: string;
    batchId?: string;
    batchStartedAt?: string;
  },
) {
  const deliveredAt = new Date().toISOString();
  const nextRecord: GroupInviteDeliveryRecord = {
    conversationId: input.conversationId,
    conversationPath: input.conversationPath,
    conversationTitle: input.conversationTitle,
    deliveredAt,
    groupName: input.groupName?.trim() || undefined,
    inviteRouteHash: normalizeHash(input.inviteRouteHash),
  };

  const nextStore = readLocalGroupInviteDeliveryStore();
  nextStore.deliveryRecords[groupId] = nextRecord;
  nextStore.deliveryTargets[groupId] = [
    {
      conversationId: input.conversationId,
      conversationPath: input.conversationPath,
      conversationTitle: input.conversationTitle,
      deliveredAt,
      batchId: input.batchId?.trim() || createGroupInviteDeliveryBatchId(),
      batchStartedAt: input.batchStartedAt?.trim() || new Date().toISOString(),
    },
    ...(nextStore.deliveryTargets[groupId] ?? []).filter(
      (record) => record.conversationPath !== input.conversationPath,
    ),
  ].slice(0, 6);

  writeGroupInviteDeliveryStoreToLocal(nextStore);
  return nextRecord;
}

export function resolveGroupInviteRouteContext(
  conversationPath: string,
): GroupInviteRouteContext | null {
  const candidates = Object.entries(readAllGroupInviteDeliveryRecords())
    .filter(([, record]) => record.conversationPath === conversationPath)
    .sort(
      (left, right) =>
        Date.parse(right[1].deliveredAt) - Date.parse(left[1].deliveredAt),
    );
  const [groupId, record] = candidates[0] ?? [];

  if (!groupId || !record) {
    return null;
  }

  return {
    actionLabel: "回到群邀请",
    description: record.groupName
      ? `这条会话最近收到过「${record.groupName}」的群邀请。`
      : "这条会话最近收到过一个群邀请，可回到邀请页继续转发。",
    groupId,
    groupName: record.groupName,
    returnPath: buildGroupInviteReturnPath(groupId, {
      conversationPath,
      conversationTitle: record.conversationTitle,
      inviteRouteHash: record.inviteRouteHash,
    }),
  };
}

export function readGroupInviteDeliveryTargets(groupId: string) {
  return readAllGroupInviteDeliveryTargets()[groupId] ?? [];
}

export function readGroupInviteReopenRecords(groupId: string) {
  return readAllGroupInviteReopenRecords()[groupId] ?? [];
}

export function writeGroupInviteReopenRecord(
  groupId: string,
  input: {
    conversationPath: string;
    conversationTitle: string;
  },
) {
  const nextStore = readLocalGroupInviteDeliveryStore();
  nextStore.reopenRecords[groupId] = [
    {
      conversationPath: input.conversationPath,
      conversationTitle: input.conversationTitle,
      reopenedAt: new Date().toISOString(),
    },
    ...(nextStore.reopenRecords[groupId] ?? []).filter(
      (record) => record.conversationPath !== input.conversationPath,
    ),
  ].slice(0, 5);

  writeGroupInviteDeliveryStoreToLocal(nextStore);
  return nextStore.reopenRecords[groupId];
}

export function createGroupInviteDeliveryBatchId() {
  return `group-invite-batch-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function buildGroupInviteReturnSearch(input?: {
  conversationPath?: string;
  conversationTitle?: string;
}) {
  const params = new URLSearchParams();

  if (input?.conversationPath) {
    params.set("from", input.conversationPath);
  }

  if (input?.conversationTitle) {
    params.set("title", input.conversationTitle);
  }

  const search = params.toString();
  return search ? `?${search}` : undefined;
}

function normalizeHash(value?: string | null) {
  const nextValue = value?.trim();
  if (!nextValue) {
    return undefined;
  }

  return nextValue.startsWith("#") ? nextValue.slice(1) : nextValue;
}

function buildGroupInviteReturnPath(
  groupId: string,
  input?: {
    conversationPath?: string;
    conversationTitle?: string;
    inviteRouteHash?: string;
  },
) {
  const search = buildGroupInviteReturnSearch(input);
  const hash = normalizeHash(input?.inviteRouteHash);
  const path = search ? `/group/${groupId}/qr${search}` : `/group/${groupId}/qr`;
  return hash ? `${path}#${hash}` : path;
}

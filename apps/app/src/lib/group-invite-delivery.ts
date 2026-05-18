import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { isDesktopRuntimeAvailable } from "@yinjie/ui";

const t = translateRuntimeMessage;

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

// 走查 新 R1：group-qr-page 在 window "storage" 事件上挂了同步 handler——但
// 浏览器对 OTHER tab 任何 localStorage 写入都会 broadcast 一遍 storage event，
// 不管 key 是不是我们关心的。tab 之间换主题、记录 last viewed page、上次输入
// 草稿等等都会触发我们的 hydrate→读 3 个 storage key→setState×4。导出一个
// key 判别器让调用方过滤 event.key，避免无关 tab 写入触发同步开销。
export function isGroupInviteStorageKey(key: string | null | undefined) {
  if (!key) {
    // 老版本 Safari 在 localStorage.clear() 时 storage event 的 key=null，
    // 这种"清空所有 key"语义下还是应该全量同步一遍。
    return true;
  }
  return (
    key === GROUP_INVITE_DELIVERY_STORAGE_KEY ||
    key === GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY ||
    key === GROUP_INVITE_REOPEN_STORAGE_KEY
  );
}

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

// 走查新一轮 R2：localStorage.setItem 在两个常见场景会抛：
//   1. QuotaExceededError —— 5MB 配额满（用户聊天附件/邀请历史攒多了）
//   2. SecurityError —— Safari iOS 隐私模式下 localStorage 存在但 setItem
//      固定抛错（quota=0）
// 原版三处 setItem 全裸跑：
//   · writeGroupInviteDeliveryRecord(line 428) 被 group-qr-page sendToConversation
//     调用：抛错会被外层 catch 翻成 danger notice"未能把群邀请发到 X"——但
//     sendGroupMessage 已经成功，群邀请其实已经发到了，提示完全 misleading；
//     更糟糕的是用户重试一次还是抛同样的错，邀请被服务端收两遍。
//   · writeGroupInviteReopenRecord(line 489) 被 group-qr-page useEffect 调用：
//     useEffect 同步抛错会冒到 React error boundary —— 整个 QR 页直接白屏。
// 修：三段 setItem/removeItem 各裹一层 try/catch，单段失败不影响其它两段，
// 业务上"持久化降级"——内存里 React state 仍正确，下次会话再写就 OK。
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

  try {
    if (Object.keys(store.deliveryRecords).length) {
      storage.setItem(
        GROUP_INVITE_DELIVERY_STORAGE_KEY,
        JSON.stringify(store.deliveryRecords),
      );
    } else {
      storage.removeItem(GROUP_INVITE_DELIVERY_STORAGE_KEY);
    }
  } catch {
    // 配额满 / Safari 隐私模式 —— 静默降级，下次再写
  }

  try {
    if (Object.keys(store.deliveryTargets).length) {
      storage.setItem(
        GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY,
        JSON.stringify(store.deliveryTargets),
      );
    } else {
      storage.removeItem(GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY);
    }
  } catch {
    // 同上
  }

  try {
    if (Object.keys(store.reopenRecords).length) {
      storage.setItem(
        GROUP_INVITE_REOPEN_STORAGE_KEY,
        JSON.stringify(store.reopenRecords),
      );
    } else {
      storage.removeItem(GROUP_INVITE_REOPEN_STORAGE_KEY);
    }
  } catch {
    // 同上
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
    actionLabel: t(msg`回到群邀请`),
    description: record.groupName
      ? t(msg`这条会话最近收到过「${record.groupName}」的群邀请。`)
      : t(msg`这条会话最近收到过一个群邀请，可回到邀请页继续转发。`),
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

// 走查 R1：原版返回 "?from=...&title=..." 字符串，被 routes/group-chat-
// details-page.tsx / desktop-chat-details-panel.tsx 直接喂给
// `navigate({ search })`。TanStack Router 的 search 参数期望对象，传字符串
// 会被 Object.entries 当成 indexed iterable 拆成 `?0=%3F&1=f&2=r…` 一坨字符
// 级 entries，进而导致 GroupQrPage 接到非预期 URL → 全树错误边界兜底，
// 控制台一片 "useAppLocale must be used inside AppLocaleProvider"。这里
// 拆成两个函数：navigate 用对象版本，路径手动拼接走 string 版本。
export function buildGroupInviteReturnSearch(input?: {
  conversationPath?: string;
  conversationTitle?: string;
}): { from?: string; title?: string } | undefined {
  const result: { from?: string; title?: string } = {};
  if (input?.conversationPath) {
    result.from = input.conversationPath;
  }
  if (input?.conversationTitle) {
    result.title = input.conversationTitle;
  }
  return result.from || result.title ? result : undefined;
}

function buildGroupInviteReturnSearchString(input?: {
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
  const search = buildGroupInviteReturnSearchString(input);
  const hash = normalizeHash(input?.inviteRouteHash);
  const path = search ? `/group/${groupId}/qr${search}` : `/group/${groupId}/qr`;
  return hash ? `${path}#${hash}` : path;
}

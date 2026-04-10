export type GroupInviteDeliveryRecord = {
  conversationId: string;
  conversationPath: string;
  conversationTitle: string;
  deliveredAt: string;
  groupName?: string;
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
};

export type GroupInviteReopenRecord = {
  conversationPath: string;
  conversationTitle: string;
  reopenedAt: string;
};

const GROUP_INVITE_DELIVERY_STORAGE_KEY = "yinjie-group-invite-delivery";
const GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY =
  "yinjie-group-invite-delivery-targets";
const GROUP_INVITE_REOPEN_STORAGE_KEY = "yinjie-group-invite-reopen";

export function readGroupInviteDeliveryRecord(groupId: string) {
  if (typeof window === "undefined") {
    return null as GroupInviteDeliveryRecord | null;
  }

  const raw = window.localStorage.getItem(GROUP_INVITE_DELIVERY_STORAGE_KEY);
  if (!raw) {
    return null as GroupInviteDeliveryRecord | null;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, GroupInviteDeliveryRecord>;
    const record = parsed[groupId];
    if (
      !record ||
      typeof record.conversationId !== "string" ||
      typeof record.conversationPath !== "string" ||
      typeof record.conversationTitle !== "string" ||
      typeof record.deliveredAt !== "string"
    ) {
      return null as GroupInviteDeliveryRecord | null;
    }

    return record;
  } catch {
    return null as GroupInviteDeliveryRecord | null;
  }
}

export function writeGroupInviteDeliveryRecord(
  groupId: string,
  input: {
    conversationId: string;
    conversationPath: string;
    conversationTitle: string;
    groupName?: string;
  },
) {
  if (typeof window === "undefined") {
    return null as GroupInviteDeliveryRecord | null;
  }

  const nextRecord: GroupInviteDeliveryRecord = {
    conversationId: input.conversationId,
    conversationPath: input.conversationPath,
    conversationTitle: input.conversationTitle,
    deliveredAt: new Date().toISOString(),
    groupName: input.groupName?.trim() || undefined,
  };

  const nextState = readAllGroupInviteDeliveryRecords();
  nextState[groupId] = nextRecord;
  window.localStorage.setItem(
    GROUP_INVITE_DELIVERY_STORAGE_KEY,
    JSON.stringify(nextState),
  );
  writeGroupInviteDeliveryTarget(groupId, {
    conversationId: input.conversationId,
    conversationPath: input.conversationPath,
    conversationTitle: input.conversationTitle,
  });

  return nextRecord;
}

function readAllGroupInviteDeliveryRecords() {
  if (typeof window === "undefined") {
    return {} as Record<string, GroupInviteDeliveryRecord>;
  }

  const raw = window.localStorage.getItem(GROUP_INVITE_DELIVERY_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, GroupInviteDeliveryRecord>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, GroupInviteDeliveryRecord>;
    return parsed && typeof parsed === "object"
      ? parsed
      : ({} as Record<string, GroupInviteDeliveryRecord>);
  } catch {
    return {} as Record<string, GroupInviteDeliveryRecord>;
  }
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
    }),
  };
}

export function readGroupInviteDeliveryTargets(groupId: string) {
  if (typeof window === "undefined") {
    return [] as GroupInviteDeliveryTarget[];
  }

  const raw = window.localStorage.getItem(
    GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY,
  );
  if (!raw) {
    return [] as GroupInviteDeliveryTarget[];
  }

  try {
    const parsed = JSON.parse(
      raw,
    ) as Record<string, GroupInviteDeliveryTarget[]>;
    const records = parsed[groupId];
    if (!Array.isArray(records)) {
      return [] as GroupInviteDeliveryTarget[];
    }

    return records.filter(
      (record): record is GroupInviteDeliveryTarget =>
        Boolean(
          record &&
            typeof record.conversationId === "string" &&
            typeof record.conversationPath === "string" &&
            typeof record.conversationTitle === "string" &&
            typeof record.deliveredAt === "string",
        ),
    );
  } catch {
    return [] as GroupInviteDeliveryTarget[];
  }
}

export function readGroupInviteReopenRecords(groupId: string) {
  if (typeof window === "undefined") {
    return [] as GroupInviteReopenRecord[];
  }

  const raw = window.localStorage.getItem(GROUP_INVITE_REOPEN_STORAGE_KEY);
  if (!raw) {
    return [] as GroupInviteReopenRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, GroupInviteReopenRecord[]>;
    const records = parsed[groupId];
    if (!Array.isArray(records)) {
      return [] as GroupInviteReopenRecord[];
    }

    return records.filter(
      (record): record is GroupInviteReopenRecord =>
        Boolean(
          record &&
            typeof record.conversationPath === "string" &&
            typeof record.conversationTitle === "string" &&
            typeof record.reopenedAt === "string",
        ),
    );
  } catch {
    return [] as GroupInviteReopenRecord[];
  }
}

export function writeGroupInviteReopenRecord(
  groupId: string,
  input: {
    conversationPath: string;
    conversationTitle: string;
  },
) {
  if (typeof window === "undefined") {
    return [] as GroupInviteReopenRecord[];
  }

  const nextRecord: GroupInviteReopenRecord = {
    conversationPath: input.conversationPath,
    conversationTitle: input.conversationTitle,
    reopenedAt: new Date().toISOString(),
  };
  const nextState = readAllGroupInviteReopenRecords();
  const currentRecords = nextState[groupId] ?? [];

  nextState[groupId] = [
    nextRecord,
    ...currentRecords.filter(
      (record) => record.conversationPath !== nextRecord.conversationPath,
    ),
  ].slice(0, 5);
  window.localStorage.setItem(
    GROUP_INVITE_REOPEN_STORAGE_KEY,
    JSON.stringify(nextState),
  );

  return nextState[groupId];
}

function writeGroupInviteDeliveryTarget(
  groupId: string,
  input: {
    conversationId: string;
    conversationPath: string;
    conversationTitle: string;
  },
) {
  if (typeof window === "undefined") {
    return [] as GroupInviteDeliveryTarget[];
  }

  const nextRecord: GroupInviteDeliveryTarget = {
    conversationId: input.conversationId,
    conversationPath: input.conversationPath,
    conversationTitle: input.conversationTitle,
    deliveredAt: new Date().toISOString(),
  };
  const nextState = readAllGroupInviteDeliveryTargets();
  const currentRecords = nextState[groupId] ?? [];

  nextState[groupId] = [
    nextRecord,
    ...currentRecords.filter(
      (record) => record.conversationPath !== nextRecord.conversationPath,
    ),
  ].slice(0, 6);
  window.localStorage.setItem(
    GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY,
    JSON.stringify(nextState),
  );

  return nextState[groupId];
}

function readAllGroupInviteReopenRecords() {
  if (typeof window === "undefined") {
    return {} as Record<string, GroupInviteReopenRecord[]>;
  }

  const raw = window.localStorage.getItem(GROUP_INVITE_REOPEN_STORAGE_KEY);
  if (!raw) {
    return {} as Record<string, GroupInviteReopenRecord[]>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, GroupInviteReopenRecord[]>;
    return parsed && typeof parsed === "object"
      ? parsed
      : ({} as Record<string, GroupInviteReopenRecord[]>);
  } catch {
    return {} as Record<string, GroupInviteReopenRecord[]>;
  }
}

function readAllGroupInviteDeliveryTargets() {
  if (typeof window === "undefined") {
    return {} as Record<string, GroupInviteDeliveryTarget[]>;
  }

  const raw = window.localStorage.getItem(
    GROUP_INVITE_DELIVERY_TARGETS_STORAGE_KEY,
  );
  if (!raw) {
    return {} as Record<string, GroupInviteDeliveryTarget[]>;
  }

  try {
    const parsed = JSON.parse(
      raw,
    ) as Record<string, GroupInviteDeliveryTarget[]>;
    return parsed && typeof parsed === "object"
      ? parsed
      : ({} as Record<string, GroupInviteDeliveryTarget[]>);
  } catch {
    return {} as Record<string, GroupInviteDeliveryTarget[]>;
  }
}

function buildGroupInviteReturnPath(
  groupId: string,
  input?: {
    conversationPath?: string;
    conversationTitle?: string;
  },
) {
  const params = new URLSearchParams();

  if (input?.conversationPath) {
    params.set("from", input.conversationPath);
  }

  if (input?.conversationTitle) {
    params.set("title", input.conversationTitle);
  }

  const search = params.toString();
  return search ? `/group/${groupId}/qr?${search}` : `/group/${groupId}/qr`;
}

export type GroupInviteDeliveryRecord = {
  conversationId: string;
  conversationPath: string;
  conversationTitle: string;
  deliveredAt: string;
};

const GROUP_INVITE_DELIVERY_STORAGE_KEY = "yinjie-group-invite-delivery";

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
  };

  const nextState = readAllGroupInviteDeliveryRecords();
  nextState[groupId] = nextRecord;
  window.localStorage.setItem(
    GROUP_INVITE_DELIVERY_STORAGE_KEY,
    JSON.stringify(nextState),
  );

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

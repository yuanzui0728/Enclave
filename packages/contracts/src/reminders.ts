export type MessageReminderThreadType = "direct" | "group";

export interface MessageReminderRecord {
  id: string;
  sourceId: string;
  messageId: string;
  threadId: string;
  threadType: MessageReminderThreadType;
  threadTitle?: string;
  previewText: string;
  remindAt: string;
  notifiedAt?: string;
  createdAt: string;
}

export interface CreateMessageReminderRequest {
  threadId: string;
  threadType: MessageReminderThreadType;
  messageId: string;
  remindAt: string;
  notifiedAt?: string;
}

export interface MarkMessageReminderNotifiedRequest {
  notifiedAt?: string;
}

import type { Message } from "@yinjie/contracts";
import { sanitizeDisplayedChatText } from "../../lib/chat-text";
import { parseTimestamp } from "../../lib/format";

export const CONVERSATION_STRONG_REMINDER_DURATION_HOURS = 3;

export function isConversationStrongReminderActive(
  strongReminderUntil?: string | null,
  nowTimestamp = Date.now(),
) {
  const strongReminderTimestamp = parseTimestamp(strongReminderUntil);
  if (!strongReminderTimestamp) {
    return false;
  }

  return strongReminderTimestamp > nowTimestamp;
}

export function formatConversationStrongReminderRemaining(
  strongReminderUntil?: string | null,
  nowTimestamp = Date.now(),
) {
  const strongReminderTimestamp = parseTimestamp(strongReminderUntil);
  if (!strongReminderTimestamp || strongReminderTimestamp <= nowTimestamp) {
    return undefined;
  }

  const remainingMinutes = Math.max(
    1,
    Math.ceil((strongReminderTimestamp - nowTimestamp) / 60_000),
  );
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `剩余 ${hours}小时${minutes}分`;
  }

  if (hours > 0) {
    return `剩余 ${hours}小时`;
  }

  return `剩余 ${remainingMinutes}分`;
}

export function describeStrongReminderMessage(message: Message) {
  const text = sanitizeDisplayedChatText(message.text).trim();
  if (text) {
    return text;
  }

  switch (message.type) {
    case "image":
      return "[图片]";
    case "file":
      return "[文件]";
    case "voice":
      return "[语音]";
    case "contact_card":
      return "[名片]";
    case "location_card":
      return "[位置]";
    case "sticker":
      return "[表情]";
    default:
      return "发来了一条新消息";
  }
}

import { isApiRequestError } from "@yinjie/contracts";

// 走查 R1：原版只按 legacyMessage 字符串完全相等匹配（`Group ${id} not found`），
// 一旦后端 i18n / 调整文案 / 把 message 换成更友好的中文，全部 8 个子页（thread /
// details / edit / announcement / background / member-picker / message-search /
// qr）的"群聊不存在自动回退"全断，用户会卡在 stuck error state，要么白屏、要么
// 要手动按返回。后端早就用 AppError code='CHAT_GROUP_NOT_FOUND' 标记，前端 ApiRequestError
// 也已经把 errorCode 透出 — 优先按 code 命中，message 兜底保留向后兼容。
export function isMissingGroupError(error: unknown, groupId: string) {
  if (isApiRequestError(error) && error.code === "CHAT_GROUP_NOT_FOUND") {
    if (error.params?.groupId === undefined) {
      return true;
    }
    return error.params.groupId === groupId;
  }

  return (
    error instanceof Error && error.message.trim() === `Group ${groupId} not found`
  );
}

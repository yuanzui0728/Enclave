import { msg } from "@lingui/macro";
import { isApiRequestError } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { translateAppErrorCode } from "./error-translate";

const NETWORK_ERROR_MESSAGES = new Set([
  "Failed to fetch",
  "NetworkError when attempting to fetch resource.",
  "Load failed",
  "fetch failed",
]);
const SERVICE_UNAVAILABLE_PATTERNS = [
  /^Request failed: 5\d\d$/,
  /^Internal Server Error$/i,
  /^Service Unavailable$/i,
];

// cloud-api 的 CloudClientAuthGuard / ban guard 直接抛裸英文 message——
// 服务端有意保留英文（cloud-client-auth.guard.ts 有 i18n-ignore-start 注释）。
// 客户端要按 status + 已知 message 集合把它们翻成当前 locale 的"会话已失效"
// / "账号被停用"，否则 zh-CN / ja-JP / ko-KR 用户在「账号安全 → 发送验证码」
// / 「修改密码」等位置看到的反馈就是裸英文 "Invalid or expired cloud
// access token."。
const CLOUD_AUTH_401_MESSAGES = new Set([
  "Missing cloud access token.",
  "Invalid or expired cloud access token.",
  "Invalid cloud access token.",
]);
const CLOUD_ACCOUNT_FORBIDDEN_MESSAGES = new Set([
  "This cloud account has been banned.",
  "This cloud account has been archived.",
]);

export function describeRequestError(error: unknown, fallback?: string) {
  const resolvedFallback =
    fallback ?? translateRuntimeMessage(msg`请求失败，请稍后重试。`);

  if (isApiRequestError(error)) {
    const message = error.message.trim();
    if (error.statusCode === 401 && CLOUD_AUTH_401_MESSAGES.has(message)) {
      return translateRuntimeMessage(
        msg`云账号会话已失效，请重新登录后再试。`,
      );
    }
    if (
      error.statusCode === 403 &&
      CLOUD_ACCOUNT_FORBIDDEN_MESSAGES.has(message)
    ) {
      return translateRuntimeMessage(
        msg`当前云账号已被停用，请联系管理员或重新登录。`,
      );
    }
    // 2026-05-22 走查移动端单聊 R2：走 /chat/<不存在>id 时 server 返
    // CHAT_CONVERSATION_NOT_FOUND + params.conversationId + legacyMessage
    // "Conversation X not found"。原 fallback 一路用 error.message（= 服务端
    // legacyMessage），整个 zh-CN APP 在「会话暂时不可用」卡片底下亮出整段英文
    // "Conversation direct_xxx not found"。error-translate.ts:393 早就为
    // CHAT_CONVERSATION_NOT_FOUND / CHAT_GROUP_NOT_FOUND / CHAT_MESSAGE_NOT_FOUND
    // 等准备了 zh-CN/en-US/ja-JP 三套文案，但 describeRequestError 没接进来。
    // 把 translateAppErrorCode 放在 cloud-auth/账号 ban 检查之后、netError 之前
    // 命中所有 KnownAppErrorCode；命中不到返回 null → 继续走旧的 fallback 链。
    const translated = translateAppErrorCode(error);
    if (translated) {
      return translated;
    }
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (error.name === "AbortError") {
      return translateRuntimeMessage(msg`请求已中断，请稍后重试。`);
    }

    if (NETWORK_ERROR_MESSAGES.has(message)) {
      return translateRuntimeMessage(
        msg`当前无法连接到隐界世界，请先检查世界地址和网络连接。`,
      );
    }

    if (SERVICE_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(message))) {
      return translateRuntimeMessage(
        msg`当前隐界世界暂时不可用，请确认世界服务已经启动后重试。`,
      );
    }

    // 后端把 JSON 接口路径配错 / 走到 SPA index.html / nginx 回了 HTML
    // 错误页时，调用方 JSON.parse 抛 SyntaxError "Unexpected token <"。
    // 这种错对终端用户没意义，统一翻成"服务地址异常"。
    if (
      error.name === "SyntaxError" ||
      /^Unexpected token/.test(message) ||
      /is not valid JSON/i.test(message)
    ) {
      return translateRuntimeMessage(
        msg`服务返回异常响应，请检查世界地址是否正确或稍后重试。`,
      );
    }

    // 走查移动端我-tab 端到端 2026-05-22：网关 / 反代 / mock server 返
    // `{"statusCode":500}` 这种"只有 body 没 message"的偷懒响应时，contracts
    // client 的 resolveRequestErrorMessage 会把整段 raw JSON 字符串当 message
    // 抛出来 —— 用户面看到的就是 `提交失败：{"statusCode":500}` 这种暴露内部
    // 结构的丑陋文案。前端这一层也兜一次：检测 message 像 JSON object/array
    // 字符串就翻成本地化 fallback。和 contracts 同款修法双重保险。
    if (message.startsWith("{") || message.startsWith("[")) {
      if (isApiRequestError(error) && error.statusCode >= 500) {
        return translateRuntimeMessage(msg`服务器暂时不可用，请稍后再试。`);
      }
      return resolvedFallback;
    }

    return message || resolvedFallback;
  }

  return resolvedFallback;
}

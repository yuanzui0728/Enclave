import { isApiRequestError } from "@yinjie/contracts";

// 公网隧道下 world(:4100)偶发被共享事件循环短暂卡住 → 返回 5xx（502/504/500），
// 或隧道抖动 → fetch 抛错被包成 network_error（ApiRequestError.statusCode === 0）。
// 这类是「再试一下就好」的瞬时故障：进聊天页首打就撞上时，会话面板会直接弹错误态，
// 用户表现为「切页面报错、再进去就好」。这里对聊天数据查询只针对瞬时故障做有上限的
// 指数退避重试，把这类抖动自动吃掉；4xx（401 未鉴权 / 403 / 404 / 413 等业务确定性
// 错误）绝不重试——重试既无意义，又会给已过载的 world 雪上加霜。
const MAX_TRANSIENT_RETRIES = 3;

export function isTransientApiError(error: unknown): boolean {
  if (isApiRequestError(error)) {
    // statusCode 0 = fetch 抛错被包成 network_error；>= 500 = 服务端瞬时错误。
    return error.statusCode === 0 || error.statusCode >= 500;
  }
  // 非 ApiRequestError（socket 断开 / 未知抛错）按瞬时处理，给一次重试机会。
  return true;
}

export function transientQueryRetry(
  failureCount: number,
  error: unknown,
): boolean {
  if (!isTransientApiError(error)) {
    return false;
  }
  return failureCount < MAX_TRANSIENT_RETRIES;
}

// 指数退避 + 上限：300ms → 600ms → 1200ms（封顶 2s）。隧道 RTT ~0.75s，
// 这个退避足以覆盖 world 一两秒的卡顿窗口，又不至于让用户等太久才看到错误。
export function transientQueryRetryDelay(attemptIndex: number): number {
  return Math.min(300 * 2 ** attemptIndex, 2000);
}

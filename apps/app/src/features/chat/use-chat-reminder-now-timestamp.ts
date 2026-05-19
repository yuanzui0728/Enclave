import { useEffect, useState } from "react";

export function useChatReminderNowTimestamp(reminderCount: number) {
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  useEffect(() => {
    if (reminderCount <= 0) {
      return;
    }

    // 走查再走一轮 R2：原版只在 reminderCount > 0 期间挂 30s interval 推进
    // nowTimestamp，下方 useChatReminderEntries 用这个 timestamp 算
    // isDue/notified/pending。问题：useState lazy init 只在 hook mount
    // 那一刻取一次 Date.now()，挂在 mobile-shell / chat-list-page /
    // chat-message-list 等常驻 surface 上的实例可能 mount 几小时后
    // reminderCount 才从 0 变 1（用户新建第一条提醒）。此时本 effect 才
    // 第一次执行 → 但 nowTimestamp 还是 mount 时的旧值 → buildChatReminderEntries
    // 拿"几小时前的 now"算第一条 reminder 的 isDue 永远 false，直到 30s
    // 后 interval 第一次 tick 才纠正。极端 case：remindAt 在过去 5 分钟
    // 但 stale now 在过去 2 小时（now < remindAt）→ 应当显示"已到时"的
    // reminder 被错算成"等待中"，最长 30s 视觉延迟。修法：每次 effect
    // 跑（reminderCount 0→N 转折也算）先把 timestamp 拉到当前，再开 interval。
    setNowTimestamp(Date.now());
    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [reminderCount]);

  return nowTimestamp;
}

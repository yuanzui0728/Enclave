import { useEffect, useState } from "react";

export function useChatReminderNowTimestamp(reminderCount: number) {
  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());

  useEffect(() => {
    if (reminderCount <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [reminderCount]);

  return nowTimestamp;
}

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSystemStatus } from "@yinjie/contracts";
import { resolveDigitalHumanEntryGuardCopy } from "./digital-human-entry-guard";

type DigitalHumanEntryNotice = ReturnType<
  typeof resolveDigitalHumanEntryGuardCopy
>;

export function useDigitalHumanEntryGuard({
  baseUrl,
  enabled = true,
}: {
  baseUrl?: string;
  enabled?: boolean;
}) {
  const [entryNotice, setEntryNotice] = useState<DigitalHumanEntryNotice>(null);
  const [videoGuardKey, setVideoGuardKey] = useState<string | null>(
    null,
  );
  // 走查 R3：每进一段单聊都触发 systemStatus 重发判断 digital human gateway
  // 是否可用——用户在多个单聊间切换时这条会重复跑很多次。gateway 状态变化
  // 是分钟级的，30s staleTime 足够新鲜，可以省掉切会话的重复 RTT。
  // 走查 R2（第 2 轮）：原 ["system-status", baseUrl] 跟 mobile-ai-call-screen
  // 的 ["app-system-status", baseUrl] / desktop-direct-call-panel 的
  // ["desktop-direct-call-system-status", ...] 三处独立 cache，单聊里
  // chat-details 守卫已经拉过一份新鲜，用户点视频/语音通话进 call 屏时仍要
  // 再拉一次相同的 GET /system-status（公网隧道 ~600ms 卡顿）。统一到
  // app-system-status，三处共享同一份 cache + 30s staleTime。
  const systemStatusQuery = useQuery({
    queryKey: ["app-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
    enabled: enabled && Boolean(baseUrl),
    staleTime: 30_000,
  });

  const resetEntryGuard = useCallback(() => {
    setEntryNotice(null);
    setVideoGuardKey(null);
  }, []);

  const clearEntryNotice = useCallback(() => {
    setEntryNotice(null);
  }, []);

  const guardVideoEntry = useCallback(() => {
    setEntryNotice(null);

    const guardCopy = resolveDigitalHumanEntryGuardCopy(
      systemStatusQuery.data?.digitalHumanGateway,
    );

    if (guardCopy && videoGuardKey !== guardCopy.key) {
      setVideoGuardKey(guardCopy.key);
      setEntryNotice(guardCopy);
      return false;
    }

    setVideoGuardKey(null);
    return true;
  }, [systemStatusQuery.data?.digitalHumanGateway, videoGuardKey]);

  return {
    entryNotice,
    clearEntryNotice,
    guardVideoEntry,
    resetEntryGuard,
  };
}

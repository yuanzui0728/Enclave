import { useQuery } from "@tanstack/react-query";
import {
  getConversationBackground,
  getGroupBackground,
  getWorldOwner,
} from "@yinjie/contracts";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

// 走查 R2：背景是几乎不变的"皮肤"数据——用户设置一次后多久不会再改。
// 但每次进单聊 / 切群 / 开「聊天信息」侧栏都会触发 useConversationBackground
// 重 mount，react-query 默认 staleTime=0 → 每次都重发 getConversationBackground。
// 公网隧道 RTT ~600ms × N 次切换 = 累计明显卡顿。背景设置后会主动 invalidate
// 这两个 query key，所以 staleTime: 60s 不会让用户看到过期数据。
export function useConversationBackground(conversationId: string) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  return useQuery({
    queryKey: ["app-conversation-background", baseUrl, conversationId],
    queryFn: () => getConversationBackground(conversationId, baseUrl),
    enabled: Boolean(conversationId),
    staleTime: 60_000,
  });
}

export function useDefaultChatBackground() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  // world-owner 是高复用 key（其他多处共用同样 key），保守 30s。
  return useQuery({
    queryKey: ["world-owner", baseUrl],
    queryFn: () => getWorldOwner(baseUrl),
    staleTime: 30_000,
  });
}

export function useGroupBackground(groupId: string) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  return useQuery({
    queryKey: ["app-group-background", baseUrl, groupId],
    queryFn: () => getGroupBackground(groupId, baseUrl),
    enabled: Boolean(groupId),
    staleTime: 60_000,
  });
}

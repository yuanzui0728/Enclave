import { useQuery } from "@tanstack/react-query";
import {
  getConversationBackground,
  getGroupBackground,
  getWorldOwner,
} from "@yinjie/contracts";
import { useAppRuntimeConfig } from "../../../runtime/runtime-config-store";

export function useConversationBackground(conversationId: string) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  return useQuery({
    queryKey: ["app-conversation-background", baseUrl, conversationId],
    queryFn: () => getConversationBackground(conversationId, baseUrl),
    enabled: Boolean(conversationId),
  });
}

export function useDefaultChatBackground() {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  return useQuery({
    queryKey: ["world-owner", baseUrl],
    queryFn: () => getWorldOwner(baseUrl),
  });
}

export function useGroupBackground(groupId: string) {
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  return useQuery({
    queryKey: ["app-group-background", baseUrl, groupId],
    queryFn: () => getGroupBackground(groupId, baseUrl),
    enabled: Boolean(groupId),
  });
}

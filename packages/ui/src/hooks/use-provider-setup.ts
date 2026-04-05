import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { getAvailableModels, getProviderConfig, setProviderConfig, testProviderConnection } from "@yinjie/contracts";
import {
  buildProviderConfigPayload,
  defaultProviderConfig,
  normalizeProviderConfig,
  type ProviderConfig,
  validateProviderConfig,
} from "@yinjie/config";

type UseProviderSetupOptions = {
  baseUrl?: string;
  enabled: boolean;
  queryKeyPrefix: string;
  invalidateOnSave?: QueryKey[];
};

export function useProviderSetup({
  baseUrl,
  enabled,
  queryKeyPrefix,
  invalidateOnSave = [],
}: UseProviderSetupOptions) {
  const queryClient = useQueryClient();
  const [providerDraft, setProviderDraft] = useState<ProviderConfig>(defaultProviderConfig);
  const [providerDraftDirty, setProviderDraftDirty] = useState(false);
  const [providerValidationMessage, setProviderValidationMessage] = useState<string | null>(null);

  const providerQuery = useQuery({
    queryKey: [queryKeyPrefix, "provider-config", baseUrl],
    queryFn: () => getProviderConfig(baseUrl),
    enabled,
    retry: false,
  });

  const availableModelsQuery = useQuery({
    queryKey: [queryKeyPrefix, "available-models", baseUrl],
    queryFn: () => getAvailableModels(baseUrl),
    enabled,
    retry: false,
  });

  useEffect(() => {
    if (!providerQuery.data || providerDraftDirty) {
      return;
    }

    setProviderDraft(normalizeProviderConfig(providerQuery.data));
  }, [providerDraftDirty, providerQuery.data]);

  const providerProbeMutation = useMutation({
    mutationFn: (values: ProviderConfig) => testProviderConnection(buildProviderConfigPayload(values), baseUrl),
  });

  const providerSaveMutation = useMutation({
    mutationFn: async (values: ProviderConfig) => normalizeProviderConfig(await setProviderConfig(buildProviderConfigPayload(values), baseUrl)),
    onSuccess: async (provider: ProviderConfig) => {
      setProviderDraft(normalizeProviderConfig(provider));
      setProviderDraftDirty(false);
      setProviderValidationMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [queryKeyPrefix, "provider-config", baseUrl] }),
        ...invalidateOnSave.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      ]);
    },
  });

  const providerReady = Boolean(providerQuery.data?.model?.trim());

  function updateProviderDraft<K extends keyof ProviderConfig>(field: K, value: ProviderConfig[K]) {
    setProviderDraft((current) => ({ ...current, [field]: value }));
    setProviderDraftDirty(true);
    setProviderValidationMessage(null);
  }

  function readValidatedProviderDraft() {
    const parsed = validateProviderConfig(providerDraft);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setProviderValidationMessage(issue?.message ?? "Provider configuration is invalid.");
      return null;
    }

    setProviderValidationMessage(null);
    return parsed.data;
  }

  function submitProviderProbe() {
    const values = readValidatedProviderDraft();
    if (values) {
      providerProbeMutation.mutate(values);
    }
  }

  function submitProviderSave() {
    const values = readValidatedProviderDraft();
    if (values) {
      providerSaveMutation.mutate(values);
    }
  }

  return {
    availableModelsQuery,
    providerDraft,
    providerProbeMutation,
    providerQuery,
    providerReady,
    providerSaveMutation,
    providerValidationMessage,
    submitProviderProbe,
    submitProviderSave,
    updateProviderDraft,
  };
}

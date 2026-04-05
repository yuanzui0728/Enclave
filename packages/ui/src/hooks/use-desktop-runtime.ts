import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  getDesktopCoreApiStatus,
  getDesktopRuntimeDiagnostics,
  getDesktopRuntimeContext,
  isDesktopRuntimeAvailable,
  probeDesktopCoreApiHealth,
  restartDesktopCoreApi,
  startDesktopCoreApi,
  stopDesktopCoreApi,
} from "../runtime/desktop-runtime";

type UseDesktopRuntimeOptions = {
  queryKeyPrefix: string;
  statusRefetchInterval?: number;
  invalidateOnAction?: QueryKey[];
};

export function useDesktopRuntime({
  queryKeyPrefix,
  statusRefetchInterval = 5_000,
  invalidateOnAction = [],
}: UseDesktopRuntimeOptions) {
  const queryClient = useQueryClient();
  const desktopAvailable = isDesktopRuntimeAvailable();
  const statusQueryKey: QueryKey = [queryKeyPrefix, "core-api-status"];
  const contextQueryKey: QueryKey = [queryKeyPrefix, "runtime-context"];
  const diagnosticsQueryKey: QueryKey = [queryKeyPrefix, "runtime-diagnostics"];

  const runtimeContextQuery = useQuery({
    queryKey: contextQueryKey,
    queryFn: getDesktopRuntimeContext,
    enabled: desktopAvailable,
  });

  const desktopStatusQuery = useQuery({
    queryKey: statusQueryKey,
    queryFn: getDesktopCoreApiStatus,
    enabled: desktopAvailable,
    refetchInterval: statusRefetchInterval,
  });

  const runtimeDiagnosticsQuery = useQuery({
    queryKey: diagnosticsQueryKey,
    queryFn: getDesktopRuntimeDiagnostics,
    enabled: desktopAvailable,
  });

  async function invalidateRuntimeQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: statusQueryKey }),
      queryClient.invalidateQueries({ queryKey: contextQueryKey }),
      queryClient.invalidateQueries({ queryKey: diagnosticsQueryKey }),
      ...invalidateOnAction.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ]);
  }

  const probeMutation = useMutation({
    mutationFn: probeDesktopCoreApiHealth,
    onSuccess: invalidateRuntimeQueries,
  });

  const startMutation = useMutation({
    mutationFn: startDesktopCoreApi,
    onSuccess: invalidateRuntimeQueries,
  });

  const stopMutation = useMutation({
    mutationFn: stopDesktopCoreApi,
    onSuccess: invalidateRuntimeQueries,
  });

  const restartMutation = useMutation({
    mutationFn: restartDesktopCoreApi,
    onSuccess: invalidateRuntimeQueries,
  });

  return {
    desktopAvailable,
    desktopStatusQuery,
    probeMutation,
    restartMutation,
    runtimeDiagnosticsQuery,
    runtimeContextQuery,
    startMutation,
    stopMutation,
  };
}

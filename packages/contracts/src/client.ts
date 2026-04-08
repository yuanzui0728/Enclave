import type {
  AuthSession,
  AuthSessionSummary,
  InitUserRequest,
  LoginRequest,
  SuccessResponse,
  RegisterRequest,
  UpdateUserRequest,
} from "./auth";
import type {
  AddGroupMemberRequest,
  Conversation,
  ConversationListItem,
  CreateGroupRequest,
  GetOrCreateConversationRequest,
  Group,
  GroupMember,
  GroupMessage,
  Message,
  SendGroupMessageRequest,
} from "./chat";
import type { Character, CharacterDraft } from "./characters";
import type { AiModelResponse, AvailableModelsResponse, UpdateAiModelRequest } from "./config";
import type {
  CreateFeedCommentRequest,
  FeedComment,
  CreateFeedPostRequest,
  FeedListResponse,
  FeedPost,
  FeedPostWithComments,
  LikeFeedPostRequest,
} from "./feed";
import type {
  CreateMomentCommentRequest,
  CreateUserMomentRequest,
  Moment,
  MomentComment,
  ToggleMomentLikeRequest,
  ToggleMomentLikeResult,
} from "./moments";
import type {
  CreateModerationReportRequest,
  ModerationReport,
} from "./moderation";
import type {
  AcceptFriendRequestRequest,
  BlockCharacterRequest,
  BlockedCharacter,
  DeclineFriendRequestRequest,
  FriendListItem,
  FriendRequest,
  SendFriendRequestRequest,
  ShakeRequest,
  ShakeResult,
  TriggerSceneRequest,
  UnblockCharacterRequest,
} from "./social";
import type {
  InferencePreviewRequest,
  InferencePreviewResponse,
  LogIndexResponse,
  OperationResult,
  ProviderConfig,
  ProviderTestRequest,
  ProviderTestResult,
  RealtimeStatus,
  SchedulerStatus,
  SystemStatus,
} from "./system";
import type { WorldContext } from "./world";
import type {
  CompareEvalRunsRequest,
  EvalComparisonRecord,
  EvalDatasetDetail,
  EvalDatasetManifest,
  EvalExperimentPresetRecord,
  EvalExperimentReportRecord,
  EvalExperimentRunResponse,
  EvalMemoryStrategyRecord,
  EvalOverview,
  EvalPromptVariantRecord,
  ListEvalComparisonsQuery,
  ListEvalRunsQuery,
  PairwiseEvalRunResponse,
  EvalRunRecord,
  GenerationTrace,
  PersonaAssetRecord,
  RunPairwiseEvalRequest,
  RunEvalDatasetRequest,
  UpdateEvalReportDecisionRequest,
} from "./evals";
import { LEGACY_API_PREFIX } from "./api";

export const DEFAULT_CORE_API_BASE_URL = "http://localhost:39091";
let authTokenProvider: (() => string | null | undefined) | null = null;
let coreApiBaseUrlProvider: (() => string | null | undefined) | null = null;

export function resolveCoreApiBaseUrl(override?: string, options?: { allowDefault?: boolean }) {
  const configuredValue = override || coreApiBaseUrlProvider?.();
  if (configuredValue) {
    return configuredValue;
  }

  if (options?.allowDefault === false) {
    return undefined;
  }

  return DEFAULT_CORE_API_BASE_URL;
}

export function setAuthTokenProvider(provider: (() => string | null | undefined) | null) {
  authTokenProvider = provider;
}

export function setCoreApiBaseUrlProvider(provider: (() => string | null | undefined) | null) {
  coreApiBaseUrlProvider = provider;
}

async function request<T>(path: string, init?: RequestInit, baseUrl?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = authTokenProvider?.();

  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${resolveCoreApiBaseUrl(baseUrl)}${path}`, {
    headers,
    ...init,
  });

  const rawBody = await response.text();

  if (!response.ok) {
    let body: { message?: string } | null = null;

    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as { message?: string };
      } catch {
        body = null;
      }
    }

    const message = body?.message ?? rawBody;
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return (rawBody ? (JSON.parse(rawBody) as T) : undefined) as T;
}

function requestLegacyApi<T>(path: string, init?: RequestInit, baseUrl?: string) {
  return request<T>(`${LEGACY_API_PREFIX}${path}`, init, baseUrl);
}

export function getSystemStatus(baseUrl?: string) {
  return request<SystemStatus>("/system/status", undefined, baseUrl);
}

export function getSchedulerStatus(baseUrl?: string) {
  return request<SchedulerStatus>("/system/scheduler", undefined, baseUrl);
}

export function runSchedulerJob(id: string, baseUrl?: string) {
  return request<OperationResult>(
    `/system/scheduler/run/${encodeURIComponent(id)}`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getRealtimeStatus(baseUrl?: string) {
  return request<RealtimeStatus>("/system/realtime", undefined, baseUrl);
}

export function testProviderConnection(payload: ProviderTestRequest, baseUrl?: string) {
  return request<ProviderTestResult>(
    "/system/provider/test",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getProviderConfig(baseUrl?: string) {
  return request<ProviderConfig>("/system/provider", undefined, baseUrl);
}

export function setProviderConfig(payload: ProviderConfig, baseUrl?: string) {
  return request<ProviderConfig>(
    "/system/provider",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function runInferencePreview(payload: InferencePreviewRequest, baseUrl?: string) {
  return request<InferencePreviewResponse>(
    "/system/inference/preview",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getSystemLogs(baseUrl?: string) {
  return request<LogIndexResponse>("/system/logs", undefined, baseUrl);
}

export function getEvalOverview(baseUrl?: string) {
  return request<EvalOverview>("/system/evals/overview", undefined, baseUrl);
}

export function listEvalDatasets(baseUrl?: string) {
  return request<EvalDatasetManifest[]>("/system/evals/datasets", undefined, baseUrl);
}

export function listEvalMemoryStrategies(baseUrl?: string) {
  return request<EvalMemoryStrategyRecord[]>("/system/evals/strategies", undefined, baseUrl);
}

export function listEvalPromptVariants(baseUrl?: string) {
  return request<EvalPromptVariantRecord[]>("/system/evals/prompt-variants", undefined, baseUrl);
}

export function listEvalExperimentPresets(baseUrl?: string) {
  return request<EvalExperimentPresetRecord[]>("/system/evals/experiments", undefined, baseUrl);
}

export function runEvalExperimentPreset(id: string, baseUrl?: string) {
  return request<EvalExperimentRunResponse>(
    `/system/evals/experiments/${encodeURIComponent(id)}/run`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function listEvalExperimentReports(baseUrl?: string) {
  return request<EvalExperimentReportRecord[]>("/system/evals/reports", undefined, baseUrl);
}

export function updateEvalReportDecision(id: string, payload: UpdateEvalReportDecisionRequest, baseUrl?: string) {
  return request<EvalExperimentReportRecord>(
    `/system/evals/reports/${encodeURIComponent(id)}/decision`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getEvalDataset(id: string, baseUrl?: string) {
  return request<EvalDatasetDetail>(`/system/evals/datasets/${encodeURIComponent(id)}`, undefined, baseUrl);
}

export function listEvalRuns(baseUrl?: string) {
  return request<EvalRunRecord[]>("/system/evals/runs", undefined, baseUrl);
}

export function listEvalRunsWithQuery(query: ListEvalRunsQuery, baseUrl?: string) {
  const params = new URLSearchParams();
  if (query.datasetId) params.set("datasetId", query.datasetId);
  if (query.experimentLabel) params.set("experimentLabel", query.experimentLabel);
  if (query.providerModel) params.set("providerModel", query.providerModel);
  if (query.judgeModel) params.set("judgeModel", query.judgeModel);
  if (query.promptVariant) params.set("promptVariant", query.promptVariant);
  if (query.memoryPolicyVariant) params.set("memoryPolicyVariant", query.memoryPolicyVariant);
  const suffix = params.toString();

  return request<EvalRunRecord[]>(
    `/system/evals/runs${suffix ? `?${suffix}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function getEvalRun(id: string, baseUrl?: string) {
  return request<EvalRunRecord>(`/system/evals/runs/${encodeURIComponent(id)}`, undefined, baseUrl);
}

export function runEvalDataset(payload: RunEvalDatasetRequest, baseUrl?: string) {
  return request<EvalRunRecord>(
    "/system/evals/runs",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function compareEvalRuns(payload: CompareEvalRunsRequest, baseUrl?: string) {
  return request<EvalComparisonRecord>(
    "/system/evals/compare",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listEvalComparisonsWithQuery(query: ListEvalComparisonsQuery, baseUrl?: string) {
  const params = new URLSearchParams();
  if (query.datasetId) params.set("datasetId", query.datasetId);
  if (query.experimentLabel) params.set("experimentLabel", query.experimentLabel);
  if (query.providerModel) params.set("providerModel", query.providerModel);
  if (query.judgeModel) params.set("judgeModel", query.judgeModel);
  if (query.promptVariant) params.set("promptVariant", query.promptVariant);
  if (query.memoryPolicyVariant) params.set("memoryPolicyVariant", query.memoryPolicyVariant);
  const suffix = params.toString();

  return request<EvalComparisonRecord[]>(
    `/system/evals/comparisons${suffix ? `?${suffix}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function runPairwiseEval(payload: RunPairwiseEvalRequest, baseUrl?: string) {
  return request<PairwiseEvalRunResponse>(
    "/system/evals/compare/run",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listGenerationTraces(baseUrl?: string) {
  return request<GenerationTrace[]>("/system/evals/traces", undefined, baseUrl);
}

export function listGenerationTracesWithQuery(
  query: {
    source?: string;
    status?: string;
    characterId?: string;
    limit?: number;
  },
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (query.source) params.set("source", query.source);
  if (query.status) params.set("status", query.status);
  if (query.characterId) params.set("characterId", query.characterId);
  if (typeof query.limit === "number") params.set("limit", String(query.limit));
  const suffix = params.toString();

  return request<GenerationTrace[]>(
    `/system/evals/traces${suffix ? `?${suffix}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function getGenerationTrace(id: string, baseUrl?: string) {
  return request<GenerationTrace>(`/system/evals/traces/${encodeURIComponent(id)}`, undefined, baseUrl);
}

export function listPersonaAssets(_baseUrl?: string) {
  return Promise.resolve<PersonaAssetRecord[]>([]);
}

export function exportDiagnostics(baseUrl?: string) {
  return request<OperationResult>(
    "/system/diag/export",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function createBackup(baseUrl?: string) {
  return request<OperationResult>(
    "/system/backup/create",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function restoreBackup(baseUrl?: string) {
  return request<OperationResult>(
    "/system/backup/restore",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function registerUser(payload: RegisterRequest, baseUrl?: string) {
  return requestLegacyApi<AuthSession>(
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function loginUser(payload: LoginRequest, baseUrl?: string) {
  return requestLegacyApi<AuthSession>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function initUser(payload: InitUserRequest, baseUrl?: string) {
  return requestLegacyApi<AuthSession>(
    "/auth/init",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listAuthSessions(baseUrl?: string) {
  return requestLegacyApi<AuthSessionSummary[]>("/auth/sessions", undefined, baseUrl);
}

export function revokeAuthSession(sessionId: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/auth/sessions/${sessionId}/revoke`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function logoutCurrentSession(baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    "/auth/logout",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function logoutAllSessions(baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    "/auth/logout-all",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function completeOnboarding(userId: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/auth/users/${userId}/onboarding-complete`,
    {
      method: "PATCH",
    },
    baseUrl,
  );
}

export function updateUser(userId: string, payload: UpdateUserRequest, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/auth/users/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function deleteUser(userId: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/auth/users/${userId}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function getAiModel(baseUrl?: string) {
  return requestLegacyApi<AiModelResponse>("/config/ai-model", undefined, baseUrl);
}

export function setAiModel(payload: UpdateAiModelRequest, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    "/config/ai-model",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getAvailableModels(baseUrl?: string) {
  return requestLegacyApi<AvailableModelsResponse>("/config/available-models", undefined, baseUrl);
}

export function listCharacters(baseUrl?: string) {
  return requestLegacyApi<Character[]>("/characters", undefined, baseUrl);
}

export function getCharacter(id: string, baseUrl?: string) {
  return requestLegacyApi<Character>(`/characters/${id}`, undefined, baseUrl);
}

export function createCharacter(payload: CharacterDraft, baseUrl?: string) {
  return requestLegacyApi<Character>(
    "/characters",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function updateCharacter(id: string, payload: CharacterDraft, baseUrl?: string) {
  return requestLegacyApi<Character>(
    `/characters/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function deleteCharacter(id: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/characters/${id}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function getLatestWorldContext(baseUrl?: string) {
  return requestLegacyApi<WorldContext>("/world/context", undefined, baseUrl);
}

export function getFriendRequests(userId: string, baseUrl?: string) {
  return requestLegacyApi<FriendRequest[]>(`/social/friend-requests?userId=${encodeURIComponent(userId)}`, undefined, baseUrl);
}

export function getConversations(userId: string, baseUrl?: string) {
  return requestLegacyApi<ConversationListItem[]>(
    `/conversations?userId=${encodeURIComponent(userId)}`,
    undefined,
    baseUrl,
  );
}

export function getOrCreateConversation(payload: GetOrCreateConversationRequest, baseUrl?: string) {
  return requestLegacyApi<Conversation>(
    "/conversations",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getConversationMessages(id: string, baseUrl?: string) {
  return requestLegacyApi<Message[]>(`/conversations/${id}/messages`, undefined, baseUrl);
}

export function markConversationRead(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/conversations/${id}/read`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function createGroup(payload: CreateGroupRequest, baseUrl?: string) {
  return requestLegacyApi<Group>(
    "/groups",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getGroup(id: string, baseUrl?: string) {
  return requestLegacyApi<Group>(`/groups/${id}`, undefined, baseUrl);
}

export function getGroupMembers(id: string, baseUrl?: string) {
  return requestLegacyApi<GroupMember[]>(`/groups/${id}/members`, undefined, baseUrl);
}

export function addGroupMember(id: string, payload: AddGroupMemberRequest, baseUrl?: string) {
  return requestLegacyApi<GroupMember>(
    `/groups/${id}/members`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getGroupMessages(id: string, baseUrl?: string) {
  return requestLegacyApi<GroupMessage[]>(`/groups/${id}/messages`, undefined, baseUrl);
}

export function sendGroupMessage(id: string, payload: SendGroupMessageRequest, baseUrl?: string) {
  return requestLegacyApi<GroupMessage>(
    `/groups/${id}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function acceptFriendRequest(id: string, payload: AcceptFriendRequestRequest, baseUrl?: string) {
  return requestLegacyApi<FriendListItem["friendship"]>(
    `/social/friend-requests/${id}/accept`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function declineFriendRequest(id: string, payload: DeclineFriendRequestRequest, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/social/friend-requests/${id}/decline`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getFriends(userId: string, baseUrl?: string) {
  return requestLegacyApi<FriendListItem[]>(`/social/friends?userId=${encodeURIComponent(userId)}`, undefined, baseUrl);
}

export function getBlockedCharacters(userId: string, baseUrl?: string) {
  return requestLegacyApi<BlockedCharacter[]>(`/social/blocks?userId=${encodeURIComponent(userId)}`, undefined, baseUrl);
}

export function blockCharacter(payload: BlockCharacterRequest, baseUrl?: string) {
  return requestLegacyApi<BlockedCharacter>(
    "/social/block",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function unblockCharacter(payload: UnblockCharacterRequest, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    "/social/unblock",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listModerationReports(userId: string, baseUrl?: string) {
  return requestLegacyApi<ModerationReport[]>(
    `/moderation/reports?userId=${encodeURIComponent(userId)}`,
    undefined,
    baseUrl,
  );
}

export function createModerationReport(payload: CreateModerationReportRequest, baseUrl?: string) {
  return requestLegacyApi<ModerationReport>(
    "/moderation/reports",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getMoments(authorId?: string, baseUrl?: string) {
  const path = authorId ? `/moments?authorId=${encodeURIComponent(authorId)}` : "/moments";
  return requestLegacyApi<Moment[]>(path, undefined, baseUrl);
}

export function getMoment(id: string, baseUrl?: string) {
  return requestLegacyApi<Moment>(`/moments/${id}`, undefined, baseUrl);
}

export function createUserMoment(payload: CreateUserMomentRequest, baseUrl?: string) {
  return requestLegacyApi<Moment>(
    "/moments/user-post",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function addMomentComment(id: string, payload: CreateMomentCommentRequest, baseUrl?: string) {
  return requestLegacyApi<MomentComment>(
    `/moments/${id}/comment`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function toggleMomentLike(id: string, payload: ToggleMomentLikeRequest, baseUrl?: string) {
  return requestLegacyApi<ToggleMomentLikeResult>(
    `/moments/${id}/like`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function generateMoment(characterId: string, baseUrl?: string) {
  return requestLegacyApi<Moment | null>(
    `/moments/generate/${characterId}`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function generateAllMoments(baseUrl?: string) {
  return requestLegacyApi<Moment[]>(
    "/moments/generate-all",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getFeed(page = 1, limit = 20, baseUrl?: string) {
  return requestLegacyApi<FeedListResponse>(
    `/feed?page=${encodeURIComponent(String(page))}&limit=${encodeURIComponent(String(limit))}`,
    undefined,
    baseUrl,
  );
}

export function getFeedPost(id: string, baseUrl?: string) {
  return requestLegacyApi<FeedPostWithComments>(`/feed/${id}`, undefined, baseUrl);
}

export function createFeedPost(payload: CreateFeedPostRequest, baseUrl?: string) {
  return requestLegacyApi<FeedPost>(
    "/feed",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function addFeedComment(id: string, payload: CreateFeedCommentRequest, baseUrl?: string) {
  return requestLegacyApi<FeedComment>(
    `/feed/${id}/comment`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function likeFeedPost(id: string, payload: LikeFeedPostRequest, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/${id}/like`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function shake(payload: ShakeRequest, baseUrl?: string) {
  return requestLegacyApi<ShakeResult | null>(
    "/social/shake",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function sendFriendRequest(payload: SendFriendRequestRequest, baseUrl?: string) {
  return requestLegacyApi<FriendRequest>(
    "/social/friend-requests/send",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function triggerSceneFriendRequest(payload: TriggerSceneRequest, baseUrl?: string) {
  return requestLegacyApi<FriendRequest | null>(
    "/social/trigger-scene",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

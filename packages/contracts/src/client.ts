import type { SuccessResponse } from "./auth";
import type {
  ConversationBackgroundSettings,
  UpdateConversationBackgroundRequest,
  UpdateWorldOwnerChatBackgroundRequest,
  UploadChatBackgroundResponse,
} from "./chat-backgrounds";
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
  SetGroupPinnedRequest,
  SetConversationPinnedRequest,
  SetConversationMutedRequest,
  SendGroupMessageRequest,
  UploadChatAttachmentResponse,
  UpdateGroupOwnerProfileRequest,
  UpdateGroupRequest,
} from "./chat";
import type { Character, CharacterDraft } from "./characters";
import type {
  CloudWorldLookupResponse,
  CloudWorldRequestRecord,
  CreateCloudWorldRequest,
  SendPhoneCodeRequest,
  SendPhoneCodeResponse,
  VerifyPhoneCodeRequest,
  VerifyPhoneCodeResponse,
} from "./cloud";
import type {
  AiModelResponse,
  AvailableModelsResponse,
  UpdateAiModelRequest,
} from "./config";
import type {
  CreateFeedCommentRequest,
  FeedComment,
  CreateFeedPostRequest,
  FeedListResponse,
  FeedPost,
  FeedPostWithComments,
} from "./feed";
import type {
  CreateMomentCommentRequest,
  CreateUserMomentRequest,
  Moment,
  MomentComment,
  ToggleMomentLikeResult,
} from "./moments";
import type {
  OfficialAccountArticleDetail,
  OfficialAccountArticleSummary,
  OfficialAccountDetail,
  OfficialAccountSummary,
} from "./official-accounts";
import type {
  CreateModerationReportRequest,
  ModerationReport,
} from "./moderation";
import type {
  BlockCharacterRequest,
  BlockedCharacter,
  FriendListItem,
  FriendRequest,
  SendFriendRequestRequest,
  SetFriendStarredRequest,
  ShakeResult,
  TriggerSceneRequest,
  UnblockCharacterRequest,
  UpdateFriendProfileRequest,
} from "./social";
import type { SpeechTranscriptionResult } from "./speech";
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
import type {
  UpdateWorldOwnerApiKeyRequest,
  UpdateWorldOwnerRequest,
  WorldContext,
  WorldOwner,
} from "./world";
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

export const DEFAULT_CORE_API_BASE_URL = "http://localhost:3000";
export const DEFAULT_CLOUD_API_BASE_URL = "http://localhost:3001";
let coreApiBaseUrlProvider: (() => string | null | undefined) | null = null;
let cloudApiBaseUrlProvider: (() => string | null | undefined) | null = null;

export function resolveCoreApiBaseUrl(
  override?: string,
  options?: { allowDefault?: boolean },
) {
  const configuredValue = override || coreApiBaseUrlProvider?.();
  if (configuredValue) {
    return configuredValue;
  }

  if (options?.allowDefault === false) {
    return undefined;
  }

  return DEFAULT_CORE_API_BASE_URL;
}

export function setCoreApiBaseUrlProvider(
  provider: (() => string | null | undefined) | null,
) {
  coreApiBaseUrlProvider = provider;
}

export function resolveCloudApiBaseUrl(
  override?: string,
  options?: { allowDefault?: boolean },
) {
  const configuredValue = override || cloudApiBaseUrlProvider?.();
  if (configuredValue) {
    return configuredValue;
  }

  if (options?.allowDefault === false) {
    return undefined;
  }

  return DEFAULT_CLOUD_API_BASE_URL;
}

export function setCloudApiBaseUrlProvider(
  provider: (() => string | null | undefined) | null,
) {
  cloudApiBaseUrlProvider = provider;
}

async function request<T>(
  path: string,
  init?: RequestInit,
  baseUrl?: string,
): Promise<T> {
  const headers = new Headers(init?.headers);
  const isFormDataBody =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  if (!headers.has("Content-Type") && init?.body && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
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

function requestLegacyApi<T>(
  path: string,
  init?: RequestInit,
  baseUrl?: string,
) {
  return request<T>(`${LEGACY_API_PREFIX}${path}`, init, baseUrl);
}

function requestCloudApi<T>(
  path: string,
  init?: RequestInit,
  baseUrl?: string,
) {
  return request<T>(path, init, resolveCloudApiBaseUrl(baseUrl));
}

export function getSystemStatus(baseUrl?: string) {
  return requestLegacyApi<SystemStatus>("/system/status", undefined, baseUrl);
}

export function createSpeechTranscription(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<SpeechTranscriptionResult>(
    "/ai/transcriptions",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function sendCloudPhoneCode(
  payload: SendPhoneCodeRequest,
  baseUrl?: string,
) {
  return requestCloudApi<SendPhoneCodeResponse>(
    "/cloud/auth/send-code",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function verifyCloudPhoneCode(
  payload: VerifyPhoneCodeRequest,
  baseUrl?: string,
) {
  return requestCloudApi<VerifyPhoneCodeResponse>(
    "/cloud/auth/verify-code",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

function buildCloudAuthHeaders(
  accessToken: string,
  init?: RequestInit,
): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return {
    ...init,
    headers,
  };
}

export function getMyCloudWorld(accessToken: string, baseUrl?: string) {
  return requestCloudApi<CloudWorldLookupResponse>(
    "/cloud/me/world",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function createMyCloudWorldRequest(
  payload: CreateCloudWorldRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<CloudWorldRequestRecord>(
    "/cloud/me/world-requests",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

export function getLatestMyCloudWorldRequest(
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<CloudWorldRequestRecord | null>(
    "/cloud/me/world-requests/latest",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function getSchedulerStatus(baseUrl?: string) {
  return requestLegacyApi<SchedulerStatus>(
    "/system/scheduler",
    undefined,
    baseUrl,
  );
}

export function runSchedulerJob(id: string, baseUrl?: string) {
  return requestLegacyApi<OperationResult>(
    `/system/scheduler/run/${encodeURIComponent(id)}`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getRealtimeStatus(baseUrl?: string) {
  return requestLegacyApi<RealtimeStatus>(
    "/system/realtime",
    undefined,
    baseUrl,
  );
}

export function testProviderConnection(
  payload: ProviderTestRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<ProviderTestResult>(
    "/system/provider/test",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getProviderConfig(baseUrl?: string) {
  return requestLegacyApi<ProviderConfig>(
    "/system/provider",
    undefined,
    baseUrl,
  );
}

export function setProviderConfig(payload: ProviderConfig, baseUrl?: string) {
  return requestLegacyApi<ProviderConfig>(
    "/system/provider",
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function runInferencePreview(
  payload: InferencePreviewRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<InferencePreviewResponse>(
    "/system/inference/preview",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getSystemLogs(baseUrl?: string) {
  return requestLegacyApi<LogIndexResponse>("/system/logs", undefined, baseUrl);
}

export function getEvalOverview(baseUrl?: string) {
  return requestLegacyApi<EvalOverview>(
    "/system/evals/overview",
    undefined,
    baseUrl,
  );
}

export function listEvalDatasets(baseUrl?: string) {
  return requestLegacyApi<EvalDatasetManifest[]>(
    "/system/evals/datasets",
    undefined,
    baseUrl,
  );
}

export function listEvalMemoryStrategies(baseUrl?: string) {
  return requestLegacyApi<EvalMemoryStrategyRecord[]>(
    "/system/evals/strategies",
    undefined,
    baseUrl,
  );
}

export function listEvalPromptVariants(baseUrl?: string) {
  return requestLegacyApi<EvalPromptVariantRecord[]>(
    "/system/evals/prompt-variants",
    undefined,
    baseUrl,
  );
}

export function listEvalExperimentPresets(baseUrl?: string) {
  return requestLegacyApi<EvalExperimentPresetRecord[]>(
    "/system/evals/experiments",
    undefined,
    baseUrl,
  );
}

export function runEvalExperimentPreset(id: string, baseUrl?: string) {
  return requestLegacyApi<EvalExperimentRunResponse>(
    `/system/evals/experiments/${encodeURIComponent(id)}/run`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function listEvalExperimentReports(baseUrl?: string) {
  return requestLegacyApi<EvalExperimentReportRecord[]>(
    "/system/evals/reports",
    undefined,
    baseUrl,
  );
}

export function updateEvalReportDecision(
  id: string,
  payload: UpdateEvalReportDecisionRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<EvalExperimentReportRecord>(
    `/system/evals/reports/${encodeURIComponent(id)}/decision`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getEvalDataset(id: string, baseUrl?: string) {
  return requestLegacyApi<EvalDatasetDetail>(
    `/system/evals/datasets/${encodeURIComponent(id)}`,
    undefined,
    baseUrl,
  );
}

export function listEvalRuns(baseUrl?: string) {
  return requestLegacyApi<EvalRunRecord[]>(
    "/system/evals/runs",
    undefined,
    baseUrl,
  );
}

export function listEvalRunsWithQuery(
  query: ListEvalRunsQuery,
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (query.datasetId) params.set("datasetId", query.datasetId);
  if (query.experimentLabel)
    params.set("experimentLabel", query.experimentLabel);
  if (query.providerModel) params.set("providerModel", query.providerModel);
  if (query.judgeModel) params.set("judgeModel", query.judgeModel);
  if (query.promptVariant) params.set("promptVariant", query.promptVariant);
  if (query.memoryPolicyVariant)
    params.set("memoryPolicyVariant", query.memoryPolicyVariant);
  const suffix = params.toString();

  return requestLegacyApi<EvalRunRecord[]>(
    `/system/evals/runs${suffix ? `?${suffix}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function getEvalRun(id: string, baseUrl?: string) {
  return requestLegacyApi<EvalRunRecord>(
    `/system/evals/runs/${encodeURIComponent(id)}`,
    undefined,
    baseUrl,
  );
}

export function runEvalDataset(
  payload: RunEvalDatasetRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<EvalRunRecord>(
    "/system/evals/runs",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function compareEvalRuns(
  payload: CompareEvalRunsRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<EvalComparisonRecord>(
    "/system/evals/compare",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listEvalComparisonsWithQuery(
  query: ListEvalComparisonsQuery,
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (query.datasetId) params.set("datasetId", query.datasetId);
  if (query.experimentLabel)
    params.set("experimentLabel", query.experimentLabel);
  if (query.providerModel) params.set("providerModel", query.providerModel);
  if (query.judgeModel) params.set("judgeModel", query.judgeModel);
  if (query.promptVariant) params.set("promptVariant", query.promptVariant);
  if (query.memoryPolicyVariant)
    params.set("memoryPolicyVariant", query.memoryPolicyVariant);
  const suffix = params.toString();

  return requestLegacyApi<EvalComparisonRecord[]>(
    `/system/evals/comparisons${suffix ? `?${suffix}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function runPairwiseEval(
  payload: RunPairwiseEvalRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<PairwiseEvalRunResponse>(
    "/system/evals/compare/run",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listGenerationTraces(baseUrl?: string) {
  return requestLegacyApi<GenerationTrace[]>(
    "/system/evals/traces",
    undefined,
    baseUrl,
  );
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

  return requestLegacyApi<GenerationTrace[]>(
    `/system/evals/traces${suffix ? `?${suffix}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function getGenerationTrace(id: string, baseUrl?: string) {
  return requestLegacyApi<GenerationTrace>(
    `/system/evals/traces/${encodeURIComponent(id)}`,
    undefined,
    baseUrl,
  );
}

export function listPersonaAssets(_baseUrl?: string) {
  return Promise.resolve<PersonaAssetRecord[]>([]);
}

export function exportDiagnostics(baseUrl?: string) {
  return requestLegacyApi<OperationResult>(
    "/system/diag/export",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function createBackup(baseUrl?: string) {
  return requestLegacyApi<OperationResult>(
    "/system/backup/create",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function restoreBackup(baseUrl?: string) {
  return requestLegacyApi<OperationResult>(
    "/system/backup/restore",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getWorldOwner(baseUrl?: string) {
  return requestLegacyApi<WorldOwner>("/world/owner", undefined, baseUrl);
}

export function updateWorldOwner(
  payload: UpdateWorldOwnerRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<WorldOwner>(
    "/world/owner",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function setWorldOwnerApiKey(
  payload: UpdateWorldOwnerApiKeyRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<WorldOwner>(
    "/world/owner/api-key",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function clearWorldOwnerApiKey(baseUrl?: string) {
  return requestLegacyApi<WorldOwner>(
    "/world/owner/api-key",
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function getAiModel(baseUrl?: string) {
  return requestLegacyApi<AiModelResponse>(
    "/config/ai-model",
    undefined,
    baseUrl,
  );
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
  return requestLegacyApi<AvailableModelsResponse>(
    "/config/available-models",
    undefined,
    baseUrl,
  );
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

export function updateCharacter(
  id: string,
  payload: CharacterDraft,
  baseUrl?: string,
) {
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

export function getFriendRequests(baseUrl?: string) {
  return requestLegacyApi<FriendRequest[]>(
    "/social/friend-requests",
    undefined,
    baseUrl,
  );
}

export function getConversations(baseUrl?: string) {
  return requestLegacyApi<ConversationListItem[]>(
    "/conversations",
    undefined,
    baseUrl,
  );
}

export function getOrCreateConversation(
  payload: GetOrCreateConversationRequest,
  baseUrl?: string,
) {
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
  return requestLegacyApi<Message[]>(
    `/conversations/${id}/messages`,
    undefined,
    baseUrl,
  );
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

export function setConversationPinned(
  id: string,
  payload: SetConversationPinnedRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<Conversation>(
    `/conversations/${id}/pin`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function setConversationMuted(id: string, payload: SetConversationMutedRequest, baseUrl?: string) {
  return requestLegacyApi<Conversation>(
    `/conversations/${id}/mute`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function hideConversation(id: string, baseUrl?: string) {
  return requestLegacyApi<Conversation>(
    `/conversations/${id}/hide`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function clearConversationHistory(id: string, baseUrl?: string) {
  return requestLegacyApi<Conversation>(
    `/conversations/${id}/clear`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getConversationBackground(id: string, baseUrl?: string) {
  return requestLegacyApi<ConversationBackgroundSettings>(
    `/conversations/${id}/background`,
    undefined,
    baseUrl,
  );
}

export function setConversationBackground(
  id: string,
  payload: UpdateConversationBackgroundRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<ConversationBackgroundSettings>(
    `/conversations/${id}/background`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function clearConversationBackground(id: string, baseUrl?: string) {
  return requestLegacyApi<ConversationBackgroundSettings>(
    `/conversations/${id}/background`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function uploadChatAttachment(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<UploadChatAttachmentResponse>(
    "/chat/attachments",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function uploadChatBackground(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<UploadChatBackgroundResponse>(
    "/chat/backgrounds",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function setWorldOwnerChatBackground(
  payload: UpdateWorldOwnerChatBackgroundRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<WorldOwner>(
    "/world/owner/chat-background",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function clearWorldOwnerChatBackground(baseUrl?: string) {
  return requestLegacyApi<WorldOwner>(
    "/world/owner/chat-background",
    {
      method: "DELETE",
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

export function updateGroup(
  id: string,
  payload: UpdateGroupRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<Group>(
    `/groups/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getGroupMembers(id: string, baseUrl?: string) {
  return requestLegacyApi<GroupMember[]>(
    `/groups/${id}/members`,
    undefined,
    baseUrl,
  );
}

export function addGroupMember(
  id: string,
  payload: AddGroupMemberRequest,
  baseUrl?: string,
) {
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
  return requestLegacyApi<GroupMessage[]>(
    `/groups/${id}/messages`,
    undefined,
    baseUrl,
  );
}

export function setGroupPinned(
  id: string,
  payload: SetGroupPinnedRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<Group>(
    `/groups/${id}/pin`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function clearGroupMessages(id: string, baseUrl?: string) {
  return requestLegacyApi<Group>(
    `/groups/${id}/clear`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function markGroupRead(id: string, baseUrl?: string) {
  return requestLegacyApi<Group>(
    `/groups/${id}/read`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function hideGroup(id: string, baseUrl?: string) {
  return requestLegacyApi<Group>(
    `/groups/${id}/hide`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function updateGroupOwnerProfile(
  id: string,
  payload: UpdateGroupOwnerProfileRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<GroupMember>(
    `/groups/${id}/me`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function leaveGroup(id: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/groups/${id}/leave`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function sendGroupMessage(
  id: string,
  payload: SendGroupMessageRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<GroupMessage>(
    `/groups/${id}/messages`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function acceptFriendRequest(id: string, baseUrl?: string) {
  return requestLegacyApi<FriendListItem["friendship"]>(
    `/social/friend-requests/${id}/accept`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function declineFriendRequest(id: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/social/friend-requests/${id}/decline`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getFriends(baseUrl?: string) {
  return requestLegacyApi<FriendListItem[]>(
    "/social/friends",
    undefined,
    baseUrl,
  );
}

export function setFriendStarred(
  characterId: string,
  payload: SetFriendStarredRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FriendListItem["friendship"]>(
    `/social/friends/${characterId}/star`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function updateFriendProfile(
  characterId: string,
  payload: UpdateFriendProfileRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FriendListItem["friendship"]>(
    `/social/friends/${characterId}/profile`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getBlockedCharacters(baseUrl?: string) {
  return requestLegacyApi<BlockedCharacter[]>(
    "/social/blocks",
    undefined,
    baseUrl,
  );
}

export function blockCharacter(
  payload: BlockCharacterRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<BlockedCharacter>(
    "/social/block",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function unblockCharacter(
  payload: UnblockCharacterRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<SuccessResponse>(
    "/social/unblock",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listModerationReports(baseUrl?: string) {
  return requestLegacyApi<ModerationReport[]>(
    "/moderation/reports",
    undefined,
    baseUrl,
  );
}

export function createModerationReport(
  payload: CreateModerationReportRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<ModerationReport>(
    "/moderation/reports",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getMoments(baseUrl?: string) {
  return requestLegacyApi<Moment[]>("/moments", undefined, baseUrl);
}

export function getMoment(id: string, baseUrl?: string) {
  return requestLegacyApi<Moment>(`/moments/${id}`, undefined, baseUrl);
}

export function createUserMoment(
  payload: CreateUserMomentRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<Moment>(
    "/moments/user-post",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function addMomentComment(
  id: string,
  payload: CreateMomentCommentRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<MomentComment>(
    `/moments/${id}/comment`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function toggleMomentLike(id: string, baseUrl?: string) {
  return requestLegacyApi<ToggleMomentLikeResult>(
    `/moments/${id}/like`,
    {
      method: "POST",
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
  return requestLegacyApi<FeedPostWithComments>(
    `/feed/${id}`,
    undefined,
    baseUrl,
  );
}

export function createFeedPost(
  payload: CreateFeedPostRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FeedPost>(
    "/feed",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function addFeedComment(
  id: string,
  payload: CreateFeedCommentRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FeedComment>(
    `/feed/${id}/comment`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function likeFeedPost(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/${id}/like`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function listOfficialAccounts(baseUrl?: string) {
  return requestLegacyApi<OfficialAccountSummary[]>(
    "/official-accounts",
    undefined,
    baseUrl,
  );
}

export function getOfficialAccount(id: string, baseUrl?: string) {
  return requestLegacyApi<OfficialAccountDetail>(
    `/official-accounts/${id}`,
    undefined,
    baseUrl,
  );
}

export function followOfficialAccount(id: string, baseUrl?: string) {
  return requestLegacyApi<OfficialAccountDetail>(
    `/official-accounts/${id}/follow`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function unfollowOfficialAccount(id: string, baseUrl?: string) {
  return requestLegacyApi<OfficialAccountDetail>(
    `/official-accounts/${id}/unfollow`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getOfficialAccountArticles(id: string, baseUrl?: string) {
  return requestLegacyApi<OfficialAccountArticleSummary[]>(
    `/official-accounts/${id}/articles`,
    undefined,
    baseUrl,
  );
}

export function getOfficialAccountArticle(articleId: string, baseUrl?: string) {
  return requestLegacyApi<OfficialAccountArticleDetail>(
    `/official-accounts/articles/${articleId}`,
    undefined,
    baseUrl,
  );
}

export function markOfficialAccountArticleRead(
  articleId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<OfficialAccountArticleDetail>(
    `/official-accounts/articles/${articleId}/read`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function shake(baseUrl?: string) {
  return requestLegacyApi<ShakeResult | null>(
    "/social/shake",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function sendFriendRequest(
  payload: SendFriendRequestRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FriendRequest>(
    "/social/friend-requests/send",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function triggerSceneFriendRequest(
  payload: TriggerSceneRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FriendRequest | null>(
    "/social/trigger-scene",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

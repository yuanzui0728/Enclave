import type { SuccessResponse } from "./auth";
import type {
  ConversationBackgroundSettings,
  UpdateConversationBackgroundRequest,
  UpdateWorldOwnerChatBackgroundRequest,
  UploadChatBackgroundResponse,
} from "./chat-backgrounds";
import type {
  AddGroupMemberRequest,
  ChatMessageSearchResponse,
  ChatMessageSearchItem,
  AgentDelegation,
  Conversation,
  ConversationListItem,
  CreateGroupRequest,
  GetOrCreateConversationRequest,
  GetChatMessagesQuery,
  Group,
  GroupMember,
  GroupMessage,
  Message,
  SearchChatMessagesQuery,
  SetGroupPinnedRequest,
  SetConversationPinnedRequest,
  SetConversationStrongReminderRequest,
  SetConversationMutedRequest,
  SendGroupMessageRequest,
  UploadChatAttachmentResponse,
  UpdateGroupPreferencesRequest,
  UpdateGroupOwnerProfileRequest,
  UpdateGroupRequest,
} from "./chat";
import type { MessageAttachment } from "./attachments";
import type {
  AvatarEncounterDecisionResult,
  AvatarEncounterInboxResponse,
  AvatarEncounterOverview,
  AvatarEncounterSession,
  AvatarEncounterView,
  DecideAvatarEncounterRequest,
} from "./avatar-encounter";
import type { Character, CharacterDraft } from "./characters";
import type {
  CyberAvatarSelfProfile,
  CyberAvatarSelfChatRequest,
  CyberAvatarSelfChatResponse,
  CyberAvatarSelfChatHistoryResponse,
  CyberAvatarSelfAnalysisReport,
  CyberAvatarSelfRebuildRequest,
  CyberAvatarSelfRebuildResponse,
} from "./cyber-avatar";
import type {
  CloudWorldLookupResponse,
  CloudWorldRequestRecord,
  CreateCloudWorldRequest,
  ResolveWorldAccessRequest,
  ResolveWorldAccessResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  ConfirmAccountDeletionRequest,
  ConfirmAccountDeletionResponse,
  LoginWithPasswordRequest,
  LoginWithPasswordResponse,
  SendAccountDeletionCodeResponse,
  SendChangePasswordCodeResponse,
  SendEmailCodeRequest,
  SendEmailCodeResponse,
  SendPhoneCodeRequest,
  SendPhoneCodeResponse,
  VerifyEmailCodeRequest,
  VerifyEmailCodeResponse,
  VerifyGoogleIdTokenRequest,
  VerifyGoogleIdTokenResponse,
  VerifyPhoneCodeRequest,
  VerifyPhoneCodeResponse,
  WorldAccessSessionSummary,
} from "./cloud";
import type {
  AiModelResponse,
  AvailableModelsResponse,
  UpdateAiModelRequest,
} from "./config";
import type {
  CreateFeedCommentRequest,
  FeedComment,
  FeedMediaAsset,
  CreateFeedPostRequest,
  FeedChannelAuthorProfile,
  FeedChannelHomeDecorationsResponse,
  FeedChannelHomeResponse,
  FeedChannelHomeSection,
  FeedChannelWatchHistoryResponse,
  FeedListResponse,
  FeedPost,
  FeedPostListItem,
  FeedPostWithComments,
  FeedShareRequest,
  FeedSurface,
  FeedViewRequest,
} from "./feed";
import type {
  FarmCheckinResult,
  FarmCheckinView,
  FarmConsumableId,
  FarmConsumablePurchaseResult,
  FarmCropId,
  FarmDecorationId,
  FarmDecorationPlaceResult,
  FarmDecorationPurchaseResult,
  FarmDogPurchaseResult,
  FarmEventView,
  FarmGiftCoinsResult,
  FarmGiftItemResult,
  FarmHarvestResult,
  FarmLeaderboardType,
  FarmLeaderboardView,
  FarmNeighborDetail,
  FarmNeighborSummary,
  FarmPlayerStateView,
  FarmQuestClaimResult,
  FarmQuestsView,
  FarmStealResult,
} from "./farm";
import type { GameCenterHomeResponse, GameCenterOwnerState } from "./games";
import type {
  CreateMessageFavoriteRequest,
  FavoriteNoteDocument,
  FavoriteNoteSummary,
  FavoriteRecord,
  UpsertFavoriteNoteRequest,
} from "./favorites";
import type {
  SubmitCloudFeedbackRequest,
  SubmitCloudFeedbackResponse,
} from "./feedback";
import type {
  FollowupRecommendationEventResult,
  MarkFollowupRecommendationFriendRequestPendingRequest,
} from "./followup-runtime";
import type {
  CreateMessageReminderRequest,
  MarkMessageReminderNotifiedRequest,
  MessageReminderRecord,
} from "./reminders";
import type {
  GetReminderTasksQuery,
  ReminderTaskMutationResult,
  ReminderTaskRecord,
  SnoozeReminderTaskRequest,
} from "./reminder-runtime";
import type {
  CreateMomentCommentRequest,
  CreateUserMomentRequest,
  Moment,
  MomentComment,
  MomentMediaAsset,
  ToggleMomentLikeResult,
  UploadMomentMediaResponse,
} from "./moments";
import type {
  OfficialAccountArticleDetail,
  OfficialAccountServiceConversationSummary,
  OfficialAccountServiceMessage,
  OfficialAccountArticleSummary,
  OfficialAccountMessageEntries,
  OfficialAccountDetail,
  OfficialAccountSubscriptionInbox,
  OfficialAccountSummary,
  UpdateOfficialAccountPreferencesRequest,
} from "./official-accounts";
import type {
  CreateModerationReportRequest,
  ModerationReport,
} from "./moderation";
import type {
  BlockCharacterRequest,
  BlockedCharacter,
  BulkFriendshipRequest,
  BulkFriendshipResponse,
  FriendListItem,
  FriendRequest,
  SendFriendRequestRequest,
  SetFriendStarredRequest,
  TriggerSceneRequest,
  TriggerSceneResponse,
  UnblockCharacterRequest,
  UpdateFriendPermissionsRequest,
  UpdateFriendProfileRequest,
} from "./social";
import type {
  CreateShakeDiscoverySessionRequest,
  DismissShakeDiscoverySessionResult,
  KeepShakeDiscoverySessionResult,
  ShakeDiscoverySessionPreview,
} from "./shake-discovery";
import type {
  CreateDigitalHumanSessionRequest,
  DigitalHumanSession,
  DigitalHumanTurnResult,
  FinalizeCallRequest,
  FinalizeCallResult,
  GroupVoiceCallTurnResult,
  SpeechSynthesisRequest,
  SpeechSynthesisResult,
  SpeechTranscriptionResult,
  UpdateDigitalHumanProviderStateRequest,
  VoiceCallTurnResult,
  VoiceCatalog,
  VoiceCloneItem,
} from "./speech";
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
  UpdateWorldLanguageRequest,
  UpdateWorldOwnerApiKeyRequest,
  UpdateWorldOwnerRequest,
  WorldContext,
  WorldLanguageConfig,
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
import type {
  CreateCustomStickerFromMessageRequest,
  CustomStickerRecord,
  StickerCatalogResponse,
} from "./stickers";
import type {
  BanCloudUserRequest,
  CheckoutRequest,
  CheckoutResponse,
  CloudConfigEntry,
  CloudProfileResponse,
  CloudUserDetail,
  CloudUserListQuery,
  CloudUserListResponse,
  GrantSubscriptionRequest,
  InviteRedemptionListQuery,
  InviteRedemptionListResponse,
  InviteSummaryResponse,
  RedeemInviteRequest,
  RedeemInviteResponse,
  RejectInviteRedemptionRequest,
  SubscriptionPlanSummary,
  SubscriptionRecordSummary,
  SubscriptionStateResponse,
  UpsertCloudConfigRequest,
  UpsertSubscriptionPlanRequest,
  XhsRewardClaimSummary,
  XhsRewardSummaryResponse,
} from "./subscription";
import type {
  CloudBillableCatalogResponse,
  CreateRechargeRequestPayload,
  CreateRechargeResponse,
  WalletCheckinResult,
  WalletCheckinStatus,
  WalletStateResponse,
  WalletTransactionListResponse,
} from "./wallet";
import type {
  DeleteKnowledgeDocumentResult,
  ImportKnowledgeWorldMemoryResult,
  IngestGlobalKnowledgeRequest,
  IngestKnowledgeTextRequest,
  IngestKnowledgeUrlRequest,
  KnowledgeDocumentSummary,
  ListKnowledgeDocumentsParams,
} from "./knowledge";
import type {
  CreateGoodsOrderPayload,
  CreateGoodsOrderResponse,
  GiftCabinetResponse,
  GiftToCharacterPayload,
  GiftToCharacterResponse,
  GoodsKind,
  GoodsListResponse,
  GoodsOrderListResponse,
  GoodsOrderStatus,
  InventoryItemSummary,
} from "./shop";
import { LEGACY_API_PREFIX } from "./api";

export const DEFAULT_CORE_API_BASE_URL = "http://localhost:3000";
export const DEFAULT_CLOUD_API_BASE_URL = "http://localhost:3001";
let coreApiBaseUrlProvider: (() => string | null | undefined) | null = null;
let cloudApiBaseUrlProvider: (() => string | null | undefined) | null = null;
let coreApiAdminSecretProvider:
  | (() => string | null | undefined)
  | null = null;
// 当 baseUrl 指向 cloud-api 的 world-api 反代入口时（多租户公网部署），
// 客户端要把 cloud access token 透给反代层让它按 phone 路由到对应 child。
// provider 决定要不要返回 token；返回 null 表示不附带（local 直连场景）。
let cloudWorldApiTokenProvider:
  | ((baseUrl: string | undefined) => string | null | undefined)
  | null = null;
// 客户端当前的 UI locale。cloud-api 的 error filter 优先按 X-Yinjie-Locale
// 头确定响应语言，没有才回落到 Accept-Language（即浏览器 / 系统语言）。
// 用户在 app 内显式选了 locale（多语言设置）后，必须把这个值透传过去，否则
// 系统是 zh-CN 而 app 选了 en-US 的用户会拿到中文 cloud-api 报错。
// provider 由 app 在 main.tsx hydrate 后调 setCloudApiLocaleProvider 注册。
// 返回 null/undefined 表示不附带，cloud-api 会按 Accept-Language 回落。
let cloudApiLocaleProvider:
  | (() => string | null | undefined)
  | null = null;
let apiRequestErrorHandler:
  | ((error: ApiRequestError) => void)
  | null = null;

export type ApiCallObservation = {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  ok: boolean;
  errorCode?: string | null;
  // 请求是否带上了 Authorization header。consumer（analytics bridge）用这个
  // 标签把"用户还没登录 / cloud session 还没 rehydrate"导致的 401 滤掉，避免
  // boot 期的预期 401 灌进 cloud-console 的错误率视图。
  hadAuth?: boolean;
};

let apiCallObserver: ((observation: ApiCallObservation) => void) | null = null;

type RequestErrorBody = {
  statusCode?: number;
  errorCode?: string;
  code?: string;
  message?: string | string[];
  params?: Record<string, string | number | boolean | null>;
  requestId?: string | null;
  meta?: unknown;
};

export class ApiRequestError extends Error {
  readonly statusCode: number;
  readonly errorCode: string | null;
  readonly code: string | null;
  readonly requestId: string | null;
  readonly params: Record<string, string | number | boolean | null> | null;
  readonly meta: unknown;

  constructor(
    message: string,
    options: {
      statusCode: number;
      errorCode?: string | null;
      requestId?: string | null;
      params?: Record<string, string | number | boolean | null> | null;
      meta?: unknown;
    },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.statusCode = options.statusCode;
    this.errorCode = options.errorCode ?? null;
    this.code = options.errorCode ?? null;
    this.requestId = options.requestId ?? null;
    this.params = options.params ?? null;
    this.meta = options.meta;
  }
}

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

// Admin clients (e.g. apps/admin) register a provider that returns the
// configured ADMIN_SECRET. When set, the contract layer attaches it as the
// `X-Admin-Secret` header on every request. Tenant-facing apps never call
// this, so they cannot reach AdminGuard-protected endpoints.
export function setCoreApiAdminSecretProvider(
  provider: (() => string | null | undefined) | null,
) {
  coreApiAdminSecretProvider = provider;
}

export function setCloudWorldApiTokenProvider(
  provider:
    | ((baseUrl: string | undefined) => string | null | undefined)
    | null,
) {
  cloudWorldApiTokenProvider = provider;
}

// 注册当前 UI locale provider；cloud-api 请求会以此设 X-Yinjie-Locale 头，
// 让服务端按用户在 app 内选择的语言返回 error message（而非浏览器系统语言）。
export function setCloudApiLocaleProvider(
  provider: (() => string | null | undefined) | null,
) {
  cloudApiLocaleProvider = provider;
}

export function setApiRequestErrorHandler(
  handler: ((error: ApiRequestError) => void) | null,
) {
  apiRequestErrorHandler = handler;
}

export function setApiCallObserver(
  observer: ((observation: ApiCallObservation) => void) | null,
) {
  apiCallObserver = observer;
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
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

  if (!headers.has("X-Admin-Secret")) {
    const adminSecret = coreApiAdminSecretProvider?.()?.trim();
    if (adminSecret) {
      headers.set("X-Admin-Secret", adminSecret);
    }
  }

  if (!headers.has("Authorization") && cloudWorldApiTokenProvider) {
    const resolvedBase = resolveCoreApiBaseUrl(baseUrl, { allowDefault: false });
    const token = cloudWorldApiTokenProvider(resolvedBase ?? undefined)?.trim();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const hadAuth = headers.has("Authorization");

  const method = (init?.method ?? "GET").toUpperCase();
  const startedAt =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  let response: Response;
  try {
    response = await fetch(`${resolveCoreApiBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers,
    });
  } catch (networkError) {
    notifyApiCallObserver({
      method,
      path,
      status: 0,
      durationMs: Math.round(currentTime() - startedAt),
      ok: false,
      errorCode: "network_error",
      hadAuth,
    });
    throw networkError;
  }

  const rawBody = await response.text();

  if (!response.ok) {
    let body: RequestErrorBody | null = null;

    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as RequestErrorBody;
      } catch {
        body = null;
      }
    }

    const message = resolveRequestErrorMessage(
      response.status,
      body?.message,
      rawBody,
    );
    const requestId =
      response.headers.get("X-Request-Id")?.trim() ||
      (typeof body?.requestId === "string" ? body.requestId : null);
    const error = new ApiRequestError(
      message || `Request failed: ${response.status}`,
      {
        statusCode: response.status,
        errorCode:
          typeof body?.errorCode === "string"
            ? body.errorCode
            : typeof body?.code === "string"
              ? body.code
              : null,
        requestId,
        params: body?.params ?? null,
        meta: body?.meta,
      },
    );

    if (apiRequestErrorHandler) {
      try {
        apiRequestErrorHandler(error);
      } catch {
        // Ignore consumer-side handler failures and preserve the original error.
      }
    }

    notifyApiCallObserver({
      method,
      path,
      status: response.status,
      durationMs: Math.round(currentTime() - startedAt),
      ok: false,
      errorCode: error.errorCode,
      hadAuth,
    });

    throw error;
  }

  notifyApiCallObserver({
    method,
    path,
    status: response.status,
    durationMs: Math.round(currentTime() - startedAt),
    ok: true,
    errorCode: null,
    hadAuth,
  });

  return (rawBody ? (JSON.parse(rawBody) as T) : undefined) as T;
}

function currentTime(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function notifyApiCallObserver(observation: ApiCallObservation): void {
  if (!apiCallObserver) return;
  try {
    apiCallObserver(observation);
  } catch {
    // Observer failures must never affect business code.
  }
}

function resolveRequestErrorMessage(
  status: number,
  bodyMessage: string | string[] | undefined,
  rawBody: string,
) {
  const normalizedBodyMessage = Array.isArray(bodyMessage)
    ? bodyMessage
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
        .join(" ")
    : bodyMessage?.trim();
  if (normalizedBodyMessage) {
    if (normalizedBodyMessage === "File too large") {
      return "上传内容过大，请缩小文件后重试。";
    }

    return normalizedBodyMessage;
  }

  if (status === 413) {
    return "上传内容过大，请缩小文件后重试。";
  }

  const normalizedRawBody = rawBody.trim();
  if (looksLikeHtmlErrorDocument(normalizedRawBody)) {
    if (status >= 500) {
      return "服务器暂时不可用，请稍后再试。";
    }

    return `Request failed: ${status}`;
  }

  // 走查移动端我-tab 端到端 2026-05-22：body 是 JSON 但没 message 字段（如
  // 网关 / 反代直接返 `{"statusCode":500}` 或 `{"error":"Internal Server Error"}`
  // 的偷懒响应）时，原版直接把整段 JSON 字符串当成"错误文案"塞给用户 ——
  // feedback 失败时会渲染成 `提交失败：{"statusCode":500}` 这种暴露内部
  // 结构的丑陋文案。检测开头是 `{` / `[` 的 JSON-looking body，落到通用
  // 兜底：5xx → "服务器暂时不可用"，4xx → `Request failed: N`（后面再被
  // describeRequestError 翻成本地化文案）。
  if (
    normalizedRawBody.startsWith("{") ||
    normalizedRawBody.startsWith("[")
  ) {
    if (status >= 500) {
      return "服务器暂时不可用，请稍后再试。";
    }
    return `Request failed: ${status}`;
  }

  return normalizedRawBody;
}

function looksLikeHtmlErrorDocument(value: string) {
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<head>") ||
    normalized.includes("<body>")
  );
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
  // 把用户在 app 内显式选的 UI locale 透传给 cloud-api，让 error filter
  // 优先按 X-Yinjie-Locale 而不是 Accept-Language（系统语言）渲染错误文案。
  // 避免「系统 zh-CN 但 app 改成 en-US」的用户在改密 / 发码失败时拿到中文。
  // 调用方已在 headers 里显式设了同名头时不覆盖（保留它的意图）。
  const locale = cloudApiLocaleProvider?.()?.trim();
  if (locale) {
    const headers = new Headers(init?.headers);
    if (!headers.has("X-Yinjie-Locale")) {
      headers.set("X-Yinjie-Locale", locale);
      init = { ...(init ?? {}), headers };
    }
  }
  return request<T>(path, init, resolveCloudApiBaseUrl(baseUrl));
}

function normalizeAttachmentAssetUrl(url: string, baseUrl?: string) {
  const normalizedUrl = url.trim();
  if (
    !normalizedUrl ||
    normalizedUrl.startsWith("blob:") ||
    normalizedUrl.startsWith("data:")
  ) {
    return normalizedUrl;
  }

  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const browserOriginUrl =
    typeof window !== "undefined" &&
    (window.location.protocol === "http:" ||
      window.location.protocol === "https:")
      ? window.location.origin
      : undefined;
  const targetUrl = tryParseUrl(resolvedBaseUrl ?? browserOriginUrl);

  // 当输入是绝对路径（/api/...）且 baseUrl 带非空 pathname 前缀（如
  // /cloud/world-api 多租户反代），WHATWG URL 拼接会把 baseUrl 的 pathname
  // 整段丢掉（new URL('/api/x','http://h/cloud/world-api') = 'http://h/api/x'）。
  // 这会让媒体 src 跳过反代直奔 nginx，被 1c20a2fe 加固的 /api/ 拦截规则 403。
  // 检测这种 case 并手动保留前缀。
  if (
    normalizedUrl.startsWith("/") &&
    !normalizedUrl.startsWith("//") &&
    targetUrl &&
    targetUrl.pathname &&
    targetUrl.pathname !== "/"
  ) {
    const prefix = targetUrl.pathname.replace(/\/+$/, "");
    if (!normalizedUrl.startsWith(`${prefix}/`) && normalizedUrl !== prefix) {
      return `${targetUrl.origin}${prefix}${normalizedUrl}`;
    }
  }

  const resolvedUrl =
    tryParseUrl(normalizedUrl, targetUrl?.toString()) ??
    tryParseUrl(normalizedUrl, browserOriginUrl);

  if (!resolvedUrl) {
    return normalizedUrl;
  }

  if (targetUrl && shouldRebasePrivateAttachmentUrl(resolvedUrl, targetUrl)) {
    return rebaseAttachmentUrl(resolvedUrl, targetUrl);
  }

  return resolvedUrl.toString();
}

function normalizeMessageAttachment(
  attachment: MessageAttachment | undefined,
  baseUrl?: string,
): MessageAttachment | undefined {
  if (!attachment) {
    return undefined;
  }

  if (attachment.kind === "note_card") {
    return {
      ...attachment,
      assets: attachment.assets.map((asset) => ({
        ...asset,
        url: normalizeAttachmentAssetUrl(asset.url, baseUrl),
      })),
    };
  }

  if ("url" in attachment && typeof attachment.url === "string") {
    return {
      ...attachment,
      url: normalizeAttachmentAssetUrl(attachment.url, baseUrl),
    };
  }

  return attachment;
}

function normalizeMessage(message: Message, baseUrl?: string): Message {
  return {
    ...message,
    attachment: normalizeMessageAttachment(message.attachment, baseUrl),
  };
}

function normalizeGroupMessage(
  message: GroupMessage,
  baseUrl?: string,
): GroupMessage {
  return {
    ...message,
    attachment: normalizeMessageAttachment(message.attachment, baseUrl),
  };
}

function normalizeConversationListItem(
  item: ConversationListItem,
  baseUrl?: string,
): ConversationListItem {
  return {
    ...item,
    messages: item.messages.map((message) =>
      normalizeMessage(message, baseUrl),
    ),
    lastMessage: item.lastMessage
      ? normalizeMessage(item.lastMessage, baseUrl)
      : item.lastMessage,
  };
}

function normalizeChatMessageSearchItem(
  item: ChatMessageSearchItem,
  baseUrl?: string,
): ChatMessageSearchItem {
  return {
    ...item,
    attachment: normalizeMessageAttachment(item.attachment, baseUrl),
  };
}

function tryParseUrl(value?: string | null, base?: string) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return null;
  }

  try {
    return new URL(normalizedValue, base);
  } catch {
    return null;
  }
}

function shouldRebasePrivateAttachmentUrl(assetUrl: URL, targetUrl: URL) {
  return (
    isPrivateHostname(assetUrl.hostname) && assetUrl.origin !== targetUrl.origin
  );
}

function rebaseAttachmentUrl(assetUrl: URL, targetUrl: URL) {
  const assetPath = `${assetUrl.pathname}${assetUrl.search}${assetUrl.hash}`;
  const normalizedTargetPath = targetUrl.pathname.replace(/\/+$/, "");
  if (
    normalizedTargetPath &&
    (assetUrl.pathname === normalizedTargetPath ||
      assetUrl.pathname.startsWith(`${normalizedTargetPath}/`))
  ) {
    return `${targetUrl.origin}${assetPath}`;
  }

  return `${targetUrl.toString().replace(/\/+$/, "")}${assetPath}`;
}

function normalizeMomentMediaAsset(
  asset: MomentMediaAsset,
  baseUrl?: string,
): MomentMediaAsset {
  if (asset.kind === "video") {
    return {
      ...asset,
      url: normalizeAttachmentAssetUrl(asset.url, baseUrl),
      posterUrl: asset.posterUrl
        ? normalizeAttachmentAssetUrl(asset.posterUrl, baseUrl)
        : asset.posterUrl,
    };
  }

  if (asset.kind === "audio") {
    return {
      ...asset,
      url: normalizeAttachmentAssetUrl(asset.url, baseUrl),
      posterUrl: asset.posterUrl
        ? normalizeAttachmentAssetUrl(asset.posterUrl, baseUrl)
        : asset.posterUrl,
    };
  }

  return {
    ...asset,
    url: normalizeAttachmentAssetUrl(asset.url, baseUrl),
    thumbnailUrl: asset.thumbnailUrl
      ? normalizeAttachmentAssetUrl(asset.thumbnailUrl, baseUrl)
      : asset.thumbnailUrl,
    livePhoto: asset.livePhoto
      ? {
          ...asset.livePhoto,
          motionUrl: asset.livePhoto.motionUrl
            ? normalizeAttachmentAssetUrl(asset.livePhoto.motionUrl, baseUrl)
            : asset.livePhoto.motionUrl,
        }
      : asset.livePhoto,
  };
}

function normalizeMoment(moment: Moment, baseUrl?: string): Moment {
  return {
    ...moment,
    media: Array.isArray(moment.media)
      ? moment.media.map((asset) => normalizeMomentMediaAsset(asset, baseUrl))
      : [],
    contentType: moment.contentType ?? "text",
  };
}

function normalizeFeedMediaAsset(
  asset: FeedMediaAsset,
  baseUrl?: string,
): FeedMediaAsset {
  return normalizeMomentMediaAsset(
    asset as MomentMediaAsset,
    baseUrl,
  ) as FeedMediaAsset;
}

function resolveFeedMediaType(
  mediaType: FeedPost["mediaType"] | undefined,
  media: FeedMediaAsset[],
): FeedPost["mediaType"] {
  // 优先信任后端 mediaType（含 "audio"）。视频号音乐贴的 media[] 是 audio + 多图，
  // 早期实现只看 media[0].kind 会把 audio 帖落到 "image"，前端就拿不到 "audio" 分支
  // → 沉浸式播放器不渲染、UI 显示"暂无可播放内容"。
  if (mediaType === "audio" || mediaType === "video") {
    return mediaType;
  }

  if (media[0]?.kind === "audio") {
    return "audio";
  }

  if (media[0]?.kind === "video") {
    return "video";
  }

  if (media.length > 0) {
    return "image";
  }

  return mediaType === "image" ? "image" : "text";
}

function createFeedMediaFromLegacy(
  post: Pick<
    FeedPost,
    "mediaType" | "mediaUrl" | "coverUrl" | "durationMs" | "aspectRatio"
  >,
): FeedMediaAsset[] {
  const mediaUrl = post.mediaUrl?.trim();
  if (!mediaUrl) {
    return [];
  }

  const aspectRatio =
    typeof post.aspectRatio === "number" && post.aspectRatio > 0
      ? post.aspectRatio
      : undefined;
  const approximateWidth = aspectRatio
    ? Math.max(1, Math.round(aspectRatio * 1000))
    : undefined;
  const approximateHeight = aspectRatio ? 1000 : undefined;

  if (post.mediaType === "video") {
    return [
      {
        id: "feed-video-legacy",
        kind: "video",
        url: mediaUrl,
        posterUrl: post.coverUrl?.trim() || undefined,
        mimeType: "video/mp4",
        fileName: "feed-video",
        size: 0,
        width: approximateWidth,
        height: approximateHeight,
        durationMs:
          typeof post.durationMs === "number" && post.durationMs > 0
            ? post.durationMs
            : undefined,
      },
    ];
  }

  if (post.mediaType === "image") {
    return [
      {
        id: "feed-image-legacy",
        kind: "image",
        url: mediaUrl,
        thumbnailUrl: post.coverUrl?.trim() || mediaUrl,
        mimeType: "image/jpeg",
        fileName: "feed-image",
        size: 0,
        width: approximateWidth,
        height: approximateHeight,
      },
    ];
  }

  return [];
}

function normalizeFeedPost<T extends FeedPost>(post: T, baseUrl?: string): T {
  const resolvedMedia =
    Array.isArray(post.media) && post.media.length > 0
      ? post.media
      : createFeedMediaFromLegacy(post);
  const media = resolvedMedia.map((asset) =>
    normalizeFeedMediaAsset(asset, baseUrl),
  );
  const primaryMedia = media[0];
  const normalizedMediaUrl =
    post.mediaUrl?.trim() || primaryMedia?.url
      ? normalizeAttachmentAssetUrl(
          post.mediaUrl?.trim() || primaryMedia?.url || "",
          baseUrl,
        )
      : undefined;
  // 音乐帖封面：MiniMax 给每首 audio 都附了一张 album-cover 图作为 posterUrl，
  // 但原来这里没把 audio 走 posterUrl 这条 fallback —— channel-author-page 的
  // ChannelPostCover 判 post.coverUrl truthy 渲缩略图，audio 全部 fall through
  // 到灰色占位面板；视频号当前 18 条全是 audio，作者页缩略图全是占位灰板。
  const primaryCoverCandidate =
    post.coverUrl?.trim() ||
    (primaryMedia?.kind === "video" || primaryMedia?.kind === "audio"
      ? primaryMedia.posterUrl
      : primaryMedia?.kind === "image"
        ? primaryMedia.thumbnailUrl || primaryMedia.url
        : undefined);
  const normalizedCoverUrl = primaryCoverCandidate
    ? normalizeAttachmentAssetUrl(primaryCoverCandidate, baseUrl)
    : null;

  return {
    ...post,
    title: post.title ?? null,
    media,
    mediaType: resolveFeedMediaType(post.mediaType, media),
    mediaUrl: normalizedMediaUrl,
    coverUrl: normalizedCoverUrl,
    durationMs:
      typeof post.durationMs === "number"
        ? post.durationMs
        : primaryMedia?.kind === "video" || primaryMedia?.kind === "audio"
          ? (primaryMedia.durationMs ?? null)
          : null,
    aspectRatio:
      typeof post.aspectRatio === "number" && Number.isFinite(post.aspectRatio)
        ? post.aspectRatio
        : primaryMedia && primaryMedia.kind !== "audio" && primaryMedia.width && primaryMedia.height
          ? primaryMedia.width / primaryMedia.height
          : null,
    topicTags: Array.isArray(post.topicTags) ? post.topicTags : [],
    statsPayload: post.statsPayload ?? null,
  } as T;
}

function normalizeFeedListResponse(
  response: FeedListResponse,
  baseUrl?: string,
): FeedListResponse {
  return {
    ...response,
    posts: response.posts.map((post) => normalizeFeedPost(post, baseUrl)),
  };
}

function normalizeFeedPostWithComments(
  post: FeedPostWithComments,
  baseUrl?: string,
): FeedPostWithComments {
  return {
    ...normalizeFeedPost(post, baseUrl),
    comments: post.comments,
  };
}

function normalizeFeedChannelAuthorProfile(
  profile: FeedChannelAuthorProfile,
  baseUrl?: string,
): FeedChannelAuthorProfile {
  return {
    ...profile,
    recentPosts: profile.recentPosts.map((post) =>
      normalizeFeedPost(post, baseUrl),
    ),
  };
}

function normalizeFeedChannelHomeResponse(
  response: FeedChannelHomeResponse,
  baseUrl?: string,
): FeedChannelHomeResponse {
  return {
    ...response,
    posts: response.posts.map((post) => normalizeFeedPost(post, baseUrl)),
    liveEntries: response.liveEntries.map((entry) => ({
      ...entry,
      coverUrl: entry.coverUrl
        ? normalizeAttachmentAssetUrl(entry.coverUrl, baseUrl)
        : entry.coverUrl,
    })),
  };
}

function normalizeFeedChannelWatchHistoryResponse(
  response: FeedChannelWatchHistoryResponse,
  baseUrl?: string,
): FeedChannelWatchHistoryResponse {
  return {
    ...response,
    posts: response.posts.map((post) => normalizeFeedPost(post, baseUrl)),
  };
}

function normalizeFeedChannelHomeDecorationsResponse(
  response: FeedChannelHomeDecorationsResponse,
  baseUrl?: string,
): FeedChannelHomeDecorationsResponse {
  return {
    ...response,
    liveEntries: response.liveEntries.map((entry) => ({
      ...entry,
      coverUrl: entry.coverUrl
        ? normalizeAttachmentAssetUrl(entry.coverUrl, baseUrl)
        : entry.coverUrl,
    })),
  };
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (
    [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "10.0.2.2",
      "host.docker.internal",
    ].includes(normalized)
  ) {
    return true;
  }

  const match = normalized.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (!match) {
    return false;
  }

  const firstOctet = Number(match[1]);
  const secondOctet = Number(match[2]);

  if (firstOctet === 10 || firstOctet === 127) {
    return true;
  }

  if (firstOctet === 192 && secondOctet === 168) {
    return true;
  }

  return firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31;
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

export function createSpeechSynthesis(
  payload: SpeechSynthesisRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<SpeechSynthesisResult>(
    "/ai/speech",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function createVoiceCallTurn(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<VoiceCallTurnResult>(
    "/chat/voice-calls/turns",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function finalizeVoiceCall(
  payload: FinalizeCallRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FinalizeCallResult>(
    "/chat/voice-calls/finalize",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function createGroupVoiceCallTurn(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<GroupVoiceCallTurnResult>(
    "/chat/group-voice-calls/turns",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function finalizeGroupVoiceCall(
  payload: FinalizeCallRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FinalizeCallResult>(
    "/chat/group-voice-calls/finalize",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function createDigitalHumanSession(
  payload: CreateDigitalHumanSessionRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<DigitalHumanSession>(
    "/chat/digital-human-calls/sessions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getDigitalHumanSession(sessionId: string, baseUrl?: string) {
  return requestLegacyApi<DigitalHumanSession>(
    `/chat/digital-human-calls/sessions/${sessionId}`,
    undefined,
    baseUrl,
  );
}

export function closeDigitalHumanSession(sessionId: string, baseUrl?: string) {
  return requestLegacyApi<DigitalHumanSession>(
    `/chat/digital-human-calls/sessions/${sessionId}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function createDigitalHumanTurn(
  sessionId: string,
  payload: FormData,
  baseUrl?: string,
) {
  return requestLegacyApi<DigitalHumanTurnResult>(
    `/chat/digital-human-calls/sessions/${sessionId}/turns`,
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function updateDigitalHumanProviderState(
  sessionId: string,
  payload: UpdateDigitalHumanProviderStateRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<DigitalHumanSession>(
    `/chat/digital-human-calls/sessions/${sessionId}/provider-state`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
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

export function submitCloudFeedback(
  payload: SubmitCloudFeedbackRequest,
  baseUrl?: string,
) {
  return requestCloudApi<SubmitCloudFeedbackResponse>(
    "/cloud/feedback",
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

export function sendCloudEmailCode(
  payload: SendEmailCodeRequest,
  baseUrl?: string,
) {
  return requestCloudApi<SendEmailCodeResponse>(
    "/cloud/auth/email/send-code",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function verifyCloudEmailCode(
  payload: VerifyEmailCodeRequest,
  baseUrl?: string,
) {
  return requestCloudApi<VerifyEmailCodeResponse>(
    "/cloud/auth/email/verify-code",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function verifyCloudGoogleIdToken(
  payload: VerifyGoogleIdTokenRequest,
  baseUrl?: string,
) {
  return requestCloudApi<VerifyGoogleIdTokenResponse>(
    "/cloud/auth/google/verify-id-token",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function loginCloudWithPassword(
  payload: LoginWithPasswordRequest,
  baseUrl?: string,
) {
  return requestCloudApi<LoginWithPasswordResponse>(
    "/cloud/auth/login-with-password",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function sendCloudChangePasswordCode(
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<SendChangePasswordCodeResponse>(
    "/cloud/auth/password/send-change-code",
    buildCloudAuthHeaders(accessToken, { method: "POST" }),
    baseUrl,
  );
}

export function changeCloudPassword(
  payload: ChangePasswordRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<ChangePasswordResponse>(
    "/cloud/auth/password/change",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

// 账号注销（Apple 5.1.1(v)）：两步。send-code 按用户标识自动选渠道（邮箱/手机），
// 响应 channel 告诉前端用哪种文案；confirm 提交验证码后服务端软删除（永久归档）。
export function sendCloudAccountDeletionCode(
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<SendAccountDeletionCodeResponse>(
    "/cloud/auth/account/deletion/send-code",
    buildCloudAuthHeaders(accessToken, { method: "POST" }),
    baseUrl,
  );
}

export function confirmCloudAccountDeletion(
  payload: ConfirmAccountDeletionRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<ConfirmAccountDeletionResponse>(
    "/cloud/auth/account/deletion/confirm",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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

export type RefreshCloudAccessTokenResponse = {
  accessToken: string;
  expiresAt: string;
};

// Sliding TTL：临到期前调，cloud-api 用现有 token 鉴权后签新 token 返回，
// 不需要重发邮件验证码。token 已过期则 401，调用方应清 cloud-session-store
// 引导用户重新登录。
export function refreshCloudAccessToken(
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<RefreshCloudAccessTokenResponse>(
    "/cloud/auth/refresh-access",
    buildCloudAuthHeaders(accessToken, { method: "POST" }),
    baseUrl,
  );
}

export function getMyCloudWorld(accessToken: string, baseUrl?: string) {
  return requestCloudApi<CloudWorldLookupResponse>(
    "/cloud/me/world",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function resolveMyCloudWorldAccess(
  payload: ResolveWorldAccessRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<ResolveWorldAccessResponse>(
    "/cloud/me/world-access/resolve",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

export function getMyCloudWorldAccessSession(
  sessionId: string,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<WorldAccessSessionSummary>(
    `/cloud/me/world-access/sessions/${encodeURIComponent(sessionId)}`,
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

export function getWorldOwner(baseUrl?: string) {
  // 公网隧道下首屏会被 splash 的这一发 RTT 卡住 ~500ms。app 的 index.html 在
  // worldAccessMode=local 时会用 inline 脚本提前 fire 同一个 fetch，并把
  // Promise 挂到 window.__YINJIE_BOOT_OWNER_FETCH__。这里命中一次就消耗掉，
  // 任何异常都回退到走完整 requestLegacyApi 流程，保证降级安全。
  if (typeof window !== "undefined") {
    const carrier = window as unknown as {
      __YINJIE_BOOT_OWNER_FETCH__?: Promise<Response>;
    };
    const inflight = carrier.__YINJIE_BOOT_OWNER_FETCH__;
    if (inflight) {
      carrier.__YINJIE_BOOT_OWNER_FETCH__ = undefined;
      return inflight
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`world-owner-prewarm-${response.status}`);
          }
          return (await response.json()) as WorldOwner;
        })
        .catch(() =>
          requestLegacyApi<WorldOwner>("/world/owner", undefined, baseUrl),
        );
    }
  }
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

// ---- 用户态「赛博分身」(self) ----------------------------------------------
// owner-scoped 世界 API（requestLegacyApi，经 cloud-api 反代注入 phone→TenantContext）。
export function getCyberAvatarSelfProfile(baseUrl?: string) {
  return requestLegacyApi<CyberAvatarSelfProfile>(
    "/cyber-avatar/me",
    undefined,
    baseUrl,
  );
}

export function getCyberAvatarSelfChatHistory(baseUrl?: string) {
  return requestLegacyApi<CyberAvatarSelfChatHistoryResponse>(
    "/cyber-avatar/chat/history",
    undefined,
    baseUrl,
  );
}

export function chatWithCyberAvatarSelf(
  payload: CyberAvatarSelfChatRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<CyberAvatarSelfChatResponse>(
    "/cyber-avatar/chat",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getCyberAvatarSelfAnalysis(baseUrl?: string) {
  return requestLegacyApi<CyberAvatarSelfAnalysisReport>(
    "/cyber-avatar/analysis",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function rebuildCyberAvatarSelf(
  payload: CyberAvatarSelfRebuildRequest = {},
  baseUrl?: string,
) {
  return requestLegacyApi<CyberAvatarSelfRebuildResponse>(
    "/cyber-avatar/rebuild",
    {
      method: "POST",
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

export function getWorldLanguage(baseUrl?: string) {
  return requestLegacyApi<WorldLanguageConfig>(
    "/config/world-language",
    undefined,
    baseUrl,
  );
}

export function setWorldLanguage(
  payload: UpdateWorldLanguageRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<WorldLanguageConfig>(
    "/config/world-language",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function listCharacters(baseUrl?: string) {
  return requestLegacyApi<Character[]>("/characters", undefined, baseUrl);
}

// ── 隐界社区游戏板块 + embedded_web 游戏运行时桥 ──────────────────────────────
/** App 游戏板块：拉 cloud-api 全局社区游戏列表（直连 cloud-api，公开读）。 */
export function fetchCommunityGameBoard(baseUrl?: string) {
  return requestCloudApi<import("./wiki-game").CommunityGameBoardResponse>(
    "/cloud/games/board",
    undefined,
    baseUrl,
  );
}

/** 取某社区游戏的可玩产物（自包含 HTML），用于沙箱 iframe srcdoc。 */
export function fetchCommunityGameArtifact(gameId: string, baseUrl?: string) {
  return requestCloudApi<import("./wiki-game").CommunityGameArtifactContent>(
    `/cloud/games/${encodeURIComponent(gameId)}/artifact`,
    undefined,
    baseUrl,
  );
}

/** 游戏内桥：列出当前世界里可陪玩的 AI 角色（走 world child）。 */
export function listGamePlayCharacters(gameId: string, baseUrl?: string) {
  return requestLegacyApi<import("./wiki-game").GamePlayCharacter[]>(
    `/games/${encodeURIComponent(gameId)}/play-characters`,
    undefined,
    baseUrl,
  );
}

/** 游戏内桥：请求某 AI 角色的回合回应（走 world child，扣 owner AI 配额）。 */
export function requestGameAiTurn(
  gameId: string,
  body: import("./wiki-game").GameAiTurnRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<import("./wiki-game").GameAiTurnResult>(
    `/games/${encodeURIComponent(gameId)}/ai-turn`,
    { method: "POST", body: JSON.stringify(body) },
    baseUrl,
  );
}

export function listPresetCatalog(baseUrl?: string) {
  return requestLegacyApi<Character[]>(
    "/characters/preset-catalog",
    undefined,
    baseUrl,
  );
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

export function setCharacterDefaultVoiceReply(
  id: string,
  enabled: boolean,
  baseUrl?: string,
) {
  return requestLegacyApi<{ id: string; defaultVoiceReply: boolean }>(
    `/characters/${id}/default-voice-reply`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
    baseUrl,
  );
}

export function listVoices(baseUrl?: string) {
  return requestLegacyApi<VoiceCatalog>("/ai/voices", undefined, baseUrl);
}

export function listVoiceClones(baseUrl?: string) {
  return requestLegacyApi<VoiceCloneItem[]>(
    "/ai/voice-clones",
    undefined,
    baseUrl,
  );
}

// payload: FormData with `file` (音频样本) + `displayName`。
export function createVoiceClone(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<VoiceCloneItem>(
    "/ai/voice-clones",
    { method: "POST", body: payload },
    baseUrl,
  );
}

export function deleteVoiceClone(id: string, baseUrl?: string) {
  return requestLegacyApi<{ success: boolean }>(
    `/ai/voice-clones/${id}`,
    { method: "DELETE" },
    baseUrl,
  );
}

export function setCharacterVoicePreset(
  id: string,
  voicePreset: string | null,
  baseUrl?: string,
) {
  return requestLegacyApi<{ id: string; voicePreset: string | null }>(
    `/characters/${id}/voice-preset`,
    {
      method: "PATCH",
      body: JSON.stringify({ voicePreset }),
    },
    baseUrl,
  );
}

/**
 * Tenant-facing：从 wiki 导出的 JSON bundle 导入私有角色到当前 world，
 * 按 name upsert。同名→覆盖；新名→新建并自动建 friendship。
 */
export function importPersonalCharacter(
  bundle: unknown,
  baseUrl?: string,
) {
  return requestLegacyApi<{
    character: Character;
    overwrote: boolean;
    // 'friend' | 'close' | 'best' | 'blocked' | 'removed'。blocked 状态的角色
    // re-import 后仍保留 blocked（用户明确动作不被覆盖），UI 据此显示对应文案
    // 而不是无脑说"已加为好友"。
    friendshipStatus: string;
  }>(
    "/characters/import-personal",
    {
      method: "POST",
      body: JSON.stringify(bundle),
    },
    baseUrl,
  );
}

export function getLatestWorldContext(baseUrl?: string) {
  return requestLegacyApi<WorldContext>("/world/context", undefined, baseUrl);
}

export function getFriendRequests(
  baseUrl?: string,
  opts?: { direction?: "inbound" | "outbound" | "all" },
) {
  const path = opts?.direction
    ? `/social/friend-requests?direction=${encodeURIComponent(opts.direction)}`
    : "/social/friend-requests";
  return requestLegacyApi<FriendRequest[]>(path, undefined, baseUrl);
}

export function getConversations(baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<ConversationListItem[]>(
    "/conversations",
    undefined,
    baseUrl,
  ).then((items) =>
    items.map((item) => normalizeConversationListItem(item, resolvedBaseUrl)),
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

export function markFollowupRecommendationOpened(
  recommendationId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<FollowupRecommendationEventResult>(
    `/followup-runtime/recommendations/${encodeURIComponent(recommendationId)}/opened`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function markFollowupRecommendationFriendRequestPending(
  recommendationId: string,
  payload: MarkFollowupRecommendationFriendRequestPendingRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FollowupRecommendationEventResult>(
    `/followup-runtime/recommendations/${encodeURIComponent(
      recommendationId,
    )}/friend-request-pending`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function markFollowupRecommendationChatStarted(
  recommendationId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<FollowupRecommendationEventResult>(
    `/followup-runtime/recommendations/${encodeURIComponent(
      recommendationId,
    )}/chat-started`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function getConversationMessages(
  id: string,
  baseUrl?: string,
  query: GetChatMessagesQuery = {},
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams();
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (query.aroundMessageId?.trim()) {
    params.set("aroundMessageId", query.aroundMessageId.trim());
  }
  if (typeof query.before === "number") {
    params.set("before", String(query.before));
  }
  if (typeof query.after === "number") {
    params.set("after", String(query.after));
  }

  return requestLegacyApi<Message[]>(
    `/conversations/${id}/messages${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  ).then((messages) =>
    messages.map((message) => normalizeMessage(message, resolvedBaseUrl)),
  );
}

export function getConversationDelegations(id: string, baseUrl?: string) {
  return requestLegacyApi<AgentDelegation[]>(
    `/conversations/${encodeURIComponent(id)}/delegations`,
    undefined,
    baseUrl,
  );
}

export function interveneAgentDelegation(
  conversationId: string,
  delegationId: string,
  text: string,
  baseUrl?: string,
) {
  return requestLegacyApi<AgentDelegation | null>(
    `/conversations/${encodeURIComponent(conversationId)}/delegations/${encodeURIComponent(
      delegationId,
    )}/intervene`,
    {
      method: "POST",
      body: JSON.stringify({ text }),
    },
    baseUrl,
  );
}

export function searchConversationMessages(
  id: string,
  query: SearchChatMessagesQuery = {},
  baseUrl?: string,
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams();
  if (query.keyword?.trim()) {
    params.set("keyword", query.keyword.trim());
  }
  if (query.category) {
    params.set("category", query.category);
  }
  if (query.messageType) {
    params.set("messageType", query.messageType);
  }
  if (query.senderId?.trim()) {
    params.set("senderId", query.senderId.trim());
  }
  if (query.dateFrom?.trim()) {
    params.set("dateFrom", query.dateFrom.trim());
  }
  if (query.dateTo?.trim()) {
    params.set("dateTo", query.dateTo.trim());
  }
  if (query.cursor?.trim()) {
    params.set("cursor", query.cursor.trim());
  }
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }

  return requestLegacyApi<ChatMessageSearchResponse>(
    `/conversations/${id}/message-search${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  ).then((response) => ({
    ...response,
    items: response.items.map((item) =>
      normalizeChatMessageSearchItem(item, resolvedBaseUrl),
    ),
  }));
}

export function recallConversationMessage(
  conversationId: string,
  messageId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<Message>(
    `/conversations/${conversationId}/messages/${messageId}/recall`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function deleteConversationMessage(
  conversationId: string,
  messageId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<SuccessResponse>(
    `/conversations/${conversationId}/messages/${messageId}`,
    {
      method: "DELETE",
    },
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

export function markConversationUnread(id: string, baseUrl?: string) {
  return requestLegacyApi<Conversation>(
    `/conversations/${id}/unread`,
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

export function setConversationMuted(
  id: string,
  payload: SetConversationMutedRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<Conversation>(
    `/conversations/${id}/mute`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function setConversationStrongReminder(
  id: string,
  payload: SetConversationStrongReminderRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<Conversation>(
    `/conversations/${id}/strong-reminder`,
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

export function getGroupBackground(id: string, baseUrl?: string) {
  return requestLegacyApi<ConversationBackgroundSettings>(
    `/groups/${id}/background`,
    undefined,
    baseUrl,
  );
}

export function setGroupBackground(
  id: string,
  payload: UpdateConversationBackgroundRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<ConversationBackgroundSettings>(
    `/groups/${id}/background`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function clearGroupBackground(id: string, baseUrl?: string) {
  return requestLegacyApi<ConversationBackgroundSettings>(
    `/groups/${id}/background`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function uploadChatAttachment(payload: FormData, baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<UploadChatAttachmentResponse>(
    "/chat/attachments",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  ).then((response) => ({
    attachment: normalizeMessageAttachment(
      response.attachment,
      resolvedBaseUrl,
    ) as UploadChatAttachmentResponse["attachment"],
  }));
}

export function getStickerCatalog(baseUrl?: string) {
  return requestLegacyApi<StickerCatalogResponse>(
    "/chat/stickers/catalog",
    undefined,
    baseUrl,
  );
}

export function uploadCustomSticker(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<CustomStickerRecord>(
    "/chat/stickers/custom",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function createCustomStickerFromMessage(
  payload: CreateCustomStickerFromMessageRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<CustomStickerRecord>(
    "/chat/stickers/custom/from-message",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function deleteCustomSticker(id: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/chat/stickers/custom/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
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

// --- 知识库（个人 context）：owner-scoped 入口，鉴权由全局 token provider 按 baseUrl 注入 ---

export function listKnowledgeDocuments(
  params?: ListKnowledgeDocumentsParams,
  baseUrl?: string,
) {
  const search = new URLSearchParams();
  if (params?.scope) search.set("scope", params.scope);
  if (params?.characterId) search.set("characterId", params.characterId);
  const qs = search.toString();
  return requestLegacyApi<KnowledgeDocumentSummary[]>(
    `/knowledge/documents${qs ? `?${qs}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function ingestKnowledgeText(
  payload: IngestKnowledgeTextRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<KnowledgeDocumentSummary>(
    "/knowledge/documents/text",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

// 任意格式文件上传。FormData 直接当 body，request() 会自动跳过 Content-Type
// 让浏览器加 multipart boundary——绝不手设 Content-Type。
export function uploadKnowledgeDocument(payload: FormData, baseUrl?: string) {
  return requestLegacyApi<KnowledgeDocumentSummary>(
    "/knowledge/documents/upload",
    {
      method: "POST",
      body: payload,
    },
    baseUrl,
  );
}

export function ingestKnowledgeUrl(
  payload: IngestKnowledgeUrlRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<KnowledgeDocumentSummary>(
    "/knowledge/documents/url",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

// import 是保留字，函数名加动词前缀。
export function importKnowledgeWorldMemory(baseUrl?: string) {
  return requestLegacyApi<ImportKnowledgeWorldMemoryResult>(
    "/knowledge/import/world-memory",
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function deleteKnowledgeDocument(id: string, baseUrl?: string) {
  return requestLegacyApi<DeleteKnowledgeDocumentResult>(
    `/knowledge/documents/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

// --- 平台运营态：全局预设知识库（admin，X-Admin-Secret；cloud-console 平台页用） ---

export function listGlobalKnowledgeDocuments(baseUrl?: string) {
  return requestLegacyApi<KnowledgeDocumentSummary[]>(
    "/admin/knowledge/global",
    undefined,
    baseUrl,
  );
}

export function ingestGlobalKnowledgeText(
  payload: IngestGlobalKnowledgeRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<KnowledgeDocumentSummary>(
    "/admin/knowledge/global",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function deleteGlobalKnowledgeDocument(id: string, baseUrl?: string) {
  return requestLegacyApi<DeleteKnowledgeDocumentResult>(
    `/admin/knowledge/global/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
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

export function getGroups(baseUrl?: string) {
  return requestLegacyApi<Group[]>("/groups", undefined, baseUrl);
}

export function getSavedGroups(baseUrl?: string) {
  return requestLegacyApi<Group[]>("/groups/saved", undefined, baseUrl);
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

export function updateGroupPreferences(
  id: string,
  payload: UpdateGroupPreferencesRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<Group>(
    `/groups/${id}/preferences`,
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

export function removeGroupMember(
  id: string,
  memberId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<SuccessResponse>(
    `/groups/${id}/members/${memberId}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function getGroupMessages(
  id: string,
  baseUrl?: string,
  query: GetChatMessagesQuery = {},
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams();
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }
  if (query.aroundMessageId?.trim()) {
    params.set("aroundMessageId", query.aroundMessageId.trim());
  }
  if (typeof query.before === "number") {
    params.set("before", String(query.before));
  }
  if (typeof query.after === "number") {
    params.set("after", String(query.after));
  }

  return requestLegacyApi<GroupMessage[]>(
    `/groups/${id}/messages${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  ).then((messages) =>
    messages.map((message) => normalizeGroupMessage(message, resolvedBaseUrl)),
  );
}

export function searchGroupMessages(
  id: string,
  query: SearchChatMessagesQuery = {},
  baseUrl?: string,
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams();
  if (query.keyword?.trim()) {
    params.set("keyword", query.keyword.trim());
  }
  if (query.category) {
    params.set("category", query.category);
  }
  if (query.messageType) {
    params.set("messageType", query.messageType);
  }
  if (query.senderId?.trim()) {
    params.set("senderId", query.senderId.trim());
  }
  if (query.dateFrom?.trim()) {
    params.set("dateFrom", query.dateFrom.trim());
  }
  if (query.dateTo?.trim()) {
    params.set("dateTo", query.dateTo.trim());
  }
  if (query.cursor?.trim()) {
    params.set("cursor", query.cursor.trim());
  }
  if (typeof query.limit === "number") {
    params.set("limit", String(query.limit));
  }

  return requestLegacyApi<ChatMessageSearchResponse>(
    `/groups/${id}/message-search${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  ).then((response) => ({
    ...response,
    items: response.items.map((item) =>
      normalizeChatMessageSearchItem(item, resolvedBaseUrl),
    ),
  }));
}

export interface RecordSearchActivityResponse {
  success: true;
  item: {
    query: string;
    usedAt: string;
    source?: string | null;
  };
}

/**
 * 用户提交一次搜索关键词时上报到后端 owner_search_history_records，
 * 同时触发 cyber-avatar 的 search_activity 信号——shake-discovery /
 * need-discovery 这些 AI 推荐特性会从这里取用户兴趣信号。
 */
export function recordSearchActivity(
  payload: { query: string; source?: string | null },
  baseUrl?: string,
) {
  return requestLegacyApi<RecordSearchActivityResponse>(
    "/search/history",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function recallGroupMessage(
  groupId: string,
  messageId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<GroupMessage>(
    `/groups/${groupId}/messages/${messageId}/recall`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function deleteGroupMessage(
  groupId: string,
  messageId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<SuccessResponse>(
    `/groups/${groupId}/messages/${messageId}`,
    {
      method: "DELETE",
    },
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

export function markGroupUnread(id: string, baseUrl?: string) {
  return requestLegacyApi<Group>(
    `/groups/${id}/unread`,
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

export function getFavorites(baseUrl?: string) {
  return requestLegacyApi<FavoriteRecord[]>("/favorites", undefined, baseUrl);
}

export function createMessageFavorite(
  payload: CreateMessageFavoriteRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FavoriteRecord>(
    "/favorites/messages",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getFavoriteNotes(baseUrl?: string) {
  return requestLegacyApi<FavoriteNoteSummary[]>(
    "/favorites/notes",
    undefined,
    baseUrl,
  );
}

export function getFavoriteNote(id: string, baseUrl?: string) {
  return requestLegacyApi<FavoriteNoteDocument>(
    `/favorites/notes/${encodeURIComponent(id)}`,
    undefined,
    baseUrl,
  );
}

export function createFavoriteNote(
  payload: UpsertFavoriteNoteRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FavoriteNoteDocument>(
    "/favorites/notes",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function updateFavoriteNote(
  id: string,
  payload: UpsertFavoriteNoteRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FavoriteNoteDocument>(
    `/favorites/notes/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function removeFavoriteNote(id: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/favorites/notes/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function removeFavorite(sourceId: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/favorites/${encodeURIComponent(sourceId)}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function getMessageReminders(baseUrl?: string) {
  return requestLegacyApi<MessageReminderRecord[]>(
    "/reminders/messages",
    undefined,
    baseUrl,
  );
}

export function createMessageReminder(
  payload: CreateMessageReminderRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<MessageReminderRecord>(
    "/reminders/messages",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function markMessageReminderNotified(
  sourceId: string,
  payload?: MarkMessageReminderNotifiedRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<MessageReminderRecord>(
    `/reminders/messages/${encodeURIComponent(sourceId)}/notified`,
    {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
    },
    baseUrl,
  );
}

export function removeMessageReminder(sourceId: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/reminders/messages/${encodeURIComponent(sourceId)}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function getReminderTasks(
  query: GetReminderTasksQuery = {},
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (query.status?.trim()) {
    params.set("status", query.status.trim());
  }

  return requestLegacyApi<ReminderTaskRecord[]>(
    `/reminder-runtime/tasks${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function getUpcomingReminderTasks(limit?: number, baseUrl?: string) {
  const params = new URLSearchParams();
  if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
    params.set("limit", String(limit));
  }

  return requestLegacyApi<ReminderTaskRecord[]>(
    `/reminder-runtime/tasks/upcoming${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  );
}

export function completeReminderTask(id: string, baseUrl?: string) {
  return requestLegacyApi<ReminderTaskMutationResult>(
    `/reminder-runtime/tasks/${encodeURIComponent(id)}/complete`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function snoozeReminderTask(
  id: string,
  payload: SnoozeReminderTaskRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<ReminderTaskMutationResult>(
    `/reminder-runtime/tasks/${encodeURIComponent(id)}/snooze`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function cancelReminderTask(id: string, baseUrl?: string) {
  return requestLegacyApi<ReminderTaskMutationResult>(
    `/reminder-runtime/tasks/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
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

export function deleteFriend(characterId: string, baseUrl?: string) {
  return requestLegacyApi<SuccessResponse>(
    `/social/friends/${characterId}`,
    {
      method: "DELETE",
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

export function updateFriendPermissions(
  characterId: string,
  payload: UpdateFriendPermissionsRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FriendListItem["friendship"]>(
    `/social/friends/${characterId}/permissions`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function bulkFriendshipAction(
  payload: BulkFriendshipRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<BulkFriendshipResponse>(
    "/social/friends/bulk",
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
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<Moment[]>("/moments", undefined, baseUrl).then(
    (moments) =>
      moments.map((moment) => normalizeMoment(moment, resolvedBaseUrl)),
  );
}

// 「我的朋友圈」专用：服务端只返回当前 world owner 发的 Moment[]，
// 不再把全表 248+ 条 ~960KB 都拉回前端 filter 出 7 条。
export function getOwnMoments(baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<Moment[]>(
    "/moments?mine=true",
    undefined,
    baseUrl,
  ).then((moments) =>
    moments.map((moment) => normalizeMoment(moment, resolvedBaseUrl)),
  );
}

// 单角色朋友圈专用：服务端按 authorType='character' AND authorId=id 过滤，
// mobile-friend-moments-page / friend-moments-page 用。之前走 getMoments 拉全表
// ~724KB 再客户端 filter 出该角色 5-10 条，每次进单个角色朋友圈页都付这流量。
// 改成服务端过滤后只回该角色实际发过的几条。
export function getCharacterMoments(characterId: string, baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const search = new URLSearchParams();
  search.set("character", characterId);
  return requestLegacyApi<Moment[]>(
    `/moments?${search.toString()}`,
    undefined,
    baseUrl,
  ).then((moments) =>
    moments.map((moment) => normalizeMoment(moment, resolvedBaseUrl)),
  );
}

export interface MomentsPageResponse {
  items: Moment[];
  total: number;
  hasMore: boolean;
}

export function getMomentsPage(
  params: { page?: number; limit?: number } = {},
  baseUrl?: string,
): Promise<MomentsPageResponse> {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const search = new URLSearchParams();
  search.set("page", String(Math.max(1, Math.floor(params.page ?? 1))));
  search.set("limit", String(Math.max(1, Math.floor(params.limit ?? 20))));
  return requestLegacyApi<{ items: Moment[]; total: number; hasMore: boolean }>(
    `/moments?${search.toString()}`,
    undefined,
    baseUrl,
  ).then((response) => ({
    items: response.items.map((moment) =>
      normalizeMoment(moment, resolvedBaseUrl),
    ),
    total: response.total,
    hasMore: response.hasMore,
  }));
}

export function getMoment(id: string, baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<Moment>(`/moments/${id}`, undefined, baseUrl).then(
    (moment) => normalizeMoment(moment, resolvedBaseUrl),
  );
}

export function createUserMoment(
  payload: CreateUserMomentRequest,
  baseUrl?: string,
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<Moment>(
    "/moments/user-post",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  ).then((moment) => normalizeMoment(moment, resolvedBaseUrl));
}

export function deleteMoment(id: string, baseUrl?: string) {
  return requestLegacyApi<{ success: boolean; id: string }>(
    `/moments/${id}`,
    { method: "DELETE" },
    baseUrl,
  );
}

export function uploadMomentMedia(payload: FormData, baseUrl?: string) {
  // 不能再跑 normalizeMomentMediaAsset 把 `/api/moments/media/<file>` 重写成绝对
  // URL：上传响应的 media 唯一用途是立刻回传给 createUserMoment / createFeedPost。
  // 服务端 assertMomentMediaUrl（moments.service.ts:84）强制要求 url/thumbnailUrl/
  // posterUrl/livePhoto.motionUrl 必须 "/api/moments/media/" 开头才能落库（防 SSRF
  // 渲染时把 <img src="https://evil/..."> 落到第三方域名）。这里若再绝对化，发布
  // 时 100% 撞 MOMENTS_MEDIA_URL_INVALID「朋友圈媒体必须来自上传接口」。
  // 朋友圈卡片渲染时绝对化在 createUserMoment.then(normalizeMoment) 那一步完成，
  // 跟此处独立；预览渲染由前端 blob: previewUrl 承担，也不依赖这里的 URL 形态。
  return requestLegacyApi<UploadMomentMediaResponse>(
    "/moments/media",
    {
      method: "POST",
      body: payload,
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

export interface SynthesizeNarrationResult {
  audioUrl: string;
  durationMs?: number;
  cached: boolean;
}

export function synthesizeMomentNarration(id: string, baseUrl?: string) {
  return requestLegacyApi<SynthesizeNarrationResult>(
    `/moments/${id}/synthesize-audio`,
    { method: "POST" },
    baseUrl,
  );
}

export function synthesizeFeedNarration(id: string, baseUrl?: string) {
  return requestLegacyApi<SynthesizeNarrationResult>(
    `/feed/${id}/synthesize-audio`,
    { method: "POST" },
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

export function getFeed(
  page = 1,
  limit = 20,
  baseUrl?: string,
  options?: { surface?: FeedSurface },
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (options?.surface) {
    params.set("surface", options.surface);
  }

  return requestLegacyApi<FeedListResponse>(
    `/feed?${params.toString()}`,
    undefined,
    baseUrl,
  ).then((response) => normalizeFeedListResponse(response, resolvedBaseUrl));
}

// 「我的广场动态」：拉当前 owner 自己发布的广场帖（GET /feed?mine=true），
// 给个人页聚合 + 管理用，照 getOwnMoments 那套返回完整数组。后端单页上限 100
// （clampFeedPaginationLimit），所以循环翻页直到取满 total——重度账号自己就发
// 过 100+ 条，单次 limit=100 会静默丢尾部。安全闸 50 页（5000 条）兜死循环。
export async function getOwnFeed(baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const pageSize = 100;
  const maxPages = 50;
  const all: FeedPostListItem[] = [];
  // 按 id 去重：分页期间若边界偏移（极小概率），page N 末尾与 N+1 开头可能撞同
  // 一条；用 seen 兜底，避免列表里重复渲染。
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page += 1) {
    const response = normalizeFeedListResponse(
      await requestLegacyApi<FeedListResponse>(
        `/feed?mine=true&page=${page}&limit=${pageSize}`,
        undefined,
        baseUrl,
      ),
      resolvedBaseUrl,
    );
    for (const post of response.posts) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      all.push(post);
    }
    if (response.posts.length === 0 || seen.size >= response.total) {
      break;
    }
  }
  return all;
}

export function getGameCenterHome(baseUrl?: string) {
  return requestLegacyApi<GameCenterHomeResponse>(
    "/games/home",
    undefined,
    baseUrl,
  );
}

export function getGameCenterOwnerState(baseUrl?: string) {
  return requestLegacyApi<GameCenterOwnerState>(
    "/games/owner-state",
    undefined,
    baseUrl,
  );
}

export function launchGameCenterGame(gameId: string, baseUrl?: string) {
  return requestLegacyApi<GameCenterOwnerState>(
    `/games/${gameId}/launch`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function setGameCenterPinned(
  gameId: string,
  pinned: boolean,
  baseUrl?: string,
) {
  return requestLegacyApi<GameCenterOwnerState>(
    `/games/${gameId}/pin`,
    {
      method: pinned ? "POST" : "DELETE",
    },
    baseUrl,
  );
}

export function dismissGameCenterActiveGame(baseUrl?: string) {
  return requestLegacyApi<GameCenterOwnerState>(
    "/games/active-game",
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function getFarmState(baseUrl?: string) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/state",
    undefined,
    baseUrl,
  );
}

export function getFarmNeighbors(
  options?: { limit?: number },
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  return requestLegacyApi<FarmNeighborSummary[]>(
    qs ? `/games/farm/neighbors?${qs}` : "/games/farm/neighbors",
    undefined,
    baseUrl,
  );
}

export function getFarmNeighborDetail(characterId: string, baseUrl?: string) {
  return requestLegacyApi<FarmNeighborDetail>(
    `/games/farm/neighbors/${encodeURIComponent(characterId)}`,
    undefined,
    baseUrl,
  );
}

export function plantFarmCrop(
  input: { plotIndex: number; cropId: FarmCropId },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/plant",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function waterFarmPlot(
  input: { plotIndex: number; characterId?: string },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/water",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function weedFarmPlot(
  input: { plotIndex: number; characterId?: string },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/weed",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function debugFarmPlot(
  input: { plotIndex: number; characterId?: string },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/debug",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function harvestFarmPlot(
  input: { plotIndex: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmHarvestResult>(
    "/games/farm/harvest",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function stealFromNeighbor(
  input: { characterId: string; plotIndex: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmStealResult>(
    "/games/farm/steal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function buyFarmSeed(
  input: { cropId: FarmCropId; quantity: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/buy-seed",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function sellFarmCrop(
  input: { cropId: FarmCropId; quantity: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/sell-crop",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function buyFarmConsumable(
  input: { consumableId: FarmConsumableId; quantity: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmConsumablePurchaseResult>(
    "/games/farm/buy-consumable",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function applyFarmFertilizer(
  input: { plotIndex: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/apply-fertilizer",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function applyFarmPesticide(
  input: { plotIndex: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/apply-pesticide",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function buyFarmDog(baseUrl?: string) {
  return requestLegacyApi<FarmDogPurchaseResult>(
    "/games/farm/buy-dog",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    baseUrl,
  );
}

export function feedFarmDog(baseUrl?: string) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/feed-dog",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    baseUrl,
  );
}

export function uprootFarmPlot(input: { plotIndex: number }, baseUrl?: string) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/uproot",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function buyFarmDecoration(
  input: { decorationId: FarmDecorationId; quantity: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmDecorationPurchaseResult>(
    "/games/farm/buy-decoration",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function placeFarmDecoration(
  input: { decorationId: FarmDecorationId; x: number; y: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmDecorationPlaceResult>(
    "/games/farm/place-decoration",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function removeFarmDecoration(
  input: { placementId: string },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmPlayerStateView>(
    "/games/farm/remove-decoration",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function getFarmLeaderboard(
  options?: { type?: FarmLeaderboardType; limit?: number },
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (options?.type) params.set("type", options.type);
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  return requestLegacyApi<FarmLeaderboardView>(
    qs ? `/games/farm/leaderboard?${qs}` : "/games/farm/leaderboard",
    undefined,
    baseUrl,
  );
}

export function giftFarmCoins(
  input: { characterId: string; amount: number },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmGiftCoinsResult>(
    "/games/farm/gift-coins",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function giftFarmItem(
  input: {
    characterId: string;
    itemKind: "crop" | "seed" | "consumable";
    itemId: string;
    quantity: number;
  },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmGiftItemResult>(
    "/games/farm/gift-item",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function getFarmCheckin(baseUrl?: string) {
  return requestLegacyApi<FarmCheckinView>(
    "/games/farm/checkin",
    undefined,
    baseUrl,
  );
}

export function doFarmCheckin(baseUrl?: string) {
  return requestLegacyApi<FarmCheckinResult>(
    "/games/farm/checkin",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    baseUrl,
  );
}

export function getFarmQuests(baseUrl?: string) {
  return requestLegacyApi<FarmQuestsView>(
    "/games/farm/quests",
    undefined,
    baseUrl,
  );
}

export function claimFarmQuest(
  input: { questId: string },
  baseUrl?: string,
) {
  return requestLegacyApi<FarmQuestClaimResult>(
    "/games/farm/quests/claim",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    baseUrl,
  );
}

export function getFarmEvents(
  options?: { since?: string; limit?: number },
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (options?.since) params.set("since", options.since);
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  return requestLegacyApi<FarmEventView[]>(
    qs ? `/games/farm/events?${qs}` : "/games/farm/events",
    undefined,
    baseUrl,
  );
}

export function getFeedPost(id: string, baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<FeedPostWithComments | null>(
    `/feed/${id}`,
    undefined,
    baseUrl,
  ).then((post) =>
    post ? normalizeFeedPostWithComments(post, resolvedBaseUrl) : null,
  );
}

export function getChannelHome(
  baseUrl?: string,
  options?: {
    section?: FeedChannelHomeSection;
    page?: number;
    limit?: number;
  },
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams();

  if (options?.section) {
    params.set("section", options.section);
  }
  if (typeof options?.page === "number") {
    params.set("page", String(options.page));
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }

  return requestLegacyApi<FeedChannelHomeResponse>(
    `/feed/channels/home${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  ).then((response) =>
    normalizeFeedChannelHomeResponse(response, resolvedBaseUrl),
  );
}

export function getChannelHomeDecorations(
  baseUrl?: string,
  options?: {
    section?: FeedChannelHomeSection;
    page?: number;
    limit?: number;
  },
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams();

  if (options?.section) {
    params.set("section", options.section);
  }
  if (typeof options?.page === "number") {
    params.set("page", String(options.page));
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }

  return requestLegacyApi<FeedChannelHomeDecorationsResponse>(
    `/feed/channels/home/decorations${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  ).then((response) =>
    normalizeFeedChannelHomeDecorationsResponse(response, resolvedBaseUrl),
  );
}

export function getChannelWatchHistory(
  baseUrl?: string,
  options?: {
    page?: number;
    limit?: number;
  },
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  const params = new URLSearchParams();

  if (typeof options?.page === "number") {
    params.set("page", String(options.page));
  }
  if (typeof options?.limit === "number") {
    params.set("limit", String(options.limit));
  }

  return requestLegacyApi<FeedChannelWatchHistoryResponse>(
    `/feed/channels/history${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    baseUrl,
  ).then((response) =>
    normalizeFeedChannelWatchHistoryResponse(response, resolvedBaseUrl),
  );
}

export function getChannelAuthorProfile(authorId: string, baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<FeedChannelAuthorProfile>(
    `/feed/channels/authors/${authorId}`,
    undefined,
    baseUrl,
  ).then((profile) =>
    normalizeFeedChannelAuthorProfile(profile, resolvedBaseUrl),
  );
}

export function createFeedPost(
  payload: CreateFeedPostRequest,
  baseUrl?: string,
) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<FeedPost>(
    "/feed",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  ).then((post) => normalizeFeedPost(post, resolvedBaseUrl));
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

export function listFeedComments(id: string, baseUrl?: string) {
  return requestLegacyApi<FeedComment[]>(
    `/feed/${id}/comments`,
    undefined,
    baseUrl,
  );
}

export function replyFeedComment(
  id: string,
  payload: CreateFeedCommentRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FeedComment>(
    `/feed/comments/${id}/reply`,
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

export function unlikeFeedPost(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/${id}/like`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function favoriteFeedPost(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/${id}/favorite`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function unfavoriteFeedPost(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/${id}/favorite`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function shareFeedPost(
  id: string,
  payload?: FeedShareRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<void>(
    `/feed/${id}/share`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
    baseUrl,
  );
}

export interface FeedForwardToChatRequest {
  targetCharacterId: string;
  note?: string;
}

export interface FeedForwardToChatResult {
  messageId: string;
  conversationId: string;
}

export function forwardFeedPostToChat(
  id: string,
  payload: FeedForwardToChatRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<FeedForwardToChatResult>(
    `/feed/${id}/forward-to-chat`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function viewFeedPost(
  id: string,
  payload?: FeedViewRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<void>(
    `/feed/${id}/view`,
    {
      method: "POST",
      body: JSON.stringify(payload ?? {}),
    },
    baseUrl,
  );
}

export function markFeedPostNotInterested(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/${id}/not-interested`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function followChannelAuthor(authorId: string, baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<FeedChannelAuthorProfile>(
    `/feed/channels/authors/${authorId}/follow`,
    {
      method: "POST",
    },
    baseUrl,
  ).then((profile) =>
    normalizeFeedChannelAuthorProfile(profile, resolvedBaseUrl),
  );
}

export function unfollowChannelAuthor(authorId: string, baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  return requestLegacyApi<FeedChannelAuthorProfile>(
    `/feed/channels/authors/${authorId}/follow`,
    {
      method: "DELETE",
    },
    baseUrl,
  ).then((profile) =>
    normalizeFeedChannelAuthorProfile(profile, resolvedBaseUrl),
  );
}

export function likeFeedComment(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/comments/${id}/like`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function deleteFeedComment(id: string, baseUrl?: string) {
  return requestLegacyApi<void>(
    `/feed/comments/${id}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

// 删除自己发布的广场动态（个人页「我的广场动态」用），照 deleteMoment 那套。
export function deleteFeedPost(id: string, baseUrl?: string) {
  return requestLegacyApi<{ success: boolean; id: string }>(
    `/feed/${id}`,
    {
      method: "DELETE",
    },
    baseUrl,
  );
}

export function generateChannelPost(baseUrl?: string) {
  const resolvedBaseUrl = resolveCoreApiBaseUrl(baseUrl, {
    allowDefault: false,
  });
  // 后端 generateChannelPost 在以下几种情况都返回 null（HTTP 201 + 空 body）：
  // MINIMAX_API_KEY 没配 / 视频额度今日用完 / 没有 feedFrequency>0 的角色。
  // requestLegacyApi 拿到空 body 会返回 undefined，传给 normalizeFeedPost
  // 会读 `post.media` 抛 TypeError——上层 mutation 又没 onError，UI 上
  // 用户看到的就是一坨堆栈。这里直接挡掉，让 mutation 自己判 null。
  return requestLegacyApi<FeedPost | null | undefined>(
    "/feed/channels/generate",
    {
      method: "POST",
    },
    baseUrl,
  ).then((post) => (post ? normalizeFeedPost(post, resolvedBaseUrl) : null));
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

export function getOfficialAccountMessageEntries(baseUrl?: string) {
  return requestLegacyApi<OfficialAccountMessageEntries>(
    "/official-accounts/message-entries",
    undefined,
    baseUrl,
  );
}

export function getOfficialAccountSubscriptionInbox(baseUrl?: string) {
  return requestLegacyApi<OfficialAccountSubscriptionInbox>(
    "/official-accounts/subscription-inbox",
    undefined,
    baseUrl,
  );
}

export function getOfficialAccountServiceConversations(baseUrl?: string) {
  return requestLegacyApi<OfficialAccountServiceConversationSummary[]>(
    "/official-accounts/service-conversations",
    undefined,
    baseUrl,
  );
}

export function getOfficialAccountServiceMessages(
  accountId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<OfficialAccountServiceMessage[]>(
    `/official-accounts/${accountId}/service-messages`,
    undefined,
    baseUrl,
  );
}

export function markOfficialAccountServiceMessagesRead(
  accountId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<OfficialAccountServiceMessage[]>(
    `/official-accounts/${accountId}/service-messages/read`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function updateOfficialAccountPreferences(
  accountId: string,
  payload: UpdateOfficialAccountPreferencesRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<OfficialAccountDetail>(
    `/official-accounts/${accountId}/preferences`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function markOfficialAccountDeliveryRead(
  deliveryId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<OfficialAccountSubscriptionInbox>(
    `/official-accounts/deliveries/${deliveryId}/read`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function markOfficialAccountSubscriptionInboxRead(baseUrl?: string) {
  return requestLegacyApi<OfficialAccountSubscriptionInbox>(
    "/official-accounts/subscription-inbox/read",
    {
      method: "POST",
    },
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

export function shake(
  payload?: CreateShakeDiscoverySessionRequest,
  baseUrl?: string,
) {
  return requestLegacyApi<ShakeDiscoverySessionPreview | null>(
    "/social/shake",
    {
      method: "POST",
      body: JSON.stringify({
        mode: payload?.mode === "reroll" ? "reroll" : "new",
      }),
    },
    baseUrl,
  );
}

export function getActiveShakeSession(baseUrl?: string) {
  return requestLegacyApi<ShakeDiscoverySessionPreview | null>(
    "/social/shake/active",
    undefined,
    baseUrl,
  );
}

export function keepShakeSession(sessionId: string, baseUrl?: string) {
  return requestLegacyApi<KeepShakeDiscoverySessionResult>(
    `/social/shake/${encodeURIComponent(sessionId)}/keep`,
    {
      method: "POST",
    },
    baseUrl,
  );
}

export function dismissShakeSession(
  sessionId: string,
  payload?: { reason?: string | null },
  baseUrl?: string,
) {
  return requestLegacyApi<DismissShakeDiscoverySessionResult>(
    `/social/shake/${encodeURIComponent(sessionId)}/dismiss`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: payload?.reason?.trim() || null,
      }),
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
  return requestLegacyApi<TriggerSceneResponse>(
    "/social/trigger-scene",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    baseUrl,
  );
}

export function getMyCloudSubscription(accessToken: string, baseUrl?: string) {
  return requestCloudApi<SubscriptionStateResponse>(
    "/cloud/me/subscription",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function getMyCloudProfile(accessToken: string, baseUrl?: string) {
  return requestCloudApi<CloudProfileResponse>(
    "/cloud/me/profile",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function getMyCloudInviteSummary(accessToken: string, baseUrl?: string) {
  return requestCloudApi<InviteSummaryResponse>(
    "/cloud/me/invite/summary",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

// ── 小红书发帖赠会员（cloud-api，带 accessToken） ─────────────────────────────
export function getMyXhsRewardSummary(accessToken: string, baseUrl?: string) {
  return requestCloudApi<XhsRewardSummaryResponse>(
    "/cloud/me/xhs-reward/summary",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function listMyXhsRewardClaims(accessToken: string, baseUrl?: string) {
  return requestCloudApi<XhsRewardClaimSummary[]>(
    "/cloud/me/xhs-reward/claims",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

// payload: FormData，字段 `postUrl`、可选 `userNote`、文件 `screenshot`。
// FormData body 时 request() 不会手设 Content-Type（让浏览器带 boundary）。
export function submitMyXhsRewardClaim(
  payload: FormData,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<XhsRewardClaimSummary>(
    "/cloud/me/xhs-reward/submit",
    buildCloudAuthHeaders(accessToken, { method: "POST", body: payload }),
    baseUrl,
  );
}

// ── 小红书发帖文案/配图生成（world 端，requestLegacyApi，Bearer 由
//    cloudWorldApiTokenProvider 注入，同 uploadMomentMedia）。 ────────────────
export interface XhsPromoCopyResponse {
  options: string[];
}

export interface XhsPromoImageResponse {
  // url 是相对路径 `/api/moments/media/<file>`，展示/下载前用 normalizeAttachmentAssetUrl
  // 绝对化（不要在这里预绝对化，理由同 uploadMomentMedia）。
  images: Array<{ url: string; fileName: string }>;
  quotaExhausted?: boolean;
}

export function generateXhsPromoCopy(
  payload: { count?: number; angle?: string },
  baseUrl?: string,
) {
  return requestLegacyApi<XhsPromoCopyResponse>(
    "/xhs-promo/generate-copy",
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    },
    baseUrl,
  );
}

export function generateXhsPromoImage(
  payload: { promptHint?: string },
  baseUrl?: string,
) {
  return requestLegacyApi<XhsPromoImageResponse>(
    "/xhs-promo/generate-image",
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    },
    baseUrl,
  );
}

// ── 分身相遇（cloud-api 跨用户） ─────────────────────────────────────────────
// 这些都是 requestCloudApi（带 accessToken），不是 world-api。联系方式字段本身
// 通过 world-api 的 updateWorldOwner({ contact }) 维护；这里只做撮合 / 决策 / 披露。

export function getAvatarEncounterOverview(
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<AvatarEncounterOverview>(
    "/cloud/social/avatar-encounters/overview",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function startAvatarEncounter(accessToken: string, baseUrl?: string) {
  return requestCloudApi<AvatarEncounterSession>(
    "/cloud/social/avatar-encounters",
    buildCloudAuthHeaders(accessToken, { method: "POST" }),
    baseUrl,
  );
}

export function getAvatarEncounter(
  encounterId: string,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<AvatarEncounterView>(
    `/cloud/social/avatar-encounters/${encounterId}`,
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function decideAvatarEncounter(
  encounterId: string,
  payload: DecideAvatarEncounterRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<AvatarEncounterDecisionResult>(
    `/cloud/social/avatar-encounters/${encounterId}/decision`,
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

export function listReceivedAvatarEncounters(
  accessToken: string,
  cursor?: string,
  baseUrl?: string,
) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return requestCloudApi<AvatarEncounterInboxResponse>(
    `/cloud/social/avatar-encounters/received${query}`,
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

// 注：opt-in 不走 cloud-api。它的唯一真源是 world owner 列，前端用 world-api
// updateWorldOwner({ encounterOptedIn }) 写，world 改字段即时推快照同步撮合池。

export function redeemMyCloudInvite(
  payload: RedeemInviteRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<RedeemInviteResponse>(
    "/cloud/me/invite/redeem",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

export function postMyCloudCheckout(
  payload: CheckoutRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<CheckoutResponse>(
    "/cloud/me/checkout",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

export function getMySubscription(accessToken: string, baseUrl?: string) {
  return getMyCloudSubscription(accessToken, baseUrl);
}

export function getMyInviteSummary(accessToken: string, baseUrl?: string) {
  return getMyCloudInviteSummary(accessToken, baseUrl);
}

export function redeemInvite(
  payload: RedeemInviteRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return redeemMyCloudInvite(payload, accessToken, baseUrl);
}

export function createCheckout(
  payload: CheckoutRequest,
  accessToken: string,
  baseUrl?: string,
) {
  return postMyCloudCheckout(payload, accessToken, baseUrl);
}

// ── 钱包（现金 ¥零钱，cloud-api /cloud/me/wallet） ────────────────────────────

export function getMyCloudWallet(accessToken: string, baseUrl?: string) {
  return requestCloudApi<WalletStateResponse>(
    "/cloud/me/wallet",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

// 钱包按量付费计费目录（启用中的特殊高消耗动作 + 每次计费价 cents）。
export function getMyCloudBillableCatalog(accessToken: string, baseUrl?: string) {
  return requestCloudApi<CloudBillableCatalogResponse>(
    "/cloud/me/wallet/billable-catalog",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function listMyCloudWalletTransactions(
  accessToken: string,
  params?: { page?: number; pageSize?: number },
  baseUrl?: string,
) {
  const search = new URLSearchParams();
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return requestCloudApi<WalletTransactionListResponse>(
    `/cloud/me/wallet/transactions${query ? `?${query}` : ""}`,
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function createCloudWalletRechargeRequest(
  payload: CreateRechargeRequestPayload,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<CreateRechargeResponse>(
    "/cloud/me/wallet/recharge-request",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

// ── 商城 + 礼物柜（cloud-api，钱包扣款）─────────────────────────────
export function listStoreGoods(
  accessToken: string,
  params?: { kind?: GoodsKind },
  baseUrl?: string,
) {
  const qs = params?.kind ? `?kind=${encodeURIComponent(params.kind)}` : "";
  return requestCloudApi<GoodsListResponse>(
    `/cloud/me/store/goods${qs}`,
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function createStoreOrder(
  payload: CreateGoodsOrderPayload,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<CreateGoodsOrderResponse>(
    "/cloud/me/store/orders",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

export function listMyStoreOrders(
  accessToken: string,
  params?: { page?: number; pageSize?: number; status?: GoodsOrderStatus },
  baseUrl?: string,
) {
  const search = new URLSearchParams();
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return requestCloudApi<GoodsOrderListResponse>(
    `/cloud/me/store/orders${qs ? `?${qs}` : ""}`,
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function getMyStoreInventory(accessToken: string, baseUrl?: string) {
  return requestCloudApi<InventoryItemSummary[]>(
    "/cloud/me/store/inventory",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function getMyGiftCabinet(accessToken: string, baseUrl?: string) {
  return requestCloudApi<GiftCabinetResponse>(
    "/cloud/me/store/gifts",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

export function giftGoodsToCharacter(
  payload: GiftToCharacterPayload,
  accessToken: string,
  baseUrl?: string,
) {
  return requestCloudApi<GiftToCharacterResponse>(
    "/cloud/me/store/gifts",
    buildCloudAuthHeaders(accessToken, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
    baseUrl,
  );
}

// 每日签到状态：今天是否已签 / 连签天数 / 今日已得金额。
export function getMyCloudWalletCheckin(accessToken: string, baseUrl?: string) {
  return requestCloudApi<WalletCheckinStatus>(
    "/cloud/me/wallet/checkin",
    buildCloudAuthHeaders(accessToken),
    baseUrl,
  );
}

// 执行签到：随机 0.2–0.5¥ 入钱包，返回本次奖励 + 最新余额 + 连签天数。
export function claimCloudWalletCheckin(accessToken: string, baseUrl?: string) {
  return requestCloudApi<WalletCheckinResult>(
    "/cloud/me/wallet/checkin",
    buildCloudAuthHeaders(accessToken, { method: "POST" }),
    baseUrl,
  );
}

function buildCloudAdminHeaders(init?: RequestInit): RequestInit {
  return {
    ...init,
    headers: init?.headers ?? new Headers(),
  };
}

function buildCloudAdminQueryString(query?: Record<string, unknown>) {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

export function listCloudUsersAdmin(
  query: CloudUserListQuery | undefined,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<CloudUserListResponse>(
    `/admin/cloud/users${buildCloudAdminQueryString(query as Record<string, unknown>)}`,
    buildCloudAdminHeaders(init),
    baseUrl,
  );
}

export function getCloudUserAdmin(
  id: string,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<CloudUserDetail>(
    `/admin/cloud/users/${encodeURIComponent(id)}`,
    buildCloudAdminHeaders(init),
    baseUrl,
  );
}

export function grantCloudUserSubscriptionAdmin(
  id: string,
  payload: GrantSubscriptionRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<SubscriptionRecordSummary>(
    `/admin/cloud/users/${encodeURIComponent(id)}/subscriptions`,
    buildCloudAdminHeaders({
      ...init,
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        "Content-Type": "application/json",
      },
    }),
    baseUrl,
  );
}

export function banCloudUserAdmin(
  id: string,
  payload: BanCloudUserRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<{ success: true }>(
    `/admin/cloud/users/${encodeURIComponent(id)}/ban`,
    buildCloudAdminHeaders({
      ...init,
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        "Content-Type": "application/json",
      },
    }),
    baseUrl,
  );
}

export function unbanCloudUserAdmin(
  id: string,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<{ success: true }>(
    `/admin/cloud/users/${encodeURIComponent(id)}/unban`,
    buildCloudAdminHeaders({
      ...init,
      method: "POST",
    }),
    baseUrl,
  );
}

export function listSubscriptionPlansAdmin(
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<SubscriptionPlanSummary[]>(
    "/admin/cloud/subscription-plans",
    buildCloudAdminHeaders(init),
    baseUrl,
  );
}

export function upsertSubscriptionPlanAdmin(
  payload: UpsertSubscriptionPlanRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<SubscriptionPlanSummary>(
    "/admin/cloud/subscription-plans",
    buildCloudAdminHeaders({
      ...init,
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        "Content-Type": "application/json",
      },
    }),
    baseUrl,
  );
}

export function listCloudConfigsAdmin(
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<CloudConfigEntry[]>(
    "/admin/cloud/configs",
    buildCloudAdminHeaders(init),
    baseUrl,
  );
}

export function upsertCloudConfigAdmin(
  payload: UpsertCloudConfigRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<CloudConfigEntry>(
    "/admin/cloud/configs",
    buildCloudAdminHeaders({
      ...init,
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        "Content-Type": "application/json",
      },
    }),
    baseUrl,
  );
}

export function listInviteRedemptionsAdmin(
  query: InviteRedemptionListQuery | undefined,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<InviteRedemptionListResponse>(
    `/admin/cloud/invites/redemptions${buildCloudAdminQueryString(query as Record<string, unknown>)}`,
    buildCloudAdminHeaders(init),
    baseUrl,
  );
}

export function rejectInviteRedemptionAdmin(
  id: string,
  payload: RejectInviteRedemptionRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return requestCloudApi<{ success: true }>(
    `/admin/cloud/invites/redemptions/${encodeURIComponent(id)}/reject`,
    buildCloudAdminHeaders({
      ...init,
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        "Content-Type": "application/json",
      },
    }),
    baseUrl,
  );
}

export function listCloudUsers(
  query: CloudUserListQuery | undefined,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return listCloudUsersAdmin(query, init, baseUrl);
}

export function getCloudUser(
  id: string,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return getCloudUserAdmin(id, init, baseUrl);
}

export function grantSubscription(
  id: string,
  payload: GrantSubscriptionRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return grantCloudUserSubscriptionAdmin(id, payload, init, baseUrl);
}

export function banUser(
  id: string,
  payload: BanCloudUserRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return banCloudUserAdmin(id, payload, init, baseUrl);
}

export function unbanUser(
  id: string,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return unbanCloudUserAdmin(id, init, baseUrl);
}

export function listSubscriptionPlans(
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return listSubscriptionPlansAdmin(init, baseUrl);
}

export function upsertSubscriptionPlan(
  payload: UpsertSubscriptionPlanRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return upsertSubscriptionPlanAdmin(payload, init, baseUrl);
}

export function listCloudConfigs(
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return listCloudConfigsAdmin(init, baseUrl);
}

export function upsertCloudConfig(
  payload: UpsertCloudConfigRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return upsertCloudConfigAdmin(payload, init, baseUrl);
}

export function listInviteRedemptions(
  query: InviteRedemptionListQuery | undefined,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return listInviteRedemptionsAdmin(query, init, baseUrl);
}

export function rejectInviteRedemption(
  id: string,
  payload: RejectInviteRedemptionRequest,
  init: RequestInit | undefined,
  baseUrl?: string,
) {
  return rejectInviteRedemptionAdmin(id, payload, init, baseUrl);
}

// ============================================================
// 抢车位 (parking-war) — see api/src/modules/games/parking-war/
// ============================================================
import type {
  ParkingWarCarTier,
  ParkingWarCollectResult,
  ParkingWarDailyBonusResult,
  ParkingWarEventView,
  ParkingWarLeaderboardRow,
  ParkingWarLotSurface,
  ParkingWarNeighborDetail,
  ParkingWarNeighborSummary,
  ParkingWarPlayerStateView,
  ParkingWarRarity,
  ParkingWarRecallResult,
  ParkingWarTicketResult,
  ParkingWarTowResult,
} from "./parking-war";

const PW = "/games/parking-war";

function postJsonParkingWar<T>(path: string, body: unknown, baseUrl?: string) {
  return requestLegacyApi<T>(
    path,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    },
    baseUrl,
  );
}

export function getParkingWarState(baseUrl?: string) {
  return requestLegacyApi<ParkingWarPlayerStateView>(
    `${PW}/state`,
    undefined,
    baseUrl,
  );
}

export function getParkingWarNeighbors(
  options?: { limit?: number },
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  return requestLegacyApi<ParkingWarNeighborSummary[]>(
    qs ? `${PW}/neighbors?${qs}` : `${PW}/neighbors`,
    undefined,
    baseUrl,
  );
}

export function getParkingWarNeighborDetail(
  characterId: string,
  baseUrl?: string,
) {
  return requestLegacyApi<ParkingWarNeighborDetail>(
    `${PW}/neighbors/${encodeURIComponent(characterId)}`,
    undefined,
    baseUrl,
  );
}

export function getParkingWarEvents(
  options?: { since?: string; limit?: number },
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (options?.since) params.set("since", options.since);
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  return requestLegacyApi<ParkingWarEventView[]>(
    qs ? `${PW}/events?${qs}` : `${PW}/events`,
    undefined,
    baseUrl,
  );
}

export function getParkingWarLeaderboard(
  options?: { scope?: "global" | "friends"; limit?: number },
  baseUrl?: string,
) {
  const params = new URLSearchParams();
  if (options?.scope) params.set("scope", options.scope);
  if (options?.limit != null) params.set("limit", String(options.limit));
  const qs = params.toString();
  return requestLegacyApi<ParkingWarLeaderboardRow[]>(
    qs ? `${PW}/leaderboard?${qs}` : `${PW}/leaderboard`,
    undefined,
    baseUrl,
  );
}

export function parkParkingWarCar(
  input: { carId: string; slotIndex: number; characterId?: string },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/park`,
    input,
    baseUrl,
  );
}

export function recallParkingWarCar(
  input: { occupancyId: string },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarRecallResult>(
    `${PW}/recall`,
    input,
    baseUrl,
  );
}

export function collectParkingWarSlot(
  input: { slotIndex?: number },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarCollectResult>(
    `${PW}/collect`,
    input,
    baseUrl,
  );
}

export function ticketParkingWarOccupancy(
  input: { occupancyId: string },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarTicketResult>(
    `${PW}/ticket`,
    input,
    baseUrl,
  );
}

export function towParkingWarOccupancy(
  input: { occupancyId: string },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarTowResult>(
    `${PW}/tow`,
    input,
    baseUrl,
  );
}

export function buyParkingWarCar(
  input: { tier: ParkingWarCarTier; rarity: ParkingWarRarity },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/buy-car`,
    input,
    baseUrl,
  );
}

export function upgradeParkingWarCar(
  input: { carId: string },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/upgrade-car`,
    input,
    baseUrl,
  );
}

export function paintParkingWarCar(
  input: { carId: string; paintIndex: number },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/paint-car`,
    input,
    baseUrl,
  );
}

export function repairParkingWarCar(
  input: { carId: string },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/repair-car`,
    input,
    baseUrl,
  );
}

export function upgradeParkingWarLot(
  input: {
    target: "size" | "surface";
    value: number | ParkingWarLotSurface;
  },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/upgrade-lot`,
    input,
    baseUrl,
  );
}

export function upgradeParkingWarGarage(baseUrl?: string) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/upgrade-garage`,
    {},
    baseUrl,
  );
}

export function claimParkingWarDailyBonus(baseUrl?: string) {
  return postJsonParkingWar<ParkingWarDailyBonusResult>(
    `${PW}/daily-bonus`,
    {},
    baseUrl,
  );
}

export function claimParkingWarDailyTask(
  input: { taskId: string },
  baseUrl?: string,
) {
  return postJsonParkingWar<ParkingWarPlayerStateView>(
    `${PW}/daily-task/claim`,
    input,
    baseUrl,
  );
}

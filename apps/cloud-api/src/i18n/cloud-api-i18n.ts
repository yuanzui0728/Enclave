import type { SupportedLocaleCode } from "@yinjie/contracts";

export type CloudApiLocale = SupportedLocaleCode;

export const DEFAULT_CLOUD_API_LOCALE: CloudApiLocale = "zh-CN";

const LOCALE_ALIASES: Record<string, CloudApiLocale> = {
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-hans": "zh-CN",
  "zh-hans-cn": "zh-CN",
  "zh-sg": "zh-CN",
  "zh-hant": "zh-CN",
  "zh-hant-tw": "zh-CN",
  "zh-tw": "zh-CN",
  en: "en-US",
  "en-us": "en-US",
  "en-gb": "en-US",
  "en-au": "en-US",
  "en-ca": "en-US",
  ja: "ja-JP",
  "ja-jp": "ja-JP",
  ko: "ko-KR",
  "ko-kr": "ko-KR",
};

type LocalizedTextSet = Record<CloudApiLocale, string>;

type CloudApiI18nResult = {
  errorCode: string;
  message: string;
  params?: Record<string, string | number | boolean | null>;
};

// i18n-ignore-start: Cloud API error dictionaries intentionally contain source and target copy.
const CLOUD_API_MESSAGE_TRANSLATIONS: Record<string, LocalizedTextSet> = {
  "云世界管理平台未授权。": {
    "zh-CN": "云世界管理平台未授权。",
    "en-US": "Cloud world admin console is not authorized.",
    "ja-JP": "クラウドワールド管理コンソールは認証されていません。",
    "ko-KR": "클라우드 월드 관리자 콘솔이 인증되지 않았습니다.",
  },
  "缺少云世界访问凭证。": {
    "zh-CN": "缺少云世界访问凭证。",
    "en-US": "Cloud world access credentials are missing.",
    "ja-JP": "クラウドワールドのアクセス資格情報がありません。",
    "ko-KR": "클라우드 월드 접근 자격 증명이 없습니다.",
  },
  "访问凭证无效。": {
    "zh-CN": "访问凭证无效。",
    "en-US": "Access credentials are invalid.",
    "ja-JP": "アクセス資格情報が無効です。",
    "ko-KR": "접근 자격 증명이 올바르지 않습니다.",
  },
  "访问凭证无效或已过期。": {
    "zh-CN": "访问凭证无效或已过期。",
    "en-US": "Access credentials are invalid or expired.",
    "ja-JP": "アクセス資格情報が無効、または期限切れです。",
    "ko-KR": "접근 자격 증명이 올바르지 않거나 만료되었습니다.",
  },
  "找不到该云世界。": {
    "zh-CN": "找不到该云世界。",
    "en-US": "Cloud world not found.",
    "ja-JP": "クラウドワールドが見つかりません。",
    "ko-KR": "클라우드 월드를 찾을 수 없습니다.",
  },
  "找不到该云世界申请。": {
    "zh-CN": "找不到该云世界申请。",
    "en-US": "Cloud world request not found.",
    "ja-JP": "クラウドワールド申請が見つかりません。",
    "ko-KR": "클라우드 월드 요청을 찾을 수 없습니다.",
  },
  "找不到该生命周期任务。": {
    "zh-CN": "找不到该生命周期任务。",
    "en-US": "Lifecycle job not found.",
    "ja-JP": "ライフサイクルジョブが見つかりません。",
    "ko-KR": "수명 주기 작업을 찾을 수 없습니다.",
  },
  "找不到这次进入世界会话。": {
    "zh-CN": "找不到这次进入世界会话。",
    "en-US": "World access session not found.",
    "ja-JP": "ワールドアクセスセッションが見つかりません。",
    "ko-KR": "월드 접근 세션을 찾을 수 없습니다.",
  },
  "找不到该管理员会话。": {
    "zh-CN": "找不到该管理员会话。",
    "en-US": "Admin session not found.",
    "ja-JP": "管理セッションが見つかりません。",
    "ko-KR": "관리자 세션을 찾을 수 없습니다.",
  },
  "世界名称不能为空。": {
    "zh-CN": "世界名称不能为空。",
    "en-US": "World name cannot be empty.",
    "ja-JP": "ワールド名は空にできません。",
    "ko-KR": "월드 이름은 비워둘 수 없습니다.",
  },
  "手机号格式不正确。": {
    "zh-CN": "手机号格式不正确。",
    "en-US": "Phone number format is invalid.",
    "ja-JP": "電話番号の形式が正しくありません。",
    "ko-KR": "전화번호 형식이 올바르지 않습니다.",
  },
  "验证码不能为空。": {
    "zh-CN": "验证码不能为空。",
    "en-US": "Verification code cannot be empty.",
    "ja-JP": "認証コードは空にできません。",
    "ko-KR": "인증 코드는 비워둘 수 없습니다.",
  },
  "验证码错误。": {
    "zh-CN": "验证码错误。",
    "en-US": "Verification code is incorrect.",
    "ja-JP": "認証コードが正しくありません。",
    "ko-KR": "인증 코드가 올바르지 않습니다.",
  },
  "该验证码已使用。": {
    "zh-CN": "该验证码已使用。",
    "en-US": "Verification code has already been used.",
    "ja-JP": "この認証コードはすでに使用されています。",
    "ko-KR": "이 인증 코드는 이미 사용되었습니다.",
  },
  "验证码已过期。": {
    "zh-CN": "验证码已过期。",
    "en-US": "Verification code has expired.",
    "ja-JP": "認証コードの有効期限が切れています。",
    "ko-KR": "인증 코드가 만료되었습니다.",
  },
  "短信验证码发送失败，请稍后重试。": {
    "zh-CN": "短信验证码发送失败，请稍后重试。",
    "en-US": "Failed to send the SMS verification code. Try again later.",
    "ja-JP": "SMS 認証コードの送信に失敗しました。後でもう一度お試しください。",
    "ko-KR": "SMS 인증 코드 전송에 실패했습니다. 나중에 다시 시도하세요.",
  },
  "该手机号验证码请求次数过多，请稍后再试。": {
    "zh-CN": "该手机号验证码请求次数过多，请稍后再试。",
    "en-US": "Too many verification code requests for this phone number. Try again later.",
    "ja-JP": "この電話番号の認証コードリクエストが多すぎます。後でもう一度お試しください。",
    "ko-KR": "이 전화번호의 인증 코드 요청이 너무 많습니다. 나중에 다시 시도하세요.",
  },
  "当前世界不可唤起。": {
    "zh-CN": "当前世界不可唤起。",
    "en-US": "This world cannot be resumed right now.",
    "ja-JP": "このワールドは現在再開できません。",
    "ko-KR": "현재 이 월드는 재개할 수 없습니다.",
  },
  "当前世界不可休眠。": {
    "zh-CN": "当前世界不可休眠。",
    "en-US": "This world cannot be suspended right now.",
    "ja-JP": "このワールドは現在休止できません。",
    "ko-KR": "현재 이 월드는 휴면할 수 없습니다.",
  },
  "当前世界不可重试。": {
    "zh-CN": "当前世界不可重试。",
    "en-US": "This world cannot be retried right now.",
    "ja-JP": "このワールドは現在再試行できません。",
    "ko-KR": "현재 이 월드는 재시도할 수 없습니다.",
  },
  "当前世界状态不支持重试。": {
    "zh-CN": "当前世界状态不支持重试。",
    "en-US": "The current world status does not support retry.",
    "ja-JP": "現在のワールド状態では再試行できません。",
    "ko-KR": "현재 월드 상태에서는 재시도를 지원하지 않습니다.",
  },
  "只有处于活跃中的世界才可以进入休眠。": {
    "zh-CN": "只有处于活跃中的世界才可以进入休眠。",
    "en-US": "Only active worlds can be suspended.",
    "ja-JP": "アクティブなワールドのみ休止できます。",
    "ko-KR": "활성 상태의 월드만 휴면할 수 있습니다.",
  },
  "激活云世界时必须提供 apiBaseUrl。": {
    "zh-CN": "激活云世界时必须提供 apiBaseUrl。",
    "en-US": "apiBaseUrl is required when activating a cloud world.",
    "ja-JP": "クラウドワールドを有効化するには apiBaseUrl が必要です。",
    "ko-KR": "클라우드 월드를 활성화하려면 apiBaseUrl이 필요합니다.",
  },
  "世界进入 ready 状态时必须提供 apiBaseUrl。": {
    "zh-CN": "世界进入 ready 状态时必须提供 apiBaseUrl。",
    "en-US": "apiBaseUrl is required when a world enters ready status.",
    "ja-JP": "ワールドが ready 状態になるには apiBaseUrl が必要です。",
    "ko-KR": "월드가 ready 상태가 되려면 apiBaseUrl이 필요합니다.",
  },
  "不支持的云世界申请状态。": {
    "zh-CN": "不支持的云世界申请状态。",
    "en-US": "Unsupported cloud world request status.",
    "ja-JP": "サポートされていないクラウドワールド申請ステータスです。",
    "ko-KR": "지원하지 않는 클라우드 월드 요청 상태입니다.",
  },
  "不支持的云世界状态。": {
    "zh-CN": "不支持的云世界状态。",
    "en-US": "Unsupported cloud world status.",
    "ja-JP": "サポートされていないクラウドワールド状態です。",
    "ko-KR": "지원하지 않는 클라우드 월드 상태입니다.",
  },
  "不支持的任务状态。": {
    "zh-CN": "不支持的任务状态。",
    "en-US": "Unsupported job status.",
    "ja-JP": "サポートされていないジョブステータスです。",
    "ko-KR": "지원하지 않는 작업 상태입니다.",
  },
  "不支持的任务类型。": {
    "zh-CN": "不支持的任务类型。",
    "en-US": "Unsupported job type.",
    "ja-JP": "サポートされていないジョブタイプです。",
    "ko-KR": "지원하지 않는 작업 유형입니다.",
  },
  "不支持的 waiting session 补偿任务状态。": {
    "zh-CN": "不支持的 waiting session 补偿任务状态。",
    "en-US": "Unsupported waiting session sync task status.",
    "ja-JP": "サポートされていない待機セッション補正タスクステータスです。",
    "ko-KR": "지원하지 않는 대기 세션 보정 작업 상태입니다.",
  },
  "不支持的 waiting session 补偿任务类型。": {
    "zh-CN": "不支持的 waiting session 补偿任务类型。",
    "en-US": "Unsupported waiting session sync task type.",
    "ja-JP": "サポートされていない待機セッション補正タスクタイプです。",
    "ko-KR": "지원하지 않는 대기 세션 보정 작업 유형입니다.",
  },
  "sourceKey 无效。": {
    "zh-CN": "sourceKey 无效。",
    "en-US": "sourceKey is invalid.",
    "ja-JP": "sourceKey が無効です。",
    "ko-KR": "sourceKey가 올바르지 않습니다.",
  },
  "World not found.": {
    "zh-CN": "找不到该云世界。",
    "en-US": "World not found.",
    "ja-JP": "ワールドが見つかりません。",
    "ko-KR": "월드를 찾을 수 없습니다.",
  },
  "World callback token is not configured.": {
    "zh-CN": "世界回调令牌未配置。",
    "en-US": "World callback token is not configured.",
    "ja-JP": "ワールドコールバックトークンが設定されていません。",
    "ko-KR": "월드 콜백 토큰이 구성되지 않았습니다.",
  },
  "Invalid world callback token.": {
    "zh-CN": "世界回调令牌无效。",
    "en-US": "Invalid world callback token.",
    "ja-JP": "ワールドコールバックトークンが無効です。",
    "ko-KR": "월드 콜백 토큰이 올바르지 않습니다.",
  },
};

const CLOUD_API_CODE_TRANSLATIONS: Record<string, LocalizedTextSet> = {
  INTERNAL_SERVER_ERROR: {
    "zh-CN": "服务器暂时不可用，请稍后再试。",
    "en-US": "Server is temporarily unavailable. Try again later.",
    "ja-JP": "サーバーは一時的に利用できません。後でもう一度お試しください。",
    "ko-KR": "서버를 일시적으로 사용할 수 없습니다. 나중에 다시 시도하세요.",
  },
  VALIDATION_ERROR: {
    "zh-CN": "请求参数不正确。",
    "en-US": "Request parameters are invalid.",
    "ja-JP": "リクエストパラメーターが正しくありません。",
    "ko-KR": "요청 매개변수가 올바르지 않습니다.",
  },
};
// i18n-ignore-end

// i18n-ignore-start: Source-message lookup keys intentionally mirror current API copy.
const CLOUD_API_ERROR_CODE_BY_MESSAGE: Record<string, string> = {
  "云世界管理平台未授权。": "CLOUD_ADMIN_UNAUTHORIZED",
  "缺少云世界访问凭证。": "CLOUD_ACCESS_TOKEN_MISSING",
  "访问凭证无效。": "CLOUD_ACCESS_TOKEN_INVALID",
  "访问凭证无效或已过期。": "CLOUD_ACCESS_TOKEN_EXPIRED",
  "找不到该云世界。": "CLOUD_WORLD_NOT_FOUND",
  "World not found.": "CLOUD_WORLD_NOT_FOUND",
  "找不到该云世界申请。": "CLOUD_WORLD_REQUEST_NOT_FOUND",
  "找不到该生命周期任务。": "CLOUD_LIFECYCLE_JOB_NOT_FOUND",
  "找不到这次进入世界会话。": "WORLD_ACCESS_SESSION_NOT_FOUND",
  "找不到该管理员会话。": "CLOUD_ADMIN_SESSION_NOT_FOUND",
  "世界名称不能为空。": "CLOUD_WORLD_NAME_REQUIRED",
  "手机号格式不正确。": "PHONE_INVALID",
  "验证码不能为空。": "PHONE_CODE_REQUIRED",
  "验证码错误。": "PHONE_CODE_INVALID",
  "该验证码已使用。": "PHONE_CODE_USED",
  "验证码已过期。": "PHONE_CODE_EXPIRED",
  "短信验证码发送失败，请稍后重试。": "PHONE_CODE_SEND_FAILED",
  "该手机号验证码请求次数过多，请稍后再试。": "PHONE_CODE_RATE_LIMITED",
  "当前世界不可唤起。": "CLOUD_WORLD_RESUME_UNAVAILABLE",
  "当前世界不可休眠。": "CLOUD_WORLD_SUSPEND_UNAVAILABLE",
  "当前世界不可重试。": "CLOUD_WORLD_RETRY_UNAVAILABLE",
  "当前世界状态不支持重试。": "CLOUD_WORLD_RETRY_UNSUPPORTED",
  "只有处于活跃中的世界才可以进入休眠。": "CLOUD_WORLD_SUSPEND_REQUIRES_ACTIVE",
  "激活云世界时必须提供 apiBaseUrl。": "CLOUD_WORLD_API_BASE_REQUIRED",
  "世界进入 ready 状态时必须提供 apiBaseUrl。": "CLOUD_WORLD_READY_API_BASE_REQUIRED",
  "不支持的云世界申请状态。": "CLOUD_WORLD_REQUEST_STATUS_UNSUPPORTED",
  "不支持的云世界状态。": "CLOUD_WORLD_STATUS_UNSUPPORTED",
  "不支持的任务状态。": "CLOUD_JOB_STATUS_UNSUPPORTED",
  "不支持的任务类型。": "CLOUD_JOB_TYPE_UNSUPPORTED",
  "不支持的 waiting session 补偿任务状态。":
    "WAITING_SESSION_SYNC_STATUS_UNSUPPORTED",
  "不支持的 waiting session 补偿任务类型。":
    "WAITING_SESSION_SYNC_TYPE_UNSUPPORTED",
  "sourceKey 无效。": "CLOUD_ADMIN_SOURCE_KEY_INVALID",
  "World callback token is not configured.": "WORLD_CALLBACK_TOKEN_MISSING",
  "Invalid world callback token.": "WORLD_CALLBACK_TOKEN_INVALID",
};
// i18n-ignore-end

export function resolveCloudApiLocale(value?: string | null): CloudApiLocale | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replaceAll("_", "-").toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized in LOCALE_ALIASES) {
    return LOCALE_ALIASES[normalized] ?? null;
  }

  if (normalized.startsWith("zh-")) {
    return "zh-CN";
  }
  if (normalized.startsWith("en-")) {
    return "en-US";
  }
  if (normalized.startsWith("ja-")) {
    return "ja-JP";
  }
  if (normalized.startsWith("ko-")) {
    return "ko-KR";
  }

  return null;
}

export function resolveCloudApiLocaleFromAcceptLanguage(
  value?: string | null,
) {
  return (
    value
      ?.split(",")
      .map((entry, index) => {
        const [rawLocale, ...params] = entry.trim().split(";");
        const qParam = params.find((param) => param.trim().startsWith("q="));
        const q = qParam ? Number.parseFloat(qParam.split("=")[1] ?? "") : 1;
        return {
          index,
          locale: resolveCloudApiLocale(rawLocale),
          q: Number.isFinite(q) ? q : 1,
        };
      })
      .filter(
        (entry): entry is { index: number; locale: CloudApiLocale; q: number } =>
          Boolean(entry.locale),
      )
      .sort((left, right) => right.q - left.q || left.index - right.index)[0]
      ?.locale ?? null
  );
}

export function resolveCloudApiLocaleFromRequest(request: {
  header?: (name: string) => string | undefined;
  headers?: Record<string, string | string[] | undefined>;
}) {
  const explicitLocale =
    request.header?.("X-Yinjie-Locale") ??
    request.header?.("X-Cloud-Console-Locale") ??
    getHeaderValue(request.headers, "x-yinjie-locale") ??
    getHeaderValue(request.headers, "x-cloud-console-locale");

  return (
    resolveCloudApiLocale(explicitLocale) ??
    resolveCloudApiLocaleFromAcceptLanguage(
      request.header?.("Accept-Language") ??
        getHeaderValue(request.headers, "accept-language"),
    ) ??
    DEFAULT_CLOUD_API_LOCALE
  );
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function getStatusFallbackCode(statusCode: number) {
  if (statusCode === 400) {
    return "VALIDATION_ERROR";
  }
  if (statusCode === 401) {
    return "UNAUTHORIZED";
  }
  if (statusCode === 403) {
    return "FORBIDDEN";
  }
  if (statusCode === 404) {
    return "NOT_FOUND";
  }
  if (statusCode === 409) {
    return "CONFLICT";
  }
  if (statusCode >= 500) {
    return "INTERNAL_SERVER_ERROR";
  }
  return "CLOUD_API_ERROR";
}

// i18n-ignore-start: Dynamic API errors are localized through explicit locale branches.
function translateKnownDynamicMessage(
  message: string,
  locale: CloudApiLocale,
): CloudApiI18nResult | null {
  const phoneRateLimitMatch = message.match(
    /^验证码发送过于频繁，请在 (\d+) 秒后重试。$/,
  );
  if (phoneRateLimitMatch) {
    const seconds = Number(phoneRateLimitMatch[1]);
    return {
      errorCode: "PHONE_CODE_COOLDOWN",
      params: { seconds },
      message:
        locale === "en-US"
          ? `Verification code requested too frequently. Try again in ${seconds} seconds.`
          : locale === "ja-JP"
            ? `認証コードのリクエストが頻繁すぎます。${seconds} 秒後にもう一度お試しください。`
            : locale === "ko-KR"
              ? `인증 코드를 너무 자주 요청했습니다. ${seconds}초 후 다시 시도하세요.`
              : `验证码发送过于频繁，请在 ${seconds} 秒后重试。`,
    };
  }

  const unsupportedProviderMatch = message.match(/^Unsupported compute provider: (.+)$/);
  if (unsupportedProviderMatch) {
    const provider = unsupportedProviderMatch[1] ?? "";
    return {
      errorCode: "UNSUPPORTED_COMPUTE_PROVIDER",
      params: { provider },
      message:
        locale === "en-US"
          ? `Unsupported compute provider: ${provider}`
          : locale === "ja-JP"
            ? `サポートされていないコンピュートプロバイダーです: ${provider}`
            : locale === "ko-KR"
              ? `지원하지 않는 컴퓨트 공급자입니다: ${provider}`
              : `不支持的计算 Provider：${provider}`,
    };
  }

  const invalidIsoMatch = message.match(/^(.+) must be a valid ISO date string\.$/);
  if (invalidIsoMatch) {
    const field = invalidIsoMatch[1] ?? "field";
    return {
      errorCode: "INVALID_ISO_DATE_FIELD",
      params: { field },
      message:
        locale === "en-US"
          ? `${field} must be a valid ISO date string.`
          : locale === "ja-JP"
            ? `${field} は有効な ISO 日時文字列である必要があります。`
            : locale === "ko-KR"
              ? `${field}은(는) 올바른 ISO 날짜 문자열이어야 합니다.`
              : `${field} 必须是合法 ISO 时间字符串。`,
    };
  }

  const invalidFormatMatch = message.match(/^(.+) 格式不正确。$/);
  if (invalidFormatMatch) {
    const field = invalidFormatMatch[1] ?? "field";
    return {
      errorCode: "VALIDATION_ERROR",
      params: { field },
      message:
        locale === "en-US"
          ? `${field} format is invalid.`
          : locale === "ja-JP"
            ? `${field} の形式が正しくありません。`
            : locale === "ko-KR"
              ? `${field} 형식이 올바르지 않습니다.`
              : `${field} 格式不正确。`,
    };
  }

  const requiredStringMatch = message.match(/^(.+) 必须是字符串。$/);
  if (requiredStringMatch) {
    const field = requiredStringMatch[1] ?? "field";
    return {
      errorCode: "VALIDATION_ERROR",
      params: { field },
      message:
        locale === "en-US"
          ? `${field} must be a string.`
          : locale === "ja-JP"
            ? `${field} は文字列である必要があります。`
            : locale === "ko-KR"
              ? `${field}은(는) 문자열이어야 합니다.`
              : `${field} 必须是字符串。`,
    };
  }

  const emptyMatch = message.match(/^(.+) 不能为空。$/);
  if (emptyMatch) {
    const field = emptyMatch[1] ?? "field";
    return {
      errorCode: "VALIDATION_ERROR",
      params: { field },
      message:
        locale === "en-US"
          ? `${field} cannot be empty.`
          : locale === "ja-JP"
            ? `${field} は空にできません。`
            : locale === "ko-KR"
              ? `${field}은(는) 비워둘 수 없습니다.`
              : `${field} 不能为空。`,
    };
  }

  const maxLengthMatch = message.match(/^(.+) 不能超过 (\d+) 个字符。$/);
  if (maxLengthMatch) {
    const field = maxLengthMatch[1] ?? "field";
    const max = Number(maxLengthMatch[2]);
    return {
      errorCode: "VALIDATION_ERROR",
      params: { field, max },
      message:
        locale === "en-US"
          ? `${field} cannot exceed ${max} characters.`
          : locale === "ja-JP"
            ? `${field} は ${max} 文字を超えられません。`
            : locale === "ko-KR"
              ? `${field}은(는) ${max}자를 초과할 수 없습니다.`
              : `${field} 不能超过 ${max} 个字符。`,
    };
  }

  const invalidEnumMatch = message.match(/^(.+) 不是合法的(.+)。$/);
  if (invalidEnumMatch) {
    const field = invalidEnumMatch[1] ?? "field";
    const subject = invalidEnumMatch[2]?.trim() || "value";
    return {
      errorCode: "VALIDATION_ERROR",
      params: { field },
      message:
        locale === "en-US"
          ? `${field} is not a valid ${subject}.`
          : locale === "ja-JP"
            ? `${field} は有効な ${subject} ではありません。`
            : locale === "ko-KR"
              ? `${field}은(는) 올바른 ${subject}이 아닙니다.`
              : `${field} 不是合法的${subject}。`,
    };
  }

  return null;
}
// i18n-ignore-end

export function localizeCloudApiError({
  errorCode,
  locale,
  messages,
  statusCode,
}: {
  errorCode?: string | null;
  locale: CloudApiLocale;
  messages: readonly string[];
  statusCode: number;
}): CloudApiI18nResult {
  const primaryMessage = messages.find((message) => message.trim())?.trim() ?? "";
  const dynamic = primaryMessage
    ? translateKnownDynamicMessage(primaryMessage, locale)
    : null;
  if (dynamic) {
    return dynamic;
  }

  const inferredCode =
    errorCode ||
    (primaryMessage ? CLOUD_API_ERROR_CODE_BY_MESSAGE[primaryMessage] : null) ||
    getStatusFallbackCode(statusCode);

  if (primaryMessage && CLOUD_API_MESSAGE_TRANSLATIONS[primaryMessage]) {
    return {
      errorCode: inferredCode,
      message:
        CLOUD_API_MESSAGE_TRANSLATIONS[primaryMessage]?.[locale] ??
        primaryMessage,
    };
  }

  if (messages.length > 1) {
    return {
      errorCode: inferredCode,
      message: messages
        .map(
          (message) =>
            CLOUD_API_MESSAGE_TRANSLATIONS[message]?.[locale] ?? message,
        )
        .join(locale === "en-US" ? "; " : "；"),
    };
  }

  if (primaryMessage) {
    return {
      errorCode: inferredCode,
      message: primaryMessage,
    };
  }

  return {
    errorCode: inferredCode,
    message:
      CLOUD_API_CODE_TRANSLATIONS[inferredCode]?.[locale] ??
      CLOUD_API_CODE_TRANSLATIONS.INTERNAL_SERVER_ERROR[locale],
  };
}

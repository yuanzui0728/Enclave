import type { ConsoleNoticeTone } from "../components/console-notice";
import { selectCloudConsoleText } from "./cloud-console-i18n";
import { createRequestScopedNotice, type RequestScopedNotice } from "./request-scoped-notice";

// i18n-ignore-start: Admin session operation notices are localized through explicit locale branches.
const CURRENT_SESSION_REISSUE_NOTICE =
  "The current console session was included, so the next admin request will re-issue a short-lived token.";

type SessionRevokeNoticeOptions = {
  requestId?: string | null;
  revokedCount: number;
  skippedCount: number;
  revokedCurrentSession: boolean;
  zeroMessage: string;
  successMessage: (revokedCount: number) => string;
  skippedMessage: (skippedCount: number) => string;
  locale?: string | null;
};

type RiskGroupRevokeNoticeOptions = {
  requestId?: string | null;
  matchedGroupCount: number;
  revokedGroupCount: number;
  revokedSessionCount: number;
  skippedSessionCount: number;
  revokedCurrentSession: boolean;
  locale?: string | null;
};

export type AdminSessionSourceRiskGuardAction =
  | "snapshot"
  | "groups-csv"
  | "sessions-csv"
  | "revoke";

export type HighlightedSessionOperationReceiptKind =
  | "session-revoke"
  | "focused-source-revoke"
  | "focused-source-snapshot";

export type HighlightedSessionOperationReceipt = {
  kind: HighlightedSessionOperationReceiptKind;
  tone: ConsoleNoticeTone;
  message: string;
  createdAt: string;
  requestId?: string | null;
  sessionId?: string;
  sourceKey?: string;
  sourceIssuedFromIp?: string | null;
  sourceIssuedUserAgent?: string | null;
};

export type HighlightedSessionOperationReceiptInput = Omit<
  HighlightedSessionOperationReceipt,
  "createdAt"
>;

export const HIGHLIGHTED_OPERATION_RECEIPT_LIMIT = 3;
export const ADMIN_SESSION_FOCUSED_SOURCE_SNAPSHOT_UNAVAILABLE_MESSAGE =
  "Focused source snapshot is not available.";

type HighlightedSessionOperationReceiptContext = {
  sessionId?: string;
  sourceKey?: string;
  sourceIssuedFromIp?: string | null;
  sourceIssuedUserAgent?: string | null;
};

type HighlightedSessionOperationReceiptOutcome = {
  tone: ConsoleNoticeTone;
  message: string;
  requestId?: string | null;
};

export function createSessionRevokeNotice({
  locale,
  requestId,
  revokedCount,
  skippedCount,
  revokedCurrentSession,
  zeroMessage,
  successMessage,
  skippedMessage,
}: SessionRevokeNoticeOptions): RequestScopedNotice {
  if (revokedCount === 0) {
    return createRequestScopedNotice(zeroMessage, "warning", requestId);
  }

  const messageParts = [successMessage(revokedCount)];
  if (skippedCount > 0) {
    messageParts.push(skippedMessage(skippedCount));
  }
  if (revokedCurrentSession) {
    messageParts.push(
      selectCloudConsoleText(locale, {
        "en-US": CURRENT_SESSION_REISSUE_NOTICE,
        "zh-CN":
          "当前控制台会话也在范围内，因此下次管理请求会重新签发短期令牌。",
        "ja-JP":
          "現在のコンソールセッションも含まれていたため、次回の管理リクエストで短期トークンを再発行します。",
        "ko-KR":
          "현재 콘솔 세션이 포함되어 다음 관리자 요청에서 단기 토큰을 다시 발급합니다.",
      }),
    );
  }

  return createRequestScopedNotice(
    messageParts.join(" "),
    revokedCurrentSession ? "warning" : "success",
    requestId,
  );
}

export function createRiskGroupRevokeNotice({
  locale,
  matchedGroupCount,
  requestId,
  revokedCurrentSession,
  revokedGroupCount,
  revokedSessionCount,
  skippedSessionCount,
}: RiskGroupRevokeNoticeOptions): RequestScopedNotice {
  if (revokedSessionCount === 0) {
    return createRequestScopedNotice(
      matchedGroupCount === 0
        ? selectCloudConsoleText(locale, {
            "en-US": "No source groups matched the selected risk filter.",
            "zh-CN": "没有来源分组匹配所选风险筛选条件。",
            "ja-JP": "選択したリスクフィルターに一致するソースグループはありません。",
            "ko-KR": "선택한 위험 필터와 일치하는 소스 그룹이 없습니다.",
          })
        : selectCloudConsoleText(locale, {
            "en-US":
              "No active admin sessions were revoked in the matching risk groups.",
            "zh-CN": "匹配的风险分组中没有活跃管理会话被吊销。",
            "ja-JP":
              "一致したリスクグループ内で取り消されたアクティブ管理セッションはありません。",
            "ko-KR":
              "일치하는 위험 그룹에서 취소된 활성 관리자 세션이 없습니다.",
          }),
      "warning",
      requestId,
    );
  }

  return createSessionRevokeNotice({
    requestId,
    revokedCount: revokedSessionCount,
    skippedCount: skippedSessionCount,
    revokedCurrentSession,
    zeroMessage: selectCloudConsoleText(locale, {
      "en-US": "No active admin sessions were revoked in the matching risk groups.",
      "zh-CN": "匹配的风险分组中没有活跃管理会话被吊销。",
      "ja-JP":
        "一致したリスクグループ内で取り消されたアクティブ管理セッションはありません。",
      "ko-KR": "일치하는 위험 그룹에서 취소된 활성 관리자 세션이 없습니다.",
    }),
    successMessage: (revokedCount) =>
      selectCloudConsoleText(locale, {
        "en-US": `Revoked ${revokedCount} active session(s) across ${revokedGroupCount} risk group(s).`,
        "zh-CN": `已吊销 ${revokedGroupCount} 个风险分组中的 ${revokedCount} 个活跃会话。`,
        "ja-JP": `${revokedGroupCount} 件のリスクグループで ${revokedCount} 件のアクティブセッションを取り消しました。`,
        "ko-KR": `${revokedGroupCount}개 위험 그룹에서 활성 세션 ${revokedCount}개를 취소했습니다.`,
      }),
    skippedMessage: (skippedCount) =>
      selectCloudConsoleText(locale, {
        "en-US": `${skippedCount} session(s) were already unavailable.`,
        "zh-CN": `${skippedCount} 个会话已不可用。`,
        "ja-JP": `${skippedCount} 件のセッションはすでに利用できませんでした。`,
        "ko-KR": `${skippedCount}개 세션은 이미 사용할 수 없었습니다.`,
      }),
    locale,
  });
}

export function getAdminSessionSourceRiskGuardMessage(
  action: AdminSessionSourceRiskGuardAction,
  locale?: string | null,
) {
  switch (action) {
    case "snapshot":
      return selectCloudConsoleText(locale, {
        "en-US": "Select a source risk filter before exporting a snapshot.",
        "zh-CN": "导出快照前请先选择来源风险筛选条件。",
        "ja-JP": "スナップショットをエクスポートする前にソースリスクフィルターを選択してください。",
        "ko-KR": "스냅샷을 내보내기 전에 소스 위험 필터를 선택하세요.",
      });
    case "groups-csv":
      return selectCloudConsoleText(locale, {
        "en-US": "Select a source risk filter before exporting CSV.",
        "zh-CN": "导出 CSV 前请先选择来源风险筛选条件。",
        "ja-JP": "CSV をエクスポートする前にソースリスクフィルターを選択してください。",
        "ko-KR": "CSV를 내보내기 전에 소스 위험 필터를 선택하세요.",
      });
    case "sessions-csv":
      return selectCloudConsoleText(locale, {
        "en-US": "Select a source risk filter before exporting session CSV.",
        "zh-CN": "导出会话 CSV 前请先选择来源风险筛选条件。",
        "ja-JP": "セッション CSV をエクスポートする前にソースリスクフィルターを選択してください。",
        "ko-KR": "세션 CSV를 내보내기 전에 소스 위험 필터를 선택하세요.",
      });
    case "revoke":
    default:
      return selectCloudConsoleText(locale, {
        "en-US": "Select a source risk filter before revoking groups.",
        "zh-CN": "吊销分组前请先选择来源风险筛选条件。",
        "ja-JP": "グループを取り消す前にソースリスクフィルターを選択してください。",
        "ko-KR": "그룹을 취소하기 전에 소스 위험 필터를 선택하세요.",
      });
  }
}

export function getAdminSessionSourceRiskSelectionPrompt(locale?: string | null) {
  return selectCloudConsoleText(locale, {
    "en-US": "Select a source risk filter to batch-revoke risky groups.",
    "zh-CN": "选择来源风险筛选条件后，可批量吊销风险分组。",
    "ja-JP": "リスクグループを一括取り消しするには、ソースリスクフィルターを選択してください。",
    "ko-KR": "위험 그룹을 일괄 취소하려면 소스 위험 필터를 선택하세요.",
  });
}

export function createAdminSessionRiskTimelineNotReadyNotice(locale?: string | null) {
  return createRequestScopedNotice(
    selectCloudConsoleText(locale, {
      "en-US": "Risk timeline data is not ready for export yet.",
      "zh-CN": "风险时间线数据尚未准备好，暂时无法导出。",
      "ja-JP": "リスクタイムラインデータはまだエクスポートできません。",
      "ko-KR": "위험 타임라인 데이터를 아직 내보낼 수 없습니다.",
    }),
    "warning",
  );
}

export function formatHighlightedOperationReceiptLabel(
  kind: HighlightedSessionOperationReceiptKind,
  locale?: string | null,
) {
  switch (kind) {
    case "focused-source-snapshot":
      return selectCloudConsoleText(locale, {
        "en-US": "Focused source snapshot",
        "zh-CN": "聚焦来源快照",
        "ja-JP": "フォーカス元スナップショット",
        "ko-KR": "포커스 소스 스냅샷",
      });
    case "focused-source-revoke":
      return selectCloudConsoleText(locale, {
        "en-US": "Focused source revoke",
        "zh-CN": "聚焦来源吊销",
        "ja-JP": "フォーカス元取り消し",
        "ko-KR": "포커스 소스 취소",
      });
    case "session-revoke":
    default:
      return selectCloudConsoleText(locale, {
        "en-US": "Session revoke",
        "zh-CN": "会话吊销",
        "ja-JP": "セッション取り消し",
        "ko-KR": "세션 취소",
      });
  }
}

export function getHighlightedOperationReceiptTone(tone: ConsoleNoticeTone) {
  switch (tone) {
    case "success":
      return "border-emerald-300/40 bg-emerald-500/10 text-emerald-100";
    case "warning":
      return "border-amber-300/40 bg-amber-500/10 text-amber-100";
    case "danger":
      return "border-rose-300/40 bg-rose-500/10 text-rose-200";
    case "info":
    default:
      return "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]";
  }
}

export function matchesHighlightedOperationReceiptContext(
  receipt: HighlightedSessionOperationReceipt,
  highlightedSessionId: string,
  sourceKey?: string,
) {
  if (receipt.sessionId && receipt.sessionId !== highlightedSessionId) {
    return false;
  }

  if (receipt.sourceKey && receipt.sourceKey !== sourceKey) {
    return false;
  }

  return true;
}

export function createHighlightedOperationReceipt(
  kind: HighlightedSessionOperationReceiptKind,
  context: HighlightedSessionOperationReceiptContext,
  outcome: HighlightedSessionOperationReceiptOutcome,
): HighlightedSessionOperationReceiptInput {
  return {
    kind,
    tone: outcome.tone,
    message: outcome.message,
    requestId: outcome.requestId,
    sessionId: context.sessionId,
    sourceKey: context.sourceKey,
    sourceIssuedFromIp: context.sourceIssuedFromIp,
    sourceIssuedUserAgent: context.sourceIssuedUserAgent,
  };
}

export function createNoticeHighlightedOperationReceipt(
  kind: HighlightedSessionOperationReceiptKind,
  context: HighlightedSessionOperationReceiptContext,
  notice: RequestScopedNotice,
): HighlightedSessionOperationReceiptInput {
  return createHighlightedOperationReceipt(kind, context, {
    tone: notice.tone,
    message: notice.message,
    requestId: notice.requestId,
  });
}

export function createErrorHighlightedOperationReceipt(
  kind: HighlightedSessionOperationReceiptKind,
  context: HighlightedSessionOperationReceiptContext,
  message: string,
  requestId?: string | null,
): HighlightedSessionOperationReceiptInput {
  return createHighlightedOperationReceipt(kind, context, {
    tone: "danger",
    message,
    requestId,
  });
}

export function prependHighlightedOperationReceipt(
  previous: HighlightedSessionOperationReceipt[],
  receipt: HighlightedSessionOperationReceiptInput,
  limit = HIGHLIGHTED_OPERATION_RECEIPT_LIMIT,
  createdAt = new Date().toISOString(),
): HighlightedSessionOperationReceipt[] {
  return [
    {
      ...receipt,
      createdAt,
    },
    ...previous,
  ].slice(0, limit);
}
// i18n-ignore-end

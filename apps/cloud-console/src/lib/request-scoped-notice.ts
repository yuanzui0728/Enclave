import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type {
  ConsoleNoticeTone,
  ShowConsoleNotice,
} from "../components/console-notice";

export type RequestScopedNotice = {
  message: string;
  tone: ConsoleNoticeTone;
  requestId?: string | null;
};

type BooleanOutcomeNoticeOptions = {
  requestId?: string | null;
  succeeded: boolean;
  successMessage: string;
  failureMessage: string;
  successTone?: ConsoleNoticeTone;
  failureTone?: ConsoleNoticeTone;
};

export function createRequestScopedNotice(
  message: string,
  tone: ConsoleNoticeTone,
  requestId?: string | null,
): RequestScopedNotice {
  return {
    message,
    tone,
    requestId,
  };
}

export function createBooleanOutcomeNotice({
  failureMessage,
  failureTone = "warning",
  requestId,
  succeeded,
  successMessage,
  successTone = "success",
}: BooleanOutcomeNoticeOptions): RequestScopedNotice {
  return createRequestScopedNotice(
    succeeded ? successMessage : failureMessage,
    succeeded ? successTone : failureTone,
    requestId,
  );
}

export function showRequestScopedNotice(
  showNotice: ShowConsoleNotice,
  notice: RequestScopedNotice,
) {
  showNotice(notice.message, notice.tone, {
    requestId: notice.requestId ?? null,
  });
}

type ShowRequestScopedNoticeAndInvalidateOptions = {
  queryClient: Pick<QueryClient, "invalidateQueries">;
  queryKey: QueryKey;
};

export function showRequestScopedNoticeAndInvalidate(
  showNotice: ShowConsoleNotice,
  notice: RequestScopedNotice,
  options: ShowRequestScopedNoticeAndInvalidateOptions,
) {
  showRequestScopedNotice(showNotice, notice);
  void options.queryClient.invalidateQueries({
    queryKey: options.queryKey,
  });
}

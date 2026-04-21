import type { ComponentProps } from "react";
import { ErrorBlock } from "@yinjie/ui";
import type { ShowConsoleNotice } from "./console-notice";
import { getCloudAdminApiErrorRequestId } from "../lib/cloud-admin-api";
import {
  createRequestScopedNotice,
  showRequestScopedNotice,
} from "../lib/request-scoped-notice";

function getCloudAdminErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Cloud admin request failed.";
}

export function showCloudAdminErrorNotice(
  showNotice: ShowConsoleNotice,
  error: unknown,
) {
  showRequestScopedNotice(
    showNotice,
    createRequestScopedNotice(
      getCloudAdminErrorMessage(error),
      "danger",
      getCloudAdminApiErrorRequestId(error),
    ),
  );
}

type CloudAdminErrorBlockProps = Omit<
  ComponentProps<typeof ErrorBlock>,
  "children" | "message"
> & {
  error: unknown;
};

export function CloudAdminErrorBlock({
  error,
  ...props
}: CloudAdminErrorBlockProps) {
  const requestId = getCloudAdminApiErrorRequestId(error);

  return (
    <ErrorBlock message={getCloudAdminErrorMessage(error)} {...props}>
      {requestId ? (
        <div className="mt-3 border-t border-current/15 pt-3 text-xs leading-5 text-current/90">
          <div className="uppercase tracking-[0.12em] opacity-80">
            Request id
          </div>
          <div className="mt-1 break-all font-mono">{requestId}</div>
        </div>
      ) : null}
    </ErrorBlock>
  );
}

export type AdminSessionAuditRequest = {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string | null;
  };
};

export type AdminSessionAuditContext = {
  ip: string | null;
  userAgent: string | null;
};

const MAX_IP_LENGTH = 128;
const MAX_USER_AGENT_LENGTH = 1024;

function normalizeAuditValue(
  value: string | undefined | null,
  maxLength: number,
) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function resolveFirstHeaderValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) {
    return normalizeAuditValue(value[0], MAX_USER_AGENT_LENGTH);
  }

  return normalizeAuditValue(value, MAX_USER_AGENT_LENGTH);
}

function resolveForwardedIp(
  value: string | string[] | undefined,
): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  const candidate = header?.split(",")[0];
  return normalizeAuditValue(candidate, MAX_IP_LENGTH);
}

export function resolveAdminSessionAudit(
  request: AdminSessionAuditRequest,
): AdminSessionAuditContext {
  return {
    ip:
      resolveForwardedIp(request.headers["x-forwarded-for"]) ??
      normalizeAuditValue(request.ip, MAX_IP_LENGTH) ??
      normalizeAuditValue(request.socket?.remoteAddress ?? null, MAX_IP_LENGTH),
    userAgent: resolveFirstHeaderValue(request.headers["user-agent"])?.slice(
      0,
      MAX_USER_AGENT_LENGTH,
    ) ?? null,
  };
}

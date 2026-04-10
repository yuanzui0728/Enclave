export type MobileHandoffRecord = {
  id: string;
  label: string;
  description: string;
  path: string;
  sentAt: string;
};

const MOBILE_HANDOFF_STORAGE_KEY = "yinjie-desktop-mobile-handoff-history";
const MAX_HANDOFF_RECORDS = 8;

export function readMobileHandoffHistory() {
  if (typeof window === "undefined") {
    return [] as MobileHandoffRecord[];
  }

  const raw = window.localStorage.getItem(MOBILE_HANDOFF_STORAGE_KEY);
  if (!raw) {
    return [] as MobileHandoffRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as MobileHandoffRecord[];
    if (!Array.isArray(parsed)) {
      return [] as MobileHandoffRecord[];
    }

    return parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.description === "string" &&
        typeof item?.path === "string" &&
        typeof item?.sentAt === "string",
    );
  } catch {
    return [] as MobileHandoffRecord[];
  }
}

export function pushMobileHandoffRecord(input: {
  description: string;
  label: string;
  path: string;
}) {
  if (typeof window === "undefined") {
    return [] as MobileHandoffRecord[];
  }

  const nextRecord: MobileHandoffRecord = {
    id: `mobile-handoff-${input.path}`,
    label: input.label,
    description: input.description,
    path: input.path,
    sentAt: new Date().toISOString(),
  };

  const nextHistory = [
    nextRecord,
    ...readMobileHandoffHistory().filter((item) => item.path !== input.path),
  ].slice(0, MAX_HANDOFF_RECORDS);

  window.localStorage.setItem(
    MOBILE_HANDOFF_STORAGE_KEY,
    JSON.stringify(nextHistory),
  );

  return nextHistory;
}

export function resolveMobileHandoffLink(path: string) {
  return typeof window === "undefined"
    ? path
    : `${window.location.origin}${path}`;
}

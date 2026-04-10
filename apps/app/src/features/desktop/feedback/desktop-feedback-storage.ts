export type DesktopFeedbackCategory =
  | "bug"
  | "interaction"
  | "performance"
  | "content"
  | "feature";

export type DesktopFeedbackPriority = "low" | "medium" | "high";

export type DesktopFeedbackDraft = {
  category: DesktopFeedbackCategory;
  priority: DesktopFeedbackPriority;
  title: string;
  detail: string;
  reproduction: string;
  expected: string;
  includeSystemSnapshot: boolean;
};

export type DesktopFeedbackRecord = DesktopFeedbackDraft & {
  id: string;
  submittedAt: string;
  diagnosticSummary: string;
};

const DESKTOP_FEEDBACK_DRAFT_KEY = "yinjie-desktop-feedback-draft";
const DESKTOP_FEEDBACK_HISTORY_KEY = "yinjie-desktop-feedback-history";
const MAX_DESKTOP_FEEDBACK_HISTORY = 12;

export const defaultDesktopFeedbackDraft: DesktopFeedbackDraft = {
  category: "bug",
  priority: "medium",
  title: "",
  detail: "",
  reproduction: "",
  expected: "",
  includeSystemSnapshot: true,
};

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function readDesktopFeedbackDraft() {
  const storage = getStorage();
  if (!storage) {
    return { ...defaultDesktopFeedbackDraft };
  }

  const raw = storage.getItem(DESKTOP_FEEDBACK_DRAFT_KEY);
  if (!raw) {
    return { ...defaultDesktopFeedbackDraft };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DesktopFeedbackDraft>;

    return {
      category: isFeedbackCategory(parsed.category)
        ? parsed.category
        : defaultDesktopFeedbackDraft.category,
      priority: isFeedbackPriority(parsed.priority)
        ? parsed.priority
        : defaultDesktopFeedbackDraft.priority,
      title: typeof parsed.title === "string" ? parsed.title : "",
      detail: typeof parsed.detail === "string" ? parsed.detail : "",
      reproduction:
        typeof parsed.reproduction === "string" ? parsed.reproduction : "",
      expected: typeof parsed.expected === "string" ? parsed.expected : "",
      includeSystemSnapshot:
        typeof parsed.includeSystemSnapshot === "boolean"
          ? parsed.includeSystemSnapshot
          : defaultDesktopFeedbackDraft.includeSystemSnapshot,
    };
  } catch {
    return { ...defaultDesktopFeedbackDraft };
  }
}

export function writeDesktopFeedbackDraft(draft: DesktopFeedbackDraft) {
  const storage = getStorage();
  if (!storage) {
    return draft;
  }

  storage.setItem(DESKTOP_FEEDBACK_DRAFT_KEY, JSON.stringify(draft));
  return draft;
}

export function clearDesktopFeedbackDraft() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(DESKTOP_FEEDBACK_DRAFT_KEY);
}

export function readDesktopFeedbackHistory() {
  const storage = getStorage();
  if (!storage) {
    return [] as DesktopFeedbackRecord[];
  }

  const raw = storage.getItem(DESKTOP_FEEDBACK_HISTORY_KEY);
  if (!raw) {
    return [] as DesktopFeedbackRecord[];
  }

  try {
    const parsed = JSON.parse(raw) as DesktopFeedbackRecord[];
    if (!Array.isArray(parsed)) {
      return [] as DesktopFeedbackRecord[];
    }

    return parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        isFeedbackCategory(item.category) &&
        isFeedbackPriority(item.priority) &&
        typeof item.title === "string" &&
        typeof item.detail === "string" &&
        typeof item.reproduction === "string" &&
        typeof item.expected === "string" &&
        typeof item.includeSystemSnapshot === "boolean" &&
        typeof item.diagnosticSummary === "string" &&
        typeof item.submittedAt === "string",
    );
  } catch {
    return [] as DesktopFeedbackRecord[];
  }
}

export function pushDesktopFeedbackRecord(
  input: Omit<DesktopFeedbackRecord, "id" | "submittedAt">,
) {
  const storage = getStorage();
  const nextRecord: DesktopFeedbackRecord = {
    ...input,
    id: `desktop-feedback-${Date.now()}`,
    submittedAt: new Date().toISOString(),
  };
  const nextHistory = [nextRecord, ...readDesktopFeedbackHistory()].slice(
    0,
    MAX_DESKTOP_FEEDBACK_HISTORY,
  );

  if (storage) {
    storage.setItem(DESKTOP_FEEDBACK_HISTORY_KEY, JSON.stringify(nextHistory));
  }

  return nextHistory;
}

function isFeedbackCategory(value: unknown): value is DesktopFeedbackCategory {
  return (
    value === "bug" ||
    value === "interaction" ||
    value === "performance" ||
    value === "content" ||
    value === "feature"
  );
}

function isFeedbackPriority(value: unknown): value is DesktopFeedbackPriority {
  return value === "low" || value === "medium" || value === "high";
}

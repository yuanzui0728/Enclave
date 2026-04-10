import { useMemo, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Link2,
  MessageSquareText,
  Search,
} from "lucide-react";
import type { GroupMessage, Message } from "@yinjie/contracts";
import { ErrorBlock, LoadingBlock, cn } from "@yinjie/ui";
import { EmptyState } from "../../components/empty-state";
import { ChatDetailsSection } from "../chat-details/chat-details-section";
import { ChatDetailsShell } from "../chat-details/chat-details-shell";
import {
  filterSearchableChatMessages,
  useLocalChatMessageActionState,
} from "./local-chat-message-actions";
import { sanitizeDisplayedChatText } from "../../lib/chat-text";
import { formatMessageTimestamp, parseTimestamp } from "../../lib/format";

type SearchableChatMessage = Message | GroupMessage;
type SearchCategoryId = "all" | "media" | "files" | "links";

type IndexedSearchMessage = {
  message: SearchableChatMessage;
  categories: SearchCategoryId[];
  searchableText: string;
  previewText: string;
  supportText: string;
  linkText: string;
  typeLabel: string;
};

type ChatMessageSearchPanelProps = {
  subtitle: string;
  messages: SearchableChatMessage[] | undefined;
  isLoading: boolean;
  error?: Error | null;
  loadingLabel: string;
  emptyResultTitle: string;
  emptyResultDescription: string;
  onBack: () => void;
  onOpenMessage: (messageId: string) => void;
};

const urlPattern = /https?:\/\/[^\s]+/giu;

const SEARCH_CATEGORIES = [
  {
    id: "all",
    label: "全部消息",
    shortLabel: "全部",
    description: "搜文本、附件和系统提示",
    icon: MessageSquareText,
  },
  {
    id: "media",
    label: "图片与视频",
    shortLabel: "图片与视频",
    description: "先按图片消息聚合浏览",
    icon: ImageIcon,
  },
  {
    id: "files",
    label: "文件",
    shortLabel: "文件",
    description: "按文件名和文件消息筛选",
    icon: FileText,
  },
  {
    id: "links",
    label: "链接",
    shortLabel: "链接",
    description: "把聊天里的 URL 单独拎出来",
    icon: Link2,
  },
] as const satisfies ReadonlyArray<{
  id: SearchCategoryId;
  label: string;
  shortLabel: string;
  description: string;
  icon: typeof MessageSquareText;
}>;

export function ChatMessageSearchPanel({
  subtitle,
  messages,
  isLoading,
  error,
  loadingLabel,
  emptyResultTitle,
  emptyResultDescription,
  onBack,
  onOpenMessage,
}: ChatMessageSearchPanelProps) {
  const [keyword, setKeyword] = useState("");
  const [activeCategory, setActiveCategory] = useState<SearchCategoryId>("all");
  const localMessageActionState = useLocalChatMessageActionState();

  const trimmedKeyword = keyword.trim().toLowerCase();
  const indexedMessages = useMemo(
    () =>
      [...filterSearchableChatMessages(messages ?? [], localMessageActionState)]
        .sort(
          (left, right) =>
            (parseTimestamp(right.createdAt) ?? 0) -
            (parseTimestamp(left.createdAt) ?? 0),
        )
        .map((message) => buildIndexedSearchMessage(message)),
    [localMessageActionState, messages],
  );

  const matchedMessages = useMemo(() => {
    if (!trimmedKeyword) {
      return indexedMessages;
    }

    return indexedMessages.filter((item) =>
      item.searchableText.includes(trimmedKeyword),
    );
  }, [indexedMessages, trimmedKeyword]);

  const categoryCounts = useMemo(() => {
    return SEARCH_CATEGORIES.reduce<Record<SearchCategoryId, number>>(
      (result, category) => {
        result[category.id] = matchedMessages.filter((item) =>
          item.categories.includes(category.id),
        ).length;
        return result;
      },
      {
        all: 0,
        media: 0,
        files: 0,
        links: 0,
      },
    );
  }, [matchedMessages]);

  const results = useMemo(() => {
    if (!trimmedKeyword && activeCategory === "all") {
      return [];
    }

    return matchedMessages.filter((item) =>
      item.categories.includes(activeCategory),
    );
  }, [activeCategory, matchedMessages, trimmedKeyword]);

  const activeCategoryMeta =
    SEARCH_CATEGORIES.find((item) => item.id === activeCategory) ??
    SEARCH_CATEGORIES[0];

  return (
    <ChatDetailsShell title="查找聊天记录" subtitle={subtitle} onBack={onBack}>
      <ChatDetailsSection title="搜索">
        <label className="flex items-center gap-2 px-3 py-3">
          <Search size={16} className="shrink-0 text-[color:var(--text-dim)]" />
          <input
            type="search"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
          />
        </label>
      </ChatDetailsSection>

      {isLoading ? <LoadingBlock label={loadingLabel} /> : null}
      {error ? (
        <div className="px-3">
          <ErrorBlock message={error.message} />
        </div>
      ) : null}

      {!isLoading && !error ? (
        <>
          <ChatDetailsSection title="分类浏览">
            <div className="grid grid-cols-2 gap-2 p-3">
              {SEARCH_CATEGORIES.map((category) => {
                const Icon = category.icon;
                const active = activeCategory === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.id)}
                    className={cn(
                      "rounded-[18px] border px-3 py-3 text-left transition-colors",
                      active
                        ? "border-[#07c160]/20 bg-[rgba(7,193,96,0.1)]"
                        : "border-black/5 bg-[#f7f7f7] hover:bg-[#f1f1f1]",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full",
                            active
                              ? "bg-[#07c160] text-white"
                              : "bg-white text-[color:var(--text-secondary)]",
                          )}
                        >
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                            {category.label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">
                            {category.description}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[18px] font-semibold leading-none text-[color:var(--text-primary)]">
                          {categoryCounts[category.id]}
                        </div>
                        <div className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                          条
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ChatDetailsSection>

          {!trimmedKeyword && activeCategory === "all" ? (
            <div className="px-3">
              <EmptyState
                title="输入关键词，或直接点分类浏览"
                description="这里先把图片与视频、文件和链接单独收口，操作更接近微信手机端。"
              />
            </div>
          ) : null}

          {!trimmedKeyword &&
          activeCategory !== "all" &&
          categoryCounts[activeCategory] === 0 ? (
            <div className="px-3">
              <EmptyState
                title={`还没有${activeCategoryMeta.shortLabel}`}
                description={`当前会话里暂时没有可浏览的${activeCategoryMeta.shortLabel}消息。`}
              />
            </div>
          ) : null}

          {trimmedKeyword && !results.length ? (
            <div className="px-3">
              <EmptyState
                title={emptyResultTitle}
                description={emptyResultDescription}
              />
            </div>
          ) : null}

          {results.length ? (
            <ChatDetailsSection
              title={buildResultSectionTitle(
                activeCategoryMeta.shortLabel,
                trimmedKeyword,
                results.length,
              )}
            >
              <div className="divide-y divide-black/5">
                {results.map((item) => (
                  <button
                    key={item.message.id}
                    type="button"
                    onClick={() => onOpenMessage(item.message.id)}
                    className="block w-full px-4 py-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="truncate text-[14px] font-medium text-[color:var(--text-primary)]">
                        {trimmedKeyword
                          ? renderHighlightedText(
                              item.message.senderName,
                              trimmedKeyword,
                            )
                          : item.message.senderName}
                      </div>
                      <div className="shrink-0 text-[12px] text-[color:var(--text-muted)]">
                        {formatMessageTimestamp(item.message.createdAt)}
                      </div>
                    </div>
                    <div className="mt-1 text-[14px] leading-6 text-[color:var(--text-secondary)]">
                      {trimmedKeyword
                        ? renderHighlightedText(
                            buildSearchPreview(
                              resolvePreviewSource(item, trimmedKeyword),
                              trimmedKeyword,
                            ),
                            trimmedKeyword,
                          )
                        : item.previewText}
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                      <span className="rounded-full bg-[#f5f5f5] px-2 py-0.5 text-[11px] text-[color:var(--text-secondary)]">
                        {item.typeLabel}
                      </span>
                      {item.supportText &&
                      item.supportText !== item.previewText &&
                      item.supportText !== item.typeLabel ? (
                        <span className="truncate">
                          {trimmedKeyword
                            ? renderHighlightedText(
                                item.supportText,
                                trimmedKeyword,
                              )
                            : item.supportText}
                        </span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </ChatDetailsSection>
          ) : null}
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

function buildIndexedSearchMessage(
  message: SearchableChatMessage,
): IndexedSearchMessage {
  const normalizedText = sanitizeDisplayedChatText(message.text).trim();
  const supportText = resolveSupportText(message);
  const linkText = extractFirstLink(normalizedText);
  const typeLabel = resolveMessageTypeLabel(message);
  const categories: SearchCategoryId[] = ["all"];

  if (message.type === "image") {
    categories.push("media");
  }

  if (message.type === "file") {
    categories.push("files");
  }

  if (linkText) {
    categories.push("links");
  }

  const previewText =
    normalizedText ||
    supportText ||
    `${typeLabel}消息`.replace("文本消息", "文本");
  const searchableText = [
    message.senderName,
    normalizedText,
    supportText,
    linkText,
    typeLabel,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

  return {
    message,
    categories,
    searchableText,
    previewText,
    supportText,
    linkText,
    typeLabel,
  };
}

function resolveSupportText(message: SearchableChatMessage) {
  if (message.attachment?.kind === "image") {
    return message.attachment.fileName
      ? `图片 · ${message.attachment.fileName}`
      : "图片";
  }

  if (message.attachment?.kind === "file") {
    return message.attachment.fileName
      ? `文件 · ${message.attachment.fileName}`
      : "文件";
  }

  if (message.attachment?.kind === "voice") {
    return "语音";
  }

  if (message.attachment?.kind === "contact_card") {
    return message.attachment.name
      ? `名片 · ${message.attachment.name}`
      : "名片";
  }

  if (message.attachment?.kind === "location_card") {
    return message.attachment.title
      ? `位置 · ${message.attachment.title}`
      : "位置";
  }

  if (message.attachment?.kind === "sticker") {
    return message.attachment.label
      ? `表情 · ${message.attachment.label}`
      : "表情";
  }

  return "";
}

function resolveMessageTypeLabel(message: SearchableChatMessage) {
  if (message.type === "image") {
    return "图片";
  }

  if (message.type === "file") {
    return "文件";
  }

  if (message.type === "voice") {
    return "语音";
  }

  if (message.type === "contact_card") {
    return "名片";
  }

  if (message.type === "location_card") {
    return "位置";
  }

  if (message.type === "sticker") {
    return "表情";
  }

  if (message.type === "system") {
    return "系统";
  }

  return "文本";
}

function extractFirstLink(text: string) {
  const match = text.match(urlPattern);
  return match?.[0] ?? "";
}

function resolvePreviewSource(item: IndexedSearchMessage, keyword: string) {
  const candidates = [
    item.previewText,
    item.supportText,
    item.linkText,
    item.message.senderName,
  ].filter(Boolean);

  return (
    candidates.find((candidate) => candidate.toLowerCase().includes(keyword)) ??
    item.previewText
  );
}

function buildResultSectionTitle(
  categoryLabel: string,
  keyword: string,
  count: number,
) {
  if (!keyword) {
    return `最近${categoryLabel} · ${count} 条`;
  }

  if (categoryLabel === "全部") {
    return `搜索结果 · ${count} 条`;
  }

  return `${categoryLabel} · ${count} 条`;
}

function renderHighlightedText(text: string, keyword: string) {
  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword);
  if (start === -1) {
    return text;
  }

  const end = start + keyword.length;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded bg-[rgba(255,214,102,0.5)] px-0.5 text-current">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function buildSearchPreview(text: string, keyword: string) {
  const normalized = text.toLowerCase();
  const start = normalized.indexOf(keyword);
  if (start === -1) {
    return text;
  }

  const contextRadius = 18;
  const previewStart = Math.max(0, start - contextRadius);
  const previewEnd = Math.min(
    text.length,
    start + keyword.length + contextRadius,
  );
  const prefix = previewStart > 0 ? "..." : "";
  const suffix = previewEnd < text.length ? "..." : "";
  return `${prefix}${text.slice(previewStart, previewEnd)}${suffix}`;
}

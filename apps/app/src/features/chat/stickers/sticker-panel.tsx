import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteCustomSticker,
  getStickerAttachment,
  getStickerCatalog,
  STICKER_PACKS,
  uploadCustomSticker,
  type CustomStickerRecord,
  type StickerAttachment,
} from "@yinjie/contracts";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import type { RecentStickerItem } from "./recent-stickers";

type StickerPanelProps = {
  baseUrl?: string;
  variant: "mobile" | "desktop";
  activePackId: string;
  recentItems: RecentStickerItem[];
  onClose: () => void;
  onPackChange: (packId: string) => void;
  onSelect: (sticker: StickerAttachment) => void;
  onError?: (message: string | null) => void;
};

const PANEL_QUERY_KEY = "app-sticker-catalog";
type StickerPanelItem = {
  sticker: StickerAttachment;
  canDelete?: boolean;
};

export function StickerPanel({
  baseUrl,
  variant,
  activePackId,
  recentItems,
  onClose,
  onPackChange,
  onSelect,
  onError,
}: StickerPanelProps) {
  const isMobile = variant === "mobile";
  const [keyword, setKeyword] = useState("");
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const stickerCatalogQuery = useQuery({
    queryKey: [PANEL_QUERY_KEY, baseUrl],
    queryFn: () => getStickerCatalog(baseUrl),
  });
  const catalog = stickerCatalogQuery.data ?? {
    builtinPacks: STICKER_PACKS,
    customStickers: [] as CustomStickerRecord[],
    maxCustomStickerCount: 300,
    customStickerCount: 0,
  };
  const activeSectionId = resolveActiveSectionId(activePackId, catalog);
  const recentStickers = useMemo(
    () => resolveRecentStickers(recentItems, catalog.customStickers),
    [catalog.customStickers, recentItems],
  );
  const featuredStickers = useMemo(
    () => buildFeaturedStickers(catalog.builtinPacks),
    [catalog.builtinPacks],
  );

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.set("file", file, file.name);
      const dimensions = await readStickerFileDimensions(file);
      if (dimensions.width) {
        formData.set("width", String(dimensions.width));
      }
      if (dimensions.height) {
        formData.set("height", String(dimensions.height));
      }
      return uploadCustomSticker(formData, baseUrl);
    },
    onMutate: () => {
      onError?.(null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PANEL_QUERY_KEY, baseUrl],
      });
      onPackChange("custom");
    },
    onError: (error) => {
      onError?.(
        error instanceof Error ? error.message : "上传表情失败，请稍后再试。",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (stickerId: string) => {
      await deleteCustomSticker(stickerId, baseUrl);
      return stickerId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [PANEL_QUERY_KEY, baseUrl],
      });
    },
    onError: (error) => {
      onError?.(
        error instanceof Error ? error.message : "删除表情失败，请稍后再试。",
      );
    },
  });

  const searching = keyword.trim().length > 0;
  const activeItems = useMemo<StickerPanelItem[]>(() => {
    if (searching) {
      return searchStickerItems({
        keyword,
        recentStickers,
        builtinPacks: catalog.builtinPacks,
        customStickers: catalog.customStickers,
      });
    }

    if (activeSectionId === "recent") {
      return recentStickers.map((sticker): StickerPanelItem => ({
        sticker,
      }));
    }

    if (activeSectionId === "featured") {
      return featuredStickers.map((sticker): StickerPanelItem => ({
        sticker,
      }));
    }

    if (activeSectionId === "custom") {
      return catalog.customStickers.map((sticker): StickerPanelItem => ({
        sticker,
        canDelete: true,
      }));
    }

    const activePack = catalog.builtinPacks.find(
      (pack) => pack.id === activeSectionId,
    );
    if (!activePack) {
      return [];
    }

    return activePack.stickers
      .map((item) => getStickerAttachment(activePack.id, item.id))
      .filter((item): item is StickerAttachment => Boolean(item))
      .map((sticker): StickerPanelItem => ({
        sticker,
      }));
  }, [
    activeSectionId,
    catalog.builtinPacks,
    catalog.customStickers,
    featuredStickers,
    keyword,
    recentStickers,
    searching,
  ]);

  const tabs = useMemo(
    () => [
      { id: "recent", label: isMobile ? "最近" : "最近使用" },
      { id: "featured", label: "精选" },
      { id: "custom", label: `自定义 ${catalog.customStickerCount}` },
      ...catalog.builtinPacks.map((pack) => ({
        id: pack.id,
        label: pack.title,
      })),
    ],
    [catalog.builtinPacks, catalog.customStickerCount, isMobile],
  );

  return (
    <div
      className={
        isMobile
          ? "mt-1.5 overflow-hidden rounded-[18px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-panel)]"
          : "absolute bottom-full left-0 z-40 mb-3 w-[430px] overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,248,244,0.98))] p-3 shadow-[0_18px_34px_rgba(15,23,42,0.16)]"
      }
    >
      <div className={isMobile ? "flex h-[284px] flex-col" : undefined}>
        <div
          className={
            isMobile
              ? "flex items-center justify-between px-3 pb-1.5 pt-2.5"
              : "flex items-center justify-between gap-2 px-1 pb-3"
          }
        >
          <div className="min-w-0">
            <div
              className={
                isMobile
                  ? "text-[13px] font-medium text-[color:var(--text-primary)]"
                  : "text-sm font-medium text-[color:var(--text-primary)]"
              }
            >
              表情
            </div>
            {!isMobile ? (
              <div className="pt-0.5 text-[11px] text-[color:var(--text-secondary)]">
                搜索、发送和管理自定义表情
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              className={
                isMobile
                  ? "rounded-full bg-white px-2.5 py-1 text-[11px] text-[#3f4b5f] transition active:bg-[#f5f5f5] disabled:opacity-45"
                  : "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)] disabled:opacity-45"
              }
            >
              {uploadMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              添加
            </button>
            <button
              type="button"
              onClick={onClose}
              className={
                isMobile
                  ? "rounded-full bg-white px-2.5 py-1 text-[11px] text-[#7b7f84] transition active:bg-[#f5f5f5]"
                  : "rounded-full px-2 py-1 text-xs text-[color:var(--text-secondary)] transition hover:bg-white/80"
              }
            >
              收起
            </button>
          </div>
        </div>

        <div className={isMobile ? "px-3 pb-2" : "px-1 pb-3"}>
          <label
            className={
              isMobile
                ? "flex items-center gap-2 rounded-[14px] border border-[color:var(--border-subtle)] bg-white px-3 py-2"
                : "flex items-center gap-2 rounded-[16px] border border-[color:var(--border-faint)] bg-white px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
            }
          >
            <Search size={14} className="text-[color:var(--text-secondary)]" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索表情"
              className="w-full border-none bg-transparent text-[13px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
            />
          </label>
        </div>

        <div
          className={
            isMobile ? "min-h-0 flex-1 overflow-y-auto px-3 pb-2.5" : "min-h-[280px] max-h-[360px] overflow-y-auto px-1 pb-3"
          }
        >
          {stickerCatalogQuery.isLoading && !stickerCatalogQuery.data ? (
            <div className="flex min-h-[160px] items-center justify-center text-sm text-[color:var(--text-secondary)]">
              <Loader2 size={16} className="mr-2 animate-spin" />
              正在载入表情...
            </div>
          ) : activeItems.length ? (
            <div className={isMobile ? "grid grid-cols-4 gap-1.5" : "grid grid-cols-4 gap-2"}>
              {activeItems.map(({ sticker, canDelete }) => (
                <StickerButton
                  key={`${sticker.sourceType ?? "builtin"}:${sticker.packId ?? "custom"}:${sticker.stickerId}`}
                  compact={isMobile}
                  sticker={sticker}
                  showDelete={Boolean(canDelete)}
                  deleting={
                    deleteMutation.isPending &&
                    deleteMutation.variables === sticker.stickerId
                  }
                  onDelete={
                    canDelete
                      ? () => {
                          void deleteMutation.mutateAsync(sticker.stickerId);
                        }
                      : undefined
                  }
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-[160px] items-center justify-center rounded-[18px] border border-dashed border-[color:var(--border-subtle)] bg-white/70 px-5 text-center text-sm text-[color:var(--text-secondary)]">
              {searching
                ? `没有找到“${keyword.trim()}”相关表情`
                : activeSectionId === "custom"
                  ? "还没有自定义表情，先上传几张图片或 GIF。"
                  : activeSectionId === "recent"
                    ? "最近还没有使用过表情。"
                    : "当前没有可用表情。"}
            </div>
          )}
        </div>

        <div
          className={
            isMobile
              ? "flex gap-1.5 overflow-x-auto border-t border-[color:var(--border-subtle)] bg-white/78 px-3 py-2"
              : "flex gap-2 overflow-x-auto pt-1"
          }
        >
          {tabs.map((tab) => {
            const active = tab.id === activeSectionId;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setKeyword("");
                  onPackChange(tab.id);
                }}
                className={
                  isMobile
                    ? `shrink-0 rounded-[10px] border px-2.5 py-1 text-[11px] transition ${
                        active
                          ? "border-[color:var(--border-subtle)] bg-white text-[#111827]"
                          : "border-transparent bg-transparent text-[#7b7f84]"
                      }`
                    : `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? "bg-[var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[0_6px_14px_rgba(160,90,10,0.20)]"
                          : "border border-white/80 bg-white/72 text-[color:var(--text-secondary)]"
                      }`
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const [file] = Array.from(event.currentTarget.files ?? []);
            if (file) {
              void uploadMutation.mutateAsync(file);
            }
            event.currentTarget.value = "";
          }}
        />
      </div>
    </div>
  );
}

function StickerButton({
  compact = false,
  sticker,
  deleting = false,
  showDelete = false,
  onDelete,
  onSelect,
}: {
  compact?: boolean;
  sticker: StickerAttachment;
  deleting?: boolean;
  showDelete?: boolean;
  onDelete?: () => void;
  onSelect: (sticker: StickerAttachment) => void;
}) {
  return (
    <div
      className={
        compact
          ? "group relative flex flex-col items-center justify-center rounded-[11px] border border-[color:var(--border-subtle)] bg-white p-2 transition active:bg-[color:var(--surface-card-hover)]"
          : "group relative flex flex-col items-center gap-1 rounded-[18px] border border-white/80 bg-white/76 p-2 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_18px_rgba(160,90,10,0.12)]"
      }
    >
      {showDelete && onDelete ? (
        <span className="absolute right-1 top-1 z-10">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(15,23,42,0.72)] text-white opacity-0 transition group-hover:opacity-100"
            aria-label="删除自定义表情"
            disabled={deleting}
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => onSelect(sticker)}
        title={sticker.label ?? sticker.stickerId}
        className="flex w-full flex-col items-center gap-1"
      >
        <img
          src={sticker.url}
          alt={sticker.label ?? sticker.stickerId}
          className={
            compact
              ? "h-12 w-12 rounded-[10px] object-contain"
              : "h-16 w-16 rounded-[16px] object-contain"
          }
          loading="lazy"
        />
        {!compact ? (
          <span className="line-clamp-1 text-[11px] text-[color:var(--text-secondary)]">
            {sticker.label ?? sticker.stickerId}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function resolveActiveSectionId(
  activePackId: string,
  catalog: {
    builtinPacks: Array<{ id: string }>;
  },
) {
  if (
    activePackId === "recent" ||
    activePackId === "featured" ||
    activePackId === "custom"
  ) {
    return activePackId;
  }

  return catalog.builtinPacks.some((pack) => pack.id === activePackId)
    ? activePackId
    : "featured";
}

function resolveRecentStickers(
  items: RecentStickerItem[],
  customStickers: CustomStickerRecord[],
) {
  return items
    .map((item) => {
      if ((item.sourceType ?? "builtin") === "custom") {
        return (
          customStickers.find((sticker) => sticker.stickerId === item.stickerId) ??
          null
        );
      }

      return item.packId
        ? getStickerAttachment(item.packId, item.stickerId)
        : null;
    })
    .filter((item): item is StickerAttachment => Boolean(item));
}

function buildFeaturedStickers(
  builtinPacks: Array<{
    id: string;
    stickers: Array<{ id: string }>;
  }>,
) {
  return builtinPacks
    .flatMap((pack) =>
      pack.stickers
        .map((sticker) => getStickerAttachment(pack.id, sticker.id))
        .filter((item): item is StickerAttachment => Boolean(item)),
    )
    .slice(0, 12);
}

function searchStickerItems(input: {
  keyword: string;
  recentStickers: StickerAttachment[];
  builtinPacks: Array<{
    id: string;
    title: string;
    stickers: Array<{
      id: string;
      label: string;
      keywords: string[];
    }>;
  }>;
  customStickers: CustomStickerRecord[];
}) {
  const query = input.keyword.trim().toLowerCase();
  if (!query) {
    return [] as Array<{ sticker: StickerAttachment; canDelete?: boolean }>;
  }

  const items = new Map<
    string,
    { sticker: StickerAttachment; canDelete?: boolean; score: number }
  >();

  input.recentStickers.forEach((sticker) => {
    const haystack = [sticker.label, sticker.stickerId].join(" ").toLowerCase();
    if (haystack.includes(query)) {
      items.set(getStickerIdentity(sticker), {
        sticker,
        canDelete: sticker.sourceType === "custom",
        score: 300,
      });
    }
  });

  input.customStickers.forEach((sticker) => {
    const haystack = [sticker.label, sticker.fileName, ...sticker.keywords]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) {
      return;
    }

    items.set(getStickerIdentity(sticker), {
      sticker,
      canDelete: true,
      score: computeSearchScore(query, [sticker.label, sticker.fileName, ...sticker.keywords]),
    });
  });

  input.builtinPacks.forEach((pack) => {
    pack.stickers.forEach((item) => {
      const haystack = [pack.title, item.label, ...item.keywords]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) {
        return;
      }

      const sticker = getStickerAttachment(pack.id, item.id);
      if (!sticker) {
        return;
      }

      items.set(getStickerIdentity(sticker), {
        sticker,
        score: computeSearchScore(query, [item.label, pack.title, ...item.keywords]),
      });
    });
  });

  return [...items.values()]
    .sort((left, right) => right.score - left.score)
    .map(({ sticker, canDelete }) => ({
      sticker,
      canDelete,
    }));
}

function getStickerIdentity(sticker: StickerAttachment) {
  return `${sticker.sourceType ?? "builtin"}:${sticker.packId ?? ""}:${sticker.stickerId}`;
}

function computeSearchScore(query: string, tokens: Array<string | undefined>) {
  return tokens.reduce((score, token) => {
    const normalized = token?.trim().toLowerCase() ?? "";
    if (!normalized) {
      return score;
    }

    if (normalized === query) {
      return score + 120;
    }

    if (normalized.startsWith(query)) {
      return score + 60;
    }

    if (normalized.includes(query)) {
      return score + 20;
    }

    return score;
  }, 0);
}

async function readStickerFileDimensions(file: File) {
  if (typeof window === "undefined") {
    return {
      width: undefined,
      height: undefined,
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await new Promise<{ width?: number; height?: number }>(
      (resolve) => {
        const image = new Image();
        image.onload = () => {
          resolve({
            width: image.naturalWidth || undefined,
            height: image.naturalHeight || undefined,
          });
        };
        image.onerror = () => {
          resolve({
            width: undefined,
            height: undefined,
          });
        };
        image.src = objectUrl;
      },
    );
    return dimensions;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

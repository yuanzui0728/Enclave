import { useEffect, useMemo, useRef, useState } from "react";
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
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { prepareCustomStickerUpload } from "./prepare-custom-sticker-upload";
import {
  removeRecentSticker,
  type RecentStickerItem,
} from "./recent-stickers";

type StickerPanelProps = {
  baseUrl?: string;
  variant: "mobile" | "desktop";
  activePackId: string;
  recentItems: RecentStickerItem[];
  onClose: () => void;
  onPackChange: (packId: string) => void;
  onRecentItemsChange?: (items: RecentStickerItem[]) => void;
  onSelect: (sticker: StickerAttachment) => void;
  onError?: (message: string | null) => void;
};

const PANEL_QUERY_KEY = "app-sticker-catalog";
type StickerPanelItem = {
  sticker: StickerAttachment;
  canDelete?: boolean;
};
type ResolvedRecentStickerItem = {
  sticker: StickerAttachment;
  usedAt: number;
};
type StickerPanelTab = {
  id: string;
  label: string;
  badgeText?: string;
  coverSticker?: StickerAttachment | null;
};
type CustomStickerSortMode = "recent" | "added";

export function StickerPanel({
  baseUrl,
  variant,
  activePackId,
  recentItems,
  onClose,
  onPackChange,
  onRecentItemsChange,
  onSelect,
  onError,
}: StickerPanelProps) {
  const isMobile = variant === "mobile";
  const [keyword, setKeyword] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [customManageMode, setCustomManageMode] = useState(false);
  const [customSortMode, setCustomSortMode] =
    useState<CustomStickerSortMode>("recent");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
  const customSlotsRemaining = Math.max(
    0,
    catalog.maxCustomStickerCount - catalog.customStickerCount,
  );
  const customStickerLibraryFull = customSlotsRemaining <= 0;
  const activeSectionId = resolveActiveSectionId(activePackId, catalog);
  const recentStickerEntries = useMemo(
    () => resolveRecentStickers(recentItems, catalog.customStickers),
    [catalog.customStickers, recentItems],
  );
  const recentStickers = useMemo(
    () => recentStickerEntries.map((item) => item.sticker),
    [recentStickerEntries],
  );
  const customStickers = useMemo(
    () =>
      sortCustomStickers({
        stickers: catalog.customStickers,
        recentStickerEntries,
        sortMode: customSortMode,
      }),
    [catalog.customStickers, customSortMode, recentStickerEntries],
  );
  const featuredStickers = useMemo(
    () => buildFeaturedStickers(catalog.builtinPacks),
    [catalog.builtinPacks],
  );
  const trimmedKeyword = keyword.trim();
  const searchPending =
    trimmedKeyword.length > 0 && trimmedKeyword !== searchKeyword;

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (customStickerLibraryFull) {
        throw new Error("自定义表情已满，请先删除几个再继续添加。");
      }

      if (files.length > customSlotsRemaining) {
        throw new Error(`还能再添加 ${customSlotsRemaining} 个表情，请分批上传。`);
      }

      let uploadedCount = 0;

      for (const file of files) {
        const prepared = await prepareCustomStickerUpload({
          file,
        });
        const formData = new FormData();
        formData.set("file", prepared.file, prepared.file.name);
        formData.set("width", String(prepared.width));
        formData.set("height", String(prepared.height));
        if (prepared.label) {
          formData.set("label", prepared.label);
        }
        await uploadCustomSticker(formData, baseUrl);
        uploadedCount += 1;
      }

      return uploadedCount;
    },
    onMutate: () => {
      onError?.(null);
    },
    onSuccess: async (uploadedCount) => {
      if (uploadedCount > 0) {
        await queryClient.invalidateQueries({
          queryKey: [PANEL_QUERY_KEY, baseUrl],
        });
        onPackChange("custom");
      }
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
    onSuccess: async (stickerId) => {
      onRecentItemsChange?.(
        removeRecentSticker({
          sourceType: "custom",
          stickerId,
        }),
      );
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

  const searching = searchKeyword.length > 0;
  const activeItems = useMemo<StickerPanelItem[]>(() => {
    if (searching) {
      return searchStickerItems({
        keyword: searchKeyword,
        recentStickerEntries,
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
      return customStickers.map((sticker): StickerPanelItem => ({
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
    customStickers,
    featuredStickers,
    recentStickerEntries,
    recentStickers,
    searchKeyword,
    searching,
  ]);

  const tabs = useMemo<StickerPanelTab[]>(
    () => [
      {
        id: "recent",
        label: isMobile ? "最近" : "最近使用",
        badgeText: "近",
        coverSticker: recentStickers[0] ?? null,
      },
      {
        id: "featured",
        label: "精选",
        badgeText: "荐",
        coverSticker: featuredStickers[0] ?? null,
      },
      {
        id: "custom",
        label: `自定义 ${catalog.customStickerCount}`,
        badgeText: "自",
        coverSticker: customStickers[0] ?? null,
      },
      ...catalog.builtinPacks.map((pack) => ({
        id: pack.id,
        label: pack.title,
        coverSticker: getStickerAttachment(pack.id, pack.coverStickerId),
      })),
    ],
    [
      catalog.builtinPacks,
      catalog.customStickerCount,
      customStickers,
      featuredStickers,
      isMobile,
      recentStickers,
    ],
  );
  const activeTab = tabs.find((tab) => tab.id === activeSectionId) ?? tabs[0];
  const panelSubtitle = trimmedKeyword.length > 0
    ? searchPending
      ? `正在搜索“${trimmedKeyword}”`
      : `搜索“${trimmedKeyword}”`
    : activeSectionId === "custom" && customManageMode
      ? `管理自定义表情 · 已保存 ${catalog.customStickerCount} / ${catalog.maxCustomStickerCount}`
      : activeSectionId === "custom" && customStickerLibraryFull
        ? "自定义表情已满，请先删除几个再继续添加"
      : activeSectionId === "custom"
        ? `已保存 ${catalog.customStickerCount} / ${catalog.maxCustomStickerCount}，支持图片和 GIF`
        : activeSectionId === "recent"
        ? "最近发送和使用过的表情"
        : `${activeTab?.label ?? "表情"} · 桌面端连续发送`;
  const customCapacityNotice =
    activeSectionId === "custom" && trimmedKeyword.length === 0
      ? customStickerLibraryFull
        ? "自定义表情已满，请先删除几个再继续添加。"
        : customSlotsRemaining <= 20
          ? `还能再添加 ${customSlotsRemaining} 个自定义表情。`
          : null
      : null;
  const showCustomSortBar =
    activeSectionId === "custom" &&
    trimmedKeyword.length === 0 &&
    catalog.customStickerCount > 1;
  const clearSearch = () => {
    setKeyword("");
    setSearchKeyword("");
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };

  useEffect(() => {
    if (activeSectionId !== "custom" || trimmedKeyword.length > 0) {
      setCustomManageMode(false);
    }
  }, [activeSectionId, trimmedKeyword.length]);

  useEffect(() => {
    if (!trimmedKeyword) {
      setSearchKeyword("");
      return;
    }

    const timer = window.setTimeout(() => {
      setSearchKeyword(trimmedKeyword);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [trimmedKeyword]);

  useEffect(() => {
    if (isMobile) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isMobile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      if (trimmedKeyword.length > 0) {
        event.preventDefault();
        clearSearch();
        return;
      }

      if (activeSectionId === "custom" && customManageMode) {
        event.preventDefault();
        setCustomManageMode(false);
        return;
      }

      if (!isMobile) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeSectionId,
    customManageMode,
    isMobile,
    onClose,
    trimmedKeyword.length,
  ]);

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
                {panelSubtitle}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {!isMobile &&
            activeSectionId === "custom" &&
            trimmedKeyword.length === 0 ? (
              <button
                type="button"
                onClick={() => setCustomManageMode((current) => !current)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  customManageMode
                    ? "bg-[rgba(15,23,42,0.08)] text-[color:var(--text-primary)]"
                    : "text-[color:var(--text-secondary)] hover:bg-white/80"
                }`}
              >
                {customManageMode ? "完成" : "管理"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadMutation.isPending || customStickerLibraryFull}
              title={
                customStickerLibraryFull
                  ? "自定义表情已满，请先删除几个再继续添加"
                  : undefined
              }
              className={
                isMobile
                  ? "rounded-full bg-white px-2.5 py-1 text-[11px] text-[#3f4b5f] transition active:bg-[#f5f5f5] disabled:opacity-45"
                  : "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--border-subtle)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)] disabled:opacity-45"
              }
            >
              {uploadMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {isMobile ? "添加" : "添加表情"}
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
              ref={searchInputRef}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  trimmedKeyword.length > 0 &&
                  !searchPending &&
                  activeItems[0]
                ) {
                  event.preventDefault();
                  onSelect(activeItems[0].sticker);
                }
              }}
              placeholder="搜索表情"
              className="w-full border-none bg-transparent text-[13px] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
            />
            {trimmedKeyword.length > 0 ? (
              <button
                type="button"
                onClick={clearSearch}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--surface-console)] text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-card-hover)]"
                aria-label="清空表情搜索"
              >
                <X size={12} />
              </button>
            ) : null}
          </label>
        </div>

        <div
          className={
            isMobile ? "min-h-0 flex-1 overflow-y-auto px-3 pb-2.5" : "min-h-[280px] max-h-[360px] overflow-y-auto px-1 pb-3"
          }
        >
          {showCustomSortBar ? (
            <div
              className={
                isMobile
                  ? "mb-2 flex items-center gap-1.5"
                  : "mb-3 flex items-center gap-2"
              }
            >
              {([
                ["recent", "最近使用"],
                ["added", "最近添加"],
              ] as const).map(([mode, label]) => {
                const active = customSortMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCustomSortMode(mode)}
                    className={
                      isMobile
                        ? `rounded-full px-2.5 py-1 text-[11px] transition ${
                            active
                              ? "bg-[rgba(160,90,10,0.14)] text-[#9a5a0a]"
                              : "bg-white text-[color:var(--text-secondary)]"
                          }`
                        : `rounded-full px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? "bg-[rgba(160,90,10,0.14)] text-[#9a5a0a]"
                              : "bg-white/82 text-[color:var(--text-secondary)] hover:bg-white"
                          }`
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          {customCapacityNotice ? (
            <div
              className={
                isMobile
                  ? "mb-2 rounded-[14px] border border-[rgba(245,158,11,0.28)] bg-[rgba(255,251,235,0.92)] px-3 py-2 text-[11px] text-[#92400e]"
                  : "mb-3 flex items-center justify-between gap-3 rounded-[16px] border border-[rgba(245,158,11,0.26)] bg-[rgba(255,251,235,0.92)] px-3 py-2.5 text-xs text-[#92400e]"
              }
            >
              <span>{customCapacityNotice}</span>
              {!isMobile && customStickerLibraryFull && !customManageMode ? (
                <button
                  type="button"
                  onClick={() => setCustomManageMode(true)}
                  className="shrink-0 rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#92400e] shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                >
                  去管理
                </button>
              ) : null}
            </div>
          ) : null}
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
                  showDelete={Boolean(canDelete) && (!isMobile ? customManageMode : true)}
                  deleteAlwaysVisible={!isMobile && customManageMode}
                  selectionDisabled={!isMobile && customManageMode && Boolean(canDelete)}
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
              <div className="flex max-w-[240px] flex-col items-center gap-3">
                <div>
                  {searching
                    ? `没有找到“${trimmedKeyword}”相关表情`
                    : activeSectionId === "custom"
                      ? "还没有自定义表情，先上传几张图片或 GIF。"
                      : activeSectionId === "recent"
                        ? "最近还没有使用过表情。"
                        : "当前没有可用表情。"}
                </div>
                {!searching && activeSectionId === "custom" ? (
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={uploadMutation.isPending || customStickerLibraryFull}
                    className="rounded-full bg-[rgba(160,90,10,0.14)] px-3 py-1.5 text-xs font-medium text-[#9a5a0a] transition disabled:opacity-45"
                  >
                    添加第一张表情
                  </button>
                ) : null}
                {!searching && activeSectionId === "recent" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setKeyword("");
                      setSearchKeyword("");
                      onPackChange("featured");
                    }}
                    className="rounded-full bg-[rgba(160,90,10,0.14)] px-3 py-1.5 text-xs font-medium text-[#9a5a0a] transition"
                  >
                    去精选看看
                  </button>
                ) : null}
              </div>
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
                  setSearchKeyword("");
                  onPackChange(tab.id);
                }}
                className={
                  isMobile
                    ? `shrink-0 rounded-[10px] border px-2.5 py-1 text-[11px] transition ${
                        active
                          ? "border-[color:var(--border-subtle)] bg-white text-[#111827]"
                          : "border-transparent bg-transparent text-[#7b7f84]"
                      }`
                    : `shrink-0 rounded-[16px] p-1.5 transition ${
                        active
                          ? "bg-[rgba(160,90,10,0.12)] shadow-[0_6px_14px_rgba(160,90,10,0.14)]"
                          : "bg-transparent hover:bg-white/76"
                      }`
                }
                title={tab.label}
              >
                {isMobile ? (
                  tab.label
                ) : (
                  <span
                    className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-[12px] border text-xs font-semibold ${
                      active
                        ? "border-[rgba(160,90,10,0.35)] bg-white text-[#9a5a0a]"
                        : "border-white/80 bg-white/84 text-[color:var(--text-secondary)]"
                    }`}
                  >
                    {tab.coverSticker ? (
                      <img
                        src={tab.coverSticker.url}
                        alt={tab.label}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span>{tab.badgeText ?? tab.label.slice(0, 1)}</span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            if (files.length) {
              void uploadMutation.mutateAsync(files);
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
  deleteAlwaysVisible = false,
  selectionDisabled = false,
  onDelete,
  onSelect,
}: {
  compact?: boolean;
  sticker: StickerAttachment;
  deleting?: boolean;
  showDelete?: boolean;
  deleteAlwaysVisible?: boolean;
  selectionDisabled?: boolean;
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
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(15,23,42,0.72)] text-white transition ${
              deleteAlwaysVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label="删除自定义表情"
            disabled={deleting}
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
          </button>
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (!selectionDisabled) {
            onSelect(sticker);
          }
        }}
        title={sticker.label ?? sticker.stickerId}
        className={`flex w-full flex-col items-center gap-1 ${
          selectionDisabled ? "cursor-default" : ""
        }`}
        disabled={selectionDisabled}
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
        const sticker =
          customStickers.find((entry) => entry.stickerId === item.stickerId) ??
          null;
        return sticker
          ? {
              sticker,
              usedAt: item.usedAt,
            }
          : null;
      }

      const sticker = item.packId
        ? getStickerAttachment(item.packId, item.stickerId)
        : null;
      return sticker
        ? {
            sticker,
            usedAt: item.usedAt,
          }
        : null;
    })
    .filter((item): item is ResolvedRecentStickerItem => Boolean(item));
}

function sortCustomStickers(input: {
  stickers: CustomStickerRecord[];
  recentStickerEntries: ResolvedRecentStickerItem[];
  sortMode: CustomStickerSortMode;
}) {
  const recentUsedAtMap = new Map<string, number>();
  input.recentStickerEntries.forEach((entry) => {
    if (entry.sticker.sourceType !== "custom") {
      return;
    }

    const current = recentUsedAtMap.get(entry.sticker.stickerId) ?? 0;
    if (entry.usedAt > current) {
      recentUsedAtMap.set(entry.sticker.stickerId, entry.usedAt);
    }
  });

  return [...input.stickers].sort((left, right) => {
    if (input.sortMode === "recent") {
      const recentDiff =
        (recentUsedAtMap.get(right.stickerId) ?? 0) -
        (recentUsedAtMap.get(left.stickerId) ?? 0);
      if (recentDiff !== 0) {
        return recentDiff;
      }
    }

    const updatedDiff =
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }

    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
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
  recentStickerEntries: ResolvedRecentStickerItem[];
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

  input.recentStickerEntries.forEach((entry, index) => {
    const score =
      320 +
      computeSearchScore(query, [entry.sticker.label, entry.sticker.stickerId]) +
      computeRankBoost(index, 72);
    if (score <= 320) {
      return;
    }

    upsertSearchItem(items, {
      sticker: entry.sticker,
      canDelete: entry.sticker.sourceType === "custom",
      score,
    });
  });

  input.customStickers.forEach((sticker, index) => {
    const score =
      220 +
      computeSearchScore(query, [
        sticker.label,
        sticker.fileName,
        ...sticker.keywords,
      ]) +
      computeRankBoost(index, 36);
    if (score <= 220) {
      return;
    }

    upsertSearchItem(items, {
      sticker,
      canDelete: true,
      score,
    });
  });

  input.builtinPacks.forEach((pack) => {
    pack.stickers.forEach((item, index) => {
      const sticker = getStickerAttachment(pack.id, item.id);
      if (!sticker) {
        return;
      }

      const score =
        140 +
        computeSearchScore(query, [item.label, pack.title, ...item.keywords]) +
        computeRankBoost(index, 12);
      if (score <= 140) {
        return;
      }

      upsertSearchItem(items, {
        sticker,
        score,
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

function upsertSearchItem(
  items: Map<
    string,
    { sticker: StickerAttachment; canDelete?: boolean; score: number }
  >,
  next: { sticker: StickerAttachment; canDelete?: boolean; score: number },
) {
  const key = getStickerIdentity(next.sticker);
  const current = items.get(key);
  if (!current) {
    items.set(key, next);
    return;
  }

  items.set(key, {
    sticker: next.score >= current.score ? next.sticker : current.sticker,
    canDelete: current.canDelete || next.canDelete,
    score: Math.max(current.score, next.score),
  });
}

function computeRankBoost(index: number, maxBoost: number) {
  return Math.max(0, maxBoost - index * 6);
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

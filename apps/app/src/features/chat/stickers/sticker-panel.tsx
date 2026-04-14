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
import { removeRecentSticker, type RecentStickerItem } from "./recent-stickers";

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
type StickerSearchSection = {
  id: string;
  label: string;
  badgeText: string;
  items: StickerPanelItem[];
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
type CustomDeleteFeedback = {
  deletedCount: number;
  remainingCount: number;
  slotsRemaining: number;
  lastDeletedLabel: string | null;
};

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
  const [customDeleteFeedback, setCustomDeleteFeedback] =
    useState<CustomDeleteFeedback | null>(null);
  const [customDeleteFeedbackFlashActive, setCustomDeleteFeedbackFlashActive] =
    useState(false);
  const [searchPreviewFlashKey, setSearchPreviewFlashKey] = useState<
    string | null
  >(null);
  const [manageFocusFlashKey, setManageFocusFlashKey] = useState<string | null>(
    null,
  );
  const [collapsingStickerKeys, setCollapsingStickerKeys] = useState<string[]>(
    [],
  );
  const [pendingManageFocusKey, setPendingManageFocusKey] = useState<
    string | null
  >(null);
  const [focusedManageDeleteKey, setFocusedManageDeleteKey] = useState<
    string | null
  >(null);
  const [manageSearchPauseHintVisible, setManageSearchPauseHintVisible] =
    useState(false);
  const [shouldFocusCustomEmptyAction, setShouldFocusCustomEmptyAction] =
    useState(false);
  const [highlightedStickerKey, setHighlightedStickerKey] = useState<
    string | null
  >(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const customEmptyActionButtonRef = useRef<HTMLButtonElement | null>(null);
  const stickerItemRefs = useRef(new Map<string, HTMLDivElement>());
  const manageDeleteButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteFeedbackFlashTimerRef = useRef<number | null>(null);
  const searchPreviewFlashTimerRef = useRef<number | null>(null);
  const manageFocusFlashTimerRef = useRef<number | null>(null);
  const deleteTransitionTimerRefs = useRef(new Map<string, number>());
  const collapsingStickerKeysRef = useRef(new Set<string>());
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

  const triggerDeleteFeedbackFlash = () => {
    if (deleteFeedbackFlashTimerRef.current !== null) {
      window.clearTimeout(deleteFeedbackFlashTimerRef.current);
    }

    setCustomDeleteFeedbackFlashActive(true);
    deleteFeedbackFlashTimerRef.current = window.setTimeout(() => {
      setCustomDeleteFeedbackFlashActive(false);
      deleteFeedbackFlashTimerRef.current = null;
    }, 720);
  };

  const triggerSearchPreviewFlash = (stickerKey: string | null) => {
    if (!stickerKey) {
      return;
    }

    if (searchPreviewFlashTimerRef.current !== null) {
      window.clearTimeout(searchPreviewFlashTimerRef.current);
    }

    setSearchPreviewFlashKey(stickerKey);
    searchPreviewFlashTimerRef.current = window.setTimeout(() => {
      setSearchPreviewFlashKey((current) =>
        current === stickerKey ? null : current,
      );
      searchPreviewFlashTimerRef.current = null;
    }, 520);
  };

  const clearDeleteTransitionTimer = (stickerKey: string) => {
    const timer = deleteTransitionTimerRefs.current.get(stickerKey);
    if (timer === undefined) {
      return;
    }

    window.clearTimeout(timer);
    deleteTransitionTimerRefs.current.delete(stickerKey);
  };

  const setStickerCollapsing = (stickerKey: string, collapsing: boolean) => {
    if (collapsing) {
      collapsingStickerKeysRef.current.add(stickerKey);
      setCollapsingStickerKeys((current) =>
        current.includes(stickerKey) ? current : [...current, stickerKey],
      );
      return;
    }

    collapsingStickerKeysRef.current.delete(stickerKey);
    setCollapsingStickerKeys((current) =>
      current.filter((key) => key !== stickerKey),
    );
  };

  const triggerManageFocusFlash = (stickerKey: string | null) => {
    if (!stickerKey) {
      return;
    }

    if (manageFocusFlashTimerRef.current !== null) {
      window.clearTimeout(manageFocusFlashTimerRef.current);
    }

    setManageFocusFlashKey(stickerKey);
    manageFocusFlashTimerRef.current = window.setTimeout(() => {
      setManageFocusFlashKey((current) =>
        current === stickerKey ? null : current,
      );
      manageFocusFlashTimerRef.current = null;
    }, 560);
  };

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (customStickerLibraryFull) {
        throw new Error("自定义表情已满，请先删除几个再继续添加。");
      }

      if (files.length > customSlotsRemaining) {
        throw new Error(
          `还能再添加 ${customSlotsRemaining} 个表情，请分批上传。`,
        );
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
        setCustomDeleteFeedback(null);
        setCustomDeleteFeedbackFlashActive(false);
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
    mutationFn: async (input: {
      stickerId: string;
      stickerKey: string;
      label?: string;
      nextFocusKey?: string | null;
      exitManageModeAfterDelete?: boolean;
    }) => {
      await deleteCustomSticker(input.stickerId, baseUrl);
      return input;
    },
    onSuccess: async ({
      stickerId,
      stickerKey,
      label,
      nextFocusKey,
      exitManageModeAfterDelete,
    }) => {
      setCustomDeleteFeedback((current) => ({
        deletedCount: (current?.deletedCount ?? 0) + 1,
        remainingCount: Math.max(
          0,
          (current?.remainingCount ?? catalog.customStickerCount) - 1,
        ),
        slotsRemaining: Math.min(
          catalog.maxCustomStickerCount,
          (current?.slotsRemaining ?? customSlotsRemaining) + 1,
        ),
        lastDeletedLabel: label?.trim() || null,
      }));
      triggerDeleteFeedbackFlash();
      setPendingManageFocusKey(nextFocusKey ?? null);
      if (exitManageModeAfterDelete) {
        setCustomManageMode(false);
        setShouldFocusCustomEmptyAction(true);
      }
      onRecentItemsChange?.(
        removeRecentSticker({
          sourceType: "custom",
          stickerId,
        }),
      );
      await queryClient.invalidateQueries({
        queryKey: [PANEL_QUERY_KEY, baseUrl],
      });
      clearDeleteTransitionTimer(stickerKey);
      setStickerCollapsing(stickerKey, false);
    },
    onError: (error, variables) => {
      clearDeleteTransitionTimer(variables.stickerKey);
      setStickerCollapsing(variables.stickerKey, false);
      onError?.(
        error instanceof Error ? error.message : "删除表情失败，请稍后再试。",
      );
    },
  });

  const searching = searchKeyword.length > 0;
  const searchSections = useMemo<StickerSearchSection[]>(() => {
    if (!searching) {
      return [];
    }

    return searchStickerItems({
      keyword: searchKeyword,
      recentStickerEntries,
      builtinPacks: catalog.builtinPacks,
      customStickers: catalog.customStickers,
    });
  }, [
    catalog.builtinPacks,
    catalog.customStickers,
    recentStickerEntries,
    searchKeyword,
    searching,
  ]);
  const activeItems = useMemo<StickerPanelItem[]>(() => {
    if (searching) {
      return searchSections.flatMap((section) => section.items);
    }

    if (activeSectionId === "recent") {
      return recentStickers.map(
        (sticker): StickerPanelItem => ({
          sticker,
        }),
      );
    }

    if (activeSectionId === "featured") {
      return featuredStickers.map(
        (sticker): StickerPanelItem => ({
          sticker,
        }),
      );
    }

    if (activeSectionId === "custom") {
      return customStickers.map(
        (sticker): StickerPanelItem => ({
          sticker,
          canDelete: true,
        }),
      );
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
      .map(
        (sticker): StickerPanelItem => ({
          sticker,
        }),
      );
  }, [
    activeSectionId,
    catalog.builtinPacks,
    catalog.customStickers,
    customStickers,
    featuredStickers,
    recentStickerEntries,
    recentStickers,
    searchKeyword,
    searchSections,
    searching,
  ]);
  const activeStickerKeys = useMemo(
    () => activeItems.map((item) => getStickerIdentity(item.sticker)),
    [activeItems],
  );
  const collapsingStickerKeySet = useMemo(
    () => new Set(collapsingStickerKeys),
    [collapsingStickerKeys],
  );
  const manageableCustomItems = useMemo(
    () => activeItems.filter((item) => item.canDelete),
    [activeItems],
  );
  const focusedManageSticker = useMemo(() => {
    if (!focusedManageDeleteKey) {
      return null;
    }

    return (
      activeItems.find(
        (item) => getStickerIdentity(item.sticker) === focusedManageDeleteKey,
      )?.sticker ?? null
    );
  }, [activeItems, focusedManageDeleteKey]);
  const focusedManageStickerPosition = useMemo(() => {
    if (!focusedManageDeleteKey) {
      return null;
    }

    const index = manageableCustomItems.findIndex(
      (item) => getStickerIdentity(item.sticker) === focusedManageDeleteKey,
    );
    return index >= 0 ? index + 1 : null;
  }, [focusedManageDeleteKey, manageableCustomItems]);
  const nextManageSticker = useMemo(() => {
    if (!focusedManageDeleteKey) {
      return null;
    }

    const nextKey = resolveAdjacentStickerKey(
      manageableCustomItems,
      focusedManageDeleteKey,
    );
    return (
      manageableCustomItems.find(
        (item) => getStickerIdentity(item.sticker) === nextKey,
      )?.sticker ?? null
    );
  }, [focusedManageDeleteKey, manageableCustomItems]);
  const nextManageDeleteOutcomeLabel = useMemo(() => {
    if (!focusedManageSticker) {
      return null;
    }

    const nextSlotsAvailable = Math.min(
      catalog.maxCustomStickerCount,
      customSlotsRemaining + 1,
    );
    if (manageableCustomItems.length <= 1) {
      return `删当前后会清空表情库，可继续添加 ${nextSlotsAvailable} 张。`;
    }

    return `删当前后：剩 ${manageableCustomItems.length - 1} 张，可再加 ${nextSlotsAvailable} 张。`;
  }, [
    catalog.maxCustomStickerCount,
    customSlotsRemaining,
    focusedManageSticker,
    manageableCustomItems.length,
  ]);
  const highlightedSearchItem = useMemo(() => {
    if (!searching || searchPending || activeItems.length === 0) {
      return null;
    }

    if (!highlightedStickerKey) {
      return activeItems[0] ?? null;
    }

    return (
      activeItems.find(
        (item) => getStickerIdentity(item.sticker) === highlightedStickerKey,
      ) ??
      activeItems[0] ??
      null
    );
  }, [activeItems, highlightedStickerKey, searchPending, searching]);
  const highlightedSearchSection = useMemo(() => {
    if (!highlightedSearchItem) {
      return null;
    }

    const stickerKey = getStickerIdentity(highlightedSearchItem.sticker);
    return (
      searchSections.find((section) =>
        section.items.some(
          (item) => getStickerIdentity(item.sticker) === stickerKey,
        ),
      ) ?? null
    );
  }, [highlightedSearchItem, searchSections]);
  const highlightedSearchSectionLeadSticker =
    highlightedSearchSection?.items[0]?.sticker ?? null;
  const highlightedSearchStickerKey = highlightedSearchItem
    ? getStickerIdentity(highlightedSearchItem.sticker)
    : null;
  const highlightedSearchSourceLabel = highlightedSearchSection?.label ?? null;
  const highlightedSearchPosition = useMemo(() => {
    if (!highlightedSearchStickerKey) {
      return null;
    }

    const index = activeItems.findIndex(
      (item) =>
        getStickerIdentity(item.sticker) === highlightedSearchStickerKey,
    );
    return index >= 0 ? index + 1 : null;
  }, [activeItems, highlightedSearchStickerKey]);
  const searchSectionNavigation = useMemo(
    () =>
      searchSections
        .map((section) => ({
          id: section.id,
          itemKeys: section.items.map((item) =>
            getStickerIdentity(item.sticker),
          ),
        }))
        .filter((section) => section.itemKeys.length > 0),
    [searchSections],
  );
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
  const panelSubtitle =
    trimmedKeyword.length > 0
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
  const customStorageRatio =
    catalog.maxCustomStickerCount > 0
      ? Math.min(
          1,
          Math.max(
            0,
            catalog.customStickerCount / catalog.maxCustomStickerCount,
          ),
        )
      : 0;
  const showCustomStorageMeter =
    activeSectionId === "custom" && trimmedKeyword.length === 0;
  const customStorageTone = customStickerLibraryFull
    ? "danger"
    : customSlotsRemaining <= 20
      ? "warning"
      : "normal";
  const showCustomSortBar =
    activeSectionId === "custom" &&
    trimmedKeyword.length === 0 &&
    catalog.customStickerCount > 1;
  const showSearchKeyboardHint =
    !isMobile && searching && !searchPending && activeItems.length > 0;
  const firstSearchResultItem =
    searching && !searchPending ? (activeItems[0] ?? null) : null;
  const firstSearchResultKey = firstSearchResultItem
    ? getStickerIdentity(firstSearchResultItem.sticker)
    : null;
  const lastSearchResultItem =
    searching && !searchPending
      ? (activeItems[activeItems.length - 1] ?? null)
      : null;
  const highlightedSearchSectionIndex = highlightedSearchSection
    ? searchSectionNavigation.findIndex(
        (section) => section.id === highlightedSearchSection.id,
      )
    : -1;
  const previousSearchSectionLabel =
    highlightedSearchSectionIndex > 0
      ? (searchSections[highlightedSearchSectionIndex - 1]?.label ?? null)
      : null;
  const nextSearchSectionLabel =
    highlightedSearchSectionIndex >= 0 &&
    highlightedSearchSectionIndex < searchSections.length - 1
      ? (searchSections[highlightedSearchSectionIndex + 1]?.label ?? null)
      : null;
  const recommendedSearchSection = useMemo(() => {
    if (!firstSearchResultKey) {
      return null;
    }

    return (
      searchSections.find((section) =>
        section.items.some(
          (item) => getStickerIdentity(item.sticker) === firstSearchResultKey,
        ),
      ) ?? null
    );
  }, [firstSearchResultKey, searchSections]);
  const recommendedSearchSectionIndex = recommendedSearchSection
    ? searchSectionNavigation.findIndex(
        (section) => section.id === recommendedSearchSection.id,
      )
    : -1;
  const searchSectionOffsetFromRecommended =
    highlightedSearchSectionIndex >= 0 && recommendedSearchSectionIndex >= 0
      ? highlightedSearchSectionIndex - recommendedSearchSectionIndex
      : null;
  const searchSectionOffsetLabel =
    searchSectionOffsetFromRecommended &&
    searchSectionOffsetFromRecommended !== 0
      ? searchSectionOffsetFromRecommended > 0
        ? `当前比首推晚 ${searchSectionOffsetFromRecommended} 组`
        : `当前比首推早 ${Math.abs(searchSectionOffsetFromRecommended)} 组`
      : null;
  const searchSectionStateMap = useMemo(() => {
    const stateMap = new Map<
      string,
      {
        containsHighlighted: boolean;
        containsRecommended: boolean;
        highlightedPosition: number | null;
      }
    >();

    searchSections.forEach((section) => {
      const itemKeys = section.items.map((item) =>
        getStickerIdentity(item.sticker),
      );
      const highlightedPosition = highlightedSearchStickerKey
        ? itemKeys.findIndex((key) => key === highlightedSearchStickerKey) + 1
        : 0;
      stateMap.set(section.id, {
        containsHighlighted: highlightedPosition > 0,
        containsRecommended: firstSearchResultKey
          ? itemKeys.includes(firstSearchResultKey)
          : false,
        highlightedPosition:
          highlightedPosition > 0 ? highlightedPosition : null,
      });
    });

    return stateMap;
  }, [firstSearchResultKey, highlightedSearchStickerKey, searchSections]);
  const highlightedSearchSectionState = highlightedSearchSection
    ? (searchSectionStateMap.get(highlightedSearchSection.id) ?? null)
    : null;
  const searchItemOffsetWithinSectionLabel =
    highlightedSearchSectionState?.highlightedPosition &&
    highlightedSearchSectionState.highlightedPosition > 1
      ? `当前比本组首项晚 ${
          highlightedSearchSectionState.highlightedPosition - 1
        } 项`
      : null;
  const showSearchSectionJumpHint =
    !isMobile &&
    searching &&
    !searchPending &&
    searchSectionNavigation.length > 1;
  const mobileSearchPreview = isMobile
    ? firstSearchResultItem
      ? {
          label:
            firstSearchResultItem.sticker.label ??
            firstSearchResultItem.sticker.stickerId,
          totalCount: activeItems.length,
          sectionCount: searchSections.length,
          sourceLabel: recommendedSearchSection?.label ?? "搜索结果",
        }
      : null
    : null;
  const showCustomManageHint =
    !isMobile &&
    activeSectionId === "custom" &&
    trimmedKeyword.length === 0 &&
    customManageMode;
  const showManageSearchPauseHint =
    !isMobile &&
    activeSectionId === "custom" &&
    searching &&
    manageSearchPauseHintVisible;
  const customManageKeyboardActive =
    !isMobile && activeSectionId === "custom" && customManageMode && !searching;
  const desktopCustomHeaderContext =
    !isMobile && activeSectionId === "custom" && trimmedKeyword.length === 0;
  const customUploadResumed = Boolean(customDeleteFeedback?.slotsRemaining);
  const mobileCustomStorageSummary = isMobile
    ? customDeleteFeedback
      ? customDeleteFeedback.slotsRemaining > 0
        ? `本轮已腾出 ${customDeleteFeedback.slotsRemaining} 个空位，可继续添加图片或 GIF。`
        : `本轮已释放 ${customDeleteFeedback.deletedCount} 个位置。`
      : catalog.customStickerCount === 0
        ? "支持上传图片 / GIF，也能把聊天里的图片、动图添加到表情。"
        : customStickerLibraryFull
          ? "表情已满，先看最近添加，再直接点右上角删除。"
          : customSlotsRemaining <= 20
            ? "空间不多了，建议优先清理最近添加的临时表情。"
            : "支持继续添加图片和 GIF，常用表情会更好找。"
    : null;
  const mobileShowsCustomResumeUploadAction =
    isMobile && customUploadResumed && !customStickerLibraryFull;
  const mobileShowsCustomAddFirstAction =
    isMobile && catalog.customStickerCount === 0 && !customUploadResumed;
  const mobileShowsCustomAddedShortcut =
    isMobile &&
    catalog.customStickerCount > 1 &&
    customSortMode !== "added" &&
    (customUploadResumed ||
      customStickerLibraryFull ||
      customSlotsRemaining <= 20);
  const mobileShowsCustomDeleteHint =
    isMobile &&
    activeSectionId === "custom" &&
    trimmedKeyword.length === 0 &&
    catalog.customStickerCount > 0 &&
    (customStickerLibraryFull || customSlotsRemaining <= 20);
  const headerUsesManageShortcut =
    desktopCustomHeaderContext &&
    customStickerLibraryFull &&
    !customManageMode &&
    !uploadMutation.isPending;
  const headerUsesResumeUploadShortcut =
    desktopCustomHeaderContext &&
    customManageMode &&
    customUploadResumed &&
    !uploadMutation.isPending;
  const headerUploadButtonLabel = isMobile
    ? "添加"
    : headerUsesResumeUploadShortcut
      ? "继续添加"
      : headerUsesManageShortcut
        ? "去管理"
        : desktopCustomHeaderContext && catalog.customStickerCount === 0
          ? "添加第一张"
          : "添加表情";
  const headerUploadButtonTone = headerUsesResumeUploadShortcut
    ? "resume"
    : headerUsesManageShortcut
      ? "manage"
      : "default";
  const headerUploadButtonTitle = headerUsesManageShortcut
    ? "自定义表情已满，先去管理里删掉几张再继续添加。"
    : headerUsesResumeUploadShortcut
      ? "已经腾出空位，退出管理后可继续添加图片或 GIF。"
      : customStickerLibraryFull
        ? "自定义表情已满，请先删除几个再继续添加"
        : undefined;
  const openCustomManageMode = () => {
    setCustomSortMode("added");
    setCustomDeleteFeedback(null);
    setCustomManageMode(true);
  };
  const queueStickerDelete = (input: {
    sticker: StickerAttachment;
    nextFocusKey?: string | null;
    exitManageModeAfterDelete?: boolean;
  }) => {
    const stickerKey = getStickerIdentity(input.sticker);
    if (collapsingStickerKeysRef.current.has(stickerKey)) {
      return;
    }

    setStickerCollapsing(stickerKey, true);
    clearDeleteTransitionTimer(stickerKey);
    const timer = window.setTimeout(() => {
      deleteTransitionTimerRefs.current.delete(stickerKey);
      void deleteMutation.mutateAsync({
        stickerId: input.sticker.stickerId,
        stickerKey,
        label: input.sticker.label,
        nextFocusKey: input.nextFocusKey,
        exitManageModeAfterDelete: input.exitManageModeAfterDelete,
      });
    }, 140);
    deleteTransitionTimerRefs.current.set(stickerKey, timer);
  };
  const clearSearch = () => {
    setKeyword("");
    setSearchKeyword("");
    window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  };
  const clearSearchAndResumeManage = () => {
    setKeyword("");
    setSearchKeyword("");
    setManageSearchPauseHintVisible(false);
    setCustomManageMode(true);
  };
  const switchToFeatured = () => {
    setKeyword("");
    setSearchKeyword("");
    onPackChange("featured");
  };
  const switchToCustom = () => {
    setKeyword("");
    setSearchKeyword("");
    onPackChange("custom");
  };
  const openUploadPicker = () => {
    uploadInputRef.current?.click();
  };
  const switchCustomSortToAdded = () => {
    setCustomSortMode("added");
    setCustomManageMode(false);
  };
  const exitManageModeAndOpenUpload = () => {
    setCustomManageMode(false);
    window.setTimeout(() => {
      openUploadPicker();
    }, 0);
  };

  useEffect(() => {
    if (
      !isMobile &&
      activeSectionId === "custom" &&
      trimmedKeyword.length > 0 &&
      customManageMode
    ) {
      setManageSearchPauseHintVisible(true);
    }

    if (activeSectionId !== "custom" || trimmedKeyword.length > 0) {
      setCustomManageMode(false);
    }
  }, [activeSectionId, customManageMode, isMobile, trimmedKeyword.length]);

  useEffect(() => {
    if (activeSectionId !== "custom" || trimmedKeyword.length === 0) {
      setManageSearchPauseHintVisible(false);
    }
  }, [activeSectionId, trimmedKeyword.length]);

  useEffect(() => {
    if (activeSectionId !== "custom" || trimmedKeyword.length > 0) {
      setCustomDeleteFeedback(null);
      setCustomDeleteFeedbackFlashActive(false);
      setManageFocusFlashKey(null);
      setFocusedManageDeleteKey(null);
      setPendingManageFocusKey(null);
      setShouldFocusCustomEmptyAction(false);
    }
  }, [activeSectionId, trimmedKeyword.length]);

  useEffect(() => {
    return () => {
      if (deleteFeedbackFlashTimerRef.current !== null) {
        window.clearTimeout(deleteFeedbackFlashTimerRef.current);
      }
      if (searchPreviewFlashTimerRef.current !== null) {
        window.clearTimeout(searchPreviewFlashTimerRef.current);
      }
      if (manageFocusFlashTimerRef.current !== null) {
        window.clearTimeout(manageFocusFlashTimerRef.current);
      }
      deleteTransitionTimerRefs.current.forEach((timer) =>
        window.clearTimeout(timer),
      );
      deleteTransitionTimerRefs.current.clear();
      collapsingStickerKeysRef.current.clear();
    };
  }, []);

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
    if (
      isMobile ||
      !searching ||
      searchPending ||
      activeStickerKeys.length === 0
    ) {
      setHighlightedStickerKey(null);
      return;
    }

    setHighlightedStickerKey((current) =>
      current && activeStickerKeys.includes(current)
        ? current
        : (activeStickerKeys[0] ?? null),
    );
  }, [activeStickerKeys, isMobile, searchPending, searching]);

  useEffect(() => {
    if (!highlightedStickerKey || isMobile || !searching || searchPending) {
      return;
    }

    const target = stickerItemRefs.current.get(highlightedStickerKey);
    target?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [highlightedStickerKey, isMobile, searchPending, searching]);

  useEffect(() => {
    if (
      isMobile ||
      !searching ||
      searchPending ||
      !highlightedSearchStickerKey
    ) {
      setSearchPreviewFlashKey(null);
      return;
    }

    triggerSearchPreviewFlash(highlightedSearchStickerKey);
  }, [highlightedSearchStickerKey, isMobile, searchPending, searching]);

  useEffect(() => {
    if (!pendingManageFocusKey || isMobile || !customManageMode || searching) {
      return;
    }

    const target = manageDeleteButtonRefs.current.get(pendingManageFocusKey);
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      target.focus();
    });
    setFocusedManageDeleteKey(pendingManageFocusKey);
    triggerManageFocusFlash(pendingManageFocusKey);
    setPendingManageFocusKey(null);
  }, [
    activeItems,
    customManageMode,
    isMobile,
    pendingManageFocusKey,
    searching,
  ]);

  useEffect(() => {
    if (!customManageKeyboardActive) {
      setManageFocusFlashKey(null);
      setFocusedManageDeleteKey(null);
      return;
    }

    if (
      focusedManageDeleteKey &&
      activeItems.some(
        (item) => getStickerIdentity(item.sticker) === focusedManageDeleteKey,
      )
    ) {
      return;
    }

    const firstCustomItem = activeItems.find((item) => item.canDelete);
    const firstStickerKey = firstCustomItem
      ? getStickerIdentity(firstCustomItem.sticker)
      : null;
    setFocusedManageDeleteKey(firstStickerKey);
    triggerManageFocusFlash(firstStickerKey);
  }, [activeItems, customManageKeyboardActive, focusedManageDeleteKey]);

  useEffect(() => {
    if (
      !shouldFocusCustomEmptyAction ||
      isMobile ||
      activeSectionId !== "custom" ||
      searching ||
      activeItems.length > 0
    ) {
      return;
    }

    const target = customEmptyActionButtonRef.current;
    if (!target) {
      return;
    }

    window.requestAnimationFrame(() => {
      target.focus();
    });
    setShouldFocusCustomEmptyAction(false);
  }, [
    activeItems.length,
    activeSectionId,
    isMobile,
    searching,
    shouldFocusCustomEmptyAction,
  ]);

  const moveSearchHighlight = (delta: number) => {
    if (!activeStickerKeys.length) {
      return;
    }

    setHighlightedStickerKey((current) => {
      const currentIndex = current ? activeStickerKeys.indexOf(current) : -1;
      const baseIndex =
        currentIndex >= 0
          ? currentIndex
          : delta >= 0
            ? 0
            : activeStickerKeys.length - 1;
      const nextIndex = Math.max(
        0,
        Math.min(activeStickerKeys.length - 1, baseIndex + delta),
      );
      return activeStickerKeys[nextIndex] ?? null;
    });
  };

  const jumpSearchHighlight = (target: "first" | "last") => {
    if (!activeStickerKeys.length) {
      return;
    }

    setHighlightedStickerKey(
      target === "first"
        ? (activeStickerKeys[0] ?? null)
        : (activeStickerKeys[activeStickerKeys.length - 1] ?? null),
    );
  };

  const jumpSearchHighlightBySection = (direction: -1 | 1) => {
    if (!searchSectionNavigation.length) {
      return;
    }

    setHighlightedStickerKey((current) => {
      const currentSectionIndex = current
        ? searchSectionNavigation.findIndex((section) =>
            section.itemKeys.includes(current),
          )
        : -1;
      if (currentSectionIndex < 0) {
        return direction > 0
          ? (searchSectionNavigation[0]?.itemKeys[0] ?? current ?? null)
          : (searchSectionNavigation[searchSectionNavigation.length - 1]
              ?.itemKeys[0] ??
              current ??
              null);
      }

      const nextIndex = currentSectionIndex + direction;
      if (nextIndex < 0 || nextIndex >= searchSectionNavigation.length) {
        return current;
      }

      return searchSectionNavigation[nextIndex]?.itemKeys[0] ?? current;
    });
  };

  const focusManageDeleteButton = (stickerKey: string | null) => {
    if (!stickerKey) {
      return;
    }

    const target = manageDeleteButtonRefs.current.get(stickerKey);
    if (!target) {
      return;
    }

    target.focus();
  };

  const moveManageDeleteFocus = (delta: number) => {
    const customItemKeys = activeItems
      .filter((item) => item.canDelete)
      .map((item) => getStickerIdentity(item.sticker));
    if (!customItemKeys.length) {
      return;
    }

    const currentIndex = focusedManageDeleteKey
      ? customItemKeys.indexOf(focusedManageDeleteKey)
      : -1;
    const baseIndex =
      currentIndex >= 0
        ? currentIndex
        : delta >= 0
          ? 0
          : customItemKeys.length - 1;
    const nextIndex = Math.max(
      0,
      Math.min(customItemKeys.length - 1, baseIndex + delta),
    );
    const nextKey = customItemKeys[nextIndex] ?? null;
    setFocusedManageDeleteKey(nextKey);
    focusManageDeleteButton(nextKey);
    triggerManageFocusFlash(nextKey);
  };

  const handleSelectHighlightedSticker = () => {
    if (!activeItems.length) {
      return;
    }

    const highlightedItem = highlightedStickerKey
      ? activeItems.find(
          (item) => getStickerIdentity(item.sticker) === highlightedStickerKey,
        )
      : null;
    const targetItem = highlightedItem ?? activeItems[0];
    if (targetItem) {
      onSelect(targetItem.sticker);
    }
  };

  const handleSearchInputKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (
      !isMobile &&
      searching &&
      !searchPending &&
      activeItems.length > 0 &&
      trimmedKeyword.length > 0
    ) {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSearchHighlight(1);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSearchHighlight(-1);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSearchHighlight(4);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSearchHighlight(-4);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        jumpSearchHighlight("first");
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        jumpSearchHighlight("last");
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        jumpSearchHighlightBySection(1);
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        jumpSearchHighlightBySection(-1);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleSelectHighlightedSticker();
      }
    }
  };

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

  const renderStickerGrid = (items: StickerPanelItem[]) => (
    <div
      className={
        isMobile ? "grid grid-cols-4 gap-1.5" : "grid grid-cols-4 gap-2"
      }
    >
      {items.map(({ sticker, canDelete }) => {
        const stickerKey = getStickerIdentity(sticker);
        return (
          <StickerButton
            key={stickerKey}
            itemRef={(node) => {
              if (node) {
                stickerItemRefs.current.set(stickerKey, node);
                return;
              }

              stickerItemRefs.current.delete(stickerKey);
            }}
            compact={isMobile}
            sticker={sticker}
            highlighted={
              !isMobile && searching && highlightedStickerKey === stickerKey
            }
            showDelete={
              Boolean(canDelete) && (!isMobile ? customManageMode : true)
            }
            deleteAlwaysVisible={
              Boolean(canDelete) && (isMobile || customManageMode)
            }
            selectionDisabled={
              !isMobile && customManageMode && Boolean(canDelete)
            }
            deleting={collapsingStickerKeySet.has(stickerKey)}
            deleteFocused={
              !isMobile &&
              customManageMode &&
              Boolean(canDelete) &&
              focusedManageDeleteKey === stickerKey
            }
            deleteFocusFlashing={manageFocusFlashKey === stickerKey}
            previewFlashing={
              !isMobile && searching && searchPreviewFlashKey === stickerKey
            }
            searchRecommended={firstSearchResultKey === stickerKey}
            deleteButtonRef={(node) => {
              if (node) {
                manageDeleteButtonRefs.current.set(stickerKey, node);
                return;
              }

              manageDeleteButtonRefs.current.delete(stickerKey);
            }}
            onDelete={
              canDelete
                ? () => {
                    const nextFocusKey =
                      !isMobile &&
                      activeSectionId === "custom" &&
                      customManageMode &&
                      !searching
                        ? resolveAdjacentStickerKey(activeItems, stickerKey)
                        : null;
                    queueStickerDelete({
                      sticker,
                      nextFocusKey,
                      exitManageModeAfterDelete:
                        !isMobile &&
                        activeSectionId === "custom" &&
                        customManageMode &&
                        !searching &&
                        activeItems.length === 1,
                    });
                  }
                : undefined
            }
            onHover={() => {
              if (!isMobile && searching) {
                setHighlightedStickerKey(stickerKey);
              }
            }}
            onDeleteFocus={() => {
              if (customManageKeyboardActive && canDelete) {
                setFocusedManageDeleteKey(stickerKey);
              }
            }}
            onDeleteHover={() => {
              if (!isMobile && customManageMode && canDelete) {
                setFocusedManageDeleteKey(stickerKey);
              }
            }}
            onDeleteKeyDown={(event) => {
              if (!customManageKeyboardActive || !canDelete) {
                return;
              }

              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveManageDeleteFocus(1);
                return;
              }

              if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveManageDeleteFocus(-1);
                return;
              }

              if (event.key === "ArrowDown") {
                event.preventDefault();
                moveManageDeleteFocus(4);
                return;
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                moveManageDeleteFocus(-4);
                return;
              }

              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                event.stopPropagation();
                queueStickerDelete({
                  sticker,
                  nextFocusKey: resolveAdjacentStickerKey(
                    activeItems,
                    stickerKey,
                  ),
                  exitManageModeAfterDelete: activeItems.length === 1,
                });
              }
            }}
            onSelect={onSelect}
          />
        );
      })}
    </div>
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
                onClick={() => {
                  if (customManageMode) {
                    setCustomManageMode(false);
                    return;
                  }

                  openCustomManageMode();
                }}
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
              onClick={() => {
                if (headerUsesResumeUploadShortcut) {
                  exitManageModeAndOpenUpload();
                  return;
                }

                if (headerUsesManageShortcut) {
                  openCustomManageMode();
                  return;
                }

                openUploadPicker();
              }}
              disabled={
                uploadMutation.isPending ||
                (customStickerLibraryFull && !headerUsesManageShortcut)
              }
              title={headerUploadButtonTitle}
              className={
                isMobile
                  ? "rounded-full bg-white px-2.5 py-1 text-[11px] text-[#3f4b5f] transition active:bg-[#f5f5f5] disabled:opacity-45"
                  : `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-45 ${
                      headerUploadButtonTone === "resume"
                        ? "border-[rgba(160,90,10,0.18)] bg-[rgba(160,90,10,0.12)] text-[#9a5a0a] hover:bg-[rgba(160,90,10,0.18)]"
                        : "border-[color:var(--border-subtle)] bg-white text-[color:var(--text-primary)] hover:bg-[color:var(--surface-console)]"
                    }`
              }
            >
              {uploadMutation.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : headerUsesResumeUploadShortcut ? (
                <Plus size={13} />
              ) : headerUsesManageShortcut ? (
                <Trash2 size={13} />
              ) : (
                <Plus size={13} />
              )}
              {headerUploadButtonLabel}
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
              onKeyDown={handleSearchInputKeyDown}
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
          {showManageSearchPauseHint ? (
            <div className="px-1 pt-2">
              <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[rgba(160,90,10,0.18)] bg-[rgba(255,251,235,0.94)] px-3 py-2 text-[11px] text-[color:var(--text-secondary)]">
                <span>
                  搜索中已暂停删除管理，清空搜索后可继续从当前自定义表情开始删。
                </span>
                <button
                  type="button"
                  onClick={clearSearchAndResumeManage}
                  className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#9a5a0a] shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-[color:var(--surface-console)]"
                >
                  继续管理
                </button>
              </div>
            </div>
          ) : null}
          {showSearchKeyboardHint ? (
            <div className="px-1 pt-2">
              {highlightedSearchItem ? (
                <div
                  className={`mb-2 flex items-center justify-between gap-3 rounded-[14px] border px-3 py-2 text-[11px] transition ${
                    searchPreviewFlashKey === highlightedSearchStickerKey
                      ? "border-[rgba(160,90,10,0.26)] bg-[rgba(255,248,220,0.98)] shadow-[0_8px_18px_rgba(160,90,10,0.12)]"
                      : "border-[rgba(160,90,10,0.18)] bg-[rgba(255,251,235,0.94)]"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border bg-white transition ${
                        searchPreviewFlashKey === highlightedSearchStickerKey
                          ? "border-[rgba(160,90,10,0.26)] shadow-[0_6px_14px_rgba(160,90,10,0.12)]"
                          : "border-white/90"
                      }`}
                    >
                      <img
                        src={highlightedSearchItem.sticker.url}
                        alt={
                          highlightedSearchItem.sticker.label ??
                          highlightedSearchItem.sticker.stickerId
                        }
                        className="h-8 w-8 object-contain"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-[#9a5a0a]">
                        回车发送：
                        {highlightedSearchItem.sticker.label ??
                          highlightedSearchItem.sticker.stickerId}
                      </div>
                      <div className="truncate pt-0.5 text-[color:var(--text-secondary)]">
                        来源：{highlightedSearchSourceLabel ?? "搜索结果"}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {highlightedSearchSection ? (
                          <span className="rounded-full bg-white/88 px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                            当前来源 · {highlightedSearchSection.label}
                          </span>
                        ) : null}
                        {highlightedSearchSection &&
                        highlightedSearchSectionState?.highlightedPosition ? (
                          <span className="rounded-full bg-white/88 px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                            本组{" "}
                            {highlightedSearchSectionState.highlightedPosition}/
                            {highlightedSearchSection.items.length}
                          </span>
                        ) : null}
                        {recommendedSearchSection &&
                        recommendedSearchSection.id !==
                          highlightedSearchSection?.id ? (
                          <span className="rounded-full bg-[rgba(160,90,10,0.12)] px-2 py-1 text-[10px] text-[#9a5a0a] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                            默认回车 · {recommendedSearchSection.label}
                          </span>
                        ) : null}
                      </div>
                      {highlightedSearchSectionLeadSticker &&
                      highlightedSearchSectionState?.highlightedPosition &&
                      highlightedSearchSectionState.highlightedPosition > 1 &&
                      getStickerIdentity(
                        highlightedSearchSectionLeadSticker,
                      ) !== firstSearchResultKey ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/92 px-1.5 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                            <img
                              src={highlightedSearchSectionLeadSticker.url}
                              alt={
                                highlightedSearchSectionLeadSticker.label ??
                                highlightedSearchSectionLeadSticker.stickerId
                              }
                              className="h-4 w-4 rounded-[6px] object-contain"
                              loading="lazy"
                            />
                            <span className="truncate">
                              本组首项：
                              {highlightedSearchSectionLeadSticker.label ??
                                highlightedSearchSectionLeadSticker.stickerId}
                            </span>
                            {highlightedSearchSection ? (
                              <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] text-[color:var(--text-secondary)]">
                                {highlightedSearchSection.label}
                              </span>
                            ) : null}
                          </div>
                          {searchItemOffsetWithinSectionLabel ? (
                            <span className="rounded-full bg-white/92 px-1.5 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                              {searchItemOffsetWithinSectionLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {firstSearchResultItem &&
                      firstSearchResultKey !== highlightedSearchStickerKey ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/92 px-1.5 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                            <img
                              src={firstSearchResultItem.sticker.url}
                              alt={
                                firstSearchResultItem.sticker.label ??
                                firstSearchResultItem.sticker.stickerId
                              }
                              className="h-4 w-4 rounded-[6px] object-contain"
                              loading="lazy"
                            />
                            <span className="truncate">
                              默认先发：
                              {firstSearchResultItem.sticker.label ??
                                firstSearchResultItem.sticker.stickerId}
                            </span>
                            {recommendedSearchSection ? (
                              <span className="rounded-full bg-[rgba(160,90,10,0.12)] px-1.5 py-0.5 text-[9px] text-[#9a5a0a]">
                                {recommendedSearchSection.label}
                              </span>
                            ) : null}
                          </div>
                          {searchSectionOffsetLabel ? (
                            <span className="rounded-full bg-[rgba(160,90,10,0.12)] px-1.5 py-1 text-[10px] text-[#9a5a0a] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                              {searchSectionOffsetLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {highlightedSearchPosition === 1 ? (
                      <span className="rounded-full bg-[rgba(160,90,10,0.14)] px-2 py-1 text-[10px] font-medium text-[#9a5a0a] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                        默认推荐
                      </span>
                    ) : null}
                    {highlightedSearchPosition &&
                    highlightedSearchPosition > 1 ? (
                      <span className="inline-flex max-w-[140px] items-center rounded-full bg-white/88 px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                        <span className="truncate">
                          Home{" "}
                          {firstSearchResultItem?.sticker.label ??
                            firstSearchResultItem?.sticker.stickerId ??
                            "回默认"}
                        </span>
                      </span>
                    ) : null}
                    {highlightedSearchPosition &&
                    highlightedSearchPosition < activeItems.length ? (
                      <span className="inline-flex max-w-[140px] items-center rounded-full bg-white/88 px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                        <span className="truncate">
                          End{" "}
                          {lastSearchResultItem?.sticker.label ??
                            lastSearchResultItem?.sticker.stickerId ??
                            "末项"}
                        </span>
                      </span>
                    ) : null}
                    {showSearchSectionJumpHint && previousSearchSectionLabel ? (
                      <span className="rounded-full bg-white/88 px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                        PgUp {previousSearchSectionLabel}
                      </span>
                    ) : null}
                    {showSearchSectionJumpHint && nextSearchSectionLabel ? (
                      <span className="rounded-full bg-white/88 px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                        PgDn {nextSearchSectionLabel}
                      </span>
                    ) : null}
                    {highlightedSearchPosition ? (
                      <span className="rounded-full bg-white/88 px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                        {highlightedSearchPosition}/{activeItems.length}
                      </span>
                    ) : null}
                    <span className="rounded-full bg-white px-2 py-1 text-[10px] text-[#9a5a0a] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                      {highlightedSearchPosition === 1
                        ? "Enter 发首推"
                        : "Enter 发当前"}
                    </span>
                  </div>
                </div>
              ) : null}
              <div className="text-[11px] text-[color:var(--text-muted)]">
                <span className="rounded-full bg-white/88 px-2 py-1">
                  ↑↓←→ 选择
                </span>
                <span className="ml-2 rounded-full bg-white/88 px-2 py-1">
                  Enter 发当前
                </span>
                <span className="ml-2 rounded-full bg-white/88 px-2 py-1">
                  Home 回默认
                </span>
                <span className="ml-2 rounded-full bg-white/88 px-2 py-1">
                  End 末项
                </span>
                {showSearchSectionJumpHint ? (
                  <>
                    <span className="ml-2 rounded-full bg-white/88 px-2 py-1">
                      PgUp 上组
                    </span>
                    <span className="ml-2 rounded-full bg-white/88 px-2 py-1">
                      PgDn 下组
                    </span>
                  </>
                ) : null}
                <span className="ml-2 rounded-full bg-white/88 px-2 py-1">
                  Esc 清空
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={
            isMobile
              ? "min-h-0 flex-1 overflow-y-auto px-3 pb-2.5"
              : "min-h-[280px] max-h-[360px] overflow-y-auto px-1 pb-3"
          }
        >
          {showCustomStorageMeter ? (
            <div
              className={
                isMobile
                  ? `mb-2 rounded-[14px] border px-3 py-2.5 transition ${
                      customStorageTone === "danger"
                        ? "border-[rgba(239,68,68,0.22)] bg-[rgba(254,242,242,0.96)]"
                        : customStorageTone === "warning"
                          ? "border-[rgba(245,158,11,0.24)] bg-[rgba(255,251,235,0.96)]"
                          : "border-[color:var(--border-subtle)] bg-white"
                    } ${
                      customDeleteFeedbackFlashActive
                        ? "shadow-[0_10px_24px_rgba(160,90,10,0.12)] ring-1 ring-[rgba(160,90,10,0.16)]"
                        : ""
                    }`
                  : `mb-3 rounded-[18px] border px-3 py-3 transition ${
                      customStorageTone === "danger"
                        ? "border-[rgba(239,68,68,0.22)] bg-[rgba(254,242,242,0.96)]"
                        : customStorageTone === "warning"
                          ? "border-[rgba(245,158,11,0.24)] bg-[rgba(255,251,235,0.96)]"
                          : "border-[color:var(--border-subtle)] bg-white/84"
                    } ${
                      customDeleteFeedbackFlashActive
                        ? "shadow-[0_12px_28px_rgba(160,90,10,0.14)] ring-1 ring-[rgba(160,90,10,0.18)]"
                        : ""
                    }`
              }
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-medium text-[color:var(--text-primary)]">
                    自定义表情库
                  </div>
                  <div className="pt-0.5 text-[11px] text-[color:var(--text-secondary)]">
                    已保存 {catalog.customStickerCount} /{" "}
                    {catalog.maxCustomStickerCount}
                  </div>
                </div>
                <div
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    customStorageTone === "danger"
                      ? "bg-[rgba(239,68,68,0.12)] text-[#b91c1c]"
                      : customStorageTone === "warning"
                        ? "bg-[rgba(245,158,11,0.14)] text-[#9a5a0a]"
                        : "bg-[rgba(15,23,42,0.06)] text-[color:var(--text-primary)]"
                  } ${customDeleteFeedbackFlashActive ? "animate-pulse" : ""}`}
                >
                  {customStickerLibraryFull
                    ? "已满"
                    : `剩余 ${customSlotsRemaining}`}
                </div>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[rgba(15,23,42,0.08)]">
                <div
                  className={`h-full rounded-full transition-[width] ${
                    customStorageTone === "danger"
                      ? "bg-[linear-gradient(90deg,#ef4444,#f97316)]"
                      : customStorageTone === "warning"
                        ? "bg-[linear-gradient(90deg,#f59e0b,#f97316)]"
                        : "bg-[linear-gradient(90deg,#f59e0b,#d97706)]"
                  }`}
                  style={{
                    width: `${
                      catalog.customStickerCount > 0
                        ? Math.max(6, Math.round(customStorageRatio * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              {isMobile ? (
                <div className="mt-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-2 text-[11px] text-[color:var(--text-secondary)]">
                    <span className="min-w-0 flex-1 leading-4">
                      {mobileCustomStorageSummary}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {customDeleteFeedback ? (
                        <span
                          className={`rounded-full bg-[rgba(160,90,10,0.12)] px-2 py-1 text-[10px] font-medium text-[#9a5a0a] ${
                            customDeleteFeedbackFlashActive
                              ? "animate-pulse"
                              : ""
                          }`}
                        >
                          +{customDeleteFeedback.deletedCount} 空位
                        </span>
                      ) : null}
                      <span>{Math.round(customStorageRatio * 100)}%</span>
                    </div>
                  </div>
                  {customDeleteFeedback ? (
                    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-[color:var(--text-secondary)]">
                      {customDeleteFeedback.lastDeletedLabel ? (
                        <span
                          className={`rounded-full bg-white/88 px-2 py-1 ${
                            customDeleteFeedbackFlashActive
                              ? "text-[#9a5a0a]"
                              : ""
                          }`}
                        >
                          最近删除：{customDeleteFeedback.lastDeletedLabel}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-white/88 px-2 py-1">
                        剩余 {customDeleteFeedback.remainingCount}
                      </span>
                    </div>
                  ) : null}
                  {mobileShowsCustomAddFirstAction ||
                  mobileShowsCustomResumeUploadAction ||
                  mobileShowsCustomAddedShortcut ||
                  mobileShowsCustomDeleteHint ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {mobileShowsCustomResumeUploadAction ? (
                        <button
                          type="button"
                          onClick={openUploadPicker}
                          disabled={uploadMutation.isPending}
                          className="rounded-full bg-[rgba(160,90,10,0.14)] px-2.5 py-1 text-[11px] font-medium text-[#9a5a0a] transition active:bg-[rgba(160,90,10,0.18)] disabled:opacity-45"
                        >
                          {catalog.customStickerCount === 0
                            ? "继续添加表情"
                            : "继续添加"}
                        </button>
                      ) : null}
                      {mobileShowsCustomAddFirstAction ? (
                        <>
                          <button
                            type="button"
                            onClick={openUploadPicker}
                            disabled={uploadMutation.isPending}
                            className="rounded-full bg-[rgba(160,90,10,0.14)] px-2.5 py-1 text-[11px] font-medium text-[#9a5a0a] transition active:bg-[rgba(160,90,10,0.18)] disabled:opacity-45"
                          >
                            添加第一张
                          </button>
                          <button
                            type="button"
                            onClick={switchToFeatured}
                            className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)] transition active:bg-[color:var(--surface-console)]"
                          >
                            去精选看看
                          </button>
                        </>
                      ) : null}
                      {mobileShowsCustomAddedShortcut ? (
                        <button
                          type="button"
                          onClick={switchCustomSortToAdded}
                          className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)] transition active:bg-[color:var(--surface-console)]"
                        >
                          看最近添加
                        </button>
                      ) : null}
                      {mobileShowsCustomDeleteHint ? (
                        <span className="rounded-full bg-[rgba(245,158,11,0.12)] px-2 py-1 text-[10px] text-[#9a5a0a]">
                          直接点右上角删除
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px] text-[color:var(--text-secondary)]">
                    <span>
                      {customDeleteFeedback
                        ? customDeleteFeedback.slotsRemaining > 0
                          ? `本轮已腾出 ${customDeleteFeedback.slotsRemaining} 个空位，可继续添加图片或 GIF。`
                          : `本轮已释放 ${customDeleteFeedback.deletedCount} 个位置。`
                        : catalog.customStickerCount === 0
                          ? "支持上传图片 / GIF，也能把聊天里的图片、动图添加到表情。"
                          : customStickerLibraryFull
                            ? "表情库已占满，删除后才能继续导入。"
                            : customSlotsRemaining <= 20
                              ? "空间不多了，建议先清理不常用表情。"
                              : "支持继续添加图片和 GIF，建议保留常用项。"}
                    </span>
                    <div className="flex items-center gap-2">
                      {customDeleteFeedback ? (
                        <span
                          className={`rounded-full bg-[rgba(160,90,10,0.12)] px-2 py-1 text-[10px] font-medium text-[#9a5a0a] ${
                            customDeleteFeedbackFlashActive
                              ? "animate-pulse"
                              : ""
                          }`}
                        >
                          +{customDeleteFeedback.deletedCount} 空位
                        </span>
                      ) : null}
                      <span>{Math.round(customStorageRatio * 100)}%</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {catalog.customStickerCount === 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={openUploadPicker}
                          className="rounded-full bg-[rgba(160,90,10,0.14)] px-3 py-1.5 text-xs font-medium text-[#9a5a0a] transition hover:bg-[rgba(160,90,10,0.18)]"
                        >
                          添加第一张
                        </button>
                        <button
                          type="button"
                          onClick={switchToFeatured}
                          className="rounded-full bg-white/88 px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-white"
                        >
                          去精选看看
                        </button>
                      </>
                    ) : customManageMode ? (
                      <>
                        {customUploadResumed ? (
                          <button
                            type="button"
                            onClick={exitManageModeAndOpenUpload}
                            className="rounded-full bg-[rgba(160,90,10,0.14)] px-3 py-1.5 text-xs font-medium text-[#9a5a0a] transition hover:bg-[rgba(160,90,10,0.18)]"
                          >
                            现在去添加
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setCustomManageMode(false)}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                        >
                          {customUploadResumed ? "继续清理" : "完成清理"}
                        </button>
                      </>
                    ) : (
                      <>
                        {customStickerLibraryFull ||
                        customSlotsRemaining <= 20 ? (
                          <button
                            type="button"
                            onClick={openCustomManageMode}
                            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-primary)] transition hover:bg-[color:var(--surface-console)]"
                          >
                            去清理
                          </button>
                        ) : null}
                        {catalog.customStickerCount > 1 &&
                        customSortMode !== "added" ? (
                          <button
                            type="button"
                            onClick={switchCustomSortToAdded}
                            className="rounded-full bg-white/88 px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-white"
                          >
                            看最近添加
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
          {showCustomManageHint ? (
            <div
              className={`mb-3 flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2.5 text-xs text-[color:var(--text-secondary)] transition ${
                customDeleteFeedbackFlashActive
                  ? "border-[rgba(160,90,10,0.18)] bg-[rgba(255,251,235,0.94)] shadow-[0_8px_20px_rgba(160,90,10,0.08)]"
                  : "border-[rgba(15,23,42,0.08)] bg-white/82"
              }`}
            >
              <span>
                {customDeleteFeedback
                  ? `已删除 ${customDeleteFeedback.deletedCount} 张，现在还能再加 ${customDeleteFeedback.slotsRemaining} 张。`
                  : customStickerLibraryFull
                    ? "表情已满：先删 1 张，删完会自动顺到下一张。"
                    : "管理中：点击表情右上角删除，删完会自动顺到下一张，按 Esc 可直接完成。"}
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-white/88 px-2 py-1 text-[11px] text-[color:var(--text-secondary)]">
                  ↑↓←→ 切换
                </span>
                <span className="rounded-full bg-white/88 px-2 py-1 text-[11px] text-[color:var(--text-secondary)]">
                  Delete 删除
                </span>
                {customDeleteFeedback?.slotsRemaining ? (
                  <button
                    type="button"
                    onClick={exitManageModeAndOpenUpload}
                    className="rounded-full bg-[rgba(160,90,10,0.14)] px-2.5 py-1 text-[11px] font-medium text-[#9a5a0a] transition hover:bg-[rgba(160,90,10,0.18)]"
                  >
                    现在去添加
                  </button>
                ) : null}
                {focusedManageSticker ? (
                  <span
                    className={`max-w-[140px] truncate rounded-full px-2 py-1 text-[11px] text-[color:var(--text-primary)] transition ${
                      manageFocusFlashKey === focusedManageDeleteKey
                        ? "bg-[rgba(160,90,10,0.14)] shadow-[0_4px_12px_rgba(160,90,10,0.12)]"
                        : "bg-[rgba(15,23,42,0.06)]"
                    }`}
                  >
                    当前：
                    {focusedManageSticker.label ??
                      focusedManageSticker.stickerId}
                  </span>
                ) : null}
                {focusedManageStickerPosition ? (
                  <span className="rounded-full bg-white/88 px-2 py-1 text-[11px] text-[color:var(--text-secondary)]">
                    当前 {focusedManageStickerPosition}/
                    {manageableCustomItems.length}
                  </span>
                ) : null}
                {nextManageSticker && manageableCustomItems.length > 1 ? (
                  <span className="max-w-[150px] truncate rounded-full bg-white/88 px-2 py-1 text-[11px] text-[color:var(--text-secondary)]">
                    删后跳到：
                    {nextManageSticker.label ?? nextManageSticker.stickerId}
                  </span>
                ) : null}
                {nextManageDeleteOutcomeLabel ? (
                  <span className="rounded-full bg-[rgba(160,90,10,0.12)] px-2 py-1 text-[11px] text-[#9a5a0a]">
                    {nextManageDeleteOutcomeLabel}
                  </span>
                ) : null}
                {customDeleteFeedback?.lastDeletedLabel ? (
                  <span
                    className={`rounded-full bg-[rgba(160,90,10,0.12)] px-2 py-1 text-[11px] text-[#9a5a0a] ${
                      customDeleteFeedbackFlashActive ? "animate-pulse" : ""
                    }`}
                  >
                    最近删除：{customDeleteFeedback.lastDeletedLabel}
                  </span>
                ) : null}
                <span className="rounded-full bg-[rgba(15,23,42,0.06)] px-2 py-1 text-[11px] text-[color:var(--text-primary)]">
                  剩余{" "}
                  {customDeleteFeedback?.remainingCount ??
                    catalog.customStickerCount}
                </span>
              </div>
            </div>
          ) : null}
          {showCustomSortBar ? (
            <div
              className={
                isMobile
                  ? "mb-2 flex items-center gap-1.5"
                  : "mb-3 flex items-center gap-2"
              }
            >
              {(
                [
                  ["recent", "最近使用"],
                  ["added", "最近添加"],
                ] as const
              ).map(([mode, label]) => {
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
              {!isMobile && !customManageMode ? (
                <div className="flex shrink-0 items-center gap-2">
                  {!customStickerLibraryFull &&
                  customSlotsRemaining <= 20 &&
                  catalog.customStickerCount > 1 &&
                  customSortMode !== "added" ? (
                    <button
                      type="button"
                      onClick={switchCustomSortToAdded}
                      className="rounded-full bg-white/88 px-3 py-1 text-[11px] font-medium text-[color:var(--text-secondary)] shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                    >
                      看最近添加
                    </button>
                  ) : null}
                  {customStickerLibraryFull || customSlotsRemaining <= 20 ? (
                    <button
                      type="button"
                      onClick={openCustomManageMode}
                      className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-[#92400e] shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                    >
                      {customStickerLibraryFull ? "去管理" : "去清理"}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
          {stickerCatalogQuery.isLoading && !stickerCatalogQuery.data ? (
            <div className="flex min-h-[160px] items-center justify-center text-sm text-[color:var(--text-secondary)]">
              <Loader2 size={16} className="mr-2 animate-spin" />
              正在载入表情...
            </div>
          ) : activeItems.length ? (
            searching ? (
              <div className={isMobile ? "space-y-3" : "space-y-4"}>
                {mobileSearchPreview ? (
                  <div className="rounded-[14px] border border-[rgba(160,90,10,0.16)] bg-[rgba(255,251,235,0.94)] px-3 py-2.5 text-[11px] text-[color:var(--text-secondary)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[#9a5a0a]">
                        首推来自 {mobileSearchPreview.sourceLabel}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] text-[color:var(--text-secondary)]">
                        {mobileSearchPreview.totalCount} 项
                      </span>
                    </div>
                    <div className="pt-1 leading-4">
                      默认先看 {mobileSearchPreview.label}
                      {mobileSearchPreview.sectionCount > 1
                        ? `，共 ${mobileSearchPreview.sectionCount} 组来源`
                        : ""}
                      。
                    </div>
                  </div>
                ) : null}
                {searchSections.map((section) => {
                  const sectionState = searchSectionStateMap.get(
                    section.id,
                  ) ?? {
                    containsHighlighted: false,
                    containsRecommended: false,
                    highlightedPosition: null,
                  };
                  return (
                    <section
                      key={section.id}
                      className={
                        isMobile
                          ? "space-y-1.5"
                          : `space-y-2 rounded-[18px] px-2 py-2 transition ${
                              sectionState.containsHighlighted
                                ? "bg-[rgba(255,248,220,0.52)] ring-1 ring-[rgba(160,90,10,0.12)]"
                                : sectionState.containsRecommended
                                  ? "bg-white/52"
                                  : ""
                            }`
                      }
                    >
                      <div className="flex items-center justify-between px-0.5">
                        <div className="inline-flex items-center gap-2 text-[color:var(--text-secondary)]">
                          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgba(160,90,10,0.12)] px-1.5 text-[10px] font-semibold text-[#9a5a0a]">
                            {section.badgeText}
                          </span>
                          <span
                            className={
                              isMobile ? "text-[11px]" : "text-xs font-medium"
                            }
                          >
                            {section.label}
                          </span>
                          {isMobile && sectionState.containsRecommended ? (
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] text-[#9a5a0a]">
                              首推
                            </span>
                          ) : null}
                          {!isMobile && sectionState.containsHighlighted ? (
                            <span className="rounded-full bg-[rgba(160,90,10,0.14)] px-2 py-1 text-[10px] font-medium text-[#9a5a0a]">
                              当前高亮
                            </span>
                          ) : null}
                          {!isMobile && sectionState.highlightedPosition ? (
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                              本组 {sectionState.highlightedPosition}/
                              {section.items.length}
                            </span>
                          ) : null}
                          {!isMobile &&
                          !sectionState.containsHighlighted &&
                          sectionState.containsRecommended ? (
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] text-[color:var(--text-secondary)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                              默认回车
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {!isMobile &&
                          sectionState.containsHighlighted &&
                          sectionState.containsRecommended ? (
                            <span className="rounded-full bg-white/88 px-2 py-1 text-[10px] text-[#9a5a0a]">
                              首项所在分组
                            </span>
                          ) : null}
                          <span className="text-[10px] text-[color:var(--text-muted)]">
                            {section.items.length}
                          </span>
                        </div>
                      </div>
                      {renderStickerGrid(section.items)}
                    </section>
                  );
                })}
              </div>
            ) : (
              renderStickerGrid(activeItems)
            )
          ) : (
            <div className="flex min-h-[160px] items-center justify-center rounded-[18px] border border-dashed border-[color:var(--border-subtle)] bg-white/70 px-5 text-center text-sm text-[color:var(--text-secondary)]">
              <div className="flex max-w-[240px] flex-col items-center gap-3">
                <div>
                  {searching
                    ? `没有找到“${trimmedKeyword}”相关表情`
                    : activeSectionId === "custom"
                      ? customDeleteFeedback?.deletedCount
                        ? "自定义表情已经清空，可以继续添加新的图片或 GIF。"
                        : "还没有自定义表情，可上传图片 / GIF，也能把聊天里的图片、动图添加到表情。"
                      : activeSectionId === "recent"
                        ? "最近还没有使用过表情。"
                        : "当前没有可用表情。"}
                </div>
                {searching ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={clearSearch}
                        className="rounded-full bg-[rgba(160,90,10,0.14)] px-3 py-1.5 text-xs font-medium text-[#9a5a0a] transition hover:bg-[rgba(160,90,10,0.18)]"
                      >
                        清空重试
                      </button>
                      {activeSectionId !== "featured" ? (
                        <button
                          type="button"
                          onClick={switchToFeatured}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
                        >
                          看精选
                        </button>
                      ) : null}
                      {catalog.customStickerCount > 0 &&
                      activeSectionId !== "custom" ? (
                        <button
                          type="button"
                          onClick={switchToCustom}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
                        >
                          看自定义
                        </button>
                      ) : null}
                      {activeSectionId === "custom" &&
                      catalog.customStickerCount > 1 &&
                      customSortMode !== "added" ? (
                        <button
                          type="button"
                          onClick={switchCustomSortToAdded}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
                        >
                          看最近添加
                        </button>
                      ) : null}
                    </div>
                    <div className="text-[11px] text-[color:var(--text-muted)]">
                      试试换个关键词，或者先看看精选 / 自定义里的常用表情
                    </div>
                  </div>
                ) : null}
                {!searching && activeSectionId === "custom" ? (
                  <div className="flex flex-col items-center gap-2">
                    {customDeleteFeedback?.deletedCount ? (
                      <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] text-[color:var(--text-secondary)]">
                        <span className="rounded-full bg-[rgba(160,90,10,0.12)] px-2 py-1 text-[#9a5a0a]">
                          已清空 · 释放 {customDeleteFeedback.deletedCount}{" "}
                          个位置
                        </span>
                        <span className="rounded-full bg-white/88 px-2 py-1">
                          现在可继续添加图片或 GIF
                        </span>
                        {customDeleteFeedback.lastDeletedLabel ? (
                          <span className="rounded-full bg-white/88 px-2 py-1">
                            最近删除：{customDeleteFeedback.lastDeletedLabel}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        ref={customEmptyActionButtonRef}
                        type="button"
                        onClick={openUploadPicker}
                        disabled={
                          uploadMutation.isPending || customStickerLibraryFull
                        }
                        className="rounded-full bg-[rgba(160,90,10,0.14)] px-3 py-1.5 text-xs font-medium text-[#9a5a0a] transition disabled:opacity-45"
                      >
                        {customDeleteFeedback?.deletedCount
                          ? "继续添加表情"
                          : "添加第一张表情"}
                      </button>
                      {isMobile || !customDeleteFeedback?.deletedCount ? (
                        <button
                          type="button"
                          onClick={switchToFeatured}
                          className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] transition hover:bg-[color:var(--surface-console)]"
                        >
                          去精选看看
                        </button>
                      ) : null}
                    </div>
                    {!customDeleteFeedback?.deletedCount ? (
                      <div className="text-[11px] text-[color:var(--text-muted)]">
                        聊天里的图片 / GIF 也能添加为表情
                      </div>
                    ) : isMobile ? (
                      <div className="text-[11px] text-[color:var(--text-muted)]">
                        也可以先去精选看看，再回来继续补自己的表情
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!searching && activeSectionId === "recent" ? (
                  <button
                    type="button"
                    onClick={switchToFeatured}
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
  itemRef,
  deleteButtonRef,
  compact = false,
  sticker,
  highlighted = false,
  deleting = false,
  deleteFocused = false,
  deleteFocusFlashing = false,
  previewFlashing = false,
  searchRecommended = false,
  showDelete = false,
  deleteAlwaysVisible = false,
  selectionDisabled = false,
  onDelete,
  onHover,
  onDeleteFocus,
  onDeleteHover,
  onDeleteKeyDown,
  onSelect,
}: {
  itemRef?: (node: HTMLDivElement | null) => void;
  deleteButtonRef?: (node: HTMLButtonElement | null) => void;
  compact?: boolean;
  sticker: StickerAttachment;
  highlighted?: boolean;
  deleting?: boolean;
  deleteFocused?: boolean;
  deleteFocusFlashing?: boolean;
  previewFlashing?: boolean;
  searchRecommended?: boolean;
  showDelete?: boolean;
  deleteAlwaysVisible?: boolean;
  selectionDisabled?: boolean;
  onDelete?: () => void;
  onHover?: () => void;
  onDeleteFocus?: () => void;
  onDeleteHover?: () => void;
  onDeleteKeyDown?: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (sticker: StickerAttachment) => void;
}) {
  return (
    <div
      ref={itemRef}
      onMouseEnter={onHover}
      className={
        compact
          ? `group relative flex flex-col items-center justify-center rounded-[11px] border p-2 transition-[transform,opacity,filter,box-shadow,background-color] duration-150 ease-out active:bg-[color:var(--surface-card-hover)] ${
              searchRecommended
                ? "border-[rgba(160,90,10,0.28)] bg-[rgba(255,248,220,0.92)] shadow-[0_6px_14px_rgba(160,90,10,0.12)]"
                : "border-[color:var(--border-subtle)] bg-white"
            } ${
              deleting
                ? "pointer-events-none scale-[0.84] opacity-0 saturate-50"
                : ""
            } ${deleteFocused ? "border-[rgba(160,90,10,0.35)]" : ""}`
          : `group relative flex flex-col items-center gap-1 rounded-[18px] border bg-white/76 p-2 transition-[transform,opacity,filter,box-shadow,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_18px_rgba(160,90,10,0.12)] ${
              highlighted
                ? "border-[rgba(160,90,10,0.38)] bg-white shadow-[0_10px_22px_rgba(160,90,10,0.18)]"
                : "border-white/80"
            } ${
              deleting
                ? "pointer-events-none scale-[0.8] opacity-0 saturate-50"
                : ""
            } ${
              deleteFocused
                ? "border-[rgba(160,90,10,0.42)] bg-white shadow-[0_10px_24px_rgba(160,90,10,0.16)] ring-1 ring-[rgba(160,90,10,0.18)]"
                : ""
            } ${
              deleteFocusFlashing
                ? "scale-[1.02] shadow-[0_14px_30px_rgba(160,90,10,0.2)]"
                : ""
            } ${
              previewFlashing
                ? "scale-[1.03] shadow-[0_16px_34px_rgba(160,90,10,0.22)]"
                : ""
            }`
      }
    >
      {searchRecommended ? (
        <span
          className={
            compact
              ? "absolute left-1 top-1 z-10 rounded-full bg-[rgba(160,90,10,0.14)] px-1.5 py-0.5 text-[9px] font-medium text-[#9a5a0a] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              : "absolute left-1.5 top-1.5 z-10 rounded-full bg-[rgba(160,90,10,0.14)] px-2 py-0.5 text-[10px] font-medium text-[#9a5a0a] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          }
        >
          首推
        </span>
      ) : null}
      {showDelete && onDelete ? (
        <span className="absolute right-1 top-1 z-10">
          <button
            ref={deleteButtonRef}
            type="button"
            onFocus={onDeleteFocus}
            onMouseEnter={onDeleteHover}
            onKeyDown={onDeleteKeyDown}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDelete();
            }}
            className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-white transition ${
              deleteFocused
                ? "bg-[#9a5a0a] shadow-[0_4px_12px_rgba(160,90,10,0.28)]"
                : "bg-[rgba(15,23,42,0.72)]"
            } ${deleteFocusFlashing ? "scale-110" : ""} ${
              deleteAlwaysVisible
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label="删除自定义表情"
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Trash2 size={11} />
            )}
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
        onFocus={onHover}
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
          <span
            className={`line-clamp-1 text-[11px] ${
              highlighted
                ? "text-[#9a5a0a]"
                : "text-[color:var(--text-secondary)]"
            }`}
          >
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
    return [] as StickerSearchSection[];
  }

  const items = new Map<
    string,
    {
      sticker: StickerAttachment;
      canDelete?: boolean;
      score: number;
      sectionId: string;
      sectionLabel: string;
      sectionBadgeText: string;
    }
  >();

  input.recentStickerEntries.forEach((entry, index) => {
    const score =
      320 +
      computeSearchScore(query, [
        entry.sticker.label,
        entry.sticker.stickerId,
      ]) +
      computeRankBoost(index, 72);
    if (score <= 320) {
      return;
    }

    upsertSearchItem(items, {
      sticker: entry.sticker,
      canDelete: entry.sticker.sourceType === "custom",
      score,
      sectionId: "recent",
      sectionLabel: "最近使用",
      sectionBadgeText: "近",
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
      sectionId: "custom",
      sectionLabel: "自定义",
      sectionBadgeText: "自",
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
        sectionId: pack.id,
        sectionLabel: pack.title,
        sectionBadgeText: pack.title.slice(0, 1),
      });
    });
  });

  const sortedItems = [...items.values()].sort(
    (left, right) => right.score - left.score,
  );
  const sections = new Map<string, StickerSearchSection>();
  const sectionOrder: string[] = [];

  sortedItems.forEach((item) => {
    if (!sections.has(item.sectionId)) {
      sections.set(item.sectionId, {
        id: item.sectionId,
        label: item.sectionLabel,
        badgeText: item.sectionBadgeText,
        items: [],
      });
      sectionOrder.push(item.sectionId);
    }

    sections.get(item.sectionId)?.items.push({
      sticker: item.sticker,
      canDelete: item.canDelete,
    });
  });

  return sectionOrder
    .map((sectionId) => sections.get(sectionId))
    .filter((section): section is StickerSearchSection => Boolean(section));
}

function getStickerIdentity(sticker: StickerAttachment) {
  return `${sticker.sourceType ?? "builtin"}:${sticker.packId ?? ""}:${sticker.stickerId}`;
}

function upsertSearchItem(
  items: Map<
    string,
    {
      sticker: StickerAttachment;
      canDelete?: boolean;
      score: number;
      sectionId: string;
      sectionLabel: string;
      sectionBadgeText: string;
    }
  >,
  next: {
    sticker: StickerAttachment;
    canDelete?: boolean;
    score: number;
    sectionId: string;
    sectionLabel: string;
    sectionBadgeText: string;
  },
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
    sectionId: next.score >= current.score ? next.sectionId : current.sectionId,
    sectionLabel:
      next.score >= current.score ? next.sectionLabel : current.sectionLabel,
    sectionBadgeText:
      next.score >= current.score
        ? next.sectionBadgeText
        : current.sectionBadgeText,
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

function resolveAdjacentStickerKey(
  items: StickerPanelItem[],
  currentKey: string,
) {
  const currentIndex = items.findIndex(
    (item) => getStickerIdentity(item.sticker) === currentKey,
  );
  if (currentIndex < 0) {
    return null;
  }

  const nextItem = items[currentIndex + 1];
  if (nextItem) {
    return getStickerIdentity(nextItem.sticker);
  }

  const previousItem = items[currentIndex - 1];
  return previousItem ? getStickerIdentity(previousItem.sticker) : null;
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DesktopMiniProgramsWorkspace } from "../features/desktop/mini-programs/desktop-mini-programs-workspace";
import {
  featuredMiniProgramIds,
  getMiniProgramEntry,
  miniProgramEntries,
  type MiniProgramCategoryId,
} from "../features/mini-programs/mini-programs-data";
import { MobileMiniProgramsWorkspace } from "../features/mini-programs/mobile-mini-programs-workspace";
import { useMiniProgramsState } from "../features/mini-programs/use-mini-programs-state";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

function resolveDefaultMiniProgramId() {
  return featuredMiniProgramIds[0] ?? miniProgramEntries[0]?.id ?? "";
}

export function MiniProgramsPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const {
    activeMiniProgramId,
    launchCountById,
    lastOpenedAtById,
    pinnedMiniProgramIds,
    recentMiniProgramIds,
    dismissActiveMiniProgram,
    openMiniProgram,
    togglePinned,
  } = useMiniProgramsState();
  const [activeCategory, setActiveCategory] =
    useState<MiniProgramCategoryId>("all");
  const [searchText, setSearchText] = useState("");
  const [selectedMiniProgramId, setSelectedMiniProgramId] = useState(
    resolveDefaultMiniProgramId(),
  );
  const [successNotice, setSuccessNotice] = useState("");

  const visibleMiniPrograms = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return miniProgramEntries.filter((item) => {
      if (activeCategory !== "all" && item.category !== activeCategory) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      return [
        item.name,
        item.slogan,
        item.description,
        item.developer,
        item.deckLabel,
        item.openHint,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [activeCategory, searchText]);

  useEffect(() => {
    if (!getMiniProgramEntry(selectedMiniProgramId)) {
      setSelectedMiniProgramId(resolveDefaultMiniProgramId());
    }
  }, [selectedMiniProgramId]);

  useEffect(() => {
    if (!visibleMiniPrograms.length) {
      return;
    }

    if (
      !visibleMiniPrograms.some((item) => item.id === selectedMiniProgramId)
    ) {
      setSelectedMiniProgramId(visibleMiniPrograms[0].id);
    }
  }, [selectedMiniProgramId, visibleMiniPrograms]);

  useEffect(() => {
    if (!successNotice) {
      return;
    }

    const timer = window.setTimeout(() => setSuccessNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [successNotice]);

  function handleOpenMiniProgram(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    openMiniProgram(miniProgramId);
    setSelectedMiniProgramId(miniProgramId);
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已加入最近使用，当前先由小程序面板承接。`,
    );
  }

  function handleTogglePinnedMiniProgram(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const pinned = pinnedMiniProgramIds.includes(miniProgramId);
    togglePinned(miniProgramId);
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已${pinned ? "移出" : "加入"}我的小程序。`,
    );
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }

    void navigate({ to: "/tabs/discover" });
  }

  if (isDesktopLayout) {
    return (
      <DesktopMiniProgramsWorkspace
        activeCategory={activeCategory}
        activeMiniProgramId={activeMiniProgramId}
        launchCountById={launchCountById}
        lastOpenedAtById={lastOpenedAtById}
        pinnedMiniProgramIds={pinnedMiniProgramIds}
        recentMiniProgramIds={recentMiniProgramIds}
        searchText={searchText}
        selectedMiniProgramId={selectedMiniProgramId}
        successNotice={successNotice}
        visibleMiniPrograms={visibleMiniPrograms}
        onCategoryChange={setActiveCategory}
        onDismissActiveMiniProgram={dismissActiveMiniProgram}
        onOpenMiniProgram={handleOpenMiniProgram}
        onSearchTextChange={setSearchText}
        onSelectMiniProgram={setSelectedMiniProgramId}
        onTogglePinnedMiniProgram={handleTogglePinnedMiniProgram}
      />
    );
  }

  return (
    <MobileMiniProgramsWorkspace
      activeCategory={activeCategory}
      activeMiniProgramId={activeMiniProgramId}
      launchCountById={launchCountById}
      lastOpenedAtById={lastOpenedAtById}
      pinnedMiniProgramIds={pinnedMiniProgramIds}
      recentMiniProgramIds={recentMiniProgramIds}
      searchText={searchText}
      selectedMiniProgramId={selectedMiniProgramId}
      successNotice={successNotice}
      visibleMiniPrograms={visibleMiniPrograms}
      onBack={handleBack}
      onCategoryChange={setActiveCategory}
      onDismissActiveMiniProgram={dismissActiveMiniProgram}
      onOpenMiniProgram={handleOpenMiniProgram}
      onSearchTextChange={setSearchText}
      onSelectMiniProgram={setSelectedMiniProgramId}
      onTogglePinnedMiniProgram={handleTogglePinnedMiniProgram}
    />
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DesktopMiniProgramsWorkspace } from "../features/desktop/mini-programs/desktop-mini-programs-workspace";
import {
  featuredMiniProgramIds,
  getMiniProgramEntry,
  miniProgramEntries,
  getMiniProgramWorkspaceTasks,
  type MiniProgramCategoryId,
} from "../features/mini-programs/mini-programs-data";
import { MobileMiniProgramsWorkspace } from "../features/mini-programs/mobile-mini-programs-workspace";
import { useMiniProgramsState } from "../features/mini-programs/use-mini-programs-state";
import {
  pushMobileHandoffRecord,
  resolveMobileHandoffLink,
} from "../features/shell/mobile-handoff-storage";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

function resolveDefaultMiniProgramId() {
  return featuredMiniProgramIds[0] ?? miniProgramEntries[0]?.id ?? "";
}

function resolveMiniProgramSelectionFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  const miniProgramId = new URLSearchParams(window.location.search).get(
    "miniProgram",
  );

  return miniProgramId && getMiniProgramEntry(miniProgramId)
    ? miniProgramId
    : null;
}

export function MiniProgramsPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const {
    activeMiniProgramId,
    completedTaskIdsByMiniProgramId,
    launchCountById,
    lastOpenedAtById,
    pinnedMiniProgramIds,
    recentMiniProgramIds,
    dismissActiveMiniProgram,
    openMiniProgram,
    toggleTaskCompletion,
    togglePinned,
  } = useMiniProgramsState();
  const [activeCategory, setActiveCategory] =
    useState<MiniProgramCategoryId>("all");
  const [searchText, setSearchText] = useState("");
  const [selectedMiniProgramId, setSelectedMiniProgramId] = useState(
    resolveMiniProgramSelectionFromLocation() ?? resolveDefaultMiniProgramId(),
  );
  const [successNotice, setSuccessNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "info">("success");

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
    setNoticeTone("success");
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已加入最近使用，当前已进入小程序工作台。`,
    );
  }

  function handleTogglePinnedMiniProgram(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const pinned = pinnedMiniProgramIds.includes(miniProgramId);
    togglePinned(miniProgramId);
    setNoticeTone("success");
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已${pinned ? "移出" : "加入"}我的小程序。`,
    );
  }

  function handleToggleMiniProgramTask(miniProgramId: string, taskId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const currentTasks = getMiniProgramWorkspaceTasks(
      miniProgramId,
      completedTaskIdsByMiniProgramId[miniProgramId] ?? [],
    );
    const task = currentTasks.find((item) => item.id === taskId);
    const completed = Boolean(task?.completed);
    toggleTaskCompletion(miniProgramId, taskId);
    setNoticeTone("success");
    setSuccessNotice(
      `${miniProgram?.name ?? "该小程序"} 已${completed ? "恢复" : "完成"}“${task?.title ?? "当前待办"}”。`,
    );
  }

  async function handleCopyMiniProgramToMobile(miniProgramId: string) {
    const miniProgram = getMiniProgramEntry(miniProgramId);
    const query = new URLSearchParams({ miniProgram: miniProgramId });
    const path = `/discover/mini-programs?${query.toString()}`;
    const link = resolveMobileHandoffLink(path);

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNoticeTone("info");
      setSuccessNotice("当前环境暂不支持复制到手机。");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      pushMobileHandoffRecord({
        description: `把 ${miniProgram?.name ?? "小程序"} 的当前工作台发到手机继续，保留最近使用和本地待办上下文。`,
        label: `${miniProgram?.name ?? "小程序"} 接力`,
        path,
      });
      setNoticeTone("success");
      setSuccessNotice(`${miniProgram?.name ?? "该小程序"} 已复制到手机接力链接。`);
    } catch {
      setNoticeTone("info");
      setSuccessNotice("复制到手机失败，请稍后重试。");
    }
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
        completedTaskIdsByMiniProgramId={completedTaskIdsByMiniProgramId}
        launchCountById={launchCountById}
        lastOpenedAtById={lastOpenedAtById}
        pinnedMiniProgramIds={pinnedMiniProgramIds}
        recentMiniProgramIds={recentMiniProgramIds}
        searchText={searchText}
        selectedMiniProgramId={selectedMiniProgramId}
        successNotice={successNotice}
        noticeTone={noticeTone}
        visibleMiniPrograms={visibleMiniPrograms}
        onCategoryChange={setActiveCategory}
        onCopyMiniProgramToMobile={handleCopyMiniProgramToMobile}
        onDismissActiveMiniProgram={dismissActiveMiniProgram}
        onOpenMiniProgram={handleOpenMiniProgram}
        onSearchTextChange={setSearchText}
        onSelectMiniProgram={setSelectedMiniProgramId}
        onToggleMiniProgramTask={handleToggleMiniProgramTask}
        onTogglePinnedMiniProgram={handleTogglePinnedMiniProgram}
      />
    );
  }

  return (
    <MobileMiniProgramsWorkspace
      activeCategory={activeCategory}
      activeMiniProgramId={activeMiniProgramId}
      completedTaskIdsByMiniProgramId={completedTaskIdsByMiniProgramId}
      launchCountById={launchCountById}
      lastOpenedAtById={lastOpenedAtById}
      pinnedMiniProgramIds={pinnedMiniProgramIds}
      recentMiniProgramIds={recentMiniProgramIds}
      searchText={searchText}
      selectedMiniProgramId={selectedMiniProgramId}
      successNotice={successNotice}
      noticeTone={noticeTone}
      visibleMiniPrograms={visibleMiniPrograms}
      onBack={handleBack}
      onCategoryChange={setActiveCategory}
      onDismissActiveMiniProgram={dismissActiveMiniProgram}
      onOpenMiniProgram={handleOpenMiniProgram}
      onSearchTextChange={setSearchText}
      onSelectMiniProgram={setSelectedMiniProgramId}
      onToggleMiniProgramTask={handleToggleMiniProgramTask}
      onTogglePinnedMiniProgram={handleTogglePinnedMiniProgram}
    />
  );
}

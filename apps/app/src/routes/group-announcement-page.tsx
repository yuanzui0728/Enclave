import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { Copy, Share2 } from "lucide-react";
import { getGroup, updateGroup } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { isMissingGroupError } from "../lib/group-route-fallback";
import {
  shareWithNativeShell,
} from "../runtime/mobile-bridge";
import { isNativeMobileShareSurface } from "../runtime/mobile-share-surface";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupAnnouncementPage() {
  const { groupId } = useParams({ from: "/group/$groupId/announcement" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const nativeMobileShareSupported = isNativeMobileShareSurface();
  const [notice, setNotice] = useState<{
    tone: "success" | "info";
    message: string;
  } | null>(null);

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(groupQuery.data?.announcement ?? "");
  }, [groupQuery.data?.announcement]);

  useEffect(() => {
    setNotice(null);
  }, [groupId]);

  useEffect(() => {
    if (groupQuery.isLoading || !isMissingGroupError(groupQuery.error, groupId)) {
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [groupId, groupQuery.error, groupQuery.isLoading, navigate]);

  async function handleShareAnnouncement() {
    const group = groupQuery.data;
    const announcement = draft.trim() || group?.announcement?.trim() || "";
    if (!group || !announcement) {
      setNotice({
        tone: "info",
        message: "当前还没有可分享的群公告。",
      });
      return;
    }

    const groupPath = `/group/${groupId}/announcement`;
    const groupUrl =
      typeof window === "undefined"
        ? groupPath
        : `${window.location.origin}${groupPath}`;
    const summary = [`${group.name} 群公告`, announcement, groupUrl].join("\n\n");

    if (nativeMobileShareSupported) {
      const shared = await shareWithNativeShell({
        title: `${group.name} 群公告`,
        text: summary,
        url: groupUrl,
      });

      if (shared) {
        setNotice({
          tone: "success",
          message: "已打开系统分享面板。",
        });
        return;
      }
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.clipboard ||
      typeof navigator.clipboard.writeText !== "function"
    ) {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "当前设备暂时无法打开系统分享，请稍后重试。"
          : "当前环境暂不支持复制群公告。",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(summary);
      setNotice({
        tone: "success",
        message: nativeMobileShareSupported
          ? "系统分享暂时不可用，已复制群公告。"
          : "群公告已复制。",
      });
    } catch {
      setNotice({
        tone: "info",
        message: nativeMobileShareSupported
          ? "系统分享失败，请稍后重试。"
          : "复制群公告失败，请稍后重试。",
      });
    }
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateGroup(
        groupId,
        { announcement: draft.trim() ? draft.trim() : null },
        baseUrl,
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["app-group", baseUrl, groupId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-saved-groups", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["app-conversations", baseUrl],
        }),
      ]);
      void navigate({
        to: "/group/$groupId/details",
        params: { groupId },
        replace: true,
      });
    },
  });

  return (
    <ChatDetailsShell
      title="群公告"
      subtitle={groupQuery.data?.name ?? "群聊信息"}
      onBack={() => {
        void navigate({
          to: "/group/$groupId/details",
          params: { groupId },
        });
      }}
      rightActions={
        groupQuery.data ? (
          <Button
            type="button"
            onClick={() => void handleShareAnnouncement()}
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full border-0 bg-transparent text-[color:var(--text-primary)] active:bg-[color:var(--surface-card-hover)]"
            aria-label={nativeMobileShareSupported ? "分享群公告" : "复制群公告"}
          >
            {nativeMobileShareSupported ? <Share2 size={18} /> : <Copy size={18} />}
          </Button>
        ) : undefined
      }
    >
      {groupQuery.isLoading ? <LoadingBlock label="正在读取群公告..." /> : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-4">
          <ErrorBlock message={groupQuery.error.message} />
        </div>
      ) : null}
      {notice ? (
        <div className="px-4">
          <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
        </div>
      ) : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <div className="px-4">
          <ErrorBlock message={saveMutation.error.message} />
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-4">
          <EmptyState
            title="群聊不存在"
            description="这个群聊暂时不可用，返回上一页再试一次。"
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title="群公告">
            <div className="px-4 py-4">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="写一条群公告，群成员会在聊天页看到它。"
                rows={8}
                className="min-h-44 w-full resize-none rounded-[10px] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] px-3 py-3 text-[15px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)] focus:border-[rgba(7,193,96,0.18)] focus:bg-white"
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                <span>留空后保存，会清空当前群公告。</span>
                <span>{draft.trim().length} 字</span>
              </div>
              <div className="mt-3 rounded-[10px] bg-[color:var(--surface-console)] px-3 py-2.5 text-[13px] leading-6 text-[color:var(--text-secondary)]">
                当前公告：{groupQuery.data.announcement?.trim() || "暂未设置"}
              </div>
            </div>
          </ChatDetailsSection>

          <div className="px-4">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="h-10 w-full rounded-[10px] bg-[color:var(--brand-primary)] text-white hover:opacity-95"
            >
              {saveMutation.isPending ? "正在保存..." : "保存群公告"}
            </Button>
          </div>
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { getGroup, updateGroup } from "@yinjie/contracts";
import { Button, ErrorBlock, LoadingBlock } from "@yinjie/ui";
import { EmptyState } from "../components/empty-state";
import { ChatDetailsShell } from "../features/chat-details/chat-details-shell";
import { ChatDetailsSection } from "../features/chat-details/chat-details-section";
import { isMissingGroupError } from "../lib/group-route-fallback";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function GroupAnnouncementPage() {
  const { groupId } = useParams({ from: "/group/$groupId/announcement" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;

  const groupQuery = useQuery({
    queryKey: ["app-group", baseUrl, groupId],
    queryFn: () => getGroup(groupId, baseUrl),
  });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(groupQuery.data?.announcement ?? "");
  }, [groupQuery.data?.announcement]);

  useEffect(() => {
    if (groupQuery.isLoading || !isMissingGroupError(groupQuery.error, groupId)) {
      return;
    }

    void navigate({ to: "/tabs/chat", replace: true });
  }, [groupId, groupQuery.error, groupQuery.isLoading, navigate]);

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
    >
      {groupQuery.isLoading ? <LoadingBlock label="正在读取群公告..." /> : null}
      {groupQuery.isError && groupQuery.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={groupQuery.error.message} />
        </div>
      ) : null}
      {saveMutation.isError && saveMutation.error instanceof Error ? (
        <div className="px-3">
          <ErrorBlock message={saveMutation.error.message} />
        </div>
      ) : null}

      {!groupQuery.isLoading && !groupQuery.data ? (
        <div className="px-3">
          <EmptyState
            title="群聊不存在"
            description="这个群聊暂时不可用，返回上一页再试一次。"
          />
        </div>
      ) : null}

      {groupQuery.data ? (
        <>
          <ChatDetailsSection title="当前公告">
            <div className="px-4 py-4">
              <div className="rounded-[12px] border border-black/6 bg-[#f7f7f7] px-4 py-3">
                {draft.trim() ? (
                  <div className="whitespace-pre-wrap text-[14px] leading-7 text-[color:var(--text-primary)]">
                    {draft.trim()}
                  </div>
                ) : (
                  <div className="text-[13px] text-[color:var(--text-muted)]">
                    暂未设置群公告
                  </div>
                )}
              </div>
            </div>
          </ChatDetailsSection>

          <ChatDetailsSection title="编辑公告">
            <div className="px-4 py-4">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="写一条群公告，群成员会在聊天页看到它。"
                rows={8}
                className="min-h-44 w-full resize-none rounded-[10px] border border-black/8 bg-white px-3 py-3 text-[15px] leading-6 text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
              <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-[color:var(--text-muted)]">
                <span>留空后保存，会清空当前群公告。</span>
                <span>{draft.trim().length} 字</span>
              </div>
            </div>
          </ChatDetailsSection>

          <div className="px-3">
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="h-10 w-full rounded-[10px] bg-[#07c160] text-white hover:bg-[#06ad56]"
            >
              {saveMutation.isPending ? "正在保存..." : "保存群公告"}
            </Button>
          </div>
        </>
      ) : null}
    </ChatDetailsShell>
  );
}

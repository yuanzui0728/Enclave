import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { FriendRequest } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, LoadingBlock, cn } from "@yinjie/ui";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AvatarChip } from "../../../components/avatar-chip";
import { EmptyState } from "../../../components/empty-state";

type DesktopContactsFriendRequestsPaneProps = {
  requests: FriendRequest[];
  loading: boolean;
  error?: string | null;
  actionError?: string | null;
  notice?: string | null;
  acceptPendingId?: string | null;
  declinePendingId?: string | null;
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
};

export function DesktopContactsFriendRequestsPane({
  requests,
  loading,
  error = null,
  actionError = null,
  notice = null,
  acceptPendingId = null,
  declinePendingId = null,
  onAccept,
  onDecline,
}: DesktopContactsFriendRequestsPaneProps) {
  const t = useRuntimeTranslator();
  const pendingCount = requests.filter(
    (item) => item.status === "pending",
  ).length;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[rgba(245,247,247,0.96)]">
      <div className="border-b border-[color:var(--border-faint)] bg-white/82 px-8 py-6 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="text-[22px] font-medium text-[color:var(--text-primary)]">
            {t(msg`新的朋友`)}
          </div>
          <div className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {pendingCount > 0
              ? t(msg`当前有 ${pendingCount} 条待处理好友申请`)
              : t(msg`查看收到的好友申请和处理结果。`)}
          </div>
        </div>
      </div>

      <div className="flex-1 px-8 py-6">
        {notice ? (
          <div className="mb-4">
            <InlineNotice tone="success">{notice}</InlineNotice>
          </div>
        ) : null}

        {actionError ? (
          <div className="mb-4">
            <InlineNotice tone="danger">{actionError}</InlineNotice>
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingBlock label={t(msg`正在读取好友请求...`)} />
          </div>
        ) : error ? (
          <ErrorBlock message={error} />
        ) : requests.length ? (
          <div className="space-y-3">
            {requests.map((request) => {
              const disabled =
                request.status !== "pending" ||
                Boolean(acceptPendingId || declinePendingId);

              return (
                <section
                  key={request.id}
                  className="rounded-[22px] border border-[color:var(--border-faint)] bg-white px-5 py-5 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start gap-4">
                    <AvatarChip
                      name={request.characterName}
                      src={request.characterAvatar}
                      size="wechat"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="truncate text-[16px] font-medium text-[color:var(--text-primary)]">
                            {request.characterName}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-[color:var(--text-muted)]">
                            <span>
                              {t(getFriendRequestSourceLabel(
                                request.triggerScene,
                              ))}
                            </span>
                            <span>·</span>
                            <span>
                              {formatFriendRequestDate(request.createdAt, t)}
                            </span>
                          </div>
                        </div>
                        <div
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px]",
                            request.status === "pending"
                              ? "bg-[rgba(250,204,21,0.10)] text-[#a16207]"
                              : request.status === "accepted"
                                ? "bg-[rgba(22,163,74,0.08)] text-[#15803d]"
                                : "bg-[rgba(226,232,240,0.88)] text-[color:var(--text-muted)]",
                          )}
                        >
                          {request.status === "pending"
                            ? t(msg`待处理`)
                            : request.status === "accepted"
                              ? t(msg`已通过`)
                              : t(msg`已忽略`)}
                        </div>
                      </div>

                      <div className="mt-4 rounded-[16px] bg-[rgba(245,247,247,0.92)] px-4 py-3 text-[14px] leading-7 text-[color:var(--text-secondary)]">
                        {request.greeting || t(msg`想认识你。`)}
                      </div>

                      <div className="mt-4 flex items-center justify-end gap-3">
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={disabled}
                          onClick={() => onDecline(request.id)}
                          className="rounded-[12px] border-[color:var(--border-faint)] bg-white px-5 shadow-none hover:bg-[color:var(--surface-console)]"
                        >
                          {declinePendingId === request.id
                            ? t(msg`处理中...`)
                            : t(msg`拒绝`)}
                        </Button>
                        <Button
                          variant="primary"
                          size="lg"
                          disabled={disabled}
                          onClick={() => onAccept(request.id)}
                          className="rounded-[12px] bg-[#07c160] px-5 text-white shadow-none hover:bg-[#06ad56]"
                        >
                          {acceptPendingId === request.id
                            ? t(msg`接受中...`)
                            : t(msg`接受`)}
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              title={t(msg`暂时没有新的好友请求`)}
              description={t(msg`等待世界里的相遇事件触发新的申请。`)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function getFriendRequestSourceLabel(triggerScene?: string): MessageDescriptor {
  if (!triggerScene) {
    return msg`新的朋友`;
  }

  if (triggerScene === "shake") {
    return msg`来自摇一摇`;
  }

  switch (triggerScene) {
    case "coffee_shop":
      return msg`来自咖啡馆`;
    case "gym":
      return msg`来自健身房`;
    case "library":
      return msg`来自图书馆`;
    case "park":
      return msg`来自公园`;
    case "classroom":
      return msg`来自教室`;
    case "lab":
      return msg`来自实验室`;
    case "office":
      return msg`来自办公室`;
    case "coworking":
      return msg`来自联合办公空间`;
    case "study_room":
      return msg`来自自习室`;
    case "restaurant":
      return msg`来自餐厅`;
    case "museum":
      return msg`来自博物馆`;
    case "bookstore":
      return msg`来自书店`;
    case "travel":
      return msg`来自旅途`;
    case "night_walk":
      return msg`来自夜晚的街道`;
    case "theater":
      return msg`来自剧场`;
    case "home":
      return msg`来自居家场景`;
    default:
      return msg`来自 ${triggerScene}`;
  }
}

function formatFriendRequestDate(
  createdAt: string,
  t: (descriptor: MessageDescriptor) => string,
) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  const sameMonth = sameYear && date.getMonth() === now.getMonth();
  const sameDay = sameMonth && date.getDate() === now.getDate();

  if (sameDay) {
    return t(msg`今天`);
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date).replace(/\//g, "-");
}

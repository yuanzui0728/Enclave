// i18n-ignore-start: cloud-console surface 字典里没有这组中文，直接走字面量。
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { formatDateTime } from "@yinjie/i18n";
import { ErrorBlock, InlineNotice, LoadingBlock } from "@yinjie/ui";
import type { WikiPrivateCharacterDetail } from "@yinjie/contracts";
import { cloudAdminApi } from "../lib/cloud-admin-api";
import { SurfaceCard } from "../components/ui";

function formatTimestamp(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTime(date, { dateStyle: "medium", timeStyle: "short" });
}

function CharacterCard({ record }: { record: WikiPrivateCharacterDetail }) {
  const [expanded, setExpanded] = useState(false);
  // avatar 加载失败时退回到字母圆，否则一张坏图会在卡片左上留一个空白块
  const [avatarBroken, setAvatarBroken] = useState(false);
  const showAvatar = !!record.avatar && !avatarBroken;
  return (
    <div className="rounded-[20px] border border-[color:var(--border-faint)] bg-white p-4">
      <div className="flex items-start gap-3">
        {showAvatar ? (
          <img
            src={record.avatar}
            alt={record.name}
            className="h-12 w-12 flex-none rounded-full object-cover"
            onError={() => setAvatarBroken(true)}
          />
        ) : (
          <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[#f3f3f3] text-[color:var(--text-muted)]">
            {record.name.slice(0, 1) || "?"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-base font-semibold text-[color:var(--text-primary)]">
              {record.name}
            </h3>
            <span className="text-xs text-[color:var(--text-muted)]">
              {record.relationshipType || "-"}
              {record.relationship ? `（${record.relationship}）` : ""}
            </span>
          </div>
          {record.bio ? (
            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">
              {record.bio}
            </p>
          ) : null}
          <div className="mt-1 text-xs text-[color:var(--text-muted)]">
            创建于 {formatTimestamp(record.createdAt)} · 更新于{" "}
            {formatTimestamp(record.updatedAt)}
          </div>
          {record.expertDomains?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {record.expertDomains.map((domain) => (
                <span
                  key={domain}
                  className="rounded-full bg-[#eaf6ec] px-2 py-0.5 text-xs text-[#2e7d5b]"
                >
                  {domain}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex-none rounded-2xl border border-[color:var(--border-subtle)] bg-white px-3 py-1 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
        >
          {expanded ? "收起" : "完整详情"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-[color:var(--border-faint)] pt-3 text-sm">
          <Section title="personality">
            {record.personality ? (
              <pre className="whitespace-pre-wrap break-words text-[color:var(--text-primary)]">
                {record.personality}
              </pre>
            ) : (
              <Muted />
            )}
          </Section>

          <Section title="triggerScenes">
            {record.triggerScenes?.length ? (
              <ul className="ml-5 list-disc text-[color:var(--text-primary)]">
                {record.triggerScenes.map((scene, i) => (
                  <li key={`${i}-${scene.slice(0, 20)}`}>{scene}</li>
                ))}
              </ul>
            ) : (
              <Muted />
            )}
          </Section>

          <Section title="profile">
            {record.profile ? (
              <JsonBlock value={record.profile} />
            ) : (
              <Muted />
            )}
          </Section>

          <Section title="recipe">
            {record.recipe ? <JsonBlock value={record.recipe} /> : <Muted />}
          </Section>

          <Section title="raw id / owner">
            <code className="text-xs text-[color:var(--text-muted)]">
              id={record.id}
              {"  "}
              ownerUserId={record.ownerUserId}
            </code>
          </Section>
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function Muted() {
  return <span className="text-[color:var(--text-muted)]">（空）</span>;
}

function JsonBlock({ value }: { value: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return (
    <pre className="max-h-96 overflow-auto rounded-2xl bg-[#0f1115] p-3 text-xs leading-relaxed text-[#dee1e8]">
      {text}
    </pre>
  );
}

export function WikiUserDetailPage() {
  const { userId } = useParams({ from: "/wiki-users/$userId" });
  const detailQuery = useQuery({
    queryKey: ["cloud-console", "wiki-user-detail", userId],
    queryFn: () => cloudAdminApi.listWikiUserPrivateCharacters(userId),
  });

  return (
    <div className="space-y-4">
      <SurfaceCard className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Link
              to="/wiki-users"
              className="text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
            >
              ← 返回 wiki用户列表
            </Link>
            <h1 className="mt-1 text-xl font-semibold text-[color:var(--text-primary)]">
              {detailQuery.data?.username ?? userId}
            </h1>
            <div className="text-xs text-[color:var(--text-muted)]">
              userId: <code>{userId}</code>
            </div>
          </div>
          {detailQuery.data ? (
            <div className="rounded-2xl border border-[color:var(--border-faint)] bg-white px-3 py-2 text-right text-sm">
              <div className="text-xs text-[color:var(--text-muted)]">
                私有角色总数
              </div>
              <div className="text-lg font-semibold text-[color:var(--brand-primary)]">
                {detailQuery.data.items.length}
              </div>
            </div>
          ) : null}
        </div>
      </SurfaceCard>

      {detailQuery.isLoading ? <LoadingBlock label="加载私有角色中..." /> : null}
      {detailQuery.isError ? (
        <ErrorBlock
          message={
            detailQuery.error instanceof Error
              ? detailQuery.error.message
              : "加载私有角色失败"
          }
        />
      ) : null}

      {detailQuery.data && !detailQuery.data.items.length ? (
        <InlineNotice tone="muted">
          该用户还没有创建任何私有角色。
        </InlineNotice>
      ) : null}

      {detailQuery.data?.items.length ? (
        <div className="space-y-3">
          {detailQuery.data.items.map((record) => (
            <CharacterCard key={record.id} record={record} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
// i18n-ignore-end

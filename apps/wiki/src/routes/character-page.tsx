import { useEffect, useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  StatusPill,
  TagBadge,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import { hasRole } from "../lib/auth-store";
import { useAuth } from "../lib/use-auth";
import {
  wikiApi,
  type WikiContentSnapshot,
  type WikiPageView,
} from "../lib/wiki-api";

type Tab = "read" | "edit" | "history";

export function CharacterPage() {
  const { characterId } = useParams({ from: "/character/$characterId" });
  const [tab, setTab] = useState<Tab>("read");
  const pageQ = useQuery({
    queryKey: ["wiki", "page", characterId],
    queryFn: () => wikiApi.getPage(characterId),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] pb-2">
        <TabButton active={tab === "read"} onClick={() => setTab("read")}>
          阅读
        </TabButton>
        <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
          编辑
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          历史
        </TabButton>
        {pageQ.data && (
          <ProtectionInfo level={pageQ.data.page.protectionLevel} />
        )}
      </div>

      {pageQ.isLoading && <LoadingBlock />}
      {pageQ.isError && <ErrorBlock message={(pageQ.error as Error).message} />}
      {pageQ.data && tab === "read" && <ReadView view={pageQ.data} />}
      {pageQ.data && tab === "edit" && (
        <EditView
          characterId={characterId}
          view={pageQ.data}
          onSubmitted={() => {
            void pageQ.refetch();
            setTab("read");
          }}
        />
      )}
      {pageQ.data && tab === "history" && <HistoryView characterId={characterId} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm rounded-t border-b-2 ${
        active
          ? "border-[var(--brand-primary)] text-[var(--text-primary)] font-medium"
          : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {children}
    </button>
  );
}

function ProtectionInfo({ level }: { level: string }) {
  if (level === "none") return null;
  return (
    <StatusPill className="ml-auto">
      {level === "semi" ? "半保护" : "完全保护"}
    </StatusPill>
  );
}

function ReadView({ view }: { view: WikiPageView }) {
  const c = view.content;
  return (
    <Card className="p-6 space-y-4">
      <header className="flex items-start gap-4">
        {c.avatar && (
          <img
            src={c.avatar}
            alt={c.name}
            className="w-20 h-20 rounded-full object-cover bg-gray-100"
          />
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{c.name}</h1>
          <div className="text-sm text-[var(--text-muted)] mt-1">
            {c.relationship} · {c.relationshipType}
          </div>
        </div>
      </header>
      <Section label="简介">{c.bio || "—"}</Section>
      {c.personality && <Section label="性格">{c.personality}</Section>}
      {c.expertDomains.length > 0 && (
        <Section label="专长领域">
          <div className="flex flex-wrap gap-2">
            {c.expertDomains.map((d) => (
              <TagBadge key={d}>{d}</TagBadge>
            ))}
          </div>
        </Section>
      )}
      {c.triggerScenes && c.triggerScenes.length > 0 && (
        <Section label="触发场景">
          <div className="flex flex-wrap gap-2">
            {c.triggerScenes.map((s) => (
              <TagBadge key={s}>{s}</TagBadge>
            ))}
          </div>
        </Section>
      )}
      <footer className="text-xs text-[var(--text-muted)] pt-3 border-t border-[var(--border-subtle)]">
        当前版本：
        {view.currentRevision
          ? `v${view.currentRevision.version} · 由 ${view.currentRevision.editorUserId} 提交于 ${new Date(view.currentRevision.createdAt).toLocaleString()}`
          : "尚未有 wiki 版本（显示后台原始数据）"}
      </footer>
    </Card>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-medium text-[var(--text-muted)] mb-1">
        {label}
      </h3>
      <div className="text-sm leading-7">{children}</div>
    </section>
  );
}

function EditView({
  characterId,
  view,
  onSubmitted,
}: {
  characterId: string;
  view: WikiPageView;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const initial = useMemo<WikiContentSnapshot>(
    () => ({
      ...view.content,
      personality: view.content.personality ?? "",
      triggerScenes: view.content.triggerScenes ?? [],
    }),
    [view.content],
  );
  const [draft, setDraft] = useState<WikiContentSnapshot>(initial);
  const [summary, setSummary] = useState("");
  const [isMinor, setIsMinor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => setDraft(initial), [initial]);

  const submitMut = useMutation({
    mutationFn: () =>
      wikiApi.submitEdit(characterId, {
        contentSnapshot: draft,
        baseRevisionId: view.page.currentRevisionId,
        editSummary: summary,
        isMinor,
      }),
    onSuccess: (res) => {
      setError(null);
      setInfo(
        res.appliedToCharacter
          ? "修改已直接生效（自动确认/巡查员/管理员）"
          : "修改已提交，等待巡查员审核",
      );
      setTimeout(onSubmitted, 800);
    },
    onError: (err: Error) => {
      setInfo(null);
      setError(err.message);
    },
  });

  if (!user) {
    return (
      <Card className="p-6">
        <p>请先登录后再编辑。</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        当前你的权限是<strong className="mx-1">{user.role}</strong>
        。仅可编辑下列<strong>内容字段</strong>，运行参数（模型、活跃度等）请去后台修改。
      </p>
      <FormRow label="名称">
        <TextField
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </FormRow>
      <FormRow label="头像 URL">
        <TextField
          value={draft.avatar}
          onChange={(e) => setDraft({ ...draft, avatar: e.target.value })}
        />
      </FormRow>
      <FormRow label="关系描述">
        <TextField
          value={draft.relationship}
          onChange={(e) =>
            setDraft({ ...draft, relationship: e.target.value })
          }
        />
      </FormRow>
      <FormRow label="关系类型">
        <TextField
          value={draft.relationshipType}
          onChange={(e) =>
            setDraft({ ...draft, relationshipType: e.target.value })
          }
        />
      </FormRow>
      <FormRow label="角色简介（bio）">
        <TextAreaField
          rows={4}
          value={draft.bio}
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
        />
      </FormRow>
      <FormRow label="性格 ⚠ 影响 AI 行为">
        <TextAreaField
          rows={3}
          value={draft.personality ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, personality: e.target.value })
          }
        />
      </FormRow>
      <FormRow label="专长领域（逗号分隔） ⚠ 影响 AI 行为">
        <TextField
          value={draft.expertDomains.join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              expertDomains: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </FormRow>
      <FormRow label="触发场景（逗号分隔） ⚠ 影响 AI 行为">
        <TextField
          value={(draft.triggerScenes ?? []).join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              triggerScenes: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </FormRow>
      <FormRow label="修改摘要">
        <TextField
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="例如：补充了职业信息"
          maxLength={500}
        />
      </FormRow>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isMinor}
          onChange={(e) => setIsMinor(e.target.checked)}
        />
        小修改（错别字、格式调整等）
      </label>
      {error && <ErrorBlock message={error} />}
      {info && (
        <div className="text-sm text-[var(--state-success-text,#0a7d4f)]">
          {info}
        </div>
      )}
      <div className="flex gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={submitMut.isPending}
          onClick={() => submitMut.mutate()}
        >
          {submitMut.isPending ? "提交中..." : "提交编辑"}
        </Button>
      </div>
    </Card>
  );
}

function FormRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function HistoryView({ characterId }: { characterId: string }) {
  const historyQ = useQuery({
    queryKey: ["wiki", "history", characterId],
    queryFn: () => wikiApi.getHistory(characterId),
  });
  if (historyQ.isLoading) return <LoadingBlock />;
  if (historyQ.isError)
    return <ErrorBlock message={(historyQ.error as Error).message} />;
  return (
    <Card className="p-4">
      {historyQ.data && historyQ.data.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">还没有任何编辑记录。</p>
      )}
      <ul className="divide-y divide-[var(--border-subtle)]">
        {historyQ.data?.map((rev) => (
          <li key={rev.id} className="py-3 flex items-start gap-3">
            <div className="w-12 text-sm font-mono text-[var(--text-muted)]">
              v{rev.version}
            </div>
            <div className="flex-1">
              <div className="text-sm">
                <strong>{rev.editorUserId}</strong>
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  {rev.editorRoleAtTime}
                </span>
                <span className="ml-2 text-xs text-[var(--text-muted)]">
                  {new Date(rev.createdAt).toLocaleString()}
                </span>
              </div>
              {rev.editSummary && (
                <div className="text-sm mt-1">{rev.editSummary}</div>
              )}
              <div className="text-xs text-[var(--text-muted)] mt-1">
                状态：{rev.status} · 来源：{rev.changeSource}
                {rev.isPatrolled ? " · 已巡查" : ""}
                {rev.isMinor ? " · 小修改" : ""}
              </div>
              {rev.diffFromParent?.changed && (
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  改动字段：{rev.diffFromParent.changed.join(", ")}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

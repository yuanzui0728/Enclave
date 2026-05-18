/**
 * 世界角色创建页（/create）—— thin parent。
 *
 * 和 world-character-edit-page.tsx 同构，只是：
 * - mode='create'（CharacterEditForm 把保存按钮文案换成创建态）
 * - 没有现有 page 要 hydrate；可选地接受一个 characterId 输入框（路径名）
 * - onSave 调 wikiApi.createPage（不是 submitEdit）
 * - 成功后跳到新创建的角色页
 */
import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  Button,
  Card,
  InlineNotice,
  TextField,
} from "@yinjie/ui";
import { useAuth } from "../lib/use-auth";
import {
  wikiApi,
  WikiApiError,
  type PrivateCharacterDto,
} from "../lib/wiki-api";
import { PageShell } from "../components/page-shell";
import { FormRow } from "../components/form-row";
import { CharacterEditForm } from "../components/character-edit-form";
import { dtoToWikiEdit } from "../lib/world-character-dto-mapping";
import {
  clearEditSession,
  getEditSession,
} from "../lib/my-character-edit-session";
import { hasMeaningfulDraftSnapshot } from "../lib/draft-snapshot-utils";

export function CreateCharacterPage() {
  const t = useRuntimeTranslator();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useSearch({ from: "/create" }) as { draftId?: string };
  const draftId = search.draftId;

  const sessionKey = "world:new";

  // 路径名（可选）：用户可以指定 character id（URL slug），留空让后端生成。
  // editSummary 同 edit 流：≥10 字必填，wiki 后端 assertWikiEditSummary 创建
  // 操作强制要求。
  const [characterId, setCharacterId] = useState("");
  const [editSummary, setEditSummary] = useState("");

  const createMut = useMutation({
    mutationFn: async (dto: PrivateCharacterDto) => {
      const { contentSnapshot, recipeSnapshot } = dtoToWikiEdit(dto);
      return wikiApi.createPage({
        characterId: characterId.trim() || null,
        contentSnapshot,
        recipeSnapshot,
        editSummary: editSummary.trim(),
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["wiki", "characters"] });
      void navigate({
        to: "/character/$characterId",
        params: { characterId: res.characterId },
      });
    },
  });

  // 草稿恢复：?draftId 命中时拉草稿、根据需要确认覆盖、清掉旧 session snapshot。
  // initialDto 跟着 draft 走，hydrationToken 用 draft:<id> 触发 form 重 hydrate。
  const draftQ = useQuery({
    queryKey: ["wiki", "draft", draftId],
    queryFn: () => wikiApi.getDraft(draftId!),
    enabled: !!user && !!draftId,
  });

  const [draftRestoreCancelled, setDraftRestoreCancelled] = useState(false);

  useEffect(() => {
    if (!draftId || !draftQ.data) return;
    if (draftRestoreCancelled) return;
    const existing = getEditSession(sessionKey).formSnapshot;
    if (hasMeaningfulDraftSnapshot(existing)) {
      const ok = window.confirm(
        t(msg`当前页面有未保存的内容，恢复草稿会覆盖。继续吗？`),
      );
      if (!ok) {
        setDraftRestoreCancelled(true);
        void navigate({ to: "/create", search: {} });
        return;
      }
    }
    clearEditSession(sessionKey);
  }, [draftId, draftQ.data, draftRestoreCancelled, navigate, sessionKey, t]);

  if (!user) {
    return (
      <PageShell eyebrow={t(msg`编辑`)} title={t(msg`创建世界角色`)}>
        <Card className="p-6 text-sm">
          <Trans>
            请先{" "}
            <Link to="/login" className="font-medium underline">
              登录
            </Link>{" "}
            后再创建角色。
          </Trans>
        </Card>
      </PageShell>
    );
  }

  const headerActions = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => void navigate({ to: "/" })}
    >
      <Trans>← 返回首页</Trans>
    </Button>
  );

  const summaryTrimmed = editSummary.trim();
  const summaryTooShort = summaryTrimmed.length < 10;
  const summaryWarning = summaryTooShort
    ? t(msg`创建摘要至少 10 字（创建操作评审要求）`)
    : null;

  const footerSlot = (
    <div className="space-y-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-dim)]">
        <Trans>提交评审</Trans>
      </div>
      <FormRow
        label={t(msg`角色 ID（可选）`)}
        hint={t(
          msg`留空由系统生成。设了之后会作为 URL 路径，例如 /character/night-archivist`,
        )}
      >
        <TextField
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          placeholder={t(msg`例如 night-archivist`)}
        />
      </FormRow>
      <FormRow
        label={t(msg`创建摘要`)}
        required
        hint={t(msg`≥10 字。说明这个角色为什么值得加入`)}
      >
        <TextField
          value={editSummary}
          onChange={(e) => setEditSummary(e.target.value)}
          placeholder={t(
            msg`例如：补一个心理咨询师角色，专擅深夜叙事疏导，文风克制`,
          )}
          maxLength={500}
        />
        <div className="mt-1 text-xs text-[color:var(--text-muted)]">
          {summaryTrimmed.length}/500
          {summaryTooShort && summaryTrimmed.length > 0 && (
            <span className="ml-2 text-[color:var(--state-warning-text)]">
              <Trans>至少需要 10 字</Trans>
            </span>
          )}
        </div>
      </FormRow>
      <p className="text-xs text-[color:var(--text-muted)]">
        <Trans>
          新角色会先进入待创建队列，patroller 通过后才会发布到运行时角色注册表。
        </Trans>
      </p>
    </div>
  );

  return (
    <PageShell
      eyebrow={t(msg`编辑`)}
      title={t(msg`创建世界角色`)}
      description={t(
        msg`和私有角色 / 世界角色编辑器同一套体验；保存后角色会作为 wiki 待创建稿提交，patroller 通过后才发布。`,
      )}
      actions={headerActions}
    >
      {createMut.isError && (
        <InlineNotice tone="danger" className="mb-3">
          {createMut.error instanceof WikiApiError
            ? createMut.error.message
            : (createMut.error as Error).message}
        </InlineNotice>
      )}
      {draftId && draftQ.data && (
        <InlineNotice tone="info" className="mb-3">
          <Trans>
            已从草稿「{draftQ.data.name || t(msg`未命名草稿`)}」恢复。
          </Trans>{" "}
          <button
            type="button"
            className="ml-2 font-medium underline"
            onClick={() => {
              clearEditSession(sessionKey);
              void navigate({ to: "/create", search: {} });
            }}
          >
            <Trans>清空表单</Trans>
          </button>
        </InlineNotice>
      )}
      {/*
        draftQ.isError 只在 retry 用尽后才转 true；中间 paused / pending+fetchFailureCount>0
        的状态下 isError 仍是 false，警告条不会渲染，用户看到的还是空白创建页 + 残留的
        ?draftId=xxx —— 这正是这个修复想避免的"silent"。所以这里同时看 fetchFailureCount
        作为兜底信号：只要至少 fetch 失败过一次且没拿到 data，就提示"草稿不存在"。
      */}
      {draftId &&
        !draftQ.data &&
        (draftQ.isError || draftQ.failureCount > 0) && (
          <InlineNotice tone="warning" className="mb-3">
            <Trans>该草稿已不存在（可能已被删除），按空白表单继续。</Trans>{" "}
            <button
              type="button"
              className="ml-2 font-medium underline"
              onClick={() => void navigate({ to: "/create", search: {} })}
            >
              <Trans>清掉 URL 中的 draftId</Trans>
            </button>
          </InlineNotice>
        )}
      <CharacterEditForm
        mode="create"
        scope="world"
        sessionKey={sessionKey}
        initialDto={draftId ? draftQ.data?.payload ?? null : null}
        // draftId 命中时，必须等 draftQ.data 真的拿到再切到 `draft:<id>` token —
        // 否则 form 第一次会用 initialDto=null 锁住 hydratedTokenRef，等 query
        // 完成 token 不变就不再重 hydrate，导致草稿恢复后 name 输入框是空的。
        hydrationToken={
          draftId
            ? draftQ.data
              ? `draft:${draftId}`
              : `draft-loading:${draftId}`
            : "new"
        }
        generator={(input) =>
          wikiApi.generateCharacterFields({ ...input, persistAsDraft: true })
        }
        onSave={async (dto) => {
          await createMut.mutateAsync(dto);
        }}
        isSavePending={createMut.isPending}
        saveError={
          createMut.isError
            ? createMut.error instanceof WikiApiError
              ? createMut.error.message
              : (createMut.error as Error).message
            : null
        }
        saveButtonLabel={{
          create: <Trans>✨ 提交创建</Trans>,
          edit: <Trans>提交</Trans>,
          pending: <Trans>提交中…</Trans>,
        }}
        saveFooterHint={{
          create: <Trans>提交后进 patroller 审核队列</Trans>,
          edit: <Trans>提交后进评审队列</Trans>,
        }}
        footerSlot={footerSlot}
        extraSaveDisabledReason={summaryWarning}
      />
    </PageShell>
  );
}

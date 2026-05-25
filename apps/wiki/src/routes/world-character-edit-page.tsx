/**
 * 世界角色编辑页（/character/$characterId/edit）—— thin parent。
 *
 * 与 my-character-edit-page.tsx 同构：内部都通过 CharacterEditForm 渲染一致的
 * 6-section 编辑器 + AI 一键生成 + 草稿会话。两边区别都在 props：
 * - onSave 调 wikiApi.submitEdit（走 wiki 评审/补丁队列；评审通过后 patroller
 *   合并到 stable revision，未通过仍属待审稿）
 * - generator 调 /wiki/ai-generate-character-fields（和私有的 /wiki/my-characters/
 *   ai-generate 走同一份 service，只是路由不同 + rate-limit 共用一个 bucket）
 * - footerSlot 渲染世界专用的 editSummary + isMinor 复选框
 * - sessionKey 用 world: 前缀，与私有不撞
 */
import { useState } from "react";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
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
import {
  dtoToWikiEdit,
  pageViewToDto,
} from "../lib/world-character-dto-mapping";

export function WorldCharacterEditPage() {
  const t = useRuntimeTranslator();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { characterId } = useParams({
    from: "/character/$characterId/edit",
  });

  const sessionKey = `world:edit:${characterId}`;

  // 编辑要拿 current view（包含 currentRevision.recipeSnapshot 全文，能恢复
  // prompting / memorySeed 各小字段）；stable view 只反映 stable revision，
  // pending 的改动看不见。
  const pageQ = useQuery({
    queryKey: ["wiki", "page", characterId, "current"],
    queryFn: () => wikiApi.getPage(characterId, "current"),
    enabled: !!user,
  });

  // editSummary / isMinor：世界专用，wiki page edit submission body 的字段。
  // editSummary 高风险 / lifecycle 改动 ≥10 字（assertWikiEditSummary）。
  const [editSummary, setEditSummary] = useState("");
  const [isMinor, setIsMinor] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const submitMut = useMutation({
    mutationFn: async (dto: PrivateCharacterDto) => {
      const { contentSnapshot, recipeSnapshot } = dtoToWikiEdit(dto);
      // baseRevisionId 必须指向 stable 当前版本（page.currentRevisionId），
      // **不能**用 view 里的 currentRevision.id —— view=current 时后者是
      // *pending* 版本（getPageView 的 visibleRevision = latestRevision），而
      // 后端 submit/submitRecipeEdit 的冲突检测固定以 page.currentRevisionId
      // 作为 before 基线。用 pending 当 base 时，用户在自己已有 pending 的页
      // 面上继续编辑，pending 的改动会被 diff 成"并发修改"，对同一字段必然
      // 触发假 409 冲突（newcomer 每次编辑都进 pending、任何人做高风险 recipe
      // 改动后再回来改同一字段都会撞）。stable head 同时也是真并发检测需要的
      // 基线：页面加载时捕获的 stable，提交时若 server 已前进 → 正确进 3-way
      // merge；未前进 → base==current 跳过冲突分支，正常叠一个新版本（审核
      // 通过时由 review pipeline 接管 supersede）。
      const baseRevisionId =
        pageQ.data?.page.currentRevisionId ??
        pageQ.data?.currentRevision?.id ??
        null;
      return wikiApi.submitEdit(characterId, {
        contentSnapshot,
        recipeSnapshot,
        baseRevisionId,
        editSummary: editSummary.trim(),
        isMinor,
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["wiki", "page", characterId] });
      void qc.invalidateQueries({ queryKey: ["wiki", "characters"] });
      setInfo(
        res.appliedToCharacter
          ? t(msg`修改已直接生效（autoconfirmed / patroller / admin 通道）`)
          : t(msg`修改已提交，等待巡查员审核（涉及高风险字段时 patroller 必审）`),
      );
      // 提交完跳回 read 视图——而不是跳到 list；用户改完通常想立刻看 diff。
      void navigate({
        to: "/character/$characterId",
        params: { characterId },
      });
    },
  });

  // headerActions 提前定义，pending_create 早返回和正常编辑两条路径都要复用。
  const headerActions = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() =>
        void navigate({
          to: "/character/$characterId",
          params: { characterId },
        })
      }
    >
      <Trans>← 返回角色页</Trans>
    </Button>
  );

  if (!user) {
    return (
      <PageShell eyebrow={t(msg`编辑`)} title={t(msg`世界角色`)}>
        <Card className="p-6 text-sm">
          <Trans>
            请先{" "}
            <Link to="/login" className="font-medium underline">
              登录
            </Link>{" "}
            后再编辑角色。
          </Trans>
        </Card>
      </PageShell>
    );
  }
  if (pageQ.isLoading) {
    return (
      <PageShell eyebrow={t(msg`编辑`)} title={t(msg`世界角色`)}>
        <LoadingBlock />
      </PageShell>
    );
  }
  if (pageQ.isError || !pageQ.data) {
    return (
      <PageShell eyebrow={t(msg`编辑`)} title={t(msg`世界角色`)}>
        <ErrorBlock
          role="alert"
          message={
            (pageQ.error as Error | null)?.message ?? t(msg`加载失败`)
          }
        />
      </PageShell>
    );
  }

  // pending_create 期间 character 行还没建，submitEdit 会 400 "角色不存在"。
  // 走查发现：用户填完整个 6-section 表单点提交才报错，体验极差。改成早返回 + 引导。
  if (pageQ.data.page.lifecycleStatus === "pending_create") {
    return (
      <PageShell
        eyebrow={t(msg`编辑`)}
        title={t(msg`编辑世界角色`)}
        actions={headerActions}
      >
        <InlineNotice tone="warning">
          <Trans>
            该词条仍在待创建评审中，patroller 通过后才能进入编辑流。请回到角色页查看当前提交的快照。
          </Trans>
        </InlineNotice>
      </PageShell>
    );
  }

  const initialDto = pageViewToDto(pageQ.data);

  // editSummary 长度判定：wiki 后端 assertWikiEditSummary 会对 high-risk /
  // lifecycle / create 强制 ≥10 字。我们这里不知道用户的改动是否触到 high-risk
  // 路径（要 diff prompting/memorySeed/tone/expertise/publishMapping/realityLink/
  // lifeStrategy/reasoning/identity.{background,motivation,worldview}），简单
  // 策略：编辑流一律强制 ≥10 字。和 admin 当前编辑页的策略一致（admin 端
  // requiresLongSummary 也是只要 personality/recipe 任一变就要求 10 字，而 6-
  // section 编辑器几乎肯定会改 recipe 的某一节）。
  const summaryTrimmed = editSummary.trim();
  const summaryTooShort = summaryTrimmed.length < 10;
  const summaryWarning = summaryTooShort
    ? t(msg`编辑摘要至少 10 字（高风险改动评审需要）`)
    : null;

  const footerSlot = (
    <div className="space-y-3 rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--surface-soft)] p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--text-dim)]">
        <Trans>提交评审</Trans>
      </div>
      <FormRow
        label={t(msg`编辑摘要`)}
        required
        hint={t(
          msg`≥10 字。说明本次改动的目的；patroller 会在审核队列看到这一行。`,
        )}
      >
        <TextField
          value={editSummary}
          onChange={(e) => setEditSummary(e.target.value)}
          placeholder={t(msg`例如：补充底层逻辑，加入对话节奏的具体引导`)}
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isMinor}
          onChange={(e) => setIsMinor(e.target.checked)}
        />
        <Trans>小修改（错别字 / 格式调整等）</Trans>
      </label>
      <p className="text-xs text-[color:var(--text-muted)]">
        <Trans>
          注意：本编辑器对接 wiki 评审/补丁队列。涉及 prompting / memorySeed /
          tone / expertise / publishMapping / realityLink / lifeStrategy /
          reasoning 的改动 = 高风险，需要 patroller 审核才能合并；其他低风险的
          内容改动可能根据你的 rank 自动通过。
        </Trans>
      </p>
    </div>
  );

  return (
    <PageShell
      eyebrow={t(msg`编辑`)}
      title={t(msg`编辑世界角色`)}
      description={t(
        msg`和私有角色用同一套 6-section 编辑器，但保存后会作为 wiki 评审稿提交，patroller 通过才合并到 stable 版本。`,
      )}
      actions={headerActions}
    >
      {/* 提交成功反馈：用户刚按下"提交编辑"按钮，需要 SR 立即播报
          "修改已直接生效" / "修改已提交评审"，否则盲用只看到按钮转圈停止，
          不知道哪一条评审路径走了。 */}
      {info && (
        <InlineNotice tone="success" role="status" className="mb-3">
          {info}
        </InlineNotice>
      )}
      {pageQ.data.pendingRevision && (
        <InlineNotice tone="warning" className="mb-3">
          <Trans>
            ⚠ 当前已有待审版本 v{pageQ.data.pendingRevision.version}
            ，继续提交可能触发编辑冲突。
          </Trans>
        </InlineNotice>
      )}
      <CharacterEditForm
        mode="edit"
        scope="world"
        sessionKey={sessionKey}
        initialDto={initialDto}
        hydrationToken={pageQ.data.currentRevision?.id ?? characterId}
        generator={(input) => wikiApi.generateCharacterFields(input)}
        onSave={async (dto) => {
          await submitMut.mutateAsync(dto);
        }}
        isSavePending={submitMut.isPending}
        saveError={
          submitMut.isError
            ? submitMut.error instanceof WikiApiError
              ? submitMut.error.message
              : (submitMut.error as Error).message
            : null
        }
        saveButtonLabel={{
          create: <Trans>提交评审</Trans>,
          edit: <Trans>📝 提交编辑（进评审）</Trans>,
          pending: <Trans>提交中…</Trans>,
        }}
        saveFooterHint={{
          create: <Trans>提交后进 patroller 审核队列</Trans>,
          edit: <Trans>提交后进评审队列，通过后合并</Trans>,
        }}
        footerSlot={footerSlot}
        extraSaveDisabledReason={summaryWarning}
      />
    </PageShell>
  );
}

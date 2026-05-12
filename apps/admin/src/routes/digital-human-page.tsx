import { useEffect, useMemo, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSystemStatus } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button, Card } from "@yinjie/ui";
import {
  AdminActionFeedback,
  AdminCallout,
  AdminCodeBlock,
  AdminDraftStatusPill,
  AdminInfoRow,
  AdminPageHero,
  AdminSectionHeader,
  AdminSelectField,
  AdminTextArea,
  AdminTextField,
} from "../components/admin-workbench";
import { adminApi } from "../lib/admin-api";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import {
  buildDigitalHumanAdminSummary,
  formatDigitalHumanAdminMode,
} from "../lib/digital-human-admin-summary";

const MODE_KEY = "digital_human_provider_mode";
const TEMPLATE_KEY = "digital_human_player_url_template";
const TOKEN_KEY = "digital_human_provider_callback_token";
const PARAMS_KEY = "digital_human_provider_params";

type Mode = "mock_stage" | "mock_iframe" | "external_iframe";

const DEFAULT_MODE: Mode = "mock_iframe";

const TEMPLATE_PLACEHOLDER =
  "https://provider.example.com/play?session={sessionId}&callback={callbackUrl}&token={callbackToken}";

const PARAMS_PLACEHOLDER = `{
  "voice": "female-warm",
  "scene": "studio"
}`;

type DraftState = {
  mode: Mode;
  playerUrlTemplate: string;
  callbackToken: string;
  providerParams: string;
};

function normalizeMode(value: string | undefined): Mode {
  if (value === "mock_stage" || value === "external_iframe") {
    return value;
  }
  return DEFAULT_MODE;
}

function validateParams(raw: string): {
  ok: boolean;
  count: number;
  keys: string[];
  error: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, count: 0, keys: [], error: null };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return {
        ok: false,
        count: 0,
        keys: [],
        error: translateRuntimeMessage(
          msg`providerParams 必须是 JSON 对象（不是数组、字符串或 null）。`,
        ),
      };
    }
    const keys = Object.keys(parsed as Record<string, unknown>);
    return { ok: true, count: keys.length, keys, error: null };
  } catch (error) {
    return {
      ok: false,
      count: 0,
      keys: [],
      error:
        error instanceof Error
          ? translateRuntimeMessage(
              msg`JSON 解析失败：${error.message}`,
            )
          : translateRuntimeMessage(msg`JSON 解析失败。`),
    };
  }
}

function generateToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function DigitalHumanPage() {
  const t = translateRuntimeMessage;
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ["admin-digital-human-config", baseUrl],
    queryFn: () => adminApi.getConfig(),
  });

  const statusQuery = useQuery({
    queryKey: ["admin-digital-human-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (draft || !configQuery.data) {
      return;
    }
    setDraft({
      mode: normalizeMode(configQuery.data[MODE_KEY]),
      playerUrlTemplate: configQuery.data[TEMPLATE_KEY] ?? "",
      callbackToken: configQuery.data[TOKEN_KEY] ?? "",
      providerParams: configQuery.data[PARAMS_KEY] ?? "",
    });
  }, [configQuery.data, draft]);

  useEffect(() => {
    if (!notice) return;
    // i18n-ignore-next-line: clearing notice state, not a user-facing literal
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const summary = useMemo(
    () =>
      buildDigitalHumanAdminSummary(statusQuery.data?.digitalHumanGateway),
    [statusQuery.data?.digitalHumanGateway],
  );

  const persisted = useMemo<DraftState>(
    () => ({
      mode: normalizeMode(configQuery.data?.[MODE_KEY]),
      playerUrlTemplate: configQuery.data?.[TEMPLATE_KEY] ?? "",
      callbackToken: configQuery.data?.[TOKEN_KEY] ?? "",
      providerParams: configQuery.data?.[PARAMS_KEY] ?? "",
    }),
    [configQuery.data],
  );

  const dirty = useMemo(() => {
    if (!draft) return false;
    return (
      draft.mode !== persisted.mode ||
      draft.playerUrlTemplate !== persisted.playerUrlTemplate ||
      draft.callbackToken !== persisted.callbackToken ||
      draft.providerParams !== persisted.providerParams
    );
  }, [draft, persisted]);

  const paramsValidation = useMemo(
    () => validateParams(draft?.providerParams ?? ""),
    [draft?.providerParams],
  );

  const saveMutation = useMutation({
    mutationFn: async (next: DraftState) => {
      const writes: Array<[string, string]> = [];
      if (next.mode !== persisted.mode) writes.push([MODE_KEY, next.mode]);
      if (next.playerUrlTemplate !== persisted.playerUrlTemplate) {
        writes.push([TEMPLATE_KEY, next.playerUrlTemplate.trim()]);
      }
      if (next.callbackToken !== persisted.callbackToken) {
        writes.push([TOKEN_KEY, next.callbackToken.trim()]);
      }
      if (next.providerParams !== persisted.providerParams) {
        writes.push([PARAMS_KEY, next.providerParams.trim()]);
      }
      for (const [key, value] of writes) {
        await adminApi.setConfig(key, value);
      }
    },
    onSuccess: async () => {
      setNotice(t(msg`数字人 Provider 配置已保存。`));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-digital-human-config", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-digital-human-status", baseUrl],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-shell-system-status", baseUrl],
        }),
      ]);
    },
  });

  const update = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleGenerateToken = () => {
    update("callbackToken", generateToken());
  };

  const handleReset = () => {
    setDraft({ ...persisted });
  };

  const handleSave = () => {
    if (!draft || !paramsValidation.ok) return;
    saveMutation.mutate(draft);
  };

  const isExternal = draft?.mode === "external_iframe";
  const templateMissing = isExternal && !draft?.playerUrlTemplate.trim();

  return (
    <div className="space-y-6">
      <AdminPageHero
        eyebrow={t(msg`数字人 Provider`)}
        title={t(msg`配置外部数字人播放器`)}
        description={t(
          msg`选择数字人模式，配置外部播放器模板、回调 token 与扩展参数，让数字人状态从“模拟”切到真实 provider。`,
        )}
        badges={[
          summary.ready ? t(msg`已就绪`) : t(msg`待配置`),
          `${t(msg`当前模式`)}：${summary.modeLabel}`,
        ]}
        metrics={[
          { label: t(msg`状态`), value: summary.statusLabel },
          { label: t(msg`播放器模板`), value: summary.templateStatus },
          { label: t(msg`回调 token`), value: summary.callbackTokenStatus },
          { label: t(msg`扩展参数`), value: summary.paramsStatus },
        ]}
      />

      <AdminCallout
        tone={summary.ready ? "success" : "warning"}
        title={
          summary.ready
            ? t(msg`数字人 Provider 已可联调真实视频通话。`)
            : t(msg`数字人 Provider 当前未就绪：${summary.statusLabel}`)
        }
        description={`${summary.description} ${summary.nextStep}`}
      />

      <Card>
        <AdminSectionHeader
          title={t(msg`Provider 配置`)}
          actions={
            <div className="flex items-center gap-2">
              <AdminDraftStatusPill ready={Boolean(draft)} dirty={dirty} />
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={!dirty || saveMutation.isPending}
              >
                {t(msg`撤销修改`)}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={
                  !draft || !dirty || !paramsValidation.ok || saveMutation.isPending
                }
              >
                {saveMutation.isPending ? t(msg`保存中…`) : t(msg`保存`)}
              </Button>
            </div>
          }
        />

        {draft ? (
          <div className="mt-5 space-y-5">
            <AdminSelectField
              label={t(msg`数字人模式`)}
              value={draft.mode}
              onChange={(value) => update("mode", value as Mode)}
              options={[
                {
                  value: "mock_stage",
                  label: t(msg`内置舞台（mock_stage）`),
                },
                {
                  value: "mock_iframe",
                  label: t(msg`内置 iframe（mock_iframe）`),
                },
                {
                  value: "external_iframe",
                  label: t(msg`外部 iframe（external_iframe）`),
                },
              ]}
            />

            <AdminTextField
              label={t(msg`外部播放器 URL 模板`)}
              value={draft.playerUrlTemplate}
              onChange={(value) => update("playerUrlTemplate", value)}
              placeholder={TEMPLATE_PLACEHOLDER}
            />
            <div className="-mt-3 text-[12px] leading-5 text-[color:var(--text-secondary)]">
              {t(
                msg`支持占位符：{sessionId} {conversationId} {characterId} {characterName} {callbackUrl} {callbackToken}，以及 providerParams 中的任意 key（如 {voice}）。仅外部 iframe 模式生效。`,
              )}
              {templateMissing ? (
                <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  {t(msg`外部模式必填`)}
                </span>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-end gap-3">
                <AdminTextField
                  className="flex-1"
                  label={t(msg`Provider 回调 token`)}
                  value={draft.callbackToken}
                  onChange={(value) => update("callbackToken", value)}
                  placeholder={t(msg`留空则 provider-state 回调不会带鉴权`)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateToken}
                  className="mb-0"
                >
                  {t(msg`生成新 token`)}
                </Button>
              </div>
              <div className="text-[12px] leading-5 text-[color:var(--text-secondary)]">
                {t(
                  msg`provider 在回写 PATCH /api/chat/digital-human-calls/sessions/:id/provider-state 时需带上该 token，否则会被拒绝。`,
                )}
              </div>
            </div>

            <div>
              <AdminTextArea
                label={t(msg`扩展参数（JSON 对象）`)}
                value={draft.providerParams}
                onChange={(value) => update("providerParams", value)}
                placeholder={PARAMS_PLACEHOLDER}
                description={t(
                  msg`这里的 key 会自动注入到 URL 模板的占位符中。值会按 string/number/boolean 直接渲染，其它结构会被 JSON 序列化。`,
                )}
                textareaClassName="min-h-32 font-mono text-[12px]"
              />
              {!paramsValidation.ok ? (
                <div className="mt-2 text-[12px] leading-5 text-amber-700">
                  {paramsValidation.error}
                </div>
              ) : paramsValidation.count > 0 ? (
                <div className="mt-2 text-[12px] leading-5 text-[color:var(--text-secondary)]">
                  {t(msg`已解析 ${paramsValidation.count} 个 key：`)}
                  {paramsValidation.keys.join(" / ")}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 text-sm text-[color:var(--text-muted)]">
            {configQuery.isError
              ? t(msg`读取配置失败，请确认 ADMIN_SECRET 已生效后重试。`)
              : t(msg`正在加载配置…`)}
          </div>
        )}

        {notice ? (
          <AdminActionFeedback
            tone="success"
            title={t(msg`已保存`)}
            description={notice}
            className="mt-4"
          />
        ) : null}
        {saveMutation.error ? (
          <AdminActionFeedback
            tone="warning"
            title={t(msg`保存失败`)}
            description={
              saveMutation.error instanceof Error
                ? saveMutation.error.message
                : t(msg`保存失败，请稍后再试。`)
            }
            className="mt-4"
          />
        ) : null}
      </Card>

      <Card>
        <AdminSectionHeader title={t(msg`实时网关快照`)} />
        <div className="mt-4 space-y-3">
          <AdminInfoRow
            label={t(msg`模式`)}
            value={formatDigitalHumanAdminMode(
              statusQuery.data?.digitalHumanGateway.mode ?? "",
            )}
          />
          <AdminInfoRow
            label={t(msg`Provider`)}
            value={statusQuery.data?.digitalHumanGateway.provider ?? "—"}
          />
          <AdminInfoRow label={t(msg`状态`)} value={summary.statusLabel} />
          <AdminInfoRow
            label={t(msg`播放器模板`)}
            value={summary.templateStatus}
          />
          <AdminInfoRow
            label={t(msg`回调 token`)}
            value={summary.callbackTokenStatus}
          />
          <AdminInfoRow
            label={t(msg`扩展参数`)}
            value={summary.paramsDetail}
          />
        </div>
        <div className="mt-4">
          <AdminCodeBlock
            value={
              statusQuery.data?.digitalHumanGateway.message ??
              t(msg`正在读取系统状态…`)
            }
          />
        </div>
      </Card>
    </div>
  );
}

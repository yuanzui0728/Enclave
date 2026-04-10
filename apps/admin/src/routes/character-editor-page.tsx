import { useEffect, useEffectEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  createCharacter,
  getCharacter,
  updateCharacter,
  type Character,
  type CharacterDraft,
} from "@yinjie/contracts";
import {
  Button,
  Card,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  MetricCard,
  SelectField as UiSelectField,
  SectionHeading,
  StatusPill,
  TextAreaField as UiTextAreaField,
  TextField as UiTextField,
  ToggleChip,
} from "@yinjie/ui";
import { AdminInfoRows, AdminPageHero, AdminSectionNav } from "../components/admin-workbench";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";

const emptyCharacterDraft: CharacterDraft = {
  name: "",
  avatar: "",
  relationship: "",
  relationshipType: "expert",
  bio: "",
  isOnline: false,
  isTemplate: false,
  expertDomains: [],
  activityFrequency: "medium",
  momentsFrequency: 1,
  feedFrequency: 1,
  intimacyLevel: 0,
  triggerScenes: [],
  profile: {
    characterId: "",
    name: "",
    relationship: "",
    expertDomains: [],
    basePrompt: "",
    systemPrompt: "",
    memorySummary: "",
    traits: {
      speechPatterns: [],
      catchphrases: [],
      topicsOfInterest: [],
      emotionalTone: "grounded",
      responseLength: "medium",
      emojiUsage: "occasional",
    },
    identity: {
      occupation: "",
      background: "",
      motivation: "",
      worldview: "",
    },
    behavioralPatterns: {
      workStyle: "",
      socialStyle: "",
      taboos: [],
      quirks: [],
    },
    cognitiveBoundaries: {
      expertiseDescription: "",
      knowledgeLimits: "",
      refusalStyle: "",
    },
    reasoningConfig: {
      enableCoT: true,
      enableReflection: true,
      enableRouting: true,
    },
    memory: {
      coreMemory: "",
      recentSummary: "",
      forgettingCurve: 70,
    },
  },
};

function csvToList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listToCsv(items?: string[] | null) {
  return items?.join(", ") ?? "";
}

export function CharacterEditorPage() {
  const { characterId } = useParams({ from: "/characters/$characterId" });
  const isNew = characterId === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const [draft, setDraft] = useState<CharacterDraft>(emptyCharacterDraft);

  const characterQuery = useQuery({
    queryKey: ["admin-character-edit", characterId, baseUrl],
    queryFn: () => getCharacter(characterId, baseUrl),
    enabled: !isNew,
  });

  useEffect(() => {
    if (isNew) {
      setDraft(emptyCharacterDraft);
      return;
    }
    if (characterQuery.isLoading) {
      setDraft(emptyCharacterDraft);
      return;
    }
    if (characterQuery.data) {
      setDraft(characterQuery.data);
      return;
    }
    if (characterQuery.isError) {
      setDraft(emptyCharacterDraft);
    }
  }, [characterQuery.data, characterQuery.isError, characterQuery.isLoading, isNew]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = normalizeDraft(draft, characterId, isNew);
      if (isNew) {
        return createCharacter(payload, baseUrl);
      }
      return updateCharacter(characterId, payload, baseUrl);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-characters-crud", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-characters", baseUrl] }),
        queryClient.invalidateQueries({ queryKey: ["admin-system-status", baseUrl] }),
      ]);
      navigate({ to: "/characters" });
    },
  });

  const resetSaveMutation = useEffectEvent(() => {
    saveMutation.reset();
  });

  useEffect(() => {
    resetSaveMutation();
  }, [baseUrl, characterId, resetSaveMutation]);

  const profile = draft.profile ?? emptyCharacterDraft.profile!;
  const canSave = Boolean(draft.name?.trim() && draft.relationship?.trim());

  function jumpToSection(sectionId: string) {
    if (typeof document === "undefined") {
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <AdminPageHero
          eyebrow="角色编辑"
          title={isNew ? "新建角色资料" : draft.name || "编辑角色资料"}
          description="先补齐基础身份和关系，再完善提示词、特征、记忆与边界。"
          actions={
            <>
              <Link to="/characters">
                <Button variant="secondary" size="lg">返回角色中心</Button>
              </Link>
              <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} variant="primary" size="lg">
                {saveMutation.isPending ? "保存中..." : "保存角色"}
              </Button>
            </>
          }
          metrics={[
            { label: "可保存", value: canSave ? "是" : "否" },
            { label: "关系类型", value: formatRelationshipType(draft.relationshipType ?? "expert") },
            { label: "擅长领域数", value: (draft.expertDomains?.length ?? 0) || 0 },
            { label: "触发场景数", value: (draft.triggerScenes?.length ?? 0) || 0 },
          ]}
        />

        <Card className="bg-[color:var(--surface-console)]">
          <SectionHeading>当前状态</SectionHeading>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="名称" value={draft.name || "未填写"} />
            <MetricCard label="关系" value={draft.relationship || "待填写"} />
            <MetricCard label="在线" value={draft.isOnline ? "在线" : "离线"} />
            <MetricCard label="模板" value={draft.isTemplate ? "是" : "否"} />
          </div>
        </Card>
      </div>

      {!isNew && characterQuery.isLoading ? <LoadingBlock label="正在加载角色草稿..." /> : null}

      {!isNew && characterQuery.isError && characterQuery.error instanceof Error ? <ErrorBlock message={characterQuery.error.message} /> : null}

      {!canSave ? <InlineNotice tone="warning">保存角色前，名称和关系描述为必填项。</InlineNotice> : null}

      {saveMutation.isError && saveMutation.error instanceof Error ? <ErrorBlock message={saveMutation.error.message} /> : null}

      {saveMutation.isSuccess ? <InlineNotice tone="success">角色已保存，正在返回角色名册...</InlineNotice> : null}

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <AdminSectionNav
            items={[
              { label: "基础信息", detail: "名称、关系、触发场景", onClick: () => jumpToSection("character-editor-basics") },
              { label: "提示词与特征", detail: "basePrompt、systemPrompt、说话风格", onClick: () => jumpToSection("character-editor-prompt") },
              { label: "推理与记忆", detail: "记忆摘要、核心记忆、推理开关", onClick: () => jumpToSection("character-editor-memory") },
              { label: "身份与边界", detail: "职业、背景、边界说明", onClick: () => jumpToSection("character-editor-identity") },
              { label: "预览", detail: "查看当前角色摘要", onClick: () => jumpToSection("character-editor-preview") },
            ]}
          />

          <AdminInfoRows
            title="保存提示"
            rows={[
              { label: "必填字段", value: canSave ? "已满足" : "名称和关系描述未齐" },
              { label: "建议流程", value: "先补基础信息，再写提示词和记忆" },
              { label: "当前入口", value: isNew ? "新建角色" : "编辑现有角色" },
            ]}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card id="character-editor-basics" className="bg-[color:var(--surface-console)]">
            <SectionHeading>基础信息</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="名称" value={draft.name ?? ""} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
              <Field label="头像" value={draft.avatar ?? ""} onChange={(value) => setDraft((current) => ({ ...current, avatar: value }))} />
              <Field
                label="关系描述"
                value={draft.relationship ?? ""}
                onChange={(value) => setDraft((current) => ({ ...current, relationship: value }))}
              />
              <SelectField
                label="关系类型"
                value={draft.relationshipType ?? "expert"}
                onChange={(value) => setDraft((current) => ({ ...current, relationshipType: value as Character["relationshipType"] }))}
                options={[
                  { value: "family", label: "家人" },
                  { value: "friend", label: "朋友" },
                  { value: "expert", label: "专家" },
                  { value: "mentor", label: "导师" },
                  { value: "custom", label: "自定义" },
                ]}
              />
              <Field
                label="擅长领域"
                value={listToCsv(draft.expertDomains)}
                onChange={(value) => setDraft((current) => ({ ...current, expertDomains: csvToList(value) }))}
              />
              <Field
                label="触发场景"
                value={listToCsv(draft.triggerScenes)}
                onChange={(value) => setDraft((current) => ({ ...current, triggerScenes: csvToList(value) }))}
              />
            </div>
            <TextAreaField
              label="简介"
              value={draft.bio ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, bio: value }))}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Toggle
                label="在线"
                checked={draft.isOnline ?? false}
                onChange={(checked) => setDraft((current) => ({ ...current, isOnline: checked }))}
              />
              <Toggle
                label="模板"
                checked={draft.isTemplate ?? false}
                onChange={(checked) => setDraft((current) => ({ ...current, isTemplate: checked }))}
              />
            </div>
          </Card>

          <Card id="character-editor-prompt" className="bg-[color:var(--surface-console)]">
            <SectionHeading>提示词与特征</SectionHeading>
            <TextAreaField
              label="基础提示词"
              value={profile.basePrompt ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, basePrompt: value } }))}
            />
            <TextAreaField
              label="系统提示词"
              value={profile.systemPrompt ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, systemPrompt: value } }))}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="说话习惯"
                value={listToCsv(profile.traits.speechPatterns)}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: {
                      ...profile,
                      traits: { ...profile.traits, speechPatterns: csvToList(value) },
                    },
                  }))
                }
              />
              <Field
                label="口头禅"
                value={listToCsv(profile.traits.catchphrases)}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: {
                      ...profile,
                      traits: { ...profile.traits, catchphrases: csvToList(value) },
                    },
                  }))
                }
              />
              <Field
                label="兴趣话题"
                value={listToCsv(profile.traits.topicsOfInterest)}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: {
                      ...profile,
                      traits: { ...profile.traits, topicsOfInterest: csvToList(value) },
                    },
                  }))
                }
              />
              <Field
                label="情绪基调"
                value={profile.traits.emotionalTone}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profile: {
                      ...profile,
                      traits: { ...profile.traits, emotionalTone: value },
                    },
                  }))
                }
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>保存状态</SectionHeading>
            <div className="mt-4 space-y-3">
              <MetricCard label="可保存" value={canSave ? "是" : "否"} />
              <MetricCard label="关系类型" value={formatRelationshipType(draft.relationshipType ?? "expert")} />
              <MetricCard label="擅长领域数" value={(draft.expertDomains?.length ?? 0) || 0} />
            </div>
          </Card>

          <Card id="character-editor-memory" className="bg-[color:var(--surface-console)]">
            <SectionHeading>推理与记忆</SectionHeading>
            <TextAreaField
              label="记忆摘要"
              value={profile.memorySummary}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, memorySummary: value } }))}
            />
            <TextAreaField
              label="核心记忆"
              value={profile.memory?.coreMemory ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    memory: {
                      ...profile.memory!,
                      coreMemory: value,
                    },
                  },
                }))
              }
            />
            <Field
              label="遗忘曲线"
              value={String(profile.memory?.forgettingCurve ?? 70)}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    memory: {
                      ...profile.memory!,
                      forgettingCurve: Number(value) || 0,
                    },
                  },
                }))
              }
            />
            <div className="mt-4 space-y-3">
              <Toggle
                label="启用链路推理"
                checked={profile.reasoningConfig?.enableCoT ?? true}
                onChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    profile: {
                      ...profile,
                      reasoningConfig: { ...profile.reasoningConfig!, enableCoT: checked },
                    },
                  }))
                }
              />
              <Toggle
                label="启用反思"
                checked={profile.reasoningConfig?.enableReflection ?? true}
                onChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    profile: {
                      ...profile,
                      reasoningConfig: { ...profile.reasoningConfig!, enableReflection: checked },
                    },
                  }))
                }
              />
              <Toggle
                label="启用路由"
                checked={profile.reasoningConfig?.enableRouting ?? true}
                onChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    profile: {
                      ...profile,
                      reasoningConfig: { ...profile.reasoningConfig!, enableRouting: checked },
                    },
                  }))
                }
              />
            </div>
          </Card>

          <Card id="character-editor-identity" className="bg-[color:var(--surface-console)]">
            <SectionHeading>身份与边界</SectionHeading>
            <Field
              label="职业"
              value={profile.identity?.occupation ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, occupation: value } },
                }))
              }
            />
            <TextAreaField
              label="背景"
              value={profile.identity?.background ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, background: value } },
                }))
              }
            />
            <Field
              label="工作风格"
              value={profile.behavioralPatterns?.workStyle ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    behavioralPatterns: { ...profile.behavioralPatterns!, workStyle: value },
                  },
                }))
              }
            />
            <Field
              label="社交风格"
              value={profile.behavioralPatterns?.socialStyle ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    behavioralPatterns: { ...profile.behavioralPatterns!, socialStyle: value },
                  },
                }))
              }
            />
            <TextAreaField
              label="能力边界说明"
              value={profile.cognitiveBoundaries?.expertiseDescription ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: {
                    ...profile,
                    cognitiveBoundaries: { ...profile.cognitiveBoundaries!, expertiseDescription: value },
                  },
                }))
              }
            />
          </Card>

          <Card id="character-editor-preview" className="bg-[color:var(--surface-console)]">
            <SectionHeading>预览</SectionHeading>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--surface-secondary)] text-xl">
                {draft.avatar || draft.name?.slice(0, 1) || "?"}
              </div>
              <div>
                <div className="text-lg font-semibold text-[color:var(--text-primary)]">{draft.name || "未命名角色"}</div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{draft.relationship || "关系待填写"}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(draft.expertDomains?.length ? draft.expertDomains : ["general"]).map((domain) => (
                <StatusPill key={domain}>{domain === "general" ? "通用" : domain}</StatusPill>
              ))}
            </div>
            <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">{draft.bio || "补充角色简介，说明它应当如何出现在这个世界里。"}</p>
          </Card>
        </div>
        </div>
      </div>
    </div>
  );
}

function normalizeDraft(draft: CharacterDraft, characterId: string, isNew: boolean): CharacterDraft {
  const normalizedId = isNew ? `char_${Date.now()}` : characterId;
  const profile = draft.profile ?? emptyCharacterDraft.profile!;
  const expertDomains = draft.expertDomains?.length ? draft.expertDomains : ["general"];

  return {
    ...draft,
    id: normalizedId,
    name: draft.name?.trim(),
    avatar: draft.avatar?.trim() ?? "",
    relationship: draft.relationship?.trim(),
    bio: draft.bio?.trim(),
    expertDomains,
    triggerScenes: draft.triggerScenes?.filter(Boolean) ?? [],
    profile: {
      ...profile,
      characterId: normalizedId,
      name: draft.name?.trim() ?? "",
      relationship: draft.relationship?.trim() ?? "",
      expertDomains,
      basePrompt: profile.basePrompt?.trim() ?? "",
      systemPrompt: profile.systemPrompt?.trim() ?? "",
      memorySummary: profile.memorySummary?.trim() ?? "",
      traits: {
        ...profile.traits,
        emotionalTone: profile.traits.emotionalTone?.trim() || "grounded",
      },
      identity: {
        occupation: profile.identity?.occupation?.trim() ?? "",
        background: profile.identity?.background?.trim() ?? "",
        motivation: profile.identity?.motivation?.trim() ?? "",
        worldview: profile.identity?.worldview?.trim() ?? "",
      },
      behavioralPatterns: {
        workStyle: profile.behavioralPatterns?.workStyle?.trim() ?? "",
        socialStyle: profile.behavioralPatterns?.socialStyle?.trim() ?? "",
        taboos: profile.behavioralPatterns?.taboos ?? [],
        quirks: profile.behavioralPatterns?.quirks ?? [],
      },
      cognitiveBoundaries: {
        expertiseDescription: profile.cognitiveBoundaries?.expertiseDescription?.trim() ?? "",
        knowledgeLimits: profile.cognitiveBoundaries?.knowledgeLimits?.trim() ?? "",
        refusalStyle: profile.cognitiveBoundaries?.refusalStyle?.trim() ?? "",
      },
      reasoningConfig: {
        enableCoT: profile.reasoningConfig?.enableCoT ?? true,
        enableReflection: profile.reasoningConfig?.enableReflection ?? true,
        enableRouting: profile.reasoningConfig?.enableRouting ?? true,
      },
      memory: {
        coreMemory: profile.memory?.coreMemory?.trim() ?? "",
        recentSummary: profile.memory?.recentSummary?.trim() ?? "",
        forgettingCurve: profile.memory?.forgettingCurve ?? 70,
      },
    },
  };
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{label}</div>
      <UiTextField
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="mt-4 block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{label}</div>
      <UiTextAreaField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{label}</div>
      <UiSelectField
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={typeof option === "string" ? option : option.value} value={typeof option === "string" ? option : option.value}>
            {typeof option === "string" ? option : option.label}
          </option>
        ))}
      </UiSelectField>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <ToggleChip label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />;
}

function formatRelationshipType(type: Character["relationshipType"]) {
  switch (type) {
    case "family":
      return "家人";
    case "friend":
      return "朋友";
    case "expert":
      return "专家";
    case "mentor":
      return "导师";
    case "custom":
      return "自定义";
    default:
      return type;
  }
}

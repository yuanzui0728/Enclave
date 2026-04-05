import { useEffect, useState } from "react";
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
  AppHeader,
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
  const baseUrl = import.meta.env.VITE_CORE_API_BASE_URL;
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

  const profile = draft.profile ?? emptyCharacterDraft.profile!;
  const canSave = Boolean(draft.name?.trim() && draft.relationship?.trim());

  return (
    <div className="space-y-6">
      <AppHeader
        eyebrow="Character Editor"
        title={isNew ? "New Character" : draft.name || "Edit Character"}
        description="先补齐基础身份和关系，再完善 prompt、traits、memory 与边界。"
        actions={
          <div className="flex flex-wrap gap-3">
            <Link to="/characters">
              <Button variant="secondary" size="lg">Back</Button>
            </Link>
            <Button onClick={() => saveMutation.mutate()} disabled={!canSave || saveMutation.isPending} variant="primary" size="lg">
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      />

      {!isNew && characterQuery.isLoading ? <LoadingBlock label="Loading character draft..." /> : null}

      {!isNew && characterQuery.isError && characterQuery.error instanceof Error ? <ErrorBlock message={characterQuery.error.message} /> : null}

      {!canSave ? <InlineNotice tone="warning">Name and relationship are required before saving this character.</InlineNotice> : null}

      {saveMutation.isError && saveMutation.error instanceof Error ? <ErrorBlock message={saveMutation.error.message} /> : null}

      {saveMutation.isSuccess ? <InlineNotice tone="success">Character saved. Redirecting back to the registry...</InlineNotice> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>Basic</SectionHeading>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Name" value={draft.name ?? ""} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
              <Field label="Avatar" value={draft.avatar ?? ""} onChange={(value) => setDraft((current) => ({ ...current, avatar: value }))} />
              <Field
                label="Relationship"
                value={draft.relationship ?? ""}
                onChange={(value) => setDraft((current) => ({ ...current, relationship: value }))}
              />
              <SelectField
                label="Relationship Type"
                value={draft.relationshipType ?? "expert"}
                onChange={(value) => setDraft((current) => ({ ...current, relationshipType: value as Character["relationshipType"] }))}
                options={["family", "friend", "expert", "mentor", "custom"]}
              />
              <Field
                label="Expert Domains"
                value={listToCsv(draft.expertDomains)}
                onChange={(value) => setDraft((current) => ({ ...current, expertDomains: csvToList(value) }))}
              />
              <Field
                label="Trigger Scenes"
                value={listToCsv(draft.triggerScenes)}
                onChange={(value) => setDraft((current) => ({ ...current, triggerScenes: csvToList(value) }))}
              />
            </div>
            <TextAreaField
              label="Bio"
              value={draft.bio ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, bio: value }))}
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Toggle
                label="Online"
                checked={draft.isOnline ?? false}
                onChange={(checked) => setDraft((current) => ({ ...current, isOnline: checked }))}
              />
              <Toggle
                label="Template"
                checked={draft.isTemplate ?? false}
                onChange={(checked) => setDraft((current) => ({ ...current, isTemplate: checked }))}
              />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>Prompt and Traits</SectionHeading>
            <TextAreaField
              label="Base Prompt"
              value={profile.basePrompt ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, basePrompt: value } }))}
            />
            <TextAreaField
              label="System Prompt"
              value={profile.systemPrompt ?? ""}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, systemPrompt: value } }))}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Speech Patterns"
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
                label="Catchphrases"
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
                label="Topics of Interest"
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
                label="Emotional Tone"
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
            <SectionHeading>Save State</SectionHeading>
            <div className="mt-4 space-y-3">
              <MetricCard label="Ready To Save" value={canSave ? "yes" : "no"} />
              <MetricCard label="Relationship Type" value={draft.relationshipType ?? "expert"} />
              <MetricCard label="Expert Domains" value={(draft.expertDomains?.length ?? 0) || 0} />
            </div>
          </Card>

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>Reasoning and Memory</SectionHeading>
            <TextAreaField
              label="Memory Summary"
              value={profile.memorySummary}
              onChange={(value) => setDraft((current) => ({ ...current, profile: { ...profile, memorySummary: value } }))}
            />
            <TextAreaField
              label="Core Memory"
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
              label="Forgetting Curve"
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
                label="Enable CoT"
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
                label="Enable Reflection"
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
                label="Enable Routing"
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

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>Identity and Boundaries</SectionHeading>
            <Field
              label="Occupation"
              value={profile.identity?.occupation ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, occupation: value } },
                }))
              }
            />
            <TextAreaField
              label="Background"
              value={profile.identity?.background ?? ""}
              onChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  profile: { ...profile, identity: { ...profile.identity!, background: value } },
                }))
              }
            />
            <Field
              label="Work Style"
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
              label="Social Style"
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
              label="Expertise Description"
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

          <Card className="bg-[color:var(--surface-console)]">
            <SectionHeading>Preview</SectionHeading>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-xl">
                {draft.avatar || draft.name?.slice(0, 1) || "?"}
              </div>
              <div>
                <div className="text-lg font-semibold text-white">{draft.name || "Unnamed Character"}</div>
                <div className="mt-1 text-sm text-[color:var(--text-secondary)]">{draft.relationship || "Relationship pending"}</div>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(draft.expertDomains?.length ? draft.expertDomains : ["general"]).map((domain) => (
                <StatusPill key={domain}>{domain}</StatusPill>
              ))}
            </div>
            <p className="mt-4 text-sm leading-7 text-[color:var(--text-secondary)]">{draft.bio || "Add a bio to describe how this character should appear in the world."}</p>
          </Card>
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
    avatar: draft.avatar?.trim() || (draft.name?.trim().slice(0, 1) ?? "隐"),
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
  options: string[];
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">{label}</div>
      <UiSelectField
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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

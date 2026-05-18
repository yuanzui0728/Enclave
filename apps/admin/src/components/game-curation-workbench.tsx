import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  AdminGameCatalogItem,
  AdminGameCenterCuration,
  AdminUpdateGameCenterCurationRequest,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  Button,
  Card,
  ErrorBlock,
  LoadingBlock,
  MetricCard,
  SelectField,
  TextAreaField,
  TextField,
} from "@yinjie/ui";
import { AdminCallout, AdminEmptyState } from "./admin-workbench";
import { adminApi } from "../lib/admin-api";

type FeedbackPayload = {
  tone: "success" | "info";
  message: string;
};

type ShelfDraft = {
  id: string;
  title: string;
  description: string;
  gameIdsText: string;
};

type RankingDraft = {
  gameId: string;
  rank: string;
  note: string;
};

type EventDraft = {
  id: string;
  title: string;
  description: string;
  meta: string;
  ctaLabel: string;
  relatedGameId: string;
  actionKind: AdminGameCenterCuration["events"][number]["actionKind"];
  tone: AdminGameCatalogItem["tone"];
};

type StoryDraft = {
  id: string;
  title: string;
  description: string;
  eyebrow: string;
  authorName: string;
  ctaLabel: string;
  publishedAt: string;
  kind: AdminGameCenterCuration["stories"][number]["kind"];
  tone: AdminGameCatalogItem["tone"];
  relatedGameId: string;
};

type CurationDraft = {
  featuredGameIdsText: string;
  shelves: ShelfDraft[];
  hotRankings: RankingDraft[];
  newRankings: RankingDraft[];
  events: EventDraft[];
  stories: StoryDraft[];
};

const TONE_OPTIONS: Array<{
  value: AdminGameCatalogItem["tone"];
  label: string;
}> = [
  { value: "forest", label: "Forest" },
  { value: "gold", label: "Gold" },
  { value: "ocean", label: "Ocean" },
  { value: "violet", label: "Violet" },
  { value: "sunset", label: "Sunset" },
  { value: "mint", label: "Mint" },
];

const EVENT_ACTION_OPTION_MESSAGES: Array<{
  value: EventDraft["actionKind"];
  label: ReturnType<typeof msg>;
}> = [
  { value: "mission", label: msg`任务` },
  { value: "reminder", label: msg`提醒` },
  { value: "join", label: msg`召回` },
];

const STORY_KIND_OPTION_MESSAGES: Array<{
  value: StoryDraft["kind"];
  label: ReturnType<typeof msg>;
}> = [
  { value: "spotlight", label: msg`主推专题` },
  { value: "guide", label: msg`攻略指南` },
  { value: "update", label: msg`版本更新` },
  { value: "behind_the_scenes", label: msg`幕后内容` },
];

function splitCommaLikeText(value: string) {
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinIdsText(values: string[]) {
  return values.join("\n");
}

function updateListItem<T>(
  items: T[],
  index: number,
  updater: (item: T) => T,
) {
  return items.map((item, itemIndex) =>
    itemIndex === index ? updater(item) : item,
  );
}

function removeListItem<T>(items: T[], index: number) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

function padDateSegment(value: number) {
  return String(value).padStart(2, "0");
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${padDateSegment(
    date.getMonth() + 1,
  )}-${padDateSegment(date.getDate())}T${padDateSegment(
    date.getHours(),
  )}:${padDateSegment(date.getMinutes())}`;
}

function fromDateTimeLocalValue(value: string) {
  const nextValue = value.trim();
  if (!nextValue) {
    return "";
  }

  const date = new Date(nextValue);
  return Number.isNaN(date.getTime()) ? nextValue : date.toISOString();
}

function createEmptyShelfDraft(indexHint = 1): ShelfDraft {
  return {
    id: `shelf-${indexHint}`,
    title: "",
    description: "",
    gameIdsText: "",
  };
}

function createEmptyRankingDraft(
  rankHint = 1,
  defaultGameId = "",
): RankingDraft {
  return {
    gameId: defaultGameId,
    rank: String(rankHint),
    note: "",
  };
}

function createEmptyEventDraft(
  indexHint = 1,
  defaultGameId = "",
): EventDraft {
  return {
    id: `event-${indexHint}`,
    title: "",
    description: "",
    meta: "",
    ctaLabel: translateRuntimeMessage(msg`立即查看`),
    relatedGameId: defaultGameId,
    actionKind: "mission",
    tone: "forest",
  };
}

function createEmptyStoryDraft(
  indexHint = 1,
  defaultGameId = "",
): StoryDraft {
  return {
    id: `story-${indexHint}`,
    title: "",
    description: "",
    eyebrow: translateRuntimeMessage(msg`编辑精选`),
    authorName: translateRuntimeMessage(msg`隐界编辑部`),
    ctaLabel: translateRuntimeMessage(msg`查看内容`),
    publishedAt: new Date().toISOString(),
    kind: "spotlight",
    tone: "forest",
    relatedGameId: defaultGameId,
  };
}

function createEmptyCurationDraft(): CurationDraft {
  return {
    featuredGameIdsText: "",
    shelves: [],
    hotRankings: [],
    newRankings: [],
    events: [],
    stories: [],
  };
}

function curationDraftFromResponse(
  curation: AdminGameCenterCuration,
): CurationDraft {
  return {
    featuredGameIdsText: joinIdsText(curation.featuredGameIds),
    shelves: curation.shelves.map((shelf) => ({
      id: shelf.id,
      title: shelf.title,
      description: shelf.description,
      gameIdsText: joinIdsText(shelf.gameIds),
    })),
    hotRankings: curation.hotRankings.map((entry) => ({
      gameId: entry.gameId,
      rank: String(entry.rank),
      note: entry.note,
    })),
    newRankings: curation.newRankings.map((entry) => ({
      gameId: entry.gameId,
      rank: String(entry.rank),
      note: entry.note,
    })),
    events: curation.events.map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
      meta: event.meta,
      ctaLabel: event.ctaLabel,
      relatedGameId: event.relatedGameId,
      actionKind: event.actionKind,
      tone: event.tone,
    })),
    stories: curation.stories.map((story) => ({
      id: story.id,
      title: story.title,
      description: story.description,
      eyebrow: story.eyebrow,
      authorName: story.authorName,
      ctaLabel: story.ctaLabel,
      publishedAt: story.publishedAt,
      kind: story.kind,
      tone: story.tone,
      relatedGameId: story.relatedGameId ?? "",
    })),
  };
}

function toCurationPayload(
  draft: CurationDraft,
): AdminUpdateGameCenterCurationRequest {
  return {
    featuredGameIds: Array.from(new Set(splitCommaLikeText(draft.featuredGameIdsText))),
    shelves: draft.shelves.map((shelf) => ({
      id: shelf.id.trim(),
      title: shelf.title.trim(),
      description: shelf.description.trim(),
      gameIds: Array.from(new Set(splitCommaLikeText(shelf.gameIdsText))),
    })),
    hotRankings: draft.hotRankings.map((entry, index) => ({
      gameId: entry.gameId.trim(),
      rank: Number(entry.rank) || index + 1,
      note: entry.note.trim(),
    })),
    newRankings: draft.newRankings.map((entry, index) => ({
      gameId: entry.gameId.trim(),
      rank: Number(entry.rank) || index + 1,
      note: entry.note.trim(),
    })),
    events: draft.events.map((event) => ({
      id: event.id.trim(),
      title: event.title.trim(),
      description: event.description.trim(),
      meta: event.meta.trim(),
      ctaLabel: event.ctaLabel.trim(),
      relatedGameId: event.relatedGameId.trim(),
      actionKind: event.actionKind,
      tone: event.tone,
    })),
    stories: draft.stories.map((story) => ({
      id: story.id.trim(),
      title: story.title.trim(),
      description: story.description.trim(),
      eyebrow: story.eyebrow.trim(),
      authorName: story.authorName.trim(),
      ctaLabel: story.ctaLabel.trim(),
      publishedAt: story.publishedAt.trim(),
      kind: story.kind,
      tone: story.tone,
      relatedGameId: story.relatedGameId.trim() || null,
    })),
  };
}

function GameIdHints({ games }: { games: AdminGameCatalogItem[] }) {
  const t = translateRuntimeMessage;
  if (!games.length) {
    return (
      <AdminEmptyState
        title={t(msg`目录还没有可引用的游戏`)}
        description={t(msg`先在上面的目录工作台里创建游戏，策展配置才能引用这些游戏 ID。`)}
      />
    );
  }

  return (
    <Card className="bg-[linear-gradient(180deg,rgba(252,252,249,0.98),rgba(255,255,255,0.98))]">
      <div className="text-[12px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
        Catalog Index
      </div>
      <div className="mt-2 text-base font-semibold text-[color:var(--text-primary)]">
        {t(msg`当前可引用的游戏目录`)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {games.map((game) => (
          <span
            key={game.id}
            className="rounded-full border border-[color:var(--border-faint)] bg-white px-3 py-1 text-xs text-[color:var(--text-secondary)]"
          >
            {game.id} · {game.name}
          </span>
        ))}
      </div>
    </Card>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[12px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
          {title}
        </div>
        <div className="mt-2 text-lg font-semibold text-[color:var(--text-primary)]">
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-[color:var(--text-secondary)]">
          {description}
        </div>
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-2 text-xs uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
      {children}
    </div>
  );
}

function InlineEditorField({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <TextField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function InlineEditorTextArea({
  label,
  value,
  onChange,
  placeholder,
  minHeightClassName,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClassName?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <TextAreaField
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={minHeightClassName ?? "min-h-24"}
      />
    </label>
  );
}

export function GameCurationWorkbench({
  games,
  onFeedback,
}: {
  games: AdminGameCatalogItem[];
  onFeedback: (feedback: FeedbackPayload) => void;
}) {
  const t = translateRuntimeMessage;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<CurationDraft>(() => createEmptyCurationDraft());

  const defaultGameId = games[0]?.id ?? "";

  const curationQuery = useQuery({
    queryKey: ["admin-games-curation"],
    queryFn: () => adminApi.getGameCenterCuration(),
  });

  useEffect(() => {
    if (!curationQuery.data) {
      return;
    }

    setDraft(curationDraftFromResponse(curationQuery.data));
  }, [curationQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: AdminUpdateGameCenterCurationRequest) =>
      adminApi.updateGameCenterCuration(payload),
    onSuccess: (curation) => {
      queryClient.setQueryData(["admin-games-curation"], curation);
      setDraft(curationDraftFromResponse(curation));
      onFeedback({
        tone: "success",
        message: t(msg`游戏中心首页策展配置已保存。`),
      });
    },
  });

  const metrics = useMemo(() => {
    return {
      featured: splitCommaLikeText(draft.featuredGameIdsText).length,
      shelves: draft.shelves.length,
      events: draft.events.length,
      stories: draft.stories.length,
    };
  }, [draft]);

  async function handleSave() {
    if (!games.length) {
      onFeedback({
        tone: "info",
        message: t(msg`目录里还没有游戏，无法保存策展配置。`),
      });
      return;
    }

    try {
      await saveMutation.mutateAsync(toCurationPayload(draft));
    } catch (error) {
      onFeedback({
        tone: "info",
        message:
          error instanceof Error ? error.message : t(msg`保存策展配置失败，请稍后重试。`),
      });
    }
  }

  function handleReset() {
    if (!curationQuery.data) {
      return;
    }

    setDraft(curationDraftFromResponse(curationQuery.data));
    onFeedback({
      tone: "info",
      message: t(msg`策展草稿已恢复到当前线上配置。`),
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard label={t(msg`主推位`)} value={String(metrics.featured)} />
        <MetricCard label={t(msg`发现货架`)} value={String(metrics.shelves)} />
        <MetricCard label={t(msg`活动卡`)} value={String(metrics.events)} />
        <MetricCard label={t(msg`内容卡`)} value={String(metrics.stories)} />
      </div>

      <AdminCallout
        title={t(msg`首页运营位、榜单和内容卡已经收口到服务端策展配置`)}
        description={t(msg`这里维护的是游戏中心首页真实货架。前台首页、榜单、看内容会直接读取这份配置，不再写死在种子数据里。`)}
        tone="info"
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={handleReset}
              disabled={!curationQuery.data || saveMutation.isPending}
            >
              {t(msg`恢复线上`)}
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saveMutation.isPending || curationQuery.isLoading}
            >
              {saveMutation.isPending ? t(msg`保存中...`) : t(msg`保存策展`)}
            </Button>
          </div>
        }
      />

      <GameIdHints games={games} />

      {curationQuery.isLoading ? <LoadingBlock label={t(msg`正在加载游戏策展配置...`)} /> : null}
      {curationQuery.isError && curationQuery.error instanceof Error ? (
        <ErrorBlock message={curationQuery.error.message} />
      ) : null}

      {curationQuery.data ? (
        <div className="space-y-6">
          <Card className="bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,251,250,0.98))]">
            <SectionHeader
              title={t(msg`首页主推位`)}
              description={t(msg`按顺序填写首页首屏主推游戏 ID。使用换行或逗号分隔，保存后前台首屏和主推荐区都会同步更新。`)}
            />
            <div className="mt-5">
              <InlineEditorTextArea
                label={t(msg`主推游戏 ID 列表`)}
                value={draft.featuredGameIdsText}
                onChange={(value) =>
                  setDraft((current) => ({ ...current, featuredGameIdsText: value }))
                }
                placeholder={"signal-squad\nnight-market\ncat-inn"}
                minHeightClassName="min-h-32"
              />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeader
                title={t(msg`发现货架`)}
                description={t(msg`定义首页和找游戏页里的主题货架，每个货架都可以承载一组游戏。`)}
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        shelves: [
                          ...current.shelves,
                          createEmptyShelfDraft(current.shelves.length + 1),
                        ],
                      }))
                    }
                  >
                    {t(msg`新增货架`)}
                  </Button>
                }
              />
              <div className="mt-5 space-y-4">
                {!draft.shelves.length ? (
                  <AdminEmptyState
                    title={t(msg`还没有货架`)}
                    description={t(msg`至少配置一组货架，找游戏页才会有可运营的主题模块。`)}
                  />
                ) : null}

                {draft.shelves.map((shelf, index) => (
                  <Card
                    key={`${shelf.id}-${index}`}
                    className="border border-[color:var(--border-faint)] bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {t(msg`货架 ${index + 1}`)}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            shelves: removeListItem(current.shelves, index),
                          }))
                        }
                      >
                        {t(msg`删除`)}
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <InlineEditorField
                        label={t(msg`货架 ID`)}
                        value={shelf.id}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            shelves: updateListItem(current.shelves, index, (item) => ({
                              ...item,
                              id: value,
                            })),
                          }))
                        }
                      />
                      <InlineEditorField
                        label={t(msg`货架标题`)}
                        value={shelf.title}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            shelves: updateListItem(current.shelves, index, (item) => ({
                              ...item,
                              title: value,
                            })),
                          }))
                        }
                      />
                    </div>

                    <div className="mt-4">
                      <InlineEditorField
                        label={t(msg`货架描述`)}
                        value={shelf.description}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            shelves: updateListItem(current.shelves, index, (item) => ({
                              ...item,
                              description: value,
                            })),
                          }))
                        }
                      />
                    </div>

                    <div className="mt-4">
                      <InlineEditorTextArea
                        label={t(msg`游戏 ID 列表`)}
                        value={shelf.gameIdsText}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            shelves: updateListItem(current.shelves, index, (item) => ({
                              ...item,
                              gameIdsText: value,
                            })),
                          }))
                        }
                        placeholder={"signal-squad\ncat-inn"}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </Card>

            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeader
                title={t(msg`热门榜`)}
                description={t(msg`配置榜单顺序、说明文案和每个排名对应的游戏。`)}
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        hotRankings: [
                          ...current.hotRankings,
                          createEmptyRankingDraft(
                            current.hotRankings.length + 1,
                            defaultGameId,
                          ),
                        ],
                      }))
                    }
                  >
                    {t(msg`新增榜单项`)}
                  </Button>
                }
              />
              <div className="mt-5 space-y-4">
                {!draft.hotRankings.length ? (
                  <AdminEmptyState
                    title={t(msg`热门榜还没有内容`)}
                    description={t(msg`至少配置一条热门榜，前台榜单页才有主榜输出。`)}
                  />
                ) : null}

                {draft.hotRankings.map((entry, index) => (
                  <Card
                    key={`hot-ranking-${index}`}
                    className="border border-[color:var(--border-faint)] bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {t(msg`热门榜 #${index + 1}`)}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            hotRankings: removeListItem(current.hotRankings, index),
                          }))
                        }
                      >
                        {t(msg`删除`)}
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[120px_1fr]">
                      <InlineEditorField
                        label={t(msg`排名`)}
                        value={entry.rank}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            hotRankings: updateListItem(
                              current.hotRankings,
                              index,
                              (item) => ({
                                ...item,
                                rank: value,
                              }),
                            ),
                          }))
                        }
                        type="number"
                      />
                      <label className="block">
                        <FieldLabel>{t(msg`关联游戏`)}</FieldLabel>
                        <SelectField
                          value={entry.gameId}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              hotRankings: updateListItem(
                                current.hotRankings,
                                index,
                                (item) => ({
                                  ...item,
                                  gameId: event.target.value,
                                }),
                              ),
                            }))
                          }
                        >
                          <option value="">{t(msg`请选择游戏`)}</option>
                          {games.map((game) => (
                            <option key={`hot-${game.id}`} value={game.id}>
                              {game.name} ({game.id})
                            </option>
                          ))}
                        </SelectField>
                      </label>
                    </div>

                    <div className="mt-4">
                      <InlineEditorField
                        label={t(msg`榜单说明`)}
                        value={entry.note}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            hotRankings: updateListItem(
                              current.hotRankings,
                              index,
                              (item) => ({
                                ...item,
                                note: value,
                              }),
                            ),
                          }))
                        }
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </Card>

            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeader
                title={t(msg`新游榜`)}
                description={t(msg`单独维护新游推荐顺位和话术，不和热门榜共享。`)}
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        newRankings: [
                          ...current.newRankings,
                          createEmptyRankingDraft(
                            current.newRankings.length + 1,
                            defaultGameId,
                          ),
                        ],
                      }))
                    }
                  >
                    {t(msg`新增榜单项`)}
                  </Button>
                }
              />
              <div className="mt-5 space-y-4">
                {!draft.newRankings.length ? (
                  <AdminEmptyState
                    title={t(msg`新游榜还没有内容`)}
                    description={t(msg`新游榜建议单独突出最近上线或正在试运营的 AI 游戏。`)}
                  />
                ) : null}

                {draft.newRankings.map((entry, index) => (
                  <Card
                    key={`new-ranking-${index}`}
                    className="border border-[color:var(--border-faint)] bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {t(msg`新游榜 #${index + 1}`)}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            newRankings: removeListItem(current.newRankings, index),
                          }))
                        }
                      >
                        {t(msg`删除`)}
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[120px_1fr]">
                      <InlineEditorField
                        label={t(msg`排名`)}
                        value={entry.rank}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            newRankings: updateListItem(
                              current.newRankings,
                              index,
                              (item) => ({
                                ...item,
                                rank: value,
                              }),
                            ),
                          }))
                        }
                        type="number"
                      />
                      <label className="block">
                        <FieldLabel>{t(msg`关联游戏`)}</FieldLabel>
                        <SelectField
                          value={entry.gameId}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              newRankings: updateListItem(
                                current.newRankings,
                                index,
                                (item) => ({
                                  ...item,
                                  gameId: event.target.value,
                                }),
                              ),
                            }))
                          }
                        >
                          <option value="">{t(msg`请选择游戏`)}</option>
                          {games.map((game) => (
                            <option key={`new-${game.id}`} value={game.id}>
                              {game.name} ({game.id})
                            </option>
                          ))}
                        </SelectField>
                      </label>
                    </div>

                    <div className="mt-4">
                      <InlineEditorField
                        label={t(msg`榜单说明`)}
                        value={entry.note}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            newRankings: updateListItem(
                              current.newRankings,
                              index,
                              (item) => ({
                                ...item,
                                note: value,
                              }),
                            ),
                          }))
                        }
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </Card>

            <Card className="bg-[color:var(--surface-console)]">
              <SectionHeader
                title={t(msg`活动卡`)}
                description={t(msg`用于首页活动位、任务召回和专题入口。`)}
                action={
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        events: [
                          ...current.events,
                          createEmptyEventDraft(current.events.length + 1, defaultGameId),
                        ],
                      }))
                    }
                  >
                    {t(msg`新增活动卡`)}
                  </Button>
                }
              />
              <div className="mt-5 space-y-4">
                {!draft.events.length ? (
                  <AdminEmptyState
                    title={t(msg`还没有活动卡`)}
                    description={t(msg`活动卡适合承接限时任务、活动提醒和回流召回。`)}
                  />
                ) : null}

                {draft.events.map((event, index) => (
                  <Card
                    key={`${event.id}-${index}`}
                    className="border border-[color:var(--border-faint)] bg-white"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                        {t(msg`活动卡 ${index + 1}`)}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            events: removeListItem(current.events, index),
                          }))
                        }
                      >
                        {t(msg`删除`)}
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <InlineEditorField
                        label={t(msg`活动 ID`)}
                        value={event.id}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            events: updateListItem(current.events, index, (item) => ({
                              ...item,
                              id: value,
                            })),
                          }))
                        }
                      />
                      <InlineEditorField
                        label={t(msg`活动标题`)}
                        value={event.title}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            events: updateListItem(current.events, index, (item) => ({
                              ...item,
                              title: value,
                            })),
                          }))
                        }
                      />
                    </div>

                    <div className="mt-4">
                      <InlineEditorTextArea
                        label={t(msg`活动描述`)}
                        value={event.description}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            events: updateListItem(current.events, index, (item) => ({
                              ...item,
                              description: value,
                            })),
                          }))
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <InlineEditorField
                        label={t(msg`Meta 文案`)}
                        value={event.meta}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            events: updateListItem(current.events, index, (item) => ({
                              ...item,
                              meta: value,
                            })),
                          }))
                        }
                      />
                      <InlineEditorField
                        label="CTA"
                        value={event.ctaLabel}
                        onChange={(value) =>
                          setDraft((current) => ({
                            ...current,
                            events: updateListItem(current.events, index, (item) => ({
                              ...item,
                              ctaLabel: value,
                            })),
                          }))
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="block">
                        <FieldLabel>{t(msg`关联游戏`)}</FieldLabel>
                        <SelectField
                          value={event.relatedGameId}
                          onChange={(eventValue) =>
                            setDraft((current) => ({
                              ...current,
                              events: updateListItem(current.events, index, (item) => ({
                                ...item,
                                relatedGameId: eventValue.target.value,
                              })),
                            }))
                          }
                        >
                          <option value="">{t(msg`请选择游戏`)}</option>
                          {games.map((game) => (
                            <option key={`event-${game.id}`} value={game.id}>
                              {game.name} ({game.id})
                            </option>
                          ))}
                        </SelectField>
                      </label>
                      <label className="block">
                        <FieldLabel>{t(msg`动作类型`)}</FieldLabel>
                        <SelectField
                          value={event.actionKind}
                          onChange={(eventValue) =>
                            setDraft((current) => ({
                              ...current,
                              events: updateListItem(current.events, index, (item) => ({
                                ...item,
                                actionKind:
                                  eventValue.target.value as EventDraft["actionKind"],
                              })),
                            }))
                          }
                        >
                          {EVENT_ACTION_OPTION_MESSAGES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {t(option.label)}
                            </option>
                          ))}
                        </SelectField>
                      </label>
                      <label className="block">
                        <FieldLabel>Tone</FieldLabel>
                        <SelectField
                          value={event.tone}
                          onChange={(eventValue) =>
                            setDraft((current) => ({
                              ...current,
                              events: updateListItem(current.events, index, (item) => ({
                                ...item,
                                tone:
                                  eventValue.target.value as AdminGameCatalogItem["tone"],
                              })),
                            }))
                          }
                        >
                          {TONE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </SelectField>
                      </label>
                    </div>
                  </Card>
                ))}
              </div>
            </Card>
          </div>

          <Card className="bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,250,252,0.98))]">
            <SectionHeader
              title={t(msg`内容卡`)}
              description={t(msg`维护"看内容"分栏里的攻略、更新、幕后专题等内容卡。`)}
              action={
                <Button
                  variant="secondary"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      stories: [
                        ...current.stories,
                        createEmptyStoryDraft(current.stories.length + 1, defaultGameId),
                      ],
                    }))
                  }
                >
                  {t(msg`新增内容卡`)}
                </Button>
              }
            />
            <div className="mt-5 space-y-4">
              {!draft.stories.length ? (
                <AdminEmptyState
                  title={t(msg`还没有内容卡`)}
                  description={t(msg`攻略、版本更新和幕后内容都可以通过这里进入游戏中心。`)}
                />
              ) : null}

              {draft.stories.map((story, index) => (
                <Card
                  key={`${story.id}-${index}`}
                  className="border border-[color:var(--border-faint)] bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[color:var(--text-primary)]">
                      {t(msg`内容卡 ${index + 1}`)}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          stories: removeListItem(current.stories, index),
                        }))
                      }
                    >
                      {t(msg`删除`)}
                    </Button>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <InlineEditorField
                      label={t(msg`内容 ID`)}
                      value={story.id}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          stories: updateListItem(current.stories, index, (item) => ({
                            ...item,
                            id: value,
                          })),
                        }))
                      }
                    />
                    <InlineEditorField
                      label={t(msg`标题`)}
                      value={story.title}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          stories: updateListItem(current.stories, index, (item) => ({
                            ...item,
                            title: value,
                          })),
                        }))
                      }
                    />
                  </div>

                  <div className="mt-4">
                    <InlineEditorTextArea
                      label={t(msg`摘要`)}
                      value={story.description}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          stories: updateListItem(current.stories, index, (item) => ({
                            ...item,
                            description: value,
                          })),
                        }))
                      }
                    />
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <InlineEditorField
                      label="Eyebrow"
                      value={story.eyebrow}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          stories: updateListItem(current.stories, index, (item) => ({
                            ...item,
                            eyebrow: value,
                          })),
                        }))
                      }
                    />
                    <InlineEditorField
                      label={t(msg`作者`)}
                      value={story.authorName}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          stories: updateListItem(current.stories, index, (item) => ({
                            ...item,
                            authorName: value,
                          })),
                        }))
                      }
                    />
                    <InlineEditorField
                      label="CTA"
                      value={story.ctaLabel}
                      onChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          stories: updateListItem(current.stories, index, (item) => ({
                            ...item,
                            ctaLabel: value,
                          })),
                        }))
                      }
                    />
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <label className="block">
                      <FieldLabel>{t(msg`内容类型`)}</FieldLabel>
                      <SelectField
                        value={story.kind}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            stories: updateListItem(current.stories, index, (item) => ({
                              ...item,
                              kind: event.target.value as StoryDraft["kind"],
                            })),
                          }))
                        }
                      >
                        {STORY_KIND_OPTION_MESSAGES.map((option) => (
                          <option key={option.value} value={option.value}>
                            {t(option.label)}
                          </option>
                        ))}
                      </SelectField>
                    </label>
                    <label className="block">
                      <FieldLabel>Tone</FieldLabel>
                      <SelectField
                        value={story.tone}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            stories: updateListItem(current.stories, index, (item) => ({
                              ...item,
                              tone:
                                event.target.value as AdminGameCatalogItem["tone"],
                            })),
                          }))
                        }
                      >
                        {TONE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectField>
                    </label>
                    <label className="block">
                      <FieldLabel>{t(msg`发布时间`)}</FieldLabel>
                      <TextField
                        type="datetime-local"
                        value={toDateTimeLocalValue(story.publishedAt)}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            stories: updateListItem(current.stories, index, (item) => ({
                              ...item,
                              publishedAt: fromDateTimeLocalValue(event.target.value),
                            })),
                          }))
                        }
                      />
                    </label>
                    <label className="block">
                      <FieldLabel>{t(msg`关联游戏`)}</FieldLabel>
                      <SelectField
                        value={story.relatedGameId}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            stories: updateListItem(current.stories, index, (item) => ({
                              ...item,
                              relatedGameId: event.target.value,
                            })),
                          }))
                        }
                      >
                        <option value="">{t(msg`不关联具体游戏`)}</option>
                        {games.map((game) => (
                          <option key={`story-${game.id}`} value={game.id}>
                            {game.name} ({game.id})
                          </option>
                        ))}
                      </SelectField>
                    </label>
                  </div>
                </Card>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
// i18n-ignore-end

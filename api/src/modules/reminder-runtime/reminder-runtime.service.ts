import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { WorldOwnerService } from '../auth/world-owner.service';
import { MessageEntity } from '../chat/message.entity';
import {
  REMINDER_CHARACTER_ID,
  REMINDER_CHARACTER_SOURCE_KEY,
} from '../characters/reminder-character';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { WorldService } from '../world/world.service';
import {
  WorldLanguageService,
  type WorldLanguageCode,
} from '../config/world-language.service';
import { ReminderTaskEntity } from './reminder-task.entity';
import { ReminderRuntimeRulesService } from './reminder-runtime-rules.service';
import { normalizeReminderRuntimeRules } from './reminder-runtime.types';
import type {
  ReminderRecurrenceRule,
  ReminderRuntimePreviewSourceValue,
  ReminderRuntimeParserPeriodDefaultsValue,
  ReminderRuntimePreviewActionValue,
  ReminderRuntimePreviewMatchedRulesValue,
  ReminderRuntimePreviewParsedTaskValue,
  ReminderRuntimePreviewReferencedTaskValue,
  ReminderRuntimePreviewResultValue,
  ReminderRuntimeRulesValue,
  ReminderTaskKind,
  ReminderTaskPriority,
  ReminderTaskRecordValue,
  ReminderTaskStatus,
} from './reminder-runtime.types';

type ReminderTaskQuery = {
  status?: string;
};

type ReminderConversationEvaluationInput = {
  ownerId: string;
  conversationId: string;
  text: string;
  timezone: string;
  now: Date;
  rules: ReminderRuntimeRulesValue;
  sourceMessageId?: string;
};

type ReminderTurnResult = {
  handled: boolean;
  responseText?: string;
  task?: ReminderTaskRecordValue | null;
};

type ReminderDispatch = {
  taskId?: string;
  conversationId: string;
  characterId: string;
  characterName: string;
  text: string;
};

type ReminderMomentSlot = 'morning' | 'evening' | 'general';

type ReminderMomentNudge = {
  id: string;
  title: string;
  category: string;
  kind: ReminderTaskKind;
  priority: ReminderTaskPriority;
  scheduleText: string;
  completionCount: number;
};

type ReminderRuntimeOverviewMessage = {
  id: string;
  conversationId: string;
  text: string;
  createdAt: string;
};

type ReminderRuntimeOverviewMoment = {
  id: string;
  text: string;
  generationKind: string;
  slot: string | null;
  slotLabel: string | null;
  likeCount: number;
  commentCount: number;
  postedAt: string;
};

type ReminderRuntimeOverviewStats = {
  activeTaskCount: number;
  dueSoonTaskCount: number;
  overdueTaskCount: number;
  habitTaskCount: number;
  hardTaskCount: number;
  deliveredTodayCount: number;
  completedTodayCount: number;
  momentCountToday: number;
};

type ReminderRuntimeOverview = {
  rules: ReminderRuntimeRulesValue;
  stats: ReminderRuntimeOverviewStats;
  activeTasks: ReminderTaskRecordValue[];
  upcomingTasks: ReminderTaskRecordValue[];
  recentDeliveredTasks: ReminderTaskRecordValue[];
  recentCompletedTasks: ReminderTaskRecordValue[];
  recentMessages: ReminderRuntimeOverviewMessage[];
  recentMoments: ReminderRuntimeOverviewMoment[];
};

type ReminderParserPeriodKey = keyof ReminderRuntimeParserPeriodDefaultsValue;

type ParsedClock = {
  hour: number;
  minute: number;
  source: 'explicit' | 'period_default' | 'default';
  matchedPeriodKey?: ReminderParserPeriodKey | null;
  matchedPatterns?: string[];
};

type ParsedReminderIntent =
  | {
      handled: false;
      reason: string;
      debug: ReminderParserDebug;
    }
  | {
      handled: true;
      needsClarification: true;
      reason: string;
      responseText: string;
      debug: ReminderParserDebug;
    }
  | {
      handled: true;
      needsClarification?: false;
      reason: string;
      title: string;
      category: string;
      kind: ReminderTaskKind;
      priority: ReminderTaskPriority;
      timezone: string;
      dueAt?: Date | null;
      nextTriggerAt?: Date | null;
      recurrenceRule?: ReminderRecurrenceRule | null;
      responseText: string;
      debug: ReminderParserDebug;
    };

type ResolvedReminderIntent = Extract<
  ParsedReminderIntent,
  { handled: true; title: string }
>;

type ParsedWeeklyRule = {
  weekday: number;
  label: string;
  matchedKeyword: string;
};

type ExplicitClockMatch = {
  rawHour: string;
  rawMinuteToken?: string;
  rawMinuteDigits?: string;
  index: number;
  text: string;
};

type ReminderParserDebug = {
  normalizedText: string;
  source: ReminderRuntimePreviewSourceValue;
  matchedIntentPatterns: string[];
  matchedCreateKeywords: string[];
  matchedDailyKeywords: string[];
  matchedWeeklyKeywords: string[];
  matchedHabitIntentKeywords: string[];
  matchedHabitKeywords: string[];
  matchedHardKeywords: string[];
  matchedCategoryKeywords: string[];
  matchedPeriodKey: ReminderParserPeriodKey | null;
  matchedPeriodPatterns: string[];
  extractedTitle: string | null;
  canonicalMessage: string | null;
  fallbackReason: string | null;
};

type ReminderConversationEvaluation =
  | {
      handled: false;
      action: 'unhandled';
      source: ReminderRuntimePreviewSourceValue;
      reason: string;
      debug: ReminderParserDebug;
    }
  | {
      handled: true;
      action: 'help' | 'list';
      source: ReminderRuntimePreviewSourceValue;
      reason: string;
      responseText: string;
      debug: ReminderParserDebug;
    }
  | {
      handled: true;
      action: 'cancel' | 'complete' | 'snooze';
      source: ReminderRuntimePreviewSourceValue;
      reason: string;
      responseText: string;
      referencedTask: ReminderTaskEntity | null;
      snoozeUntil?: Date;
      debug: ReminderParserDebug;
    }
  | {
      handled: true;
      action: 'update';
      source: ReminderRuntimePreviewSourceValue;
      reason: string;
      responseText: string;
      referencedTask: ReminderTaskEntity | null;
      parsedIntent: ResolvedReminderIntent | null;
      debug: ReminderParserDebug;
    }
  | {
      handled: true;
      action: 'create';
      source: ReminderRuntimePreviewSourceValue;
      reason: string;
      parsedIntent: ParsedReminderIntent;
      debug: ReminderParserDebug;
    };

type ReminderLlmFallbackResult = {
  handled: boolean;
  reason: string;
  canonicalMessage: string | null;
};

const WEEKDAY_ALIASES: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 0,
};

function padTime(value: number) {
  return String(value).padStart(2, '0');
}

function formatTime(hour: number, minute: number) {
  return `${padTime(hour)}:${padTime(minute)}`;
}

function hashTextSeed(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function normalizeComparableText(value: string) {
  return value.replace(/[\s，。、“”‘’：:！!？?、,.]/g, '').trim();
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[，。、“”‘’：:！!？?；;,.]+$/g, '').trim();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripReminderCommand(value: string) {
  return stripTrailingPunctuation(
    value
      .replace(/^(请|麻烦你|帮我|你)?/, '')
      .replace(
        /(提醒我|记得提醒我|帮我记一下|帮我记着|帮我记住|帮我记|记一下|记着|记住)/g,
        '',
      )
      .trim(),
  );
}

function stripUpdateCommand(value: string) {
  const text = stripTrailingPunctuation(value.trim());
  if (!text) {
    return '';
  }

  const updateMatch = text.match(
    /(改成|改到|改为|改下|改一下|换成|换到|调整到|更正成|更正为|纠正成|纠正为)/,
  );
  if (updateMatch?.index != null) {
    return stripTrailingPunctuation(
      text.slice(updateMatch.index + updateMatch[0].length).trim(),
    );
  }

  if (/^(不对|不是)/.test(text)) {
    const pivot = text.lastIndexOf('是');
    if (pivot >= 0 && pivot < text.length - 1) {
      return stripTrailingPunctuation(text.slice(pivot + 1).trim());
    }
  }

  if (text.startsWith('是')) {
    return stripTrailingPunctuation(text.slice(1).trim());
  }

  return text;
}

function stripReferencedTaskTitle(text: string, title: string) {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return stripTrailingPunctuation(text.trim());
  }

  return stripTrailingPunctuation(
    text
      .replace(new RegExp(escapeRegex(normalizedTitle), 'gu'), ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function normalizeUpdateScheduleFragment(value: string) {
  return stripTrailingPunctuation(
    value
      .replace(/^(那就|那|就)\s*/u, '')
      .replace(
        /\s*(就行|就可以|就好|即可|吧|哈|呀|啊|呗|哦|噢|行吗|可以吗)$/u,
        '',
      )
      .trim(),
  );
}

function renderTemplate(
  template: string,
  variables: Record<string, string | number | undefined | null>,
) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    variables[key] == null ? '' : String(variables[key]),
  );
}

function splitTemplateVariants(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseChineseNumber(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return Number.NaN;
  }

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }

  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (trimmed === '十') {
    return 10;
  }
  if (trimmed.startsWith('十')) {
    return 10 + (digits[trimmed.slice(1)] ?? 0);
  }
  const tenIndex = trimmed.indexOf('十');
  if (tenIndex > 0) {
    const leading = digits[trimmed.slice(0, tenIndex)] ?? Number.NaN;
    const trailing = digits[trimmed.slice(tenIndex + 1)] ?? 0;
    return leading * 10 + trailing;
  }
  return digits[trimmed] ?? Number.NaN;
}

function formatDateTimeLabel(date: Date, now: Date) {
  const startOfNow = new Date(now);
  startOfNow.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(date);
  startOfTarget.setHours(0, 0, 0, 0);
  const diffDays =
    (startOfTarget.getTime() - startOfNow.getTime()) / (24 * 60 * 60 * 1000);
  const timeText = formatTime(date.getHours(), date.getMinutes());
  if (diffDays === 0) {
    return `今天 ${timeText}`;
  }
  if (diffDays === 1) {
    return `明天 ${timeText}`;
  }
  if (diffDays === 2) {
    return `后天 ${timeText}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${timeText}`;
}

@Injectable()
export class ReminderRuntimeService {
  constructor(
    @InjectRepository(ReminderTaskEntity)
    private readonly taskRepo: Repository<ReminderTaskEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(MomentPostEntity)
    private readonly momentPostRepo: Repository<MomentPostEntity>,
    private readonly worldOwnerService: WorldOwnerService,
    private readonly worldService: WorldService,
    private readonly rulesService: ReminderRuntimeRulesService,
    private readonly ai: AiOrchestratorService,
    private readonly worldLanguage: WorldLanguageService,
  ) {}

  getReminderCharacterIdentity() {
    return {
      id: REMINDER_CHARACTER_ID,
      sourceKey: REMINDER_CHARACTER_SOURCE_KEY,
      name: '小盯',
    };
  }

  buildConversationId(characterId = REMINDER_CHARACTER_ID) {
    return `direct_${characterId}`;
  }

  getRules() {
    return this.rulesService.getRules();
  }

  async setRules(
    patch: Partial<ReminderRuntimeRulesValue>,
  ): Promise<ReminderRuntimeRulesValue> {
    return this.rulesService.setRules(patch);
  }

  async previewMessage(input: {
    message: string;
    rules?: Partial<ReminderRuntimeRulesValue> | null;
  }): Promise<ReminderRuntimePreviewResultValue> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rules =
      input.rules != null
        ? normalizeReminderRuntimeRules(input.rules)
        : await this.rulesService.getRules();
    const worldCalendar = await this.worldService.getWorldCalendar();
    const now = new Date();
    const text = input.message.trim();
    const evaluation = await this.evaluateConversationTurn({
      ownerId: owner.id,
      conversationId: this.buildConversationId(),
      text,
      timezone: worldCalendar.location.timezone,
      now,
      rules,
    });

    return this.buildPreviewResult(
      evaluation,
      now,
      worldCalendar.location.timezone,
    );
  }

  async getTasks(
    query?: ReminderTaskQuery,
  ): Promise<ReminderTaskRecordValue[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rows = await this.taskRepo.find({
      where: {
        ownerId: owner.id,
        ...(query?.status ? { status: query.status } : {}),
      },
      order: {
        nextTriggerAt: 'ASC',
        dueAt: 'ASC',
        updatedAt: 'DESC',
      },
    });
    return rows.map((item) => this.serializeTask(item));
  }

  async getUpcomingTasks(limit = 5): Promise<ReminderTaskRecordValue[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rows = await this.taskRepo.find({
      where: {
        ownerId: owner.id,
        status: 'active',
      },
      order: {
        nextTriggerAt: 'ASC',
        dueAt: 'ASC',
        updatedAt: 'DESC',
      },
    });

    return rows
      .filter((item) => item.nextTriggerAt instanceof Date)
      .slice(0, limit)
      .map((item) => this.serializeTask(item));
  }

  async getMomentNudgeTasks(
    limit = 3,
    language?: WorldLanguageCode,
  ): Promise<ReminderMomentNudge[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const activeLanguage = language ?? (await this.worldLanguage.getLanguage());
    const rows = await this.taskRepo.find({
      where: {
        ownerId: owner.id,
        characterId: REMINDER_CHARACTER_ID,
        status: 'active',
      },
      order: {
        nextTriggerAt: 'ASC',
        dueAt: 'ASC',
        updatedAt: 'DESC',
      },
      take: 24,
    });

    const preferred = rows.filter((item) => this.isLongHorizonNudgeTask(item));
    const source = preferred.length > 0 ? preferred : rows;

    return source.slice(0, limit).map((task) => ({
      id: task.id,
      title: task.title,
      category: task.category,
      kind: task.kind as ReminderTaskKind,
      priority: task.priority as ReminderTaskPriority,
      scheduleText: this.describeSchedule(task, activeLanguage),
      completionCount: task.completionCount ?? 0,
    }));
  }

  async getOverview(): Promise<ReminderRuntimeOverview> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const dueSoonCutoff = new Date(now);
    dueSoonCutoff.setHours(dueSoonCutoff.getHours() + 6);
    const rules = await this.rulesService.getRules();

    const activeRows = await this.taskRepo.find({
      where: {
        ownerId: owner.id,
        characterId: REMINDER_CHARACTER_ID,
        status: 'active',
      },
      order: {
        nextTriggerAt: 'ASC',
        dueAt: 'ASC',
        updatedAt: 'DESC',
      },
    });

    const [
      recentDeliveredRows,
      recentCompletedRows,
      recentMessages,
      recentMoments,
      deliveredTodayCount,
      completedTodayCount,
      momentCountToday,
    ] = await Promise.all([
      this.taskRepo
        .createQueryBuilder('task')
        .where('task.ownerId = :ownerId', { ownerId: owner.id })
        .andWhere('task.characterId = :characterId', {
          characterId: REMINDER_CHARACTER_ID,
        })
        .andWhere('task.lastDeliveredAt IS NOT NULL')
        .orderBy('task.lastDeliveredAt', 'DESC')
        .limit(8)
        .getMany(),
      this.taskRepo
        .createQueryBuilder('task')
        .where('task.ownerId = :ownerId', { ownerId: owner.id })
        .andWhere('task.characterId = :characterId', {
          characterId: REMINDER_CHARACTER_ID,
        })
        .andWhere('task.lastCompletedAt IS NOT NULL')
        .orderBy('task.lastCompletedAt', 'DESC')
        .limit(8)
        .getMany(),
      this.messageRepo.find({
        where: {
          conversationId: this.buildConversationId(),
          senderType: 'character',
          senderId: REMINDER_CHARACTER_ID,
        },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.momentPostRepo.find({
        where: {
          authorId: REMINDER_CHARACTER_ID,
        },
        order: { postedAt: 'DESC' },
        take: 8,
      }),
      this.taskRepo
        .createQueryBuilder('task')
        .where('task.ownerId = :ownerId', { ownerId: owner.id })
        .andWhere('task.characterId = :characterId', {
          characterId: REMINDER_CHARACTER_ID,
        })
        .andWhere('task.lastDeliveredAt >= :startOfDay', { startOfDay })
        .getCount(),
      this.taskRepo
        .createQueryBuilder('task')
        .where('task.ownerId = :ownerId', { ownerId: owner.id })
        .andWhere('task.characterId = :characterId', {
          characterId: REMINDER_CHARACTER_ID,
        })
        .andWhere('task.lastCompletedAt >= :startOfDay', { startOfDay })
        .getCount(),
      this.momentPostRepo
        .createQueryBuilder('post')
        .where('post.authorId = :characterId', {
          characterId: REMINDER_CHARACTER_ID,
        })
        .andWhere('post.postedAt >= :startOfDay', { startOfDay })
        .getCount(),
    ]);

    const activeTasks = activeRows.map((item) => this.serializeTask(item));
    const upcomingTasks = activeRows
      .filter((item) => item.nextTriggerAt instanceof Date)
      .slice(0, 8)
      .map((item) => this.serializeTask(item));

    return {
      rules,
      stats: {
        activeTaskCount: activeRows.length,
        dueSoonTaskCount: activeRows.filter((item) => {
          if (!(item.nextTriggerAt instanceof Date)) {
            return false;
          }
          const timestamp = item.nextTriggerAt.getTime();
          return (
            timestamp >= now.getTime() && timestamp <= dueSoonCutoff.getTime()
          );
        }).length,
        overdueTaskCount: activeRows.filter(
          (item) =>
            item.nextTriggerAt instanceof Date &&
            item.nextTriggerAt.getTime() < now.getTime(),
        ).length,
        habitTaskCount: activeRows.filter((item) => item.kind === 'habit')
          .length,
        hardTaskCount: activeRows.filter((item) => item.priority === 'hard')
          .length,
        deliveredTodayCount,
        completedTodayCount,
        momentCountToday,
      },
      activeTasks,
      upcomingTasks,
      recentDeliveredTasks: recentDeliveredRows.map((item) =>
        this.serializeTask(item),
      ),
      recentCompletedTasks: recentCompletedRows.map((item) =>
        this.serializeTask(item),
      ),
      recentMessages: recentMessages.map((item) => ({
        id: item.id,
        conversationId: item.conversationId,
        text: item.text,
        createdAt: item.createdAt.toISOString(),
      })),
      recentMoments: recentMoments.map((item) => this.serializeMoment(item)),
    };
  }

  async buildMomentNudgePayload(input?: {
    now?: Date;
    seedKey?: string;
    slot?: ReminderMomentSlot;
    limit?: number;
  }): Promise<{ text: string; tasks: ReminderMomentNudge[] } | null> {
    const now = input?.now ?? new Date();
    const slot = input?.slot ?? 'general';
    const language = await this.worldLanguage.getLanguage();
    const rules = await this.rulesService.getRules();
    const tasks = await this.getMomentNudgeTasks(input?.limit ?? 3, language);
    if (tasks.length === 0) {
      return null;
    }

    const primary = tasks[0];
    const focus = this.truncateReminderLabel(primary.title, 14);
    const companionLine =
      this.buildReminderCompanionLine(tasks, slot, language) ||
      this.buildSingleReminderCompanionLine(focus, language);
    const variants =
      language === 'zh-CN'
        ? splitTemplateVariants(
            slot === 'morning'
              ? rules.promptTemplates.momentNudgeMorningTemplates
              : slot === 'evening'
                ? rules.promptTemplates.momentNudgeEveningTemplates
                : rules.promptTemplates.momentNudgeGeneralTemplates,
          )
        : this.getLocalizedMomentNudgeTemplates(language, slot);
    const selectedTemplate =
      variants[
        hashTextSeed(
          `${input?.seedKey ?? now.toISOString().slice(0, 10)}:${slot}:${primary.id}`,
        ) % variants.length
      ] ?? companionLine;
    const text = renderTemplate(selectedTemplate, {
      title: primary.title,
      focus,
      category: primary.category,
      scheduleText: primary.scheduleText,
      completionCount: primary.completionCount,
      companionLine,
      slot,
    }).trim();

    return {
      text: text || companionLine,
      tasks,
    };
  }

  async completeTask(id: string) {
    const task = await this.requireOwnedTask(id);
    const now = new Date();

    if (task.status !== 'active') {
      throw new BadRequestException('只有激活中的提醒可以完成。');
    }

    task.lastCompletedAt = now;
    task.completionCount = (task.completionCount ?? 0) + 1;
    task.snoozedUntil = null;

    if (task.kind === 'one_time') {
      task.status = 'completed';
      task.completedAt = now;
      task.nextTriggerAt = null;
    } else {
      task.completedAt = null;
      task.nextTriggerAt = this.computeNextTriggerAfter(task, now);
    }

    const saved = await this.taskRepo.save(task);
    return { task: this.serializeTask(saved) };
  }

  async snoozeTask(
    id: string,
    input: { minutes?: number; hours?: number; until?: string },
  ) {
    const task = await this.requireOwnedTask(id);
    if (task.status !== 'active') {
      throw new BadRequestException('只有激活中的提醒可以延后。');
    }

    const until = this.resolveSnoozeUntil(input, new Date());
    task.nextTriggerAt = until;
    task.snoozedUntil = until;
    const saved = await this.taskRepo.save(task);
    return { task: this.serializeTask(saved) };
  }

  async cancelTask(id: string) {
    const task = await this.requireOwnedTask(id);
    if (task.status === 'cancelled') {
      return { task: this.serializeTask(task) };
    }

    task.status = 'cancelled';
    task.cancelledAt = new Date();
    task.nextTriggerAt = null;
    const saved = await this.taskRepo.save(task);
    return { task: this.serializeTask(saved) };
  }

  async handleConversationTurn(input: {
    conversationId: string;
    userMessage: string;
    sourceMessageId: string;
  }): Promise<ReminderTurnResult> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const rules = await this.rulesService.getRules();
    const worldCalendar = await this.worldService.getWorldCalendar();
    const now = new Date();
    const text = input.userMessage.trim();

    const evaluation = await this.evaluateConversationTurn({
      ownerId: owner.id,
      conversationId: input.conversationId,
      text,
      now,
      timezone: worldCalendar.location.timezone,
      rules,
      sourceMessageId: input.sourceMessageId,
    });

    switch (evaluation.action) {
      case 'help':
      case 'list':
        return {
          handled: true,
          responseText: evaluation.responseText,
        };
      case 'cancel': {
        const task = evaluation.referencedTask;
        if (!task) {
          return {
            handled: true,
            responseText: evaluation.responseText,
          };
        }

        task.status = 'cancelled';
        task.cancelledAt = now;
        task.nextTriggerAt = null;
        const saved = await this.taskRepo.save(task);
        return {
          handled: true,
          responseText: renderTemplate(rules.textTemplates.taskCancelSuccess, {
            title: saved.title,
          }),
          task: this.serializeTask(saved),
        };
      }
      case 'snooze': {
        const task = evaluation.referencedTask;
        if (!task || !evaluation.snoozeUntil) {
          return {
            handled: true,
            responseText: evaluation.responseText,
          };
        }

        task.nextTriggerAt = evaluation.snoozeUntil;
        task.snoozedUntil = evaluation.snoozeUntil;
        const saved = await this.taskRepo.save(task);
        return {
          handled: true,
          responseText: renderTemplate(rules.textTemplates.taskSnoozeSuccess, {
            title: saved.title,
            untilLabel: formatDateTimeLabel(evaluation.snoozeUntil, now),
          }),
          task: this.serializeTask(saved),
        };
      }
      case 'update': {
        const task = evaluation.referencedTask;
        const parsedIntent = evaluation.parsedIntent;
        if (!task || !parsedIntent) {
          return {
            handled: true,
            responseText: evaluation.responseText,
          };
        }

        task.sourceMessageId = input.sourceMessageId;
        task.title = parsedIntent.title;
        task.category = parsedIntent.category;
        task.kind = parsedIntent.kind;
        task.priority = parsedIntent.priority;
        task.timezone = parsedIntent.timezone;
        task.dueAt = parsedIntent.dueAt ?? null;
        task.recurrenceRule = parsedIntent.recurrenceRule ?? null;
        task.nextTriggerAt = parsedIntent.nextTriggerAt ?? null;
        task.snoozedUntil = null;
        task.status = 'active';
        task.completedAt = null;
        task.cancelledAt = null;

        const saved = await this.taskRepo.save(task);
        return {
          handled: true,
          responseText: renderTemplate(rules.textTemplates.taskUpdateSuccess, {
            title: saved.title,
            scheduleText: this.describeSchedule(saved),
          }),
          task: this.serializeTask(saved),
        };
      }
      case 'complete': {
        const task = evaluation.referencedTask;
        if (!task) {
          return {
            handled: true,
            responseText: evaluation.responseText,
          };
        }

        task.lastCompletedAt = now;
        task.completionCount = (task.completionCount ?? 0) + 1;
        task.snoozedUntil = null;

        let responseText = '';
        if (task.kind === 'one_time') {
          task.status = 'completed';
          task.completedAt = now;
          task.nextTriggerAt = null;
          responseText = renderTemplate(
            rules.textTemplates.taskCompleteOneTimeSuccess,
            {
              title: task.title,
            },
          );
        } else {
          task.completedAt = null;
          task.nextTriggerAt = this.computeNextTriggerAfter(task, now);
          responseText = renderTemplate(
            rules.textTemplates.taskCompleteRecurringSuccess,
            {
              title: task.title,
              scheduleText: this.describeSchedule(task),
            },
          );
        }

        const saved = await this.taskRepo.save(task);
        return {
          handled: true,
          responseText,
          task: this.serializeTask(saved),
        };
      }
      case 'create': {
        const parsedIntent = evaluation.parsedIntent;
        if (!parsedIntent.handled) {
          return { handled: false };
        }
        if (
          'needsClarification' in parsedIntent &&
          parsedIntent.needsClarification
        ) {
          return {
            handled: true,
            responseText: parsedIntent.responseText,
          };
        }

        const task = this.taskRepo.create({
          ownerId: owner.id,
          characterId: REMINDER_CHARACTER_ID,
          sourceConversationId: input.conversationId,
          sourceMessageId: input.sourceMessageId,
          title: parsedIntent.title,
          category: parsedIntent.category,
          kind: parsedIntent.kind,
          status: 'active',
          priority: parsedIntent.priority,
          timezone: parsedIntent.timezone,
          dueAt: parsedIntent.dueAt ?? null,
          recurrenceRule: parsedIntent.recurrenceRule ?? null,
          nextTriggerAt: parsedIntent.nextTriggerAt ?? null,
          completionCount: 0,
        });
        const saved = await this.taskRepo.save(task);
        return {
          handled: true,
          responseText: parsedIntent.responseText,
          task: this.serializeTask(saved),
        };
      }
      case 'unhandled':
      default:
        return { handled: false };
    }
  }

  private async evaluateConversationTurn(
    input: ReminderConversationEvaluationInput,
  ): Promise<ReminderConversationEvaluation> {
    const directEvaluation =
      await this.evaluateConversationTurnWithoutClarification(input);
    if (
      directEvaluation.handled ||
      !input.sourceMessageId ||
      !input.text.trim()
    ) {
      return directEvaluation;
    }

    const clarificationEvaluation =
      await this.evaluateConversationTurnFromRecentReminderContext(input);
    if (clarificationEvaluation) {
      return clarificationEvaluation;
    }

    const createClarificationEvaluation =
      await this.evaluateConversationTurnFromClarification(input);
    if (createClarificationEvaluation) {
      return createClarificationEvaluation;
    }

    return directEvaluation;
  }

  private async evaluateConversationTurnWithoutClarification(
    input: ReminderConversationEvaluationInput,
  ): Promise<ReminderConversationEvaluation> {
    const rulesEvaluation = await this.evaluateConversationTurnFromRules(
      input,
      {
        source: 'rules',
      },
    );
    if (
      rulesEvaluation.handled ||
      input.rules.parserRules.parserMode === 'rules_only' ||
      !input.text.trim()
    ) {
      return rulesEvaluation;
    }

    return this.evaluateConversationTurnWithLlmFallback(input, rulesEvaluation);
  }

  private async evaluateConversationTurnFromClarification(
    input: ReminderConversationEvaluationInput,
  ): Promise<ReminderConversationEvaluation | null> {
    const previousUserMessage = await this.findLatestPreviousUserMessage(
      input.conversationId,
      input.sourceMessageId ?? '',
    );
    if (!previousUserMessage) {
      return null;
    }

    const previousEvaluation =
      await this.evaluateConversationTurnWithoutClarification({
        ...input,
        text: previousUserMessage.text.trim(),
        now: previousUserMessage.createdAt,
        sourceMessageId: undefined,
      });
    if (!previousEvaluation.handled || previousEvaluation.action !== 'create') {
      return null;
    }

    const clarifiedCommand = this.buildClarifiedCreateCommand({
      currentText: input.text,
      previousText: previousUserMessage.text,
      previousEvaluation,
    });
    if (!clarifiedCommand) {
      return null;
    }

    const clarificationEvaluation =
      await this.evaluateConversationTurnWithoutClarification({
        ...input,
        text: clarifiedCommand,
        sourceMessageId: undefined,
      });
    if (
      !clarificationEvaluation.handled ||
      clarificationEvaluation.action !== 'create'
    ) {
      return null;
    }

    const clarifiedIntent = clarificationEvaluation.parsedIntent;
    if (
      !clarifiedIntent.handled ||
      ('needsClarification' in clarifiedIntent &&
        clarifiedIntent.needsClarification)
    ) {
      return null;
    }

    return {
      ...clarificationEvaluation,
      reason: `${clarificationEvaluation.reason}（已结合上一条待补充提醒）`,
      debug: {
        ...clarificationEvaluation.debug,
        canonicalMessage: clarifiedCommand,
      },
    };
  }

  private async evaluateConversationTurnFromRecentReminderContext(
    input: ReminderConversationEvaluationInput,
  ): Promise<ReminderConversationEvaluation | null> {
    const currentText = normalizeUpdateScheduleFragment(input.text.trim());
    if (
      !currentText ||
      !this.hasScheduleCue(currentText, input.rules) ||
      this.findMatchedKeywords(
        currentText,
        input.rules.parserRules.createIntentKeywords,
      ).length > 0
    ) {
      return null;
    }

    const previousUserMessage = await this.findLatestPreviousUserMessage(
      input.conversationId,
      input.sourceMessageId ?? '',
    );
    if (!previousUserMessage) {
      return null;
    }

    const followupWindowMs = 10 * 60 * 1000;
    if (
      input.now.getTime() - previousUserMessage.createdAt.getTime() >
      followupWindowMs
    ) {
      return null;
    }

    const previousEvaluation =
      await this.evaluateConversationTurnWithoutClarification({
        ...input,
        text: previousUserMessage.text.trim(),
        now: previousUserMessage.createdAt,
        sourceMessageId: undefined,
      });
    if (
      !previousEvaluation.handled ||
      (previousEvaluation.action !== 'create' &&
        previousEvaluation.action !== 'update')
    ) {
      return null;
    }

    const referencedTask =
      previousEvaluation.action === 'update'
        ? previousEvaluation.referencedTask
        : await this.resolveReferencedTask(
            input.ownerId,
            input.conversationId,
            previousUserMessage.text,
          );
    if (!referencedTask) {
      return null;
    }

    const updateCommand = this.buildUpdateReminderCommand({
      text: currentText,
      task: referencedTask,
      rules: input.rules,
    });
    if (!updateCommand) {
      return null;
    }

    const parsedIntent = this.parseCreateIntent(
      updateCommand,
      input.timezone,
      input.now,
      input.rules,
    );
    if (
      !parsedIntent.handled ||
      ('needsClarification' in parsedIntent && parsedIntent.needsClarification)
    ) {
      return null;
    }

    return {
      handled: true,
      action: 'update',
      source: 'rules',
      reason: '已结合上一条提醒上下文，解析为修改当前提醒时间。',
      responseText: renderTemplate(
        input.rules.textTemplates.taskUpdateSuccess,
        {
          title: referencedTask.title,
          scheduleText: this.describeIntentSchedule(parsedIntent, input.now),
        },
      ),
      referencedTask,
      parsedIntent,
      debug: {
        ...parsedIntent.debug,
        normalizedText: normalizeComparableText(input.text),
        source: 'rules',
        extractedTitle: referencedTask.title,
        canonicalMessage: updateCommand,
      },
    };
  }

  private async evaluateConversationTurnFromRules(
    input: ReminderConversationEvaluationInput,
    options?: {
      source?: ReminderRuntimePreviewSourceValue;
      canonicalMessage?: string | null;
      fallbackReason?: string | null;
    },
  ): Promise<ReminderConversationEvaluation> {
    const { ownerId, conversationId, text, timezone, now, rules } = input;
    const source = options?.source ?? 'rules';
    const canonicalMessage = options?.canonicalMessage ?? null;
    const fallbackReason = options?.fallbackReason ?? null;

    if (!text) {
      return {
        handled: false,
        action: 'unhandled',
        source,
        reason: '消息为空，未进入提醒解析。',
        debug: this.createParserDebug(text, {
          source,
          canonicalMessage,
          fallbackReason,
        }),
      };
    }

    const helpPatterns = this.findMatchedPatterns(
      text,
      rules.parserRules.helpIntentPatterns,
    );
    if (helpPatterns.length > 0) {
      return {
        handled: true,
        action: 'help',
        source,
        reason: '命中帮助意图规则。',
        responseText: rules.textTemplates.helpMessage,
        debug: this.createParserDebug(text, {
          source,
          matchedIntentPatterns: helpPatterns,
          canonicalMessage,
          fallbackReason,
        }),
      };
    }

    const listPatterns = this.findMatchedPatterns(
      text,
      rules.parserRules.listIntentPatterns,
    );
    if (listPatterns.length > 0) {
      const tasks = await this.listActiveTasksForConversation(
        ownerId,
        conversationId,
      );
      return {
        handled: true,
        action: 'list',
        source,
        reason: '命中提醒列表查询规则。',
        responseText: this.renderTaskList(tasks, rules.maxListItems, rules),
        debug: this.createParserDebug(text, {
          source,
          matchedIntentPatterns: listPatterns,
          canonicalMessage,
          fallbackReason,
        }),
      };
    }

    const cancelPatterns = this.findMatchedPatterns(
      text,
      rules.parserRules.cancelIntentPatterns,
    );
    if (cancelPatterns.length > 0) {
      const referencedTask = await this.resolveReferencedTask(
        ownerId,
        conversationId,
        text,
      );
      return {
        handled: true,
        action: 'cancel',
        source,
        reason: referencedTask
          ? '命中删除提醒规则，并匹配到了当前提醒。'
          : '命中删除提醒规则，但没有匹配到当前提醒。',
        responseText: referencedTask
          ? renderTemplate(rules.textTemplates.taskCancelSuccess, {
              title: referencedTask.title,
            })
          : rules.textTemplates.taskCancelMissing,
        referencedTask,
        debug: this.createParserDebug(text, {
          source,
          matchedIntentPatterns: cancelPatterns,
          canonicalMessage,
          fallbackReason,
        }),
      };
    }

    const updatePatterns = this.findMatchedPatterns(
      text,
      rules.parserRules.updateIntentPatterns,
    );
    if (updatePatterns.length > 0) {
      const referencedTask = await this.resolveReferencedTask(
        ownerId,
        conversationId,
        text,
      );
      if (!referencedTask) {
        return {
          handled: true,
          action: 'update',
          source,
          reason: '命中修改提醒规则，但没有匹配到当前提醒。',
          responseText: rules.textTemplates.taskUpdateMissing,
          referencedTask: null,
          parsedIntent: null,
          debug: this.createParserDebug(text, {
            source,
            matchedIntentPatterns: updatePatterns,
            canonicalMessage,
            fallbackReason,
          }),
        };
      }

      const updateCommand = this.buildUpdateReminderCommand({
        text,
        task: referencedTask,
        rules,
      });
      if (!updateCommand) {
        const normalizedUpdateText = normalizeUpdateScheduleFragment(
          stripUpdateCommand(text),
        );
        const hasStructuredUpdateCue =
          normalizedUpdateText.length > 0 &&
          (this.hasScheduleCue(normalizedUpdateText, rules) ||
            this.findMatchedKeywords(
              normalizedUpdateText,
              rules.parserRules.createIntentKeywords,
            ).length > 0);
        if (this.isPlainAffirmation(text)) {
          return {
            handled: false,
            action: 'unhandled',
            source,
            reason: '修改提醒规则命中后，没有解析出有效的新时间信息。',
            debug: this.createParserDebug(text, {
              source,
              matchedIntentPatterns: updatePatterns,
              extractedTitle: referencedTask.title,
              canonicalMessage,
              fallbackReason,
            }),
          };
        }
        if (!hasStructuredUpdateCue) {
          return {
            handled: false,
            action: 'unhandled',
            source,
            reason: '命中修改口令，但没有识别出新的提醒时间信息。',
            debug: this.createParserDebug(text, {
              source,
              matchedIntentPatterns: updatePatterns,
              extractedTitle: referencedTask.title,
              canonicalMessage,
              fallbackReason,
            }),
          };
        }

        return {
          handled: true,
          action: 'update',
          source,
          reason: '命中修改提醒规则，但没有解析出新的时间。',
          responseText: rules.textTemplates.taskUpdateMissingTime,
          referencedTask,
          parsedIntent: null,
          debug: this.createParserDebug(text, {
            source,
            matchedIntentPatterns: updatePatterns,
            extractedTitle: referencedTask.title,
            canonicalMessage,
            fallbackReason,
          }),
        };
      }

      const parsedIntent = this.parseCreateIntent(
        updateCommand,
        timezone,
        now,
        rules,
      );
      if (
        !parsedIntent.handled ||
        ('needsClarification' in parsedIntent &&
          parsedIntent.needsClarification)
      ) {
        return {
          handled: true,
          action: 'update',
          source,
          reason: '命中修改提醒规则，但没有解析出新的时间。',
          responseText: rules.textTemplates.taskUpdateMissingTime,
          referencedTask,
          parsedIntent: null,
          debug: {
            ...parsedIntent.debug,
            normalizedText: normalizeComparableText(text),
            source,
            matchedIntentPatterns: updatePatterns,
            extractedTitle: referencedTask.title,
            canonicalMessage,
            fallbackReason,
          },
        };
      }

      return {
        handled: true,
        action: 'update',
        source,
        reason: '命中修改提醒规则，并解析出了新的提醒时间。',
        responseText: renderTemplate(rules.textTemplates.taskUpdateSuccess, {
          title: referencedTask.title,
          scheduleText: this.describeIntentSchedule(parsedIntent, now),
        }),
        referencedTask,
        parsedIntent,
        debug: {
          ...parsedIntent.debug,
          normalizedText: normalizeComparableText(text),
          source,
          matchedIntentPatterns: updatePatterns,
          extractedTitle: referencedTask.title,
          canonicalMessage,
          fallbackReason,
        },
      };
    }

    const snoozePatterns = this.findMatchedPatterns(
      text,
      rules.parserRules.snoozeIntentPatterns,
    );
    if (snoozePatterns.length > 0) {
      const referencedTask = await this.resolveReferencedTask(
        ownerId,
        conversationId,
        text,
      );
      const snoozeUntil = referencedTask
        ? this.resolveSnoozeFromText(text, now)
        : undefined;
      return {
        handled: true,
        action: 'snooze',
        source,
        reason: referencedTask
          ? '命中顺延提醒规则，并匹配到了当前提醒。'
          : '命中顺延提醒规则，但没有匹配到当前提醒。',
        responseText:
          referencedTask && snoozeUntil
            ? renderTemplate(rules.textTemplates.taskSnoozeSuccess, {
                title: referencedTask.title,
                untilLabel: formatDateTimeLabel(snoozeUntil, now),
              })
            : rules.textTemplates.taskSnoozeMissing,
        referencedTask,
        snoozeUntil,
        debug: this.createParserDebug(text, {
          source,
          matchedIntentPatterns: snoozePatterns,
          canonicalMessage,
          fallbackReason,
        }),
      };
    }

    const completePatterns = this.findMatchedPatterns(
      text,
      rules.parserRules.completeIntentPatterns,
    );
    if (completePatterns.length > 0) {
      const referencedTask = await this.resolveReferencedTask(
        ownerId,
        conversationId,
        text,
      );
      let responseText = rules.textTemplates.taskCompleteMissing;
      if (referencedTask) {
        responseText =
          referencedTask.kind === 'one_time'
            ? renderTemplate(rules.textTemplates.taskCompleteOneTimeSuccess, {
                title: referencedTask.title,
              })
            : renderTemplate(rules.textTemplates.taskCompleteRecurringSuccess, {
                title: referencedTask.title,
                scheduleText: this.describeSchedule(referencedTask),
              });
      }

      return {
        handled: true,
        action: 'complete',
        source,
        reason: referencedTask
          ? '命中完成提醒规则，并匹配到了当前提醒。'
          : '命中完成提醒规则，但没有匹配到当前提醒。',
        responseText,
        referencedTask,
        debug: this.createParserDebug(text, {
          source,
          matchedIntentPatterns: completePatterns,
          canonicalMessage,
          fallbackReason,
        }),
      };
    }

    const parsedIntent = this.parseCreateIntent(text, timezone, now, rules);
    if (!parsedIntent.handled) {
      return {
        handled: false,
        action: 'unhandled',
        source,
        reason: parsedIntent.reason,
        debug: {
          ...parsedIntent.debug,
          source,
          canonicalMessage,
          fallbackReason,
        },
      };
    }

    return {
      handled: true,
      action: 'create',
      source,
      reason: parsedIntent.reason,
      parsedIntent,
      debug: {
        ...parsedIntent.debug,
        source,
        canonicalMessage,
        fallbackReason,
      },
    };
  }

  private async evaluateConversationTurnWithLlmFallback(
    input: ReminderConversationEvaluationInput,
    rulesEvaluation: ReminderConversationEvaluation,
  ): Promise<ReminderConversationEvaluation> {
    const llmResult = await this.resolveLlmFallbackCommand(input);
    if (!llmResult.handled || !llmResult.canonicalMessage) {
      return {
        handled: false,
        action: 'unhandled',
        source: 'llm_fallback',
        reason: llmResult.reason || rulesEvaluation.reason,
        debug: this.createParserDebug(input.text, {
          source: 'llm_fallback',
          canonicalMessage: llmResult.canonicalMessage,
          fallbackReason: llmResult.reason || rulesEvaluation.reason,
        }),
      };
    }

    const canonicalEvaluation = await this.evaluateConversationTurnFromRules(
      {
        ...input,
        text: llmResult.canonicalMessage,
      },
      {
        source: 'llm_fallback',
        canonicalMessage: llmResult.canonicalMessage,
        fallbackReason: llmResult.reason,
      },
    );

    if (canonicalEvaluation.handled) {
      return canonicalEvaluation;
    }

    return {
      handled: false,
      action: 'unhandled',
      source: 'llm_fallback',
      reason: `模型已尝试归一化为“${llmResult.canonicalMessage}”，但规则仍未命中。`,
      debug: this.createParserDebug(input.text, {
        source: 'llm_fallback',
        canonicalMessage: llmResult.canonicalMessage,
        fallbackReason: llmResult.reason,
      }),
    };
  }

  private async resolveLlmFallbackCommand(input: {
    ownerId: string;
    conversationId: string;
    text: string;
    timezone: string;
    now: Date;
    rules: ReminderRuntimeRulesValue;
  }): Promise<ReminderLlmFallbackResult> {
    const activeTasks = await this.listActiveTasksForConversation(
      input.ownerId,
      input.conversationId,
    );
    const prompt = this.buildLlmFallbackPrompt({
      message: input.text,
      activeTasks,
      timezone: input.timezone,
      now: input.now,
      rules: input.rules,
    });

    const raw = await this.ai.generateJsonObject({
      prompt,
      usageContext: {
        surface: 'app',
        scene: 'reminder_runtime_parse_fallback',
        scopeType: 'conversation',
        scopeId: input.conversationId,
        scopeLabel: '提醒运行时解析',
        ownerId: input.ownerId,
        characterId: REMINDER_CHARACTER_ID,
        characterName: this.getReminderCharacterIdentity().name,
        conversationId: input.conversationId,
      },
      maxTokens: 600,
      temperature: 0.1,
      fallback: {
        handled: false,
        action: 'unhandled',
        reason: '模型兜底没有返回有效结果。',
        canonicalMessage: '',
      },
    });

    return this.normalizeLlmFallbackResult(raw);
  }

  private async findLatestPreviousUserMessage(
    conversationId: string,
    sourceMessageId: string,
  ) {
    const rows = await this.messageRepo.find({
      where: {
        conversationId,
        senderType: 'user',
      },
      order: {
        createdAt: 'DESC',
      },
      take: 6,
    });

    return rows.find((item) => item.id !== sourceMessageId) ?? null;
  }

  private buildClarifiedCreateCommand(input: {
    currentText: string;
    previousText: string;
    previousEvaluation: ReminderConversationEvaluation;
  }) {
    if (input.previousEvaluation.action !== 'create') {
      return null;
    }

    const parsedIntent = input.previousEvaluation.parsedIntent;
    if (
      !parsedIntent.handled ||
      !('needsClarification' in parsedIntent) ||
      !parsedIntent.needsClarification
    ) {
      return null;
    }

    const currentText = stripTrailingPunctuation(input.currentText.trim());
    if (!currentText) {
      return null;
    }

    const previousTitle = stripTrailingPunctuation(
      parsedIntent.debug.extractedTitle ?? '',
    );
    if (previousTitle) {
      return stripTrailingPunctuation(`${currentText} 提醒我 ${previousTitle}`);
    }

    const previousBase = stripTrailingPunctuation(
      input.previousEvaluation.debug.canonicalMessage?.trim() ||
        input.previousText.trim(),
    );
    if (!previousBase) {
      return null;
    }

    return `${previousBase} ${currentText}`.trim();
  }

  private buildLlmFallbackPrompt(input: {
    message: string;
    activeTasks: ReminderTaskEntity[];
    timezone: string;
    now: Date;
    rules: ReminderRuntimeRulesValue;
  }) {
    const activeTaskSummary = input.activeTasks.length
      ? input.activeTasks
          .slice(0, 12)
          .map(
            (task, index) =>
              `${index + 1}. ${task.title} | ${this.describeSchedule(task)}`,
          )
          .join('\n')
      : '当前没有活跃提醒。';

    return [
      input.rules.parserRules.llmFallbackPrompt,
      `当前时间：${input.now.toISOString()}`,
      `当前时区：${input.timezone}`,
      `用户原话：${input.message}`,
      `当前活跃提醒：\n${activeTaskSummary}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private normalizeLlmFallbackResult(
    raw: Record<string, unknown>,
  ): ReminderLlmFallbackResult {
    const handled = raw.handled === true;
    const reason =
      typeof raw.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim()
        : handled
          ? '模型兜底已生成标准提醒口令。'
          : '模型兜底判断当前消息不属于提醒链。';
    const canonicalMessage =
      typeof raw.canonicalMessage === 'string' && raw.canonicalMessage.trim()
        ? raw.canonicalMessage.trim()
        : null;

    return {
      handled: handled && canonicalMessage != null,
      reason,
      canonicalMessage,
    };
  }

  private buildPreviewResult(
    evaluation: ReminderConversationEvaluation,
    now: Date,
    timezone: string,
  ): ReminderRuntimePreviewResultValue {
    const createParsedIntent =
      evaluation.action === 'create' ? evaluation.parsedIntent : null;
    const createNeedsClarification =
      createParsedIntent != null &&
      createParsedIntent.handled &&
      'needsClarification' in createParsedIntent &&
      createParsedIntent.needsClarification === true;
    const createResolvedIntent =
      createParsedIntent != null &&
      createParsedIntent.handled &&
      !createNeedsClarification
        ? createParsedIntent
        : null;

    return {
      handled: evaluation.handled,
      action: this.toPreviewAction(evaluation.action),
      source: evaluation.source,
      reason: evaluation.reason,
      evaluatedAt: now.toISOString(),
      timezone,
      normalizedText: evaluation.debug.normalizedText,
      extractedTitle: evaluation.debug.extractedTitle,
      canonicalMessage: evaluation.debug.canonicalMessage,
      fallbackReason: evaluation.debug.fallbackReason,
      responseText:
        createParsedIntent != null && createParsedIntent.handled
          ? createParsedIntent.responseText
          : evaluation.handled && evaluation.action !== 'create'
            ? evaluation.responseText
            : null,
      needsClarification: createNeedsClarification,
      parsedTask:
        createResolvedIntent != null
          ? this.serializePreviewParsedTask(createResolvedIntent)
          : evaluation.action === 'update' && evaluation.parsedIntent
            ? this.serializePreviewParsedTask(evaluation.parsedIntent)
            : null,
      referencedTask:
        evaluation.action === 'cancel' ||
        evaluation.action === 'complete' ||
        evaluation.action === 'snooze' ||
        evaluation.action === 'update'
          ? this.serializePreviewReferencedTask(evaluation.referencedTask)
          : null,
      matchedRules: this.serializePreviewMatchedRules(evaluation.debug),
    };
  }

  async prepareDueDispatches(now = new Date()): Promise<ReminderDispatch[]> {
    const rules = await this.rulesService.getRules();
    const rows = await this.taskRepo.find({
      where: {
        characterId: REMINDER_CHARACTER_ID,
        status: 'active',
        nextTriggerAt: LessThanOrEqual(now),
      },
      order: {
        nextTriggerAt: 'ASC',
        updatedAt: 'ASC',
      },
    });

    return rows.map((task) => ({
      taskId: task.id,
      conversationId:
        task.sourceConversationId || this.buildConversationId(task.characterId),
      characterId: task.characterId,
      characterName: this.getReminderCharacterIdentity().name,
      text: this.buildDueReminderMessage(task, rules),
    }));
  }

  async markTaskDelivered(taskId: string, deliveredAt = new Date()) {
    const task = await this.taskRepo.findOneBy({ id: taskId });
    if (!task) {
      return;
    }

    task.lastTriggeredAt = deliveredAt;
    task.lastDeliveredAt = deliveredAt;
    task.snoozedUntil = null;
    if (task.kind === 'one_time') {
      task.nextTriggerAt = null;
    } else {
      task.nextTriggerAt = this.computeNextTriggerAfter(task, deliveredAt);
    }
    await this.taskRepo.save(task);
  }

  async collectCheckinDispatches(
    now = new Date(),
  ): Promise<ReminderDispatch[]> {
    const rules = await this.rulesService.getRules();
    if (!rules.checkinHours.includes(now.getHours())) {
      return [];
    }

    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const conversationId = this.buildConversationId();
    const lastReminderMessage = await this.messageRepo.findOne({
      where: {
        conversationId,
        senderType: 'character',
        senderId: REMINDER_CHARACTER_ID,
      },
      order: { createdAt: 'DESC' },
    });

    if (lastReminderMessage) {
      const minIntervalMs = rules.checkinMinIntervalHours * 60 * 60 * 1000;
      if (
        now.getTime() - lastReminderMessage.createdAt.getTime() <
        minIntervalMs
      ) {
        return [];
      }
    }

    const activeCount = await this.taskRepo.count({
      where: {
        ownerId: owner.id,
        characterId: REMINDER_CHARACTER_ID,
        status: 'active',
      },
    });

    return [
      {
        conversationId,
        characterId: REMINDER_CHARACTER_ID,
        characterName: this.getReminderCharacterIdentity().name,
        text:
          activeCount > 0
            ? renderTemplate(rules.textTemplates.checkinWithActiveTasks, {
                activeCount,
              })
            : rules.textTemplates.checkinWithoutActiveTasks,
      },
    ];
  }

  private async requireOwnedTask(id: string) {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
    const task = await this.taskRepo.findOneBy({ id, ownerId: owner.id });
    if (!task) {
      throw new NotFoundException('提醒不存在。');
    }
    return task;
  }

  private async listActiveTasksForConversation(
    ownerId: string,
    conversationId: string,
  ) {
    const rows = await this.taskRepo.find({
      where: {
        ownerId,
        characterId: REMINDER_CHARACTER_ID,
        status: 'active',
      },
      order: {
        nextTriggerAt: 'ASC',
        dueAt: 'ASC',
        updatedAt: 'DESC',
      },
      take: 20,
    });

    const scoped = rows.filter(
      (item) =>
        !item.sourceConversationId ||
        item.sourceConversationId === conversationId,
    );
    return scoped.length > 0 ? scoped : rows;
  }

  private renderTaskList(
    tasks: ReminderTaskEntity[],
    maxItems: number,
    rules: ReminderRuntimeRulesValue,
  ) {
    if (tasks.length === 0) {
      return rules.textTemplates.taskListEmpty;
    }

    const lines = tasks.slice(0, maxItems).map((item, index) => {
      return renderTemplate(rules.textTemplates.taskListItem, {
        index: index + 1,
        title: item.title,
        scheduleText: this.describeSchedule(item),
      });
    });
    return `${rules.textTemplates.taskListHeader}\n${lines.join('\n')}`;
  }

  private async resolveReferencedTask(
    ownerId: string,
    conversationId: string,
    text: string,
  ) {
    const tasks = await this.listActiveTasksForConversation(
      ownerId,
      conversationId,
    );
    if (tasks.length === 0) {
      return null;
    }

    const normalizedText = normalizeComparableText(text);
    for (const task of tasks) {
      const normalizedTitle = normalizeComparableText(task.title);
      if (!normalizedTitle) {
        continue;
      }
      if (
        normalizedText.includes(normalizedTitle) ||
        normalizedTitle.includes(normalizedText)
      ) {
        return task;
      }
    }

    const sorted = [...tasks].sort((left, right) => {
      const leftTs =
        left.lastDeliveredAt?.getTime() ?? left.updatedAt.getTime();
      const rightTs =
        right.lastDeliveredAt?.getTime() ?? right.updatedAt.getTime();
      return rightTs - leftTs;
    });
    return sorted[0] ?? null;
  }

  private createParserDebug(
    text: string,
    patch: Partial<ReminderParserDebug> = {},
  ): ReminderParserDebug {
    return {
      normalizedText: normalizeComparableText(text),
      source: patch.source ?? 'none',
      matchedIntentPatterns: patch.matchedIntentPatterns ?? [],
      matchedCreateKeywords: patch.matchedCreateKeywords ?? [],
      matchedDailyKeywords: patch.matchedDailyKeywords ?? [],
      matchedWeeklyKeywords: patch.matchedWeeklyKeywords ?? [],
      matchedHabitIntentKeywords: patch.matchedHabitIntentKeywords ?? [],
      matchedHabitKeywords: patch.matchedHabitKeywords ?? [],
      matchedHardKeywords: patch.matchedHardKeywords ?? [],
      matchedCategoryKeywords: patch.matchedCategoryKeywords ?? [],
      matchedPeriodKey: patch.matchedPeriodKey ?? null,
      matchedPeriodPatterns: patch.matchedPeriodPatterns ?? [],
      extractedTitle: patch.extractedTitle ?? null,
      canonicalMessage: patch.canonicalMessage ?? null,
      fallbackReason: patch.fallbackReason ?? null,
    };
  }

  private toPreviewAction(
    action: ReminderConversationEvaluation['action'],
  ): ReminderRuntimePreviewActionValue {
    return action;
  }

  private serializePreviewMatchedRules(
    debug: ReminderParserDebug,
  ): ReminderRuntimePreviewMatchedRulesValue {
    return {
      intentPatterns: debug.matchedIntentPatterns,
      createKeywords: debug.matchedCreateKeywords,
      dailyKeywords: debug.matchedDailyKeywords,
      weeklyKeywords: debug.matchedWeeklyKeywords,
      habitIntentKeywords: debug.matchedHabitIntentKeywords,
      habitKeywords: debug.matchedHabitKeywords,
      hardKeywords: debug.matchedHardKeywords,
      categoryKeywords: debug.matchedCategoryKeywords,
      periodKey: debug.matchedPeriodKey,
      periodPatterns: debug.matchedPeriodPatterns,
    };
  }

  private serializePreviewParsedTask(
    parsedIntent: ResolvedReminderIntent,
  ): ReminderRuntimePreviewParsedTaskValue {
    return {
      title: parsedIntent.title,
      category: parsedIntent.category,
      kind: parsedIntent.kind,
      priority: parsedIntent.priority,
      dueAt: parsedIntent.dueAt?.toISOString() ?? null,
      nextTriggerAt: parsedIntent.nextTriggerAt?.toISOString() ?? null,
      recurrenceRule: parsedIntent.recurrenceRule ?? null,
    };
  }

  private serializePreviewReferencedTask(
    task: ReminderTaskEntity | null,
  ): ReminderRuntimePreviewReferencedTaskValue | null {
    if (!task) {
      return null;
    }

    return {
      id: task.id,
      title: task.title,
      scheduleText: this.describeSchedule(task),
    };
  }

  private findMatchedPatterns(text: string, patterns: string[]) {
    return patterns.filter((pattern) => this.matchesPattern(text, pattern));
  }

  private matchesPattern(text: string, pattern: string) {
    const normalizedPattern = pattern.trim();
    if (!normalizedPattern) {
      return false;
    }

    try {
      return new RegExp(normalizedPattern, 'u').test(text);
    } catch {
      return text.includes(normalizedPattern);
    }
  }

  private findMatchedKeywords(text: string, keywords: string[]) {
    return keywords.filter(
      (keyword) => keyword.trim() && text.includes(keyword),
    );
  }

  private isPlainAffirmation(text: string) {
    return /^(是|是的|对|对的|好|好了|嗯|嗯嗯|好的)[!！。]?$/u.test(
      stripTrailingPunctuation(text.trim()),
    );
  }

  private hasRecurrenceCue(text: string, rules: ReminderRuntimeRulesValue) {
    return (
      this.findMatchedKeywords(text, rules.parserRules.dailyRecurrenceKeywords)
        .length > 0 || this.extractWeeklyRule(text, rules) != null
    );
  }

  private hasScheduleCue(text: string, rules: ReminderRuntimeRulesValue) {
    const matchedPeriod = this.findMatchedPeriod(text, rules);
    return (
      this.extractClock(text, rules) != null ||
      this.extractWeeklyRule(text, rules) != null ||
      this.findMatchedKeywords(text, rules.parserRules.dailyRecurrenceKeywords)
        .length > 0 ||
      this.resolveRelativeDayOffset(
        text,
        matchedPeriod?.matchedPatterns ?? [],
      ) != null
    );
  }

  private findExplicitClockMatch(text: string): ExplicitClockMatch | null {
    const pattern =
      /(\d{1,2}|[零〇一二两三四五六七八九十]{1,3})(?:点|:|：)(半|一刻|三刻|(\d{1,2}|[零〇一二两三四五六七八九十]{1,3}))?分?/u;
    const match = pattern.exec(text);
    if (!match) {
      return null;
    }

    return {
      rawHour: match[1] ?? '',
      rawMinuteToken: match[2] ?? undefined,
      rawMinuteDigits: match[3] ?? undefined,
      index: match.index,
      text: match[0] ?? '',
    };
  }

  private isExplicitClockContextLikelySchedule(
    text: string,
    explicitMatch: ExplicitClockMatch,
    matchedPeriodKey: ReminderParserPeriodKey | null,
  ) {
    if (/^\d{1,2}$/.test(explicitMatch.rawHour) || matchedPeriodKey != null) {
      return true;
    }

    const prefix = normalizeComparableText(text.slice(0, explicitMatch.index));
    if (!prefix) {
      return true;
    }

    return /(改成|改到|改为|改下|改一下|换成|换到|调整到|更正成|更正为|纠正成|纠正为|是|在|约|今天|明天|后天|早上|早晨|上午|中午|下午|傍晚|晚上|今晚|明晚|睡前|提醒我|记得提醒我|帮我记一下|帮我记着|帮我记住|帮我记|记一下|记着|记住|每周[一二三四五六日天七]?|星期[一二三四五六日天七]?|礼拜[一二三四五六日天七]?)$/u.test(
      prefix,
    );
  }

  private buildTaskRecurrencePrefix(task: ReminderTaskEntity) {
    const rule = task.recurrenceRule;
    if (!rule) {
      return '';
    }

    if (rule.unit === 'daily') {
      return '每天';
    }

    if (rule.unit === 'weekly' && rule.weekdays?.length) {
      const labels = ['日', '一', '二', '三', '四', '五', '六'];
      return `每周${labels[rule.weekdays[0]]}`;
    }

    return '';
  }

  private buildTaskClockText(task: ReminderTaskEntity) {
    if (task.recurrenceRule) {
      return formatTime(task.recurrenceRule.hour, task.recurrenceRule.minute);
    }

    const anchor = task.nextTriggerAt ?? task.dueAt;
    if (!anchor) {
      return '';
    }

    return formatTime(anchor.getHours(), anchor.getMinutes());
  }

  private buildUpdateReminderCommand(input: {
    text: string;
    task: ReminderTaskEntity;
    rules: ReminderRuntimeRulesValue;
  }) {
    const strippedText = normalizeUpdateScheduleFragment(
      stripUpdateCommand(input.text),
    );
    if (!strippedText) {
      return null;
    }

    if (
      this.findMatchedKeywords(
        strippedText,
        input.rules.parserRules.createIntentKeywords,
      ).length > 0
    ) {
      return this.hasScheduleCue(strippedText, input.rules)
        ? strippedText
        : null;
    }

    const scheduleText =
      normalizeUpdateScheduleFragment(
        stripReferencedTaskTitle(strippedText, input.task.title),
      ) || strippedText;
    if (!this.hasScheduleCue(scheduleText, input.rules)) {
      return null;
    }

    const recurrencePrefix =
      input.task.kind !== 'one_time' &&
      !this.hasRecurrenceCue(scheduleText, input.rules)
        ? this.buildTaskRecurrencePrefix(input.task)
        : '';
    const clockText =
      this.extractClock(scheduleText, input.rules) == null
        ? this.buildTaskClockText(input.task)
        : '';

    return [
      recurrencePrefix,
      scheduleText,
      clockText,
      '提醒我',
      input.task.title,
    ]
      .filter((item) => item.trim().length > 0)
      .join(' ');
  }

  private getPeriodRuleEntries(rules: ReminderRuntimeRulesValue) {
    const periodDefaults = rules.parserRules.periodDefaultClocks;
    return [
      ['sleepBefore', periodDefaults.sleepBefore],
      ['morning', periodDefaults.morning],
      ['lateMorning', periodDefaults.lateMorning],
      ['noon', periodDefaults.noon],
      ['afternoon', periodDefaults.afternoon],
      ['dusk', periodDefaults.dusk],
      ['evening', periodDefaults.evening],
    ] as const;
  }

  private findMatchedPeriod(
    text: string,
    rules: ReminderRuntimeRulesValue,
  ): {
    key: ReminderParserPeriodKey;
    matchedPatterns: string[];
    clock: ParsedClock;
  } | null {
    for (const [key, rule] of this.getPeriodRuleEntries(rules)) {
      const matchedPatterns = this.findMatchedKeywords(text, rule.patterns);
      if (matchedPatterns.length === 0) {
        continue;
      }

      return {
        key,
        matchedPatterns,
        clock: {
          hour: rule.hour,
          minute: rule.minute,
          source: 'period_default',
          matchedPeriodKey: key,
          matchedPatterns,
        },
      };
    }

    return null;
  }

  private buildDefaultClock(hour: number, minute: number): ParsedClock {
    return {
      hour,
      minute,
      source: 'default',
      matchedPeriodKey: null,
      matchedPatterns: [],
    };
  }

  private parseCreateIntent(
    text: string,
    timezone: string,
    now: Date,
    rules: ReminderRuntimeRulesValue,
  ): ParsedReminderIntent {
    const matchedCreateKeywords = this.findMatchedKeywords(
      text,
      rules.parserRules.createIntentKeywords,
    );
    const matchedDailyKeywords = this.findMatchedKeywords(
      text,
      rules.parserRules.dailyRecurrenceKeywords,
    );
    const weeklyRule = this.extractWeeklyRule(text, rules);
    const matchedWeeklyKeywords = weeklyRule
      ? [weeklyRule.matchedKeyword]
      : this.findMatchedKeywords(
          text,
          rules.parserRules.weeklyRecurrenceKeywords,
        );
    const matchedHabitIntentKeywords = this.findMatchedKeywords(
      text,
      rules.parserRules.habitIntentKeywords,
    );
    const matchedHabitKeywordsInText = this.findMatchedKeywords(
      text,
      rules.parserRules.habitKeywords,
    );
    const clock = this.extractClock(text, rules);

    const hasReminderVerb = matchedCreateKeywords.length > 0;
    const looksLikeHabit =
      (text.includes('提醒') || hasReminderVerb) &&
      matchedHabitKeywordsInText.length > 0;
    const baseDebug = this.createParserDebug(text, {
      matchedCreateKeywords,
      matchedDailyKeywords,
      matchedWeeklyKeywords,
      matchedHabitIntentKeywords,
      matchedHabitKeywords: matchedHabitKeywordsInText,
      matchedPeriodKey: clock?.matchedPeriodKey ?? null,
      matchedPeriodPatterns: clock?.matchedPatterns ?? [],
    });

    if (!hasReminderVerb && !looksLikeHabit) {
      return {
        handled: false,
        reason: '没有命中创建提醒入口关键词，也不像习惯提醒。',
        debug: baseDebug,
      };
    }

    const title = this.extractReminderTitle(text, rules);
    if (!title) {
      return {
        handled: true,
        needsClarification: true,
        reason: '命中创建提醒入口，但没有解析出事项标题。',
        responseText: rules.textTemplates.taskCreateMissingTitle,
        debug: {
          ...baseDebug,
          extractedTitle: null,
        },
      };
    }

    const matchedHabitKeywords = this.findMatchedKeywords(
      title,
      rules.parserRules.habitKeywords,
    );
    const matchedHardKeywords = this.findMatchedKeywords(
      title,
      rules.parserRules.hardReminderKeywords,
    );
    const categoryMatch = this.detectCategory(title, rules);
    const debug = {
      ...baseDebug,
      extractedTitle: title,
      matchedHabitKeywords,
      matchedHardKeywords,
      matchedCategoryKeywords: categoryMatch.hits,
    };
    const kind =
      matchedDailyKeywords.length > 0 || weeklyRule
        ? 'recurring'
        : matchedHabitIntentKeywords.length > 0 ||
            matchedHabitKeywords.length > 0
          ? 'habit'
          : 'one_time';
    const priority = matchedHardKeywords.length > 0 ? 'hard' : 'soft';
    const category = categoryMatch.category;

    if (kind === 'habit') {
      const resolvedClock =
        clock ??
        this.buildDefaultClock(
          rules.habitDefaultHour,
          rules.habitDefaultMinute,
        );
      const nextTriggerAt = this.resolveNextDailyDate(now, resolvedClock);
      return {
        handled: true,
        reason: '命中创建提醒入口，并解析成习惯提醒。',
        title,
        category,
        kind,
        priority: 'soft',
        timezone,
        dueAt: nextTriggerAt,
        nextTriggerAt,
        recurrenceRule: {
          unit: 'habit',
          hour: resolvedClock.hour,
          minute: resolvedClock.minute,
          cadenceDays: 1,
        },
        responseText: renderTemplate(
          rules.textTemplates.taskCreateHabitSuccess,
          {
            title,
            time: formatTime(resolvedClock.hour, resolvedClock.minute),
          },
        ),
        debug,
      };
    }

    if (matchedDailyKeywords.length > 0) {
      const resolvedClock =
        clock ??
        this.buildDefaultClock(
          rules.defaultReminderHour,
          rules.defaultReminderMinute,
        );
      const nextTriggerAt = this.resolveNextDailyDate(now, resolvedClock);
      return {
        handled: true,
        reason: '命中创建提醒入口，并解析成每日重复提醒。',
        title,
        category,
        kind: 'recurring',
        priority,
        timezone,
        dueAt: nextTriggerAt,
        nextTriggerAt,
        recurrenceRule: {
          unit: 'daily',
          hour: resolvedClock.hour,
          minute: resolvedClock.minute,
        },
        responseText: renderTemplate(
          rules.textTemplates.taskCreateDailySuccess,
          {
            title,
            time: formatTime(resolvedClock.hour, resolvedClock.minute),
          },
        ),
        debug,
      };
    }

    if (weeklyRule) {
      const resolvedClock =
        clock ??
        this.buildDefaultClock(
          rules.defaultReminderHour,
          rules.defaultReminderMinute,
        );
      const nextTriggerAt = this.resolveNextWeeklyDate(
        now,
        weeklyRule.weekday,
        resolvedClock,
      );
      return {
        handled: true,
        reason: '命中创建提醒入口，并解析成每周重复提醒。',
        title,
        category,
        kind: 'recurring',
        priority,
        timezone,
        dueAt: nextTriggerAt,
        nextTriggerAt,
        recurrenceRule: {
          unit: 'weekly',
          weekdays: [weeklyRule.weekday],
          hour: resolvedClock.hour,
          minute: resolvedClock.minute,
        },
        responseText: renderTemplate(
          rules.textTemplates.taskCreateWeeklySuccess,
          {
            title,
            time: formatTime(resolvedClock.hour, resolvedClock.minute),
            weekdayLabel: weeklyRule.label,
          },
        ),
        debug,
      };
    }

    const oneTime = this.extractOneTimeDate(text, now, rules, clock);
    if (!oneTime) {
      return {
        handled: true,
        needsClarification: true,
        reason: '命中创建提醒入口，但没有解析出具体触发时间。',
        responseText: rules.textTemplates.taskCreateMissingTime,
        debug,
      };
    }

    return {
      handled: true,
      reason: '命中创建提醒入口，并解析成单次提醒。',
      title,
      category,
      kind: 'one_time',
      priority,
      timezone,
      dueAt: oneTime,
      nextTriggerAt: oneTime,
      responseText: renderTemplate(
        rules.textTemplates.taskCreateOneTimeSuccess,
        {
          title,
          dateTimeLabel: formatDateTimeLabel(oneTime, now),
        },
      ),
      debug,
    };
  }

  private detectCategory(title: string, rules: ReminderRuntimeRulesValue) {
    const categoryKeywords = rules.parserRules.categoryKeywords;
    const categories: Array<{
      category: string;
      keywords: string[];
    }> = [
      { category: 'health', keywords: categoryKeywords.health },
      { category: 'shopping', keywords: categoryKeywords.shopping },
      { category: 'lifestyle', keywords: categoryKeywords.lifestyle },
      { category: 'growth', keywords: categoryKeywords.growth },
    ];

    for (const item of categories) {
      const hits = this.findMatchedKeywords(title, item.keywords);
      if (hits.length > 0) {
        return {
          category: item.category,
          hits,
        };
      }
    }

    return {
      category: 'general',
      hits: [],
    };
  }

  private extractReminderTitle(text: string, rules: ReminderRuntimeRulesValue) {
    const matchedCreateKeyword = rules.parserRules.createIntentKeywords
      .map((keyword) => ({
        keyword,
        index: text.indexOf(keyword),
      }))
      .filter((item) => item.index >= 0)
      .sort((left, right) =>
        left.index === right.index
          ? right.keyword.length - left.keyword.length
          : left.index - right.index,
      )[0];
    let title = '';
    if (matchedCreateKeyword) {
      title = text
        .slice(matchedCreateKeyword.index + matchedCreateKeyword.keyword.length)
        .trim();
    } else {
      title = text;
    }

    const periodTokens = Array.from(
      new Set([
        '今天',
        '明天',
        '后天',
        ...this.getPeriodRuleEntries(rules).flatMap(
          ([, rule]) => rule.patterns,
        ),
      ]),
    );
    if (periodTokens.length > 0) {
      title = title.replace(
        new RegExp(
          `^(?:(?:${periodTokens.map(escapeRegex).join('|')})\\s*)+`,
          'u',
        ),
        '',
      );
    }

    if (rules.parserRules.dailyRecurrenceKeywords.length > 0) {
      title = title.replace(
        new RegExp(
          `^(?:(?:${rules.parserRules.dailyRecurrenceKeywords
            .map(escapeRegex)
            .join('|')})\\s*)+`,
          'u',
        ),
        '',
      );
    }

    if (rules.parserRules.weeklyRecurrenceKeywords.length > 0) {
      title = title.replace(
        new RegExp(
          `^(?:(?:${rules.parserRules.weeklyRecurrenceKeywords
            .map(escapeRegex)
            .join('|')})[一二三四五六日天七]\\s*)+`,
          'u',
        ),
        '',
      );
    }

    if (periodTokens.length > 0) {
      title = title.replace(
        new RegExp(
          `^(?:(?:${periodTokens.map(escapeRegex).join('|')})\\s*)+`,
          'u',
        ),
        '',
      );
    }

    title = title.replace(
      new RegExp(
        '^((\\d{1,2}|[\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341]{1,3})(\\u70b9|:|\\uff1a)(\\u534a|\\u4e00\\u523b|\\u4e09\\u523b|(\\d{1,2}|[\\u96f6\\u3007\\u4e00\\u4e8c\\u4e24\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341]{1,3}))?\\u5206?)\\s*',
        'u',
      ),
      '',
    );

    title = stripReminderCommand(title);
    return title || null;
  }

  private extractClock(
    text: string,
    rules: ReminderRuntimeRulesValue,
  ): ParsedClock | null {
    const explicitMatch = this.findExplicitClockMatch(text);
    if (explicitMatch) {
      const matchedPeriod = this.findMatchedPeriod(text, rules);
      if (
        !this.isExplicitClockContextLikelySchedule(
          text,
          explicitMatch,
          matchedPeriod?.key ?? null,
        )
      ) {
        return this.findMatchedPeriod(text, rules)?.clock ?? null;
      }

      const rawHour = parseChineseNumber(explicitMatch.rawHour);
      const rawMinute =
        explicitMatch.rawMinuteToken === '半'
          ? 30
          : explicitMatch.rawMinuteToken === '一刻'
            ? 15
            : explicitMatch.rawMinuteToken === '三刻'
              ? 45
              : explicitMatch.rawMinuteDigits
                ? parseChineseNumber(explicitMatch.rawMinuteDigits)
                : 0;
      if (
        Number.isFinite(rawHour) &&
        Number.isFinite(rawMinute) &&
        rawHour >= 0 &&
        rawHour <= 23 &&
        rawMinute >= 0 &&
        rawMinute <= 59
      ) {
        let hour = rawHour;
        if (
          matchedPeriod &&
          ['afternoon', 'dusk', 'evening'].includes(matchedPeriod.key) &&
          hour < 12
        ) {
          hour += 12;
        }
        if (matchedPeriod?.key === 'noon' && hour < 11) {
          hour += 12;
        }
        return {
          hour,
          minute: rawMinute,
          source: 'explicit',
          matchedPeriodKey: matchedPeriod?.key ?? null,
          matchedPatterns: matchedPeriod?.matchedPatterns ?? [],
        };
      }
    }

    return this.findMatchedPeriod(text, rules)?.clock ?? null;
  }

  private extractWeeklyRule(
    text: string,
    rules: ReminderRuntimeRulesValue,
  ): ParsedWeeklyRule | null {
    if (rules.parserRules.weeklyRecurrenceKeywords.length === 0) {
      return null;
    }

    const weeklyPattern = new RegExp(
      `(?:${rules.parserRules.weeklyRecurrenceKeywords
        .map(escapeRegex)
        .join('|')})([一二三四五六日天七])`,
      'u',
    );
    const match = text.match(weeklyPattern);
    if (!match?.[1]) {
      return null;
    }
    const weekday = WEEKDAY_ALIASES[match[1]];
    if (weekday == null) {
      return null;
    }

    return {
      weekday,
      matchedKeyword:
        rules.parserRules.weeklyRecurrenceKeywords.find((keyword) =>
          text.includes(keyword),
        ) ??
        rules.parserRules.weeklyRecurrenceKeywords[0] ??
        '',
      label:
        match[1] === '天' || match[1] === '日' || match[1] === '七'
          ? '日'
          : match[1],
    };
  }

  private extractOneTimeDate(
    text: string,
    now: Date,
    rules: ReminderRuntimeRulesValue,
    clock: ParsedClock | null,
  ) {
    const resolvedClock =
      clock ??
      this.buildDefaultClock(
        rules.defaultReminderHour,
        rules.defaultReminderMinute,
      );
    const dayOffset = this.resolveRelativeDayOffset(
      text,
      resolvedClock.matchedPatterns ?? [],
    );

    if (dayOffset != null) {
      const target = new Date(now);
      target.setDate(target.getDate() + dayOffset);
      target.setHours(resolvedClock.hour, resolvedClock.minute, 0, 0);
      return target;
    }

    if (clock && clock.source !== 'default') {
      const target = new Date(now);
      target.setHours(resolvedClock.hour, resolvedClock.minute, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target;
    }

    return null;
  }

  private resolveRelativeDayOffset(text: string, matchedPatterns: string[]) {
    if (/后天/.test(text)) {
      return 2;
    }
    if (/明天/.test(text)) {
      return 1;
    }
    if (/今天/.test(text)) {
      return 0;
    }
    if (matchedPatterns.some((pattern) => pattern.startsWith('明'))) {
      return 1;
    }
    if (matchedPatterns.some((pattern) => pattern.startsWith('今'))) {
      return 0;
    }
    return null;
  }

  private resolveNextDailyDate(now: Date, clock: ParsedClock) {
    const target = new Date(now);
    target.setHours(clock.hour, clock.minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return target;
  }

  private resolveNextWeeklyDate(
    now: Date,
    weekday: number,
    clock: ParsedClock,
  ) {
    const target = new Date(now);
    target.setHours(clock.hour, clock.minute, 0, 0);
    const diff = (weekday - target.getDay() + 7) % 7;
    target.setDate(target.getDate() + diff);
    if (diff === 0 && target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 7);
    }
    return target;
  }

  private computeNextTriggerAfter(task: ReminderTaskEntity, now: Date) {
    const rule = task.recurrenceRule;
    if (!rule) {
      return null;
    }

    const clock = {
      hour: rule.hour,
      minute: rule.minute,
      source: 'default' as const,
    };

    if (rule.unit === 'weekly' && rule.weekdays?.length) {
      return this.resolveNextWeeklyDate(now, rule.weekdays[0], clock);
    }

    const cadenceDays = rule.unit === 'habit' ? (rule.cadenceDays ?? 1) : 1;
    const target = new Date(now);
    target.setHours(clock.hour, clock.minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + cadenceDays);
    }
    return target;
  }

  private describeIntentSchedule(intent: ResolvedReminderIntent, now: Date) {
    if (intent.recurrenceRule?.unit === 'daily') {
      return `每天 ${formatTime(
        intent.recurrenceRule.hour,
        intent.recurrenceRule.minute,
      )}`;
    }
    if (
      intent.recurrenceRule?.unit === 'weekly' &&
      intent.recurrenceRule.weekdays?.length
    ) {
      const labels = ['日', '一', '二', '三', '四', '五', '六'];
      return `每周${labels[intent.recurrenceRule.weekdays[0]]} ${formatTime(
        intent.recurrenceRule.hour,
        intent.recurrenceRule.minute,
      )}`;
    }
    if (intent.recurrenceRule?.unit === 'habit') {
      return `每天 ${formatTime(
        intent.recurrenceRule.hour,
        intent.recurrenceRule.minute,
      )} 轻提醒`;
    }

    const next = intent.nextTriggerAt ?? intent.dueAt;
    return next ? formatDateTimeLabel(next, now) : '已更新';
  }

  private describeSchedule(
    task: ReminderTaskEntity,
    language: WorldLanguageCode = 'zh-CN',
  ) {
    if (task.recurrenceRule?.unit === 'daily') {
      const time = formatTime(
        task.recurrenceRule.hour,
        task.recurrenceRule.minute,
      );
      switch (language) {
        case 'en-US':
          return `every day at ${time}`;
        case 'ja-JP':
          return `毎日 ${time}`;
        case 'ko-KR':
          return `매일 ${time}`;
        case 'zh-CN':
        default:
          return `每天 ${time}`;
      }
    }
    if (
      task.recurrenceRule?.unit === 'weekly' &&
      task.recurrenceRule.weekdays?.length
    ) {
      const weekday = task.recurrenceRule.weekdays[0] ?? 0;
      const time = formatTime(
        task.recurrenceRule.hour,
        task.recurrenceRule.minute,
      );
      switch (language) {
        case 'en-US':
          return `every ${this.getWeekdayLabel(weekday, language)} at ${time}`;
        case 'ja-JP':
          return `毎週${this.getWeekdayLabel(weekday, language)} ${time}`;
        case 'ko-KR':
          return `매주 ${this.getWeekdayLabel(weekday, language)} ${time}`;
        case 'zh-CN':
        default:
          return `每周${this.getWeekdayLabel(weekday, language)} ${time}`;
      }
    }
    if (task.recurrenceRule?.unit === 'habit') {
      const time = formatTime(
        task.recurrenceRule.hour,
        task.recurrenceRule.minute,
      );
      switch (language) {
        case 'en-US':
          return `gentle reminder every day at ${time}`;
        case 'ja-JP':
          return `毎日 ${time} の軽いリマインド`;
        case 'ko-KR':
          return `매일 ${time} 가벼운 알림`;
        case 'zh-CN':
        default:
          return `每天 ${time} 轻提醒`;
      }
    }

    const next = task.nextTriggerAt ?? task.dueAt;
    if (next) {
      return language === 'zh-CN'
        ? formatDateTimeLabel(next, new Date())
        : new Intl.DateTimeFormat(language, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(next);
    }
    switch (language) {
      case 'en-US':
        return 'already triggered, waiting for you';
      case 'ja-JP':
        return 'すでに通知済み、対応待ち';
      case 'ko-KR':
        return '이미 알림됨, 처리 대기 중';
      case 'zh-CN':
      default:
        return '已触发，等你处理';
    }
  }

  private isLongHorizonNudgeTask(task: ReminderTaskEntity) {
    return (
      task.kind === 'habit' ||
      task.category === 'growth' ||
      task.category === 'lifestyle' ||
      task.category === 'health'
    );
  }

  private buildReminderCompanionLine(
    tasks: ReminderMomentNudge[],
    slot: ReminderMomentSlot,
    language: WorldLanguageCode = 'zh-CN',
  ) {
    if (tasks.length <= 1) {
      return '';
    }

    const labels = tasks
      .slice(0, 3)
      .map((item) => this.truncateReminderLabel(item.title, 8));
    switch (language) {
      case 'en-US':
        return slot === 'morning'
          ? `I'm keeping an eye on these today: ${labels.join(', ')}. Don't let the day bury them.`
          : `I'm still watching these today: ${labels.join(', ')}. Long-running things do not need to drift into tomorrow again.`;
      case 'ja-JP':
        return slot === 'morning'
          ? `今日はまず${labels.join('、')}を見ています。忙しさで全部流さないで。`
          : `今日は引き続き${labels.join('、')}を見ています。長く残っていることをまた明日に回さないで。`;
      case 'ko-KR':
        return slot === 'morning'
          ? `오늘은 먼저 ${labels.join(', ')}을(를) 보고 있을게요. 바쁘다고 전부 놓치지 마세요.`
          : `오늘도 ${labels.join(', ')}을(를) 계속 보고 있을게요. 오래 남은 일들을 또 내일로 미루지 마세요.`;
      case 'zh-CN':
      default:
        break;
    }
    if (slot === 'morning') {
      return `我这边今天先盯着：${labels.join('、')}。别一忙起来就全忘了。`;
    }
    return `我这边今天继续盯着：${labels.join('、')}。长期的事，别又一起拖到明天。`;
  }

  private buildSingleReminderCompanionLine(
    focus: string,
    language: WorldLanguageCode,
  ) {
    switch (language) {
      case 'en-US':
        return `${focus} is still on the list. Start with one small move today instead of pushing it back again.`;
      case 'ja-JP':
        return `${focus}、今日は少しだけでも動かして。これ以上先送りにしないで。`;
      case 'ko-KR':
        return `${focus}, 오늘은 조금이라도 시작해요. 더 미루지 마세요.`;
      case 'zh-CN':
      default:
        return `${focus}，今天先动一点，别继续往后拖。`;
    }
  }

  private getLocalizedMomentNudgeTemplates(
    language: Exclude<WorldLanguageCode, 'zh-CN'>,
    slot: ReminderMomentSlot,
  ) {
    const templates: Record<
      Exclude<WorldLanguageCode, 'zh-CN'>,
      Record<ReminderMomentSlot, string[]>
    > = {
      'en-US': {
        morning: [
          '{{companionLine}}',
          '{{focus}} is the thing to touch first this morning. A small start counts.',
        ],
        evening: [
          '{{companionLine}}',
          '{{focus}} can still move a little tonight. Close one small loop before the day ends.',
        ],
        general: [
          '{{companionLine}}',
          '{{focus}} is still waiting. One small step is better than carrying it untouched.',
        ],
      },
      'ja-JP': {
        morning: [
          '{{companionLine}}',
          '今朝はまず{{focus}}に少し触れて。小さく始めるだけでもいい。',
        ],
        evening: [
          '{{companionLine}}',
          '今夜のうちに{{focus}}を少しだけ進めて。小さく閉じられるところまででいい。',
        ],
        general: [
          '{{companionLine}}',
          '{{focus}}がまだ待っています。手つかずで抱えるより、少し動かしておこう。',
        ],
      },
      'ko-KR': {
        morning: [
          '{{companionLine}}',
          '오늘 아침엔 {{focus}}부터 조금 건드려 봐요. 작게 시작해도 충분해요.',
        ],
        evening: [
          '{{companionLine}}',
          '오늘이 끝나기 전에 {{focus}}를 조금만 더 움직여 봐요.',
        ],
        general: [
          '{{companionLine}}',
          '{{focus}}가 아직 기다리고 있어요. 그대로 안고 가기보다 한 걸음만 옮겨요.',
        ],
      },
    };
    return templates[language][slot];
  }

  private getWeekdayLabel(day: number, language: WorldLanguageCode) {
    const normalizedDay = Math.max(0, Math.min(6, Math.trunc(day)));
    const labels: Record<WorldLanguageCode, string[]> = {
      'zh-CN': ['日', '一', '二', '三', '四', '五', '六'],
      'en-US': [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ],
      'ja-JP': ['日曜', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜'],
      'ko-KR': [
        '일요일',
        '월요일',
        '화요일',
        '수요일',
        '목요일',
        '금요일',
        '토요일',
      ],
    };
    return labels[language][normalizedDay] ?? labels['zh-CN'][normalizedDay];
  }

  private truncateReminderLabel(value: string, maxLength: number) {
    const normalized = value.replace(/[，。、“”‘’：:！!？?；;,.]/g, '').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, maxLength)}…`;
  }

  private serializeMoment(
    moment: MomentPostEntity,
  ): ReminderRuntimeOverviewMoment {
    const slot =
      typeof moment.generationMetadata?.slot === 'string'
        ? moment.generationMetadata.slot
        : null;
    const slotLabel =
      typeof moment.generationMetadata?.slotLabel === 'string'
        ? moment.generationMetadata.slotLabel
        : null;

    return {
      id: moment.id,
      text: moment.text,
      generationKind: moment.generationKind,
      slot,
      slotLabel,
      likeCount: moment.likeCount ?? 0,
      commentCount: moment.commentCount ?? 0,
      postedAt: moment.postedAt.toISOString(),
    };
  }

  private buildDueReminderMessage(
    task: ReminderTaskEntity,
    rules: ReminderRuntimeRulesValue,
  ) {
    if (task.priority === 'hard') {
      return renderTemplate(rules.textTemplates.dueReminderHard, {
        title: task.title,
      });
    }
    if (task.kind === 'habit') {
      return renderTemplate(rules.textTemplates.dueReminderHabit, {
        title: task.title,
      });
    }
    return renderTemplate(rules.textTemplates.dueReminderDefault, {
      title: task.title,
    });
  }

  private resolveSnoozeUntil(
    input: { minutes?: number; hours?: number; until?: string },
    now: Date,
  ) {
    if (input.until) {
      const parsed = new Date(input.until);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('until 不是有效时间。');
      }
      return parsed;
    }

    const minutes = Number.isFinite(input.minutes) ? Number(input.minutes) : 0;
    const hours = Number.isFinite(input.hours) ? Number(input.hours) : 0;
    const totalMinutes = Math.trunc(minutes + hours * 60);
    if (totalMinutes <= 0) {
      throw new BadRequestException('请提供有效的延后时间。');
    }

    const until = new Date(now);
    until.setMinutes(until.getMinutes() + totalMinutes);
    return until;
  }

  private resolveSnoozeFromText(text: string, now: Date) {
    if (/明天再提醒/.test(text)) {
      const until = new Date(now);
      until.setDate(until.getDate() + 1);
      until.setHours(now.getHours(), now.getMinutes(), 0, 0);
      return until;
    }
    if (/明早再提醒/.test(text)) {
      const until = new Date(now);
      until.setDate(until.getDate() + 1);
      until.setHours(8, 0, 0, 0);
      return until;
    }
    if (/半小时/.test(text)) {
      const until = new Date(now);
      until.setMinutes(until.getMinutes() + 30);
      return until;
    }

    const hourMatch = text.match(/(\d+)\s*小时后/);
    if (hourMatch?.[1]) {
      const until = new Date(now);
      until.setHours(until.getHours() + Number(hourMatch[1]));
      return until;
    }

    const until = new Date(now);
    until.setHours(until.getHours() + 1);
    return until;
  }

  private serializeTask(task: ReminderTaskEntity): ReminderTaskRecordValue {
    return {
      id: task.id,
      title: task.title,
      detail: task.detail ?? null,
      category: task.category,
      kind: task.kind as ReminderTaskKind,
      status: task.status as ReminderTaskStatus,
      priority: task.priority as ReminderTaskPriority,
      timezone: task.timezone,
      dueAt: task.dueAt?.toISOString() ?? null,
      nextTriggerAt: task.nextTriggerAt?.toISOString() ?? null,
      lastTriggeredAt: task.lastTriggeredAt?.toISOString() ?? null,
      lastDeliveredAt: task.lastDeliveredAt?.toISOString() ?? null,
      lastCompletedAt: task.lastCompletedAt?.toISOString() ?? null,
      snoozedUntil: task.snoozedUntil?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
      cancelledAt: task.cancelledAt?.toISOString() ?? null,
      completionCount: task.completionCount ?? 0,
      recurrenceRule: task.recurrenceRule ?? null,
      scheduleText: this.describeSchedule(task),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }
}

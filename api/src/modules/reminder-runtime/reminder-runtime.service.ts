import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { WorldOwnerService } from '../auth/world-owner.service';
import { MessageEntity } from '../chat/message.entity';
import {
  REMINDER_CHARACTER_ID,
  REMINDER_CHARACTER_SOURCE_KEY,
} from '../characters/reminder-character';
import { MomentPostEntity } from '../moments/moment-post.entity';
import { WorldService } from '../world/world.service';
import { ReminderTaskEntity } from './reminder-task.entity';
import { ReminderRuntimeRulesService } from './reminder-runtime-rules.service';
import type {
  ReminderRecurrenceRule,
  ReminderRuntimeRulesValue,
  ReminderTaskKind,
  ReminderTaskPriority,
  ReminderTaskRecordValue,
  ReminderTaskStatus,
} from './reminder-runtime.types';

type ReminderTaskQuery = {
  status?: string;
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

type ParsedClock = {
  hour: number;
  minute: number;
};

type ParsedReminderIntent =
  | {
      handled: false;
    }
  | {
      handled: true;
      needsClarification: true;
      responseText: string;
    }
  | {
      handled: true;
      needsClarification?: false;
      title: string;
      category: string;
      kind: ReminderTaskKind;
      priority: ReminderTaskPriority;
      timezone: string;
      dueAt?: Date | null;
      nextTriggerAt?: Date | null;
      recurrenceRule?: ReminderRecurrenceRule | null;
      responseText: string;
    };

const HARD_REMINDER_KEYWORDS = ['吃药', '开会', '会议', '复诊', '考试'];
const HABIT_KEYWORDS = [
  '学英语',
  '英语',
  '锻炼',
  '运动',
  '健身',
  '背单词',
  '喝水',
  '早睡',
  '复盘',
  '看书',
  '读书',
];
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

  async getTasks(query?: ReminderTaskQuery): Promise<ReminderTaskRecordValue[]> {
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

  async getMomentNudgeTasks(limit = 3): Promise<ReminderMomentNudge[]> {
    const owner = await this.worldOwnerService.getOwnerOrThrow();
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
      scheduleText: this.describeSchedule(task),
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
          return timestamp >= now.getTime() && timestamp <= dueSoonCutoff.getTime();
        }).length,
        overdueTaskCount: activeRows.filter(
          (item) =>
            item.nextTriggerAt instanceof Date &&
            item.nextTriggerAt.getTime() < now.getTime(),
        ).length,
        habitTaskCount: activeRows.filter((item) => item.kind === 'habit').length,
        hardTaskCount: activeRows.filter((item) => item.priority === 'hard').length,
        deliveredTodayCount,
        completedTodayCount,
        momentCountToday,
      },
      activeTasks,
      upcomingTasks,
      recentDeliveredTasks: recentDeliveredRows.map((item) => this.serializeTask(item)),
      recentCompletedTasks: recentCompletedRows.map((item) => this.serializeTask(item)),
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
    const tasks = await this.getMomentNudgeTasks(input?.limit ?? 3);
    if (tasks.length === 0) {
      return null;
    }

    const primary = tasks[0];
    const focus = this.truncateReminderLabel(primary.title, 14);
    const companionLine = this.buildReminderCompanionLine(tasks, slot);
    let variants: string[] = [];

    if (/英语|背单词/.test(primary.title)) {
      variants =
        slot === 'morning'
          ? [
              `今天的${focus}，早一点开个头。`,
              '英语这件事，先开口一点，就不算断。',
              companionLine || `别把${focus}又顺到晚上。`,
            ]
          : [
              '英语这件事，不靠哪天突然开窍，靠的是今天也没断。',
              `今天的${focus}，做一点就不算掉线。`,
              companionLine || `先别跟“明天开始”合作了。${focus}，今天动一下。`,
            ];
    } else if (/锻炼|运动|健身/.test(primary.title)) {
      variants =
        slot === 'morning'
          ? [
              `今天的${focus}，先动一下就算开张。`,
              '锻炼不靠等状态，靠今天先动一下。',
              companionLine || `把${focus}留到太晚，通常就没下文了。`,
            ]
          : [
              '锻炼不靠等状态，靠今天先动一下。',
              `今天不必练很猛，${focus}别断就行。`,
              companionLine || `长期的事最怕连续说“明天”。${focus}，先做一点。`,
            ];
    } else if (/早睡|睡觉/.test(primary.title)) {
      variants = [
        '早睡这件事，嘴上说一次不算，今晚早点放下手机才算。',
        `今天的${focus}，别又让“再刷一会儿”赢了。`,
        companionLine || '消息可以晚回一点，觉别总晚睡。',
      ];
    } else if (/喝水|吃饭/.test(primary.title)) {
      variants =
        slot === 'morning'
          ? [
              `今天别一忙就把${focus}忘了。`,
              `先把${focus}放进今天的节奏里。`,
              companionLine || `从现在开始，${focus}也算一件正事。`,
            ]
          : [
              `再忙也别把${focus}排到最后。`,
              '照顾身体这种事，不该总靠想起来。',
              companionLine || `今天的${focus}，也照样算数。`,
            ];
    } else if (/吃药|复诊|体检/.test(primary.title)) {
      variants = [
        `跟身体有关的事别拿来讨价还价。${focus}。`,
        `重要的不是记性好，是到点就动。${focus}。`,
        companionLine || `该做的${focus}，今天别拖。`,
      ];
    } else {
      switch (primary.category) {
        case 'growth':
          variants =
            slot === 'morning'
              ? [
                  `今天先盯住${focus}，别还没开始就让一天过去。`,
                  companionLine || `先动一下${focus}，今天才算真正开场。`,
                  `热血不一定天天有，${focus}先做一点也行。`,
                ]
              : [
                  `长期的事最怕“明天开始”。${focus}，今天做一点也算没掉线。`,
                  companionLine || `今天先盯住${focus}，别让计划继续停在计划里。`,
                  `热血不一定天天有，${focus}做一点也算推进。`,
                ];
          break;
        case 'lifestyle':
          variants = [
            `再忙也别把身体放到待办最后。${focus}，今天照样算数。`,
            companionLine || `今天也照顾一下自己。${focus}别再往后拖。`,
            `人可以慢一点，${focus}别一直往后顺。`,
          ];
          break;
        case 'health':
          variants = [
            `身体相关的事，不适合跟自己讲价。${focus}。`,
            companionLine || `今天先把${focus}处理掉，别拖。`,
            `我这边盯的不是效率，是${focus}这种不能一直拖的事。`,
          ];
          break;
        default:
          variants = [
            companionLine || `我这边今天继续盯着：${focus}。先做一点，别全留给明天。`,
            `怕忘的事不用都塞给脑子。${focus}，今天往前推一点。`,
            `先做一件也行，${focus}别一直挂在嘴上。`,
          ];
          break;
      }
    }

    return {
      text:
        variants[
          hashTextSeed(
            `${input?.seedKey ?? now.toISOString().slice(0, 10)}:${slot}:${primary.id}`,
          ) % variants.length
        ],
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

    if (!text) {
      return { handled: false };
    }

    if (this.isHelpIntent(text)) {
      return {
        handled: true,
        responseText:
          '你可以直接说“明早8点提醒我吃药”“每周五提醒我买猫粮”“提醒我坚持学英语”。要查、删、延后、完成，也直接跟我说。',
      };
    }

    if (this.isListIntent(text)) {
      const tasks = await this.listActiveTasksForConversation(
        owner.id,
        input.conversationId,
      );
      return {
        handled: true,
        responseText: this.renderTaskList(tasks, rules.maxListItems),
      };
    }

    if (this.isCancelIntent(text)) {
      const task = await this.resolveReferencedTask(
        owner.id,
        input.conversationId,
        text,
      );
      if (!task) {
        return {
          handled: true,
          responseText: '我没对上你想删的是哪一个。你把事项名再说一遍就行。',
        };
      }

      task.status = 'cancelled';
      task.cancelledAt = now;
      task.nextTriggerAt = null;
      const saved = await this.taskRepo.save(task);
      return {
        handled: true,
        responseText: `删掉了：${saved.title}。`,
        task: this.serializeTask(saved),
      };
    }

    if (this.isSnoozeIntent(text)) {
      const task = await this.resolveReferencedTask(
        owner.id,
        input.conversationId,
        text,
      );
      if (!task) {
        return {
          handled: true,
          responseText: '我没对上要延后的是哪一个。你带上事项名再说一次。',
        };
      }

      const until = this.resolveSnoozeFromText(text, now);
      task.nextTriggerAt = until;
      task.snoozedUntil = until;
      const saved = await this.taskRepo.save(task);
      return {
        handled: true,
        responseText: `往后顺到了${formatDateTimeLabel(until, now)}。${saved.title}我会再叫你。`,
        task: this.serializeTask(saved),
      };
    }

    if (this.isCompleteIntent(text)) {
      const task = await this.resolveReferencedTask(
        owner.id,
        input.conversationId,
        text,
      );
      if (!task) {
        return {
          handled: true,
          responseText: '我没对上你完成的是哪件事。你把事项名补给我就行。',
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
        responseText = `收到，${task.title}我记成已完成了。`;
      } else {
        task.completedAt = null;
        task.nextTriggerAt = this.computeNextTriggerAfter(task, now);
        responseText = `收到，这次${task.title}我记成完成了。下次还是按${this.describeSchedule(task)}提醒你。`;
      }

      const saved = await this.taskRepo.save(task);
      return {
        handled: true,
        responseText,
        task: this.serializeTask(saved),
      };
    }

    const parsedIntent = this.parseCreateIntent(
      text,
      worldCalendar.location.timezone,
      now,
      rules,
    );
    if (!parsedIntent.handled) {
      return { handled: false };
    }

    if ('needsClarification' in parsedIntent && parsedIntent.needsClarification) {
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

  async prepareDueDispatches(now = new Date()): Promise<ReminderDispatch[]> {
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
      text: this.buildDueReminderMessage(task),
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

  async collectCheckinDispatches(now = new Date()): Promise<ReminderDispatch[]> {
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
      const minIntervalMs =
        rules.checkinMinIntervalHours * 60 * 60 * 1000;
      if (now.getTime() - lastReminderMessage.createdAt.getTime() < minIntervalMs) {
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
            ? `我这边还替你记着${activeCount}件事。要是还有新的，也继续丢给我。`
            : '今天如果还有什么怕忘的，直接发我一句，我替你盯着。',
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
        !item.sourceConversationId || item.sourceConversationId === conversationId,
    );
    return scoped.length > 0 ? scoped : rows;
  }

  private renderTaskList(tasks: ReminderTaskEntity[], maxItems: number) {
    if (tasks.length === 0) {
      return '你现在还没让我记着具体的事。要记新的，直接把事项和时间发我。';
    }

    const lines = tasks.slice(0, maxItems).map((item, index) => {
      return `${index + 1}. ${item.title}，${this.describeSchedule(item)}`;
    });
    return `你现在让我记着这些：\n${lines.join('\n')}`;
  }

  private async resolveReferencedTask(
    ownerId: string,
    conversationId: string,
    text: string,
  ) {
    const tasks = await this.listActiveTasksForConversation(ownerId, conversationId);
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

  private isListIntent(text: string) {
    return /(有哪些|有什么|列一下|查一下|看看).*(提醒|待提醒|待办|记着)|提醒.*(有哪些|有什么|列一下|查一下|看看)/.test(
      text,
    );
  }

  private isHelpIntent(text: string) {
    return /(怎么用|你能提醒|你能做什么|怎么提醒|能帮我记什么)/.test(text);
  }

  private isCancelIntent(text: string) {
    return /(取消|删掉|删除|不用提醒|别提醒|不需要提醒)/.test(text);
  }

  private isCompleteIntent(text: string) {
    return /^(完成了|已完成|搞定了|做完了|买好了|吃过了|吃完了|练了|睡了)/.test(
      text,
    );
  }

  private isSnoozeIntent(text: string) {
    return /(延后|晚点|等会|待会|稍后|一小时后|半小时后|明天再提醒|明早再提醒)/.test(
      text,
    );
  }

  private parseCreateIntent(
    text: string,
    timezone: string,
    now: Date,
    rules: ReminderRuntimeRulesValue,
  ): ParsedReminderIntent {
    const hasReminderVerb =
      text.includes('提醒我') ||
      text.includes('记得提醒我') ||
      text.includes('帮我记') ||
      text.includes('记一下') ||
      text.includes('记着');
    const looksLikeHabit =
      /提醒/.test(text) &&
      HABIT_KEYWORDS.some((keyword) => text.includes(keyword));

    if (!hasReminderVerb && !looksLikeHabit) {
      return { handled: false };
    }

    const title = this.extractReminderTitle(text);
    if (!title) {
      return {
        handled: true,
        needsClarification: true,
        responseText:
          '这件事我能替你记，但你还没把事项说清。你可以直接说“明早8点提醒我吃药”。',
      };
    }

    const kind = this.detectKind(text, title);
    const priority = HARD_REMINDER_KEYWORDS.some((keyword) =>
      title.includes(keyword),
    )
      ? 'hard'
      : 'soft';
    const category = this.detectCategory(title);

    if (kind === 'habit') {
      const clock =
        this.extractClock(text) ?? {
          hour: rules.habitDefaultHour,
          minute: rules.habitDefaultMinute,
        };
      const nextTriggerAt = this.resolveNextDailyDate(now, clock);
      return {
        handled: true,
        title,
        category,
        kind,
        priority: 'soft',
        timezone,
        dueAt: nextTriggerAt,
        nextTriggerAt,
        recurrenceRule: {
          unit: 'habit',
          hour: clock.hour,
          minute: clock.minute,
          cadenceDays: 1,
        },
        responseText: `记下了。我先按每天 ${formatTime(clock.hour, clock.minute)} 轻轻提醒你${title}。想换时间就直接告诉我。`,
      };
    }

    if (text.includes('每天')) {
      const clock =
        this.extractClock(text) ?? {
          hour: rules.defaultReminderHour,
          minute: rules.defaultReminderMinute,
        };
      const nextTriggerAt = this.resolveNextDailyDate(now, clock);
      return {
        handled: true,
        title,
        category,
        kind: 'recurring',
        priority,
        timezone,
        dueAt: nextTriggerAt,
        nextTriggerAt,
        recurrenceRule: {
          unit: 'daily',
          hour: clock.hour,
          minute: clock.minute,
        },
        responseText: `记下了。我会每天 ${formatTime(clock.hour, clock.minute)} 提醒你${title}。`,
      };
    }

    const weeklyRule = this.extractWeeklyRule(text);
    if (weeklyRule) {
      const clock =
        this.extractClock(text) ?? {
          hour: rules.defaultReminderHour,
          minute: rules.defaultReminderMinute,
        };
      const nextTriggerAt = this.resolveNextWeeklyDate(
        now,
        weeklyRule.weekday,
        clock,
      );
      return {
        handled: true,
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
          hour: clock.hour,
          minute: clock.minute,
        },
        responseText: `记下了。我会每周${weeklyRule.label} ${formatTime(clock.hour, clock.minute)} 提醒你${title}。`,
      };
    }

    const oneTime = this.extractOneTimeDate(text, now, rules);
    if (!oneTime) {
      return {
        handled: true,
        needsClarification: true,
        responseText:
          '这件事我可以替你记，但你还没告诉我具体什么时候提醒。比如“明天早上8点提醒我吃药”。',
      };
    }

    return {
      handled: true,
      title,
      category,
      kind: 'one_time',
      priority,
      timezone,
      dueAt: oneTime,
      nextTriggerAt: oneTime,
      responseText: `记下了。我会在${formatDateTimeLabel(oneTime, now)}提醒你${title}。`,
    };
  }

  private detectKind(text: string, title: string): ReminderTaskKind {
    if (text.includes('每天') || /每周|每星期|礼拜./.test(text)) {
      return 'recurring';
    }
    if (
      /坚持|长期|养成|监督我/.test(text) ||
      HABIT_KEYWORDS.some((keyword) => title.includes(keyword))
    ) {
      return 'habit';
    }
    return 'one_time';
  }

  private detectCategory(title: string) {
    if (/吃药|复诊|体检/.test(title)) {
      return 'health';
    }
    if (/买|采购|补货|快递/.test(title)) {
      return 'shopping';
    }
    if (/睡|吃饭|喝水/.test(title)) {
      return 'lifestyle';
    }
    if (/学|背单词|英语|复盘|锻炼|运动|看书/.test(title)) {
      return 'growth';
    }
    return 'general';
  }

  private extractReminderTitle(text: string) {
    const reminderIndex = text.indexOf('提醒我');
    let title = '';
    if (reminderIndex >= 0) {
      title = text.slice(reminderIndex + '提醒我'.length).trim();
    } else if (text.includes('记得提醒我')) {
      title = text.slice(text.indexOf('记得提醒我') + '记得提醒我'.length).trim();
    } else if (text.includes('帮我记')) {
      title = text.slice(text.indexOf('帮我记') + '帮我记'.length).trim();
    } else {
      title = text;
    }

    title = title
      .replace(
        /^(今天|明天|后天|今晚|今早|明早|明晚|早上|上午|中午|下午|傍晚|晚上|睡前)\s*/,
        '',
      )
      .replace(
        /^(每周[一二三四五六日天]|每星期[一二三四五六日天]|礼拜[一二三四五六日天]|周[一二三四五六日天])\s*/,
        '',
      )
      .replace(
        /^((\d{1,2}|[零〇一二两三四五六七八九十]{1,3})(点|:|：)(\d{1,2}|[零〇一二两三四五六七八九十]{1,3})?分?)\s*/,
        '',
      );

    title = stripReminderCommand(title);
    return title || null;
  }

  private extractClock(text: string): ParsedClock | null {
    const explicitMatch = text.match(
      /(\d{1,2}|[零〇一二两三四五六七八九十]{1,3})(?:点|:|：)(\d{1,2}|[零〇一二两三四五六七八九十]{1,3})?/,
    );
    if (explicitMatch) {
      const rawHour = parseChineseNumber(explicitMatch[1]);
      const rawMinute = explicitMatch[2]
        ? parseChineseNumber(explicitMatch[2])
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
        if (/下午|晚上|今晚|傍晚/.test(text) && hour < 12) {
          hour += 12;
        }
        if (/中午/.test(text) && hour < 11) {
          hour += 12;
        }
        return { hour, minute: rawMinute };
      }
    }

    const periodDefaults: Array<{ pattern: RegExp; clock: ParsedClock }> = [
      { pattern: /睡前/, clock: { hour: 23, minute: 0 } },
      { pattern: /明早|今早|早上|早晨/, clock: { hour: 8, minute: 0 } },
      { pattern: /上午/, clock: { hour: 9, minute: 0 } },
      { pattern: /中午/, clock: { hour: 12, minute: 30 } },
      { pattern: /下午/, clock: { hour: 15, minute: 0 } },
      { pattern: /傍晚/, clock: { hour: 18, minute: 30 } },
      { pattern: /晚上|今晚|明晚/, clock: { hour: 20, minute: 0 } },
    ];

    for (const item of periodDefaults) {
      if (item.pattern.test(text)) {
        return item.clock;
      }
    }

    return null;
  }

  private extractWeeklyRule(text: string) {
    const match = text.match(/(?:每周|每星期|礼拜)([一二三四五六日天七])/);
    if (!match?.[1]) {
      return null;
    }
    const weekday = WEEKDAY_ALIASES[match[1]];
    if (weekday == null) {
      return null;
    }

    return {
      weekday,
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
  ) {
    const clock =
      this.extractClock(text) ?? {
        hour: rules.defaultReminderHour,
        minute: rules.defaultReminderMinute,
      };

    if (/明天/.test(text)) {
      const target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(clock.hour, clock.minute, 0, 0);
      return target;
    }
    if (/后天/.test(text)) {
      const target = new Date(now);
      target.setDate(target.getDate() + 2);
      target.setHours(clock.hour, clock.minute, 0, 0);
      return target;
    }
    if (/今晚|今早|今天|早上|上午|中午|下午|傍晚|晚上|睡前/.test(text)) {
      const target = new Date(now);
      target.setHours(clock.hour, clock.minute, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target;
    }
    if (this.extractClock(text)) {
      const target = new Date(now);
      target.setHours(clock.hour, clock.minute, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target;
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
    };

    if (rule.unit === 'weekly' && rule.weekdays?.length) {
      return this.resolveNextWeeklyDate(now, rule.weekdays[0], clock);
    }

    const cadenceDays = rule.unit === 'habit' ? rule.cadenceDays ?? 1 : 1;
    const target = new Date(now);
    target.setHours(clock.hour, clock.minute, 0, 0);
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + cadenceDays);
    }
    return target;
  }

  private describeSchedule(task: ReminderTaskEntity) {
    if (task.recurrenceRule?.unit === 'daily') {
      return `每天 ${formatTime(task.recurrenceRule.hour, task.recurrenceRule.minute)}`;
    }
    if (
      task.recurrenceRule?.unit === 'weekly' &&
      task.recurrenceRule.weekdays?.length
    ) {
      const labels = ['日', '一', '二', '三', '四', '五', '六'];
      return `每周${labels[task.recurrenceRule.weekdays[0]]} ${formatTime(
        task.recurrenceRule.hour,
        task.recurrenceRule.minute,
      )}`;
    }
    if (task.recurrenceRule?.unit === 'habit') {
      return `每天 ${formatTime(task.recurrenceRule.hour, task.recurrenceRule.minute)} 轻提醒`;
    }

    const next = task.nextTriggerAt ?? task.dueAt;
    return next ? formatDateTimeLabel(next, new Date()) : '已触发，等你处理';
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
  ) {
    if (tasks.length <= 1) {
      return '';
    }

    const labels = tasks
      .slice(0, 3)
      .map((item) => this.truncateReminderLabel(item.title, 8));
    if (slot === 'morning') {
      return `我这边今天先盯着：${labels.join('、')}。别一忙起来就全忘了。`;
    }
    return `我这边今天继续盯着：${labels.join('、')}。长期的事，别又一起拖到明天。`;
  }

  private truncateReminderLabel(value: string, maxLength: number) {
    const normalized = value
      .replace(/[，。、“”‘’：:！!？?；;,.]/g, '')
      .trim();
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

  private buildDueReminderMessage(task: ReminderTaskEntity) {
    if (task.priority === 'hard') {
      return `${task.title}，到点了。先去做。`;
    }
    if (task.kind === 'habit') {
      return `${task.title}这件事，今天也别断。我在这儿替你提个醒。`;
    }
    return `${task.title}，别忘了。`;
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

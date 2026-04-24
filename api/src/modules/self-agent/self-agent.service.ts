import { NotFoundException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThanOrEqual } from 'typeorm';
import { ActionRuntimeService } from '../action-runtime/action-runtime.service';
import { ActionRunEntity } from '../action-runtime/action-run.entity';
import { UserEntity } from '../auth/user.entity';
import { CharacterEntity } from '../characters/character.entity';
import { SELF_CHARACTER_ID } from '../characters/default-characters';
import { FollowupOpenLoopEntity } from '../followup-runtime/followup-open-loop.entity';
import { ReminderRuntimeService } from '../reminder-runtime/reminder-runtime.service';
import { ReminderTaskEntity } from '../reminder-runtime/reminder-task.entity';
import { SelfAgentWorkspaceService } from './self-agent-workspace.service';
import { SelfAgentHeartbeatRunEntity } from './self-agent-heartbeat-run.entity';

type SelfAgentHandlingResult = {
  handled: boolean;
  responseText?: string;
  handledBy?: 'action_runtime' | 'reminder_runtime';
};

type SelfAgentWorkspaceDocumentName =
  | 'AGENTS.md'
  | 'SOUL.md'
  | 'USER.md'
  | 'IDENTITY.md'
  | 'TOOLS.md'
  | 'HEARTBEAT.md'
  | 'MEMORY.md';

type SelfAgentHeartbeatTrigger = 'manual' | 'scheduler';

type SelfAgentHeartbeatFindingRecord = {
  type:
    | 'open_loop'
    | 'upcoming_reminder'
    | 'action_confirmation'
    | 'action_missing_slots';
  title: string;
  summary: string;
  count: number;
  items: string[];
};

@Injectable()
export class SelfAgentService {
  constructor(
    @InjectRepository(CharacterEntity)
    private readonly characterRepo: Repository<CharacterEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ActionRunEntity)
    private readonly actionRunRepo: Repository<ActionRunEntity>,
    @InjectRepository(ReminderTaskEntity)
    private readonly reminderTaskRepo: Repository<ReminderTaskEntity>,
    @InjectRepository(FollowupOpenLoopEntity)
    private readonly followupOpenLoopRepo: Repository<FollowupOpenLoopEntity>,
    @InjectRepository(SelfAgentHeartbeatRunEntity)
    private readonly heartbeatRunRepo: Repository<SelfAgentHeartbeatRunEntity>,
    private readonly actionRuntime: ActionRuntimeService,
    private readonly reminderRuntime: ReminderRuntimeService,
    private readonly workspace: SelfAgentWorkspaceService,
  ) {}

  async handleConversationTurn(input: {
    conversationId: string;
    ownerId: string;
    character: CharacterEntity;
    userMessage: string;
    sourceMessageId: string;
  }): Promise<SelfAgentHandlingResult> {
    if (!this.isSelfCharacter(input.character)) {
      return { handled: false };
    }

    const actionResult = await this.actionRuntime.handleConversationTurn({
      conversationId: input.conversationId,
      ownerId: input.ownerId,
      character: input.character,
      userMessage: input.userMessage,
      delegatedBy: 'self_agent',
    });
    if (actionResult.handled) {
      return {
        handled: true,
        responseText: actionResult.responseText,
        handledBy: 'action_runtime',
      };
    }

    const reminderResult = await this.reminderRuntime.handleConversationTurn({
      conversationId: input.conversationId,
      userMessage: input.userMessage,
      sourceMessageId: input.sourceMessageId,
    });
    if (reminderResult.handled) {
      return {
        handled: true,
        responseText: reminderResult.responseText,
        handledBy: 'reminder_runtime',
      };
    }

    return { handled: false };
  }

  async buildChatPromptSections(input: { character: CharacterEntity }) {
    if (!this.isSelfCharacter(input.character)) {
      return [];
    }

    return this.workspace.buildChatPromptSections(input);
  }

  async getAdminOverview() {
    const now = new Date();
    const [selfCharacter, owner] = await Promise.all([
      this.requireSelfCharacter(),
      this.requireOwner(),
    ]);
    const [
      workspaceDocuments,
      activeOpenLoopCount,
      upcomingReminderCount,
      awaitingActionConfirmationCount,
      awaitingActionSlotsCount,
      recentHeartbeatRuns,
    ] = await Promise.all([
      this.workspace.listWorkspaceDocuments({ character: selfCharacter }),
      this.followupOpenLoopRepo.count({
        where: { status: In(['open', 'watching', 'recommended']) },
      }),
      this.reminderTaskRepo.count({
        where: {
          ownerId: owner.id,
          status: 'active',
          nextTriggerAt: LessThanOrEqual(
            new Date(now.getTime() + 24 * 60 * 60 * 1000),
          ),
        },
      }),
      this.actionRunRepo.count({
        where: {
          ownerId: owner.id,
          status: 'awaiting_confirmation',
        },
      }),
      this.actionRunRepo.count({
        where: {
          ownerId: owner.id,
          status: 'awaiting_slots',
        },
      }),
      this.heartbeatRunRepo.find({
        order: { updatedAt: 'DESC', createdAt: 'DESC' },
        take: 12,
      }),
    ]);

    return {
      identity: {
        ownerId: owner.id,
        ownerName: owner.username?.trim() || '世界主人',
        ownerSignature: owner.signature?.trim() || null,
        characterId: selfCharacter.id,
        characterName: selfCharacter.name,
        characterSourceKey: selfCharacter.sourceKey?.trim() || null,
      },
      workspaceDocuments,
      stats: {
        activeOpenLoopCount,
        upcomingReminderCount,
        awaitingActionConfirmationCount,
        awaitingActionSlotsCount,
        heartbeatRunCount: recentHeartbeatRuns.length,
      },
      recentHeartbeatRuns: recentHeartbeatRuns.map((item) =>
        this.serializeHeartbeatRun(item),
      ),
    };
  }

  async getWorkspaceDocument(name: SelfAgentWorkspaceDocumentName) {
    const selfCharacter = await this.requireSelfCharacter();
    return this.workspace.getWorkspaceDocument({
      character: selfCharacter,
      name,
    });
  }

  async updateWorkspaceDocument(
    name: SelfAgentWorkspaceDocumentName,
    content: string,
  ) {
    const selfCharacter = await this.requireSelfCharacter();
    return this.workspace.updateWorkspaceDocument({
      character: selfCharacter,
      name,
      content,
    });
  }

  async runHeartbeat(options?: { trigger?: SelfAgentHeartbeatTrigger }) {
    await this.requireSelfCharacter();
    const owner = await this.requireOwner();
    const trigger = options?.trigger ?? 'manual';
    const now = new Date();

    const [openLoops, upcomingReminders, awaitingConfirmationRuns, awaitingSlotRuns] =
      await Promise.all([
        this.followupOpenLoopRepo.find({
          where: { status: In(['open', 'watching', 'recommended']) },
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: 3,
        }),
        this.reminderTaskRepo.find({
          where: {
            ownerId: owner.id,
            status: 'active',
            nextTriggerAt: LessThanOrEqual(
              new Date(now.getTime() + 24 * 60 * 60 * 1000),
            ),
          },
          order: { nextTriggerAt: 'ASC', dueAt: 'ASC', updatedAt: 'DESC' },
          take: 3,
        }),
        this.actionRunRepo.find({
          where: {
            ownerId: owner.id,
            status: 'awaiting_confirmation',
          },
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: 3,
        }),
        this.actionRunRepo.find({
          where: {
            ownerId: owner.id,
            status: 'awaiting_slots',
          },
          order: { updatedAt: 'DESC', createdAt: 'DESC' },
          take: 3,
        }),
      ]);

    const findings: SelfAgentHeartbeatFindingRecord[] = [];
    if (awaitingConfirmationRuns.length > 0) {
      findings.push({
        type: 'action_confirmation',
        title: '待确认动作',
        summary: `还有 ${awaitingConfirmationRuns.length} 个真实动作卡在确认上。`,
        count: awaitingConfirmationRuns.length,
        items: awaitingConfirmationRuns.map((item) => item.title),
      });
    }
    if (awaitingSlotRuns.length > 0) {
      findings.push({
        type: 'action_missing_slots',
        title: '待补参数动作',
        summary: `还有 ${awaitingSlotRuns.length} 个动作在等补参数。`,
        count: awaitingSlotRuns.length,
        items: awaitingSlotRuns.map((item) => item.title),
      });
    }
    if (upcomingReminders.length > 0) {
      findings.push({
        type: 'upcoming_reminder',
        title: '即将到期提醒',
        summary: `接下来 24 小时内有 ${upcomingReminders.length} 个提醒需要留意。`,
        count: upcomingReminders.length,
        items: upcomingReminders.map((item) => item.title),
      });
    }
    if (openLoops.length > 0) {
      findings.push({
        type: 'open_loop',
        title: '未闭环事项',
        summary: `目前还有 ${openLoops.length} 个话头没真正落下。`,
        count: openLoops.length,
        items: openLoops.map((item) => item.summary),
      });
    }

    const suggestedMessage = this.buildHeartbeatMessage(findings);
    const run = this.heartbeatRunRepo.create({
      triggerType: trigger,
      status: findings.length > 0 ? 'success' : 'noop',
      summary:
        findings.length > 0
          ? `heartbeat 命中了 ${findings.length} 类待处理事项。`
          : 'heartbeat 已扫描，本轮没有发现需要主动提起的事项。',
      suggestedMessage,
      findingsPayload: findings,
      errorMessage: null,
    });
    const saved = await this.heartbeatRunRepo.save(run);
    return this.serializeHeartbeatRun(saved);
  }

  private isSelfCharacter(character: CharacterEntity) {
    return (
      character.id === SELF_CHARACTER_ID ||
      character.relationshipType === 'self' ||
      character.sourceKey?.trim() === 'self'
    );
  }

  private async requireSelfCharacter() {
    const character = await this.characterRepo.findOneBy({
      id: SELF_CHARACTER_ID,
    });
    if (!character) {
      throw new NotFoundException('默认 self 角色尚未落库。');
    }
    return character;
  }

  private async requireOwner() {
    const owner = await this.userRepo.findOne({
      where: {},
      order: { createdAt: 'ASC' },
    });
    if (!owner) {
      throw new NotFoundException('世界主人不存在。');
    }
    return owner;
  }

  private serializeHeartbeatRun(run: SelfAgentHeartbeatRunEntity) {
    return {
      id: run.id,
      triggerType: run.triggerType as SelfAgentHeartbeatTrigger,
      status: run.status as 'success' | 'noop' | 'error',
      summary: run.summary,
      suggestedMessage: run.suggestedMessage ?? null,
      findings: Array.isArray(run.findingsPayload)
        ? (run.findingsPayload as SelfAgentHeartbeatFindingRecord[])
        : [],
      errorMessage: run.errorMessage ?? null,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    };
  }

  private buildHeartbeatMessage(findings: SelfAgentHeartbeatFindingRecord[]) {
    if (!findings.length) {
      return null;
    }

    return findings
      .map((finding) => {
        if (finding.type === 'action_confirmation') {
          return `有${finding.count}个动作还卡在确认上。`;
        }
        if (finding.type === 'action_missing_slots') {
          return `还有${finding.count}个动作在等你补一句关键信息。`;
        }
        if (finding.type === 'upcoming_reminder') {
          return `接下来有${finding.count}件提醒快到了。`;
        }
        return `还有${finding.count}件事其实没真正落下。`;
      })
      .join('');
  }
}

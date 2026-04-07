import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GroupEntity } from './group.entity';
import { GroupMemberEntity } from './group-member.entity';
import { GroupMessageEntity } from './group-message.entity';
import { AiOrchestratorService } from '../ai/ai-orchestrator.service';
import { CharactersService } from '../characters/characters.service';

export interface CreateGroupDto {
  name: string;
  creatorId: string;
  creatorType: 'user' | 'character';
  memberIds: string[];
}

export interface AddMemberDto {
  memberId: string;
  memberType: 'user' | 'character';
  memberName: string;
  memberAvatar?: string;
}

@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    @InjectRepository(GroupEntity)
    private groupRepo: Repository<GroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private memberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(GroupMessageEntity)
    private messageRepo: Repository<GroupMessageEntity>,
    private readonly ai: AiOrchestratorService,
    private readonly characters: CharactersService,
  ) {}

  async createGroup(dto: CreateGroupDto): Promise<GroupEntity> {
    const group = this.groupRepo.create({
      name: dto.name,
      creatorId: dto.creatorId,
      creatorType: dto.creatorType,
    });
    await this.groupRepo.save(group);

    // Add creator as owner
    const ownerMember = this.memberRepo.create({
      groupId: group.id,
      memberId: dto.creatorId,
      memberType: dto.creatorType,
      role: 'owner',
    });
    await this.memberRepo.save(ownerMember);

    // Add other members
    for (const memberId of dto.memberIds) {
      const member = this.memberRepo.create({
        groupId: group.id,
        memberId,
        memberType: 'character',
        role: 'member',
      });
      await this.memberRepo.save(member);
    }

    this.logger.log(`Created group ${group.id} with ${dto.memberIds.length + 1} members`);
    return group;
  }

  async addMember(groupId: string, dto: AddMemberDto): Promise<GroupMemberEntity> {
    const existing = await this.memberRepo.findOne({
      where: { groupId, memberId: dto.memberId },
    });

    if (existing) {
      this.logger.warn(`Member ${dto.memberId} already in group ${groupId}`);
      return existing;
    }

    const member = this.memberRepo.create({
      groupId,
      memberId: dto.memberId,
      memberType: dto.memberType,
      memberName: dto.memberName,
      memberAvatar: dto.memberAvatar,
      role: 'member',
    });

    await this.memberRepo.save(member);
    this.logger.log(`Added member ${dto.memberId} to group ${groupId}`);
    return member;
  }

  async getGroup(groupId: string): Promise<GroupEntity | null> {
    return this.groupRepo.findOne({ where: { id: groupId } });
  }

  async getMembers(groupId: string): Promise<GroupMemberEntity[]> {
    return this.memberRepo.find({ where: { groupId }, order: { joinedAt: 'ASC' } });
  }

  async getMessages(groupId: string, limit = 100): Promise<GroupMessageEntity[]> {
    const messages = await this.messageRepo.find({
      where: { groupId },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return messages.reverse();
  }

  async sendMessage(
    groupId: string,
    senderId: string,
    senderType: 'user' | 'character',
    senderName: string,
    text: string,
    senderAvatar?: string,
  ): Promise<GroupMessageEntity> {
    const message = this.messageRepo.create({
      groupId,
      senderId,
      senderType,
      senderName,
      senderAvatar,
      text,
      type: 'text',
    });

    await this.messageRepo.save(message);
    return message;
  }

  async sendSystemMessage(groupId: string, text: string): Promise<GroupMessageEntity> {
    const message = this.messageRepo.create({
      groupId,
      senderId: 'system',
      senderType: 'character',
      senderName: 'system',
      text,
      type: 'system',
    });

    await this.messageRepo.save(message);
    return message;
  }

  async triggerAiReplies(groupId: string, userMessage: string, senderName: string): Promise<void> {
    const members = await this.memberRepo.find({ where: { groupId, memberType: 'character' } });
    const recentMessages = await this.messageRepo.find({
      where: { groupId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    const history = recentMessages.reverse().map(m => ({ role: 'user' as const, content: `[${m.senderName}]: ${m.text}` }));

    for (const member of members) {
      const char = await this.characters.findById(member.memberId);
      if (!char) continue;

      const replyChance = char.activityFrequency === 'high' ? 0.7
        : char.activityFrequency === 'low' ? 0.2 : 0.4;
      if (Math.random() > replyChance) continue;

      const profile = await this.characters.getProfile(member.memberId);
      if (!profile) continue;

      const delay = 5000 + Math.random() * 25000;
      setTimeout(async () => {
        try {
          const reply = await this.ai.generateReply({
            profile,
            conversationHistory: history,
            userMessage: `${senderName}说：${userMessage}`,
            isGroupChat: true,
          });
          await this.sendMessage(groupId, char.id, 'character', char.name, reply.text, char.avatar);
        } catch (err) {
          this.logger.error(`AI reply failed for ${char.name} in group ${groupId}`, err);
        }
      }, delay);
    }
  }
}

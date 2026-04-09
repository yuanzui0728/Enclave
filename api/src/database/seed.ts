import { DataSource } from 'typeorm';
import { CharacterEntity } from '../modules/characters/character.entity';
import { FriendshipEntity } from '../modules/social/friendship.entity';
import { FriendRequestEntity } from '../modules/social/friend-request.entity';
import { AIRelationshipEntity } from '../modules/social/ai-relationship.entity';
import { ConversationEntity } from '../modules/chat/conversation.entity';
import { MessageEntity } from '../modules/chat/message.entity';
import { GroupEntity } from '../modules/chat/group.entity';
import { GroupMemberEntity } from '../modules/chat/group-member.entity';
import { GroupMessageEntity } from '../modules/chat/group-message.entity';
import { NarrativeArcEntity } from '../modules/narrative/narrative-arc.entity';
import { MomentPostEntity } from '../modules/moments/moment-post.entity';
import { MomentCommentEntity } from '../modules/moments/moment-comment.entity';
import { MomentLikeEntity } from '../modules/moments/moment-like.entity';
import { FeedPostEntity } from '../modules/feed/feed-post.entity';
import { FeedCommentEntity } from '../modules/feed/feed-comment.entity';
import { buildDefaultCharacters, DEFAULT_CHARACTER_IDS } from '../modules/characters/default-characters';

const SEED_CHARACTERS = buildDefaultCharacters();

export async function seedCharacters(dataSource: DataSource): Promise<void> {
  console.log('🌱 Reconciling default characters...');

  await dataSource.transaction(async (manager) => {
    const characterRepo = manager.getRepository(CharacterEntity);
    const existingCharacters = await characterRepo.find({ select: ['id'] });
    const staleCharacterIds = existingCharacters
      .map((character) => character.id)
      .filter((id) => !DEFAULT_CHARACTER_IDS.includes(id as (typeof DEFAULT_CHARACTER_IDS)[number]));

    if (staleCharacterIds.length > 0) {
      const conversations = await manager.getRepository(ConversationEntity).find();
      const staleConversationIds = conversations
        .filter((conversation) => conversation.participants.some((participantId) => staleCharacterIds.includes(participantId)))
        .map((conversation) => conversation.id);

      if (staleConversationIds.length > 0) {
        await manager.getRepository(MessageEntity).delete(staleConversationIds.map((id) => ({ conversationId: id })));
        await manager.getRepository(ConversationEntity).delete(staleConversationIds.map((id) => ({ id })));
      }

      await manager.getRepository(GroupMessageEntity).clear();
      await manager.getRepository(GroupMemberEntity).clear();
      await manager.getRepository(GroupEntity).clear();

      await manager.getRepository(FriendshipEntity).delete(staleCharacterIds.map((id) => ({ characterId: id })));
      await manager.getRepository(FriendRequestEntity).delete(staleCharacterIds.map((id) => ({ characterId: id })));
      await manager
        .createQueryBuilder()
        .delete()
        .from(AIRelationshipEntity)
        .where('characterIdA IN (:...ids) OR characterIdB IN (:...ids)', { ids: staleCharacterIds })
        .execute();
      await manager.getRepository(NarrativeArcEntity).delete(staleCharacterIds.map((id) => ({ characterId: id })));

      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentLikeEntity)
        .where('authorType = :authorType AND authorId IN (:...ids)', { authorType: 'character', ids: staleCharacterIds })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentCommentEntity)
        .where('authorType = :authorType AND authorId IN (:...ids)', { authorType: 'character', ids: staleCharacterIds })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(MomentPostEntity)
        .where('authorType = :authorType AND authorId IN (:...ids)', { authorType: 'character', ids: staleCharacterIds })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(FeedCommentEntity)
        .where('authorType = :authorType AND authorId IN (:...ids)', { authorType: 'character', ids: staleCharacterIds })
        .execute();
      await manager
        .createQueryBuilder()
        .delete()
        .from(FeedPostEntity)
        .where('authorType = :authorType AND authorId IN (:...ids)', { authorType: 'character', ids: staleCharacterIds })
        .execute();

      await characterRepo.delete(staleCharacterIds.map((id) => ({ id })));
    }

    for (const charData of SEED_CHARACTERS) {
      await characterRepo.save(charData as CharacterEntity);
    }
  });

  console.log(`✓ Seeded ${SEED_CHARACTERS.length} characters`);
}

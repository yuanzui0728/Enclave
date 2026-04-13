import { Injectable } from '@nestjs/common';
import { CharactersService } from '../characters/characters.service';
import {
  type GroupReplyCandidate,
  type GroupReplyPlannerCandidateDiagnostic,
  type GroupReplyPlannerDecision,
  type GroupReplyPlannerInput,
  type GroupReplySelectionDisposition,
} from './group-reply.types';

@Injectable()
export class GroupReplyPlannerService {
  constructor(private readonly characters: CharactersService) {}

  async selectReplyActorsForTurn(
    input: GroupReplyPlannerInput,
  ): Promise<GroupReplyPlannerDecision> {
    const {
      members,
      history,
      currentUserContext,
      runtimeRules,
    } = input;
    const recentSpeakerIds = history
      .filter((message) => message.senderType === 'character')
      .map((message) => message.senderId)
      .slice(0, runtimeRules.groupReplyRecentSpeakerWindow);
    const normalizedMentionTargets = new Set(
      currentUserContext.mentions.map((mention) =>
        this.normalizeMentionTarget(mention),
      ),
    );
    const replyTargetCharacterId =
      currentUserContext.replyTargetMessage?.senderType === 'character'
        ? currentUserContext.replyTargetMessage.senderId
        : undefined;

    const maybeCandidates = await Promise.all(
      members.map(async (member) => {
        const character = await this.characters.findById(member.memberId);
        if (!character) {
          return null;
        }

        const profile = await this.characters.getProfile(member.memberId);
        if (!profile) {
          return null;
        }

        const aliases = Array.from(
          new Set(
            [member.memberName, character.name]
              .map((value) => value?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        );
        const isExplicitTarget = aliases.some((alias) =>
          normalizedMentionTargets.has(alias),
        );
        const isReplyTarget = replyTargetCharacterId === character.id;
        const baseChance =
          runtimeRules.groupReplyChance[
            (character.activityFrequency as 'high' | 'normal' | 'low') ??
              'normal'
          ] ?? runtimeRules.groupReplyChance.normal;
        let score = baseChance * 10;

        if (currentUserContext.hasMentionAll) {
          score += 1.5;
        }
        if (isExplicitTarget) {
          score += 6;
        }
        if (isReplyTarget) {
          score += 8;
        }

        const recentSpeakerIndex = recentSpeakerIds.indexOf(character.id);
        if (recentSpeakerIndex >= 0) {
          score -=
            (runtimeRules.groupReplyRecentSpeakerWindow - recentSpeakerIndex) *
            1.25;
        }

        const adjustedChance = Math.min(
          0.98,
          baseChance +
            (isExplicitTarget ? 0.25 : 0) +
            (isReplyTarget ? 0.35 : 0) +
            (currentUserContext.hasMentionAll ? 0.08 : 0),
        );

        return {
          character,
          profile,
          score,
          randomPassed: Math.random() <= adjustedChance,
          isExplicitTarget,
          isReplyTarget,
          recentSpeakerIndex,
        } satisfies GroupReplyCandidate;
      }),
    );
    const candidates = maybeCandidates
      .filter((candidate): candidate is GroupReplyCandidate => candidate !== null)
      .sort((left, right) => right.score - left.score);

    if (!candidates.length) {
      return {
        selectedActors: [],
        candidateDiagnostics: [],
        maxSpeakers: 0,
        explicitInterest: false,
        hasMentionAll: currentUserContext.hasMentionAll,
        mentionTargets: [...normalizedMentionTargets],
        replyTargetCharacterId,
      };
    }

    const explicitInterest =
      Boolean(replyTargetCharacterId) || normalizedMentionTargets.size > 0;
    const maxSpeakers = currentUserContext.hasMentionAll
      ? runtimeRules.groupReplyMaxSpeakersMentionAll
      : explicitInterest
        ? runtimeRules.groupReplyMaxSpeakers
        : 1;
    const selected: GroupReplyCandidate[] = [];
    const selectedIds = new Set<string>();
    const selectionDispositionByCharacterId = new Map<
      string,
      GroupReplySelectionDisposition
    >();

    for (const candidate of candidates) {
      if (selected.length >= maxSpeakers) {
        break;
      }
      if (!candidate.isReplyTarget && !candidate.isExplicitTarget) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(candidate.character.id);
      selectionDispositionByCharacterId.set(
        candidate.character.id,
        'selected_targeted',
      );
    }

    if (!selected.length) {
      selected.push(candidates[0]);
      selectedIds.add(candidates[0].character.id);
      selectionDispositionByCharacterId.set(
        candidates[0].character.id,
        'selected_fallback',
      );
    }

    for (const candidate of candidates) {
      if (selected.length >= maxSpeakers) {
        break;
      }
      if (selectedIds.has(candidate.character.id) || !candidate.randomPassed) {
        continue;
      }
      if (!currentUserContext.hasMentionAll && !explicitInterest) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(candidate.character.id);
      selectionDispositionByCharacterId.set(
        candidate.character.id,
        'selected_followup',
      );
    }

    const candidateDiagnostics = candidates.map((candidate) => ({
      characterId: candidate.character.id,
      characterName: candidate.character.name,
      score: candidate.score,
      randomPassed: candidate.randomPassed,
      isExplicitTarget: candidate.isExplicitTarget,
      isReplyTarget: candidate.isReplyTarget,
      recentSpeakerIndex: candidate.recentSpeakerIndex,
      selectionDisposition: this.resolveSelectionDisposition({
        candidate,
        selectedIds,
        selectionDispositionByCharacterId,
        explicitInterest,
        hasMentionAll: currentUserContext.hasMentionAll,
        maxSpeakers,
      }),
    })) satisfies GroupReplyPlannerCandidateDiagnostic[];

    return {
      selectedActors: selected,
      candidateDiagnostics,
      maxSpeakers,
      explicitInterest,
      hasMentionAll: currentUserContext.hasMentionAll,
      mentionTargets: [...normalizedMentionTargets],
      replyTargetCharacterId,
    };
  }

  private resolveSelectionDisposition(input: {
    candidate: GroupReplyCandidate;
    selectedIds: Set<string>;
    selectionDispositionByCharacterId: Map<string, GroupReplySelectionDisposition>;
    explicitInterest: boolean;
    hasMentionAll: boolean;
    maxSpeakers: number;
  }): GroupReplySelectionDisposition {
    const {
      candidate,
      selectedIds,
      selectionDispositionByCharacterId,
      explicitInterest,
      hasMentionAll,
      maxSpeakers,
    } = input;
    const selectedDisposition = selectionDispositionByCharacterId.get(
      candidate.character.id,
    );
    if (selectedDisposition) {
      return selectedDisposition;
    }

    const capacityFilled = selectedIds.size >= maxSpeakers;
    if (
      capacityFilled &&
      (candidate.isReplyTarget ||
        candidate.isExplicitTarget ||
        ((explicitInterest || hasMentionAll) && candidate.randomPassed))
    ) {
      return 'skipped_max_speakers';
    }

    if (!candidate.isReplyTarget && !candidate.isExplicitTarget) {
      if (!candidate.randomPassed) {
        return 'skipped_random_gate';
      }
      if (!explicitInterest && !hasMentionAll) {
        return 'skipped_without_explicit_interest';
      }
    }

    return 'skipped_not_targeted';
  }

  private normalizeMentionTarget(mention: string) {
    return mention.replace(/^@/, '').trim();
  }
}

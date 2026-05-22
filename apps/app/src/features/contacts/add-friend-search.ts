import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import type {
  Character,
  FriendListItem,
  FriendRequest,
} from "@yinjie/contracts";

import { buildYinjieId } from "../../lib/yinjie-id";
import { getFriendDisplayName, stripBidiControl } from "./contact-utils";

export type AddFriendRelationshipState =
  | "available"
  | "blocked"
  | "friend"
  | "pending";

export type AddFriendSearchResult = {
  character: Character;
  identifier: string;
  friendship?: FriendListItem["friendship"] | null;
  matchReason: MessageDescriptor;
  pendingRequest?: FriendRequest | null;
  score: number;
  status: AddFriendRelationshipState;
};

export function buildCharacterIdentifier(characterId: string) {
  return buildYinjieId(characterId);
}

export function getSearchResultDisplayName(
  item: Pick<AddFriendSearchResult, "character" | "friendship">,
) {
  // 非好友态走 character.name 直读时也要 strip bidi 控制字符；getFriendDisplayName
  // 已经走 stripBidiControl，这里对齐——「添加朋友」搜索结果是用户接触陌生角色
  // 名字的主要入口，若放任 U+202E 之类的字符进来，角色名能被视觉伪装。
  return stripBidiControl(
    item.friendship
      ? getFriendDisplayName({
          character: item.character,
          friendship: item.friendship,
        })
      : item.character.name,
  );
}

export function formatRelationshipStatus(
  status: AddFriendRelationshipState,
): MessageDescriptor {
  if (status === "friend") {
    return msg`已添加`;
  }

  if (status === "pending") {
    return msg`待处理`;
  }

  if (status === "blocked") {
    return msg`黑名单`;
  }

  return msg`可添加`;
}

export function buildAddFriendSearchResults(
  characters: Character[],
  normalizedKeyword: string,
  friendshipMap: Map<string, FriendListItem["friendship"]>,
  pendingRequestMap: Map<string, FriendRequest>,
  blockedCharacterIds: Set<string>,
  routeCharacterId?: string | null,
  limit = 8,
): AddFriendSearchResult[] {
  if (!normalizedKeyword && !routeCharacterId) {
    return [];
  }

  const results: AddFriendSearchResult[] = [];

  for (const character of characters) {
    if (character.relationshipType === "self") {
      continue;
    }

    const friendship = friendshipMap.get(character.id) ?? null;
    const identifier = buildCharacterIdentifier(character.id);
    const directRouteTarget =
      Boolean(routeCharacterId) && character.id === routeCharacterId;
    const match = normalizedKeyword
      ? matchCharacter(character, identifier, normalizedKeyword, friendship)
      : null;
    if (!match && !directRouteTarget) {
      continue;
    }

    const pendingRequest = pendingRequestMap.get(character.id) ?? null;
    const status: AddFriendRelationshipState = blockedCharacterIds.has(
      character.id,
    )
      ? "blocked"
      : friendship
        ? "friend"
        : pendingRequest
          ? "pending"
          : "available";

    results.push({
      character,
      friendship,
      identifier,
      matchReason: directRouteTarget
        ? (match?.reason ?? msg`来自当前资料页`)
        : (match?.reason ?? msg`资料关键词匹配`),
      pendingRequest,
      score: directRouteTarget
        ? Math.min(match?.score ?? 0, 0)
        : (match?.score ?? 0),
      status,
    });
  }

  return results
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      return getSearchResultDisplayName(left).localeCompare(
        getSearchResultDisplayName(right),
        "zh-CN",
      );
    })
    .slice(0, limit);
}

function matchCharacter(
  character: Character,
  identifier: string,
  normalizedKeyword: string,
  friendship?: FriendListItem["friendship"] | null,
) {
  const normalizedName = character.name.trim().toLowerCase();
  const normalizedIdentifier = identifier.toLowerCase();
  const normalizedId = character.id.toLowerCase();
  const normalizedRemarkName =
    friendship?.remarkName?.trim()?.toLowerCase() ?? "";

  if (
    normalizedIdentifier === normalizedKeyword ||
    normalizedId.startsWith(normalizedKeyword)
  ) {
    return {
      score: 0,
      reason: msg`隐界号精确匹配`,
    };
  }

  if (normalizedRemarkName) {
    if (normalizedRemarkName === normalizedKeyword) {
      return {
        score: 5,
        reason: msg`备注名精确匹配`,
      };
    }

    if (normalizedRemarkName.startsWith(normalizedKeyword)) {
      return {
        score: 15,
        reason: msg`备注名前缀匹配`,
      };
    }

    if (normalizedRemarkName.includes(normalizedKeyword)) {
      return {
        score: 25,
        reason: msg`备注名匹配`,
      };
    }
  }

  if (normalizedName === normalizedKeyword) {
    return {
      score: 10,
      reason: msg`角色名精确匹配`,
    };
  }

  if (normalizedName.startsWith(normalizedKeyword)) {
    return {
      score: 20,
      reason: msg`角色名前缀匹配`,
    };
  }

  if (normalizedName.includes(normalizedKeyword)) {
    return {
      score: 30,
      reason: msg`角色名模糊匹配`,
    };
  }

  const statusMatchFields = [
    character.relationship,
    character.currentStatus,
    character.currentActivity,
    character.bio,
    character.expertDomains.join(" "),
  ];

  for (const [index, field] of statusMatchFields.entries()) {
    if (field?.toLowerCase().includes(normalizedKeyword)) {
      return {
        score: 40 + index,
        reason: index === 0 ? msg`关系描述匹配` : msg`资料关键词匹配`,
      };
    }
  }

  const contactMatchFields = [
    friendship?.region?.trim() ?? "",
    friendship?.source?.trim() ?? "",
    friendship?.tags?.filter(Boolean).join(" ") ?? "",
  ];

  for (const [index, field] of contactMatchFields.entries()) {
    if (field.toLowerCase().includes(normalizedKeyword)) {
      return {
        score: 50 + index,
        reason:
          index === 0
            ? msg`地区匹配`
            : index === 1
              ? msg`来源匹配`
              : msg`标签匹配`,
      };
    }
  }

  return null;
}

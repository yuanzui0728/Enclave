import { SELF_CHARACTER_ID, type FriendListItem } from "@yinjie/contracts";
import { getFriendDisplayName, matchesFriendSearch } from "./contact-utils";

export type ContactTagGroup = {
  tag: string;
  items: FriendListItem[];
};

export function buildContactTagGroups(
  friends: FriendListItem[],
  searchText: string,
): ContactTagGroup[] {
  const groups = new Map<string, FriendListItem[]>();

  for (const item of friends) {
    // SELF（char-default-self）哪怕老数据 / 历史走查脚本误打上 tag，标签页
    // 也不应展示——通讯录管理 → 标签里 "我" 在某个标签下做一位"联系人"
    // 出现完全反直觉；前端 toggleBulkSelection / 全选逻辑都已经守 SELF。
    if (item.character.id === SELF_CHARACTER_ID) {
      continue;
    }
    const tags =
      item.friendship.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [];

    for (const tag of tags) {
      const currentItems = groups.get(tag) ?? [];
      currentItems.push(item);
      groups.set(tag, currentItems);
    }
  }

  const normalizedSearchText = searchText.trim().toLowerCase();

  return [...groups.entries()]
    .map(([tag, items]) => ({
      tag,
      items: [...items].sort((left, right) =>
        getFriendDisplayName(left).localeCompare(
          getFriendDisplayName(right),
          "zh-CN",
        ),
      ),
    }))
    .filter((group) => {
      if (!normalizedSearchText) {
        return true;
      }

      if (group.tag.toLowerCase().includes(normalizedSearchText)) {
        return true;
      }

      return group.items.some((item) =>
        matchesFriendSearch(item, normalizedSearchText),
      );
    })
    .sort((left, right) => left.tag.localeCompare(right.tag, "zh-CN")); // i18n-ignore-line
}

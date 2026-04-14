import type { Character, FriendListItem } from "@yinjie/contracts";

const latinSectionOrder = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const chineseSectionBoundaries = [
  { label: "A", start: "阿" },
  { label: "B", start: "芭" },
  { label: "C", start: "擦" },
  { label: "D", start: "搭" },
  { label: "E", start: "蛾" },
  { label: "F", start: "发" },
  { label: "G", start: "噶" },
  { label: "H", start: "哈" },
  { label: "J", start: "机" },
  { label: "K", start: "喀" },
  { label: "L", start: "垃" },
  { label: "M", start: "妈" },
  { label: "N", start: "拿" },
  { label: "O", start: "哦" },
  { label: "P", start: "啪" },
  { label: "Q", start: "期" },
  { label: "R", start: "然" },
  { label: "S", start: "撒" },
  { label: "T", start: "塌" },
  { label: "W", start: "挖" },
  { label: "X", start: "昔" },
  { label: "Y", start: "压" },
  { label: "Z", start: "匝" },
] as const;

const pinyinCollator = new Intl.Collator("zh-CN-u-co-pinyin", {
  sensitivity: "base",
});

export type FriendDirectoryItem = FriendListItem & {
  indexLabel: string;
  displayName: string;
  sortLabel: string;
};

export type WorldCharacterDirectoryItem = {
  character: Character;
  indexLabel: string;
};

export type ContactSection<TItem> = {
  key: string;
  title: string;
  indexLabel: string;
  anchorId: string;
  items: TItem[];
};

export function createFriendDirectoryItems(
  items: FriendListItem[],
): FriendDirectoryItem[] {
  return sortDirectoryItems(
    items.map((item) => ({
      ...item,
      displayName: getFriendDisplayName(item),
      sortLabel: getFriendDisplayName(item),
      indexLabel: getContactIndexLabel(getFriendDisplayName(item)),
    })),
  );
}

export function createWorldCharacterDirectoryItems(
  items: Character[],
): WorldCharacterDirectoryItem[] {
  return sortDirectoryItems(
    items.map((character) => ({
      character,
      indexLabel: getContactIndexLabel(character.name),
    })),
  );
}

export function buildContactSections<TItem extends { indexLabel: string }>(
  items: TItem[],
): ContactSection<TItem>[] {
  const sections = new Map<string, ContactSection<TItem>>();

  for (const item of items) {
    const title = item.indexLabel;
    const existingSection = sections.get(title);
    if (existingSection) {
      existingSection.items.push(item);
      continue;
    }

    sections.set(title, {
      key: title,
      title,
      indexLabel: title,
      anchorId: `contact-section-${title === "#" ? "hash" : title.toLowerCase()}`,
      items: [item],
    });
  }

  return [...sections.values()].sort(
    (left, right) =>
      getSectionRank(left.indexLabel) - getSectionRank(right.indexLabel),
  );
}

export function buildDesktopFriendSections(
  items: FriendDirectoryItem[],
): ContactSection<FriendDirectoryItem>[] {
  const starredItems = items.filter((item) => item.friendship.isStarred);
  const regularSections = buildContactSections(
    items.filter((item) => !item.friendship.isStarred),
  );

  if (!starredItems.length) {
    return regularSections;
  }

  return [
    {
      key: "starred-friends",
      title: "星标朋友",
      indexLabel: "★",
      anchorId: "contact-section-starred",
      items: starredItems,
    },
    ...regularSections,
  ];
}

export function matchesCharacterSearch(
  character: Pick<
    Character,
    | "name"
    | "relationship"
    | "bio"
    | "currentStatus"
    | "currentActivity"
    | "expertDomains"
  >,
  normalizedSearchText: string,
) {
  if (!normalizedSearchText) {
    return true;
  }

  const haystacks = [
    character.name,
    character.relationship,
    character.bio,
    character.currentStatus ?? "",
    character.currentActivity ?? "",
    character.expertDomains.join(" "),
  ];

  return haystacks.some((value) =>
    value.toLowerCase().includes(normalizedSearchText),
  );
}

export function matchesFriendSearch(
  item: Pick<FriendListItem, "character" | "friendship">,
  normalizedSearchText: string,
) {
  if (!normalizedSearchText) {
    return true;
  }

  if (matchesCharacterSearch(item.character, normalizedSearchText)) {
    return true;
  }

  const haystacks = [
    item.friendship.remarkName ?? "",
    item.friendship.region ?? "",
    item.friendship.source ?? "",
    item.friendship.tags?.join(" ") ?? "",
  ];

  return haystacks.some((value) =>
    value.toLowerCase().includes(normalizedSearchText),
  );
}

export function getFriendDisplayName(
  item: Pick<FriendListItem, "character" | "friendship">,
) {
  return item.friendship.remarkName?.trim() || item.character.name;
}

function sortDirectoryItems<
  TItem extends {
    character: Character;
    indexLabel: string;
    sortLabel?: string;
  },
>(items: TItem[]) {
  return [...items].sort((left, right) => {
    const sectionDiff =
      getSectionRank(left.indexLabel) - getSectionRank(right.indexLabel);
    if (sectionDiff !== 0) {
      return sectionDiff;
    }

    const nameDiff = pinyinCollator.compare(
      left.sortLabel ?? left.character.name,
      right.sortLabel ?? right.character.name,
    );
    if (nameDiff !== 0) {
      return nameDiff;
    }

    return left.character.id.localeCompare(right.character.id);
  });
}

function getContactIndexLabel(name?: string | null) {
  const value = name?.trim();
  if (!value) {
    return "#";
  }

  const firstCharacter = value.slice(0, 1).toUpperCase();

  if (/^[A-Z]$/.test(firstCharacter)) {
    return firstCharacter;
  }

  if (/^[0-9]$/.test(firstCharacter)) {
    return "#";
  }

  for (
    let index = chineseSectionBoundaries.length - 1;
    index >= 0;
    index -= 1
  ) {
    const boundary = chineseSectionBoundaries[index];
    if (pinyinCollator.compare(firstCharacter, boundary.start) >= 0) {
      return boundary.label;
    }
  }

  return "#";
}

function getSectionRank(indexLabel: string) {
  const normalizedLabel = indexLabel.toUpperCase();
  const orderIndex = latinSectionOrder.indexOf(normalizedLabel);
  return orderIndex === -1 ? latinSectionOrder.length : orderIndex;
}

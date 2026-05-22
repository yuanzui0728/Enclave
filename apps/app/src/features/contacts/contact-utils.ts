import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { Character, FriendListItem } from "@yinjie/contracts";

const t = translateRuntimeMessage;

const latinSectionOrder = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// i18n-ignore-start: 拼音段首参考字符，仅用于按字母分段排序，非 UI 文本
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

// i18n-ignore-next-line: 拼音排序固定使用 zh-CN 拼音 Collator
const pinyinCollator = new Intl.Collator("zh-CN-u-co-pinyin", {
  sensitivity: "base",
});
// i18n-ignore-end

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
    items.map((item) => {
      const displayName = getFriendDisplayName(item);
      return {
        ...item,
        displayName,
        sortLabel: displayName,
        indexLabel: getContactIndexLabel(displayName),
      };
    }),
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

export function shouldIncludeInWorldCharacterDirectory(
  character: Pick<Character, "id" | "sourceType">,
  friendIds: ReadonlySet<string>,
) {
  return !friendIds.has(character.id);
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
      title: t(msg`星标朋友`),
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

// 走查（第二次）R1：yuanzui0728 通讯录里出现 character.name="good‮bad"——名字里
// 嵌了 U+202E (Right-to-Left Override) bidi 控制字符。RTL Override 会让后续的
// "bad" 在 LTR 上下文里被反向渲染，视觉上把 "good‮bad" 显示成 "goodbad" 但
// 后半段被翻转——典型用例是 `‮exe.foo` 把"foo.exe"伪装成正常文件名诱骗点击。
// character.name 是用户自创内容（私有角色 / 群名 / 给好友的备注），全前端没人
// strip 过 bidi 控制字符，朋友权限列表 / 添加朋友搜索结果 / 群聊参与者预览 /
// chat 顶端 title 等所有读 character.name 的地方都会被骗。同时 zwsp/zwj/lrm
// 等不可见字符（U+200B-U+200F、U+202A-U+202E、U+2066-U+2069、U+FEFF）会让
// 同名搜索 / 复制粘贴对不齐。
// 这条 regex 跟 packages/api world-owner.service.ts 的 server-side sanitize
// 对齐口径（server 侧 sanitize 仅 owner-name，character.name 暂未守住）。
// 覆盖：U+200B..200F (zwsp/zwnj/zwj/lrm/rlm)、U+202A..202E (lre/rle/pdf/lro/rlo)、
// U+2066..2069 (lri/rli/fsi/pdi)、U+FEFF (BOM)。用 new RegExp + \\u 写明
// codepoint，避免 source 里出现不可见字符（被维护者误删 / 编辑器复制粘贴丢字）。
const BIDI_CONTROL_PATTERN = new RegExp(
  "[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]",
  "g",
);

export function stripBidiControl(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(BIDI_CONTROL_PATTERN, "");
}

export function getFriendDisplayName(
  item: Pick<FriendListItem, "character" | "friendship">,
) {
  const remark = item.friendship.remarkName?.trim();
  // remark 也走 strip——用户给好友备注 "‮重要联系人" 同样会被翻转。
  return stripBidiControl(remark || item.character.name);
}

// 星标列表的排序：最近设星标的排在前面，starredAt 缺失 / 同时间时回退到显示名 + id。
// 桌面星标 sub-pane 和移动 starred-friends-page 共用，避免两端出现"同一份星标好友
// 排序不一致"的怪事（用户把好友拉黑/再加回来后 starredAt 会刷新，顺序就会变）。
export function compareStarredFriends(
  left: FriendListItem,
  right: FriendListItem,
) {
  const starredAtDelta =
    getSortableTimestamp(right.friendship.starredAt) -
    getSortableTimestamp(left.friendship.starredAt);

  if (starredAtDelta !== 0) {
    return starredAtDelta;
  }

  const nameDiff = getFriendDisplayName(left).localeCompare(
    getFriendDisplayName(right),
    "zh-CN",
  );
  if (nameDiff !== 0) {
    return nameDiff;
  }

  return left.character.id.localeCompare(right.character.id);
}

function getSortableTimestamp(value?: string | null) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
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

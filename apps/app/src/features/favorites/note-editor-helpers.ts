import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type {
  FavoriteNoteAsset,
  FavoriteNoteDocument,
  FavoriteNoteSummary,
  FavoriteRecord,
  NoteCardAttachment,
} from "@yinjie/contracts";
import type { DesktopNoteDraftRecord } from "./note-drafts-storage";

export type NoteEditorState = {
  contentHtml: string;
  contentText: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
};

export const EMPTY_NOTE_EDITOR_STATE: NoteEditorState = {
  contentHtml: "",
  contentText: "",
  tags: [],
  assets: [],
};

export type NoteSendDialogNote = {
  noteId: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  updatedAt: string;
};

export function buildEditorStateFromDocument(
  note: FavoriteNoteDocument,
): NoteEditorState {
  return {
    contentHtml: note.contentHtml,
    contentText: note.contentText,
    tags: [...note.tags],
    assets: note.assets.map((asset) => ({ ...asset })),
  };
}

export function buildEditorStateFromDraft(
  draft: DesktopNoteDraftRecord,
): NoteEditorState {
  return {
    contentHtml: draft.contentHtml,
    contentText: draft.contentText,
    tags: [...draft.tags],
    assets: draft.assets.map((asset) => ({ ...asset })),
  };
}

// 共用于 draft / document 的空判定：normalizeEditorHtml 会剥掉 <p></p>、<p><br></p>
// 这类编辑器留下的空占位，避免被错认为"有内容"。
type NoteContentLike = {
  contentHtml: string;
  contentText: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
};

export function isNoteContentEmpty(content: NoteContentLike): boolean {
  return (
    !normalizeEditorHtml(content.contentHtml) &&
    !content.contentText.trim() &&
    content.tags.length === 0 &&
    content.assets.length === 0
  );
}

// 初始化编辑器时，若本地草稿是空（旧版 bug 的残留），且 API 笔记里确实有内容，
// 走 API 分支而非草稿分支，避免空草稿覆盖原文。
export function shouldDiscardEmptyDraftForApi(
  localDraft: DesktopNoteDraftRecord | null | undefined,
  apiDocument: FavoriteNoteDocument | null | undefined,
): boolean {
  if (!localDraft || !apiDocument) return false;
  return isNoteContentEmpty(localDraft) && !isNoteContentEmpty(apiDocument);
}

export function buildNoteSnapshot(state: NoteEditorState) {
  return JSON.stringify({
    contentHtml: normalizeEditorHtml(state.contentHtml),
    contentText: state.contentText.trim(),
    tags: [...state.tags].sort(),
    assets: state.assets,
  });
}

export function buildNoteMutationPayload(state: NoteEditorState) {
  const contentHtml = normalizeEditorHtml(state.contentHtml);
  return {
    contentHtml,
    contentText: extractNoteTextFromHtml(contentHtml),
    tags: state.tags,
    assets: filterAssetsByHtml(contentHtml, state.assets),
  };
}

export function normalizeEditorHtml(value: string) {
  const normalized = value
    .replace(/\u200b/g, "")
    .replace(/<div><br><\/div>/gi, "")
    .replace(/<p><br><\/p>/gi, "")
    .trim();

  if (!normalized) {
    return "";
  }

  const text = extractNoteTextFromHtml(normalized);
  const hasAsset = /data-note-asset-id=/.test(normalized);
  return text || hasAsset ? normalized : "";
}

export function extractNoteTextFromHtml(value: string) {
  if (!value.trim()) {
    return "";
  }

  // 之前用 detached <div>.innerText 抽文本：浏览器对游离节点不算 block 布局，
  // <p>/<div>/<br> 全部塌成同一行，contentText 多行内容塌成一行；resolveNoteTitle
  // 取"第一行"实际取到全文连起来。改用纯字符串：块级标签的开 / 闭都映成 \n，
  // 跟后端 favorites.service.ts stripHtmlTags 一套规则。
  const blockOpenPattern = /<(p|div|li|h[1-6])(\s[^>]*)?>/gi;
  const blockClosePattern = /<\/(p|div|li|h[1-6])>/gi;
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(blockOpenPattern, "\n")
    .replace(blockClosePattern, "\n")
    .replace(/<[^>]+>/g, " ")
    // 把 &nbsp;(U+00A0) 归一成普通空格——之前直接在正则里写了字面量 NBSP, ESLint no-irregular-whitespace 在 lint:desktop-web 长期报红；改成 \u00A0 转义同语义，可视化清晰，过 lint。
    .replace(/\u00A0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function filterAssetsByHtml(html: string, assets: FavoriteNoteAsset[]) {
  const assetIds = [...html.matchAll(/data-note-asset-id="([^"]+)"/g)].map(
    (item) => item[1],
  );
  const assetIdSet = new Set(assetIds);
  return assets.filter((asset) => assetIdSet.has(asset.id));
}

export function mergeNoteAssets(
  current: FavoriteNoteAsset[],
  incoming: FavoriteNoteAsset[],
) {
  const currentById = new Map(current.map((asset) => [asset.id, asset]));
  for (const asset of incoming) {
    currentById.set(asset.id, asset);
  }

  return [...currentById.values()];
}

export function resolveNoteTitle(contentText: string) {
  const firstLine = contentText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine?.slice(0, 28) || translateRuntimeMessage(msg`无标题笔记`);
}

export function resolveNoteExcerpt(contentText: string, title: string) {
  const lines = contentText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const body = lines.join(" ").trim();
  if (!body) {
    return "";
  }

  if (body === title) {
    return "";
  }

  const withoutTitle = body.startsWith(title)
    ? body.slice(title.length).trim()
    : body;
  return withoutTitle.slice(0, 120);
}

export function buildNoteSendDialogNote(input: {
  noteId: string;
  state: NoteEditorState;
  updatedAt?: string;
}): NoteSendDialogNote {
  const title = resolveNoteTitle(input.state.contentText);
  return {
    noteId: input.noteId,
    title,
    excerpt: resolveNoteExcerpt(input.state.contentText, title),
    tags: [...input.state.tags],
    assets: filterAssetsByHtml(input.state.contentHtml, input.state.assets),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export function buildNoteSendDialogNoteFromDocument(
  note: FavoriteNoteDocument,
): NoteSendDialogNote {
  return {
    noteId: note.id,
    title: note.title,
    excerpt: note.excerpt,
    tags: [...note.tags],
    assets: note.assets.map((asset) => ({ ...asset })),
    updatedAt: note.updatedAt,
  };
}

export function buildNoteCardAttachment(
  note: NoteSendDialogNote,
): NoteCardAttachment {
  return {
    kind: "note_card",
    noteId: note.noteId,
    title: note.title,
    excerpt: note.excerpt,
    tags: [...note.tags],
    assets: note.assets.map((asset) => ({ ...asset })),
    updatedAt: note.updatedAt,
  };
}

export function buildFavoriteNoteSummary(
  note: FavoriteNoteDocument,
): FavoriteNoteSummary {
  return {
    id: note.id,
    title: note.title,
    excerpt: note.excerpt,
    tags: [...note.tags],
    assets: note.assets.map((asset) => ({ ...asset })),
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

export function buildFavoriteNoteSourceId(noteId: string) {
  return `favorite-note-${noteId}`;
}

export function buildFavoriteNoteRecord(note: FavoriteNoteDocument): FavoriteRecord {
  return {
    id: `favorite-${note.id}`,
    sourceId: buildFavoriteNoteSourceId(note.id),
    category: "notes",
    title: note.title,
    description: note.excerpt,
    meta: formatFavoriteTimestamp(note.updatedAt),
    to: `/tabs/favorites#draftId=${encodeURIComponent(note.id)}&noteId=${encodeURIComponent(note.id)}`,
    badge: translateRuntimeMessage(msg`笔记`),
    avatarName: note.title,
    collectedAt: note.updatedAt,
  };
}

export function upsertFavoriteNoteSummary(
  current: FavoriteNoteSummary[] | undefined,
  note: FavoriteNoteDocument,
) {
  const nextNote = buildFavoriteNoteSummary(note);
  // ISO 字符串走原生字典序，跟 favorites-storage 对齐，省掉 localeCompare Collator。
  return [
    nextNote,
    ...(current ?? []).filter((item) => item.id !== note.id),
  ].sort((left, right) =>
    right.updatedAt < left.updatedAt
      ? -1
      : right.updatedAt > left.updatedAt
        ? 1
        : 0,
  );
}

export function upsertFavoriteNoteRecord(
  current: FavoriteRecord[] | undefined,
  note: FavoriteNoteDocument,
) {
  const nextRecord = buildFavoriteNoteRecord(note);
  return [
    nextRecord,
    ...(current ?? []).filter((item) => item.sourceId !== nextRecord.sourceId),
  ].sort((left, right) =>
    right.collectedAt < left.collectedAt
      ? -1
      : right.collectedAt > left.collectedAt
        ? 1
        : 0,
  );
}

export function removeFavoriteNoteSummary(
  current: FavoriteNoteSummary[] | undefined,
  noteId: string,
) {
  return (current ?? []).filter((item) => item.id !== noteId);
}

export function removeFavoriteNoteRecord(
  current: FavoriteRecord[] | undefined,
  noteId: string,
) {
  const sourceId = buildFavoriteNoteSourceId(noteId);
  return (current ?? []).filter((item) => item.sourceId !== sourceId);
}

export function isFavoriteNoteMissingError(error: unknown) {
  return (
    error instanceof Error &&
    /favorite note .+ not found/i.test(error.message.trim())
  );
}

export function formatFavoriteTimestamp(iso: string) {
  const date = new Date(iso);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return translateRuntimeMessage(
    msg`${month}月${day}日 ${hours}:${minutes}`,
  );
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeHtmlAttribute(value: string) {
  return escapeHtml(value);
}

// 笔记附件 URL 在 chat-message-list 里被直接喂给 <a href> / <img src>。后端
// R1/R3 已经拦了 javascript:/vbscript:/data:text 协议，FE 再加一层
// defense-in-depth：老数据 / 被 DevTools 注入的 localStorage 兜不住时，
// 至少别让链接在 UI 上可点。
const DANGEROUS_FAVORITE_URL_PROTOCOL =
  /^\s*(?:javascript|vbscript|data:(?:text|application))/i;

export function isSafeFavoriteAssetUrl(
  url: string | undefined | null,
): boolean {
  if (!url) return false;
  return !DANGEROUS_FAVORITE_URL_PROTOCOL.test(url);
}

export type FavoriteCategory =
  | "messages"
  | "notes"
  | "contacts"
  | "officialAccounts"
  | "moments"
  | "feed"
  | "channels";

export interface FavoriteRecord {
  id: string;
  sourceId: string;
  category: FavoriteCategory;
  title: string;
  description: string;
  meta: string;
  to: string;
  badge: string;
  avatarName?: string;
  avatarSrc?: string;
  collectedAt: string;
}

export interface CreateMessageFavoriteRequest {
  threadId: string;
  threadType: "direct" | "group";
  messageId: string;
}

export type FavoriteNoteAsset = {
  id: string;
  kind: "image" | "file";
  fileName: string;
  url: string;
  mimeType?: string;
  sizeBytes?: number;
  width?: number;
  height?: number;
};

export interface FavoriteNoteSummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  createdAt: string;
  updatedAt: string;
}

export interface FavoriteNoteDocument extends FavoriteNoteSummary {
  contentHtml: string;
  contentText: string;
}

export interface UpsertFavoriteNoteRequest {
  contentHtml: string;
  contentText?: string;
  tags?: string[];
  assets?: FavoriteNoteAsset[];
}

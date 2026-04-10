export type FavoriteCategory =
  | "messages"
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

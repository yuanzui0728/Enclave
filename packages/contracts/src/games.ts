export type GameCenterTone =
  | "forest"
  | "gold"
  | "ocean"
  | "violet"
  | "sunset"
  | "mint";

export type GameCenterCategoryId =
  | "featured"
  | "party"
  | "competitive"
  | "relax"
  | "strategy";

export type GameCenterPrimarySectionId =
  | "home"
  | "discover"
  | "rankings"
  | "content"
  | "mine";

export type GamePublisherKind =
  | "platform_official"
  | "third_party"
  | "character_creator";

export type GameProductionKind =
  | "human_authored"
  | "ai_assisted"
  | "ai_generated"
  | "character_generated";

export type GameRuntimeMode =
  | "workspace_mock"
  | "chat_native"
  | "embedded_web"
  | "remote_session";

export type GameReviewStatus =
  | "internal_seed"
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export type GameVisibilityScope =
  | "featured"
  | "published"
  | "coming_soon"
  | "internal";

export type GameCenterStoryKind =
  | "spotlight"
  | "guide"
  | "update"
  | "behind_the_scenes";

export interface GameCenterPrimarySection {
  id: GameCenterPrimarySectionId;
  label: string;
  description: string;
}

export interface GameCenterCategoryTab {
  id: GameCenterCategoryId;
  label: string;
  description: string;
}

export interface GameCenterGame {
  id: string;
  name: string;
  slogan: string;
  description: string;
  studio: string;
  badge: string;
  heroLabel: string;
  category: GameCenterCategoryId;
  tone: GameCenterTone;
  playersLabel: string;
  friendsLabel: string;
  updateNote: string;
  deckLabel: string;
  estimatedDuration: string;
  rewardLabel: string;
  sessionObjective: string;
  tags: string[];
  publisherKind: GamePublisherKind;
  productionKind: GameProductionKind;
  runtimeMode: GameRuntimeMode;
  reviewStatus: GameReviewStatus;
  visibilityScope: GameVisibilityScope;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  aiHighlights: string[];
}

export interface GameCenterRankingEntry {
  gameId: string;
  rank: number;
  note: string;
}

export interface GameCenterFriendActivity {
  id: string;
  friendName: string;
  friendAvatar?: string;
  gameId: string;
  status: string;
  updatedAt: string;
}

export interface GameCenterEvent {
  id: string;
  title: string;
  description: string;
  meta: string;
  ctaLabel: string;
  relatedGameId: string;
  actionKind: "mission" | "reminder" | "join";
  tone: GameCenterTone;
}

export interface GameCenterStory {
  id: string;
  title: string;
  description: string;
  eyebrow: string;
  authorName: string;
  ctaLabel: string;
  publishedAt: string;
  kind: GameCenterStoryKind;
  tone: GameCenterTone;
  relatedGameId?: string | null;
}

export interface GameCenterShelf {
  id: string;
  title: string;
  description: string;
  gameIds: string[];
}

export interface GameCenterOwnerState {
  activeGameId?: string | null;
  recentGameIds: string[];
  pinnedGameIds: string[];
  launchCountById: Record<string, number>;
  lastOpenedAtById: Record<string, string>;
  updatedAt: string;
}

export interface GameCenterHomeResponse {
  primarySections: GameCenterPrimarySection[];
  categoryTabs: GameCenterCategoryTab[];
  featuredGameIds: string[];
  shelves: GameCenterShelf[];
  hotRankings: GameCenterRankingEntry[];
  newRankings: GameCenterRankingEntry[];
  friendActivities: GameCenterFriendActivity[];
  events: GameCenterEvent[];
  stories: GameCenterStory[];
  games: GameCenterGame[];
  ownerState: GameCenterOwnerState;
  generatedAt: string;
}

export interface AdminGameCatalogItem {
  id: string;
  name: string;
  category: GameCenterCategoryId;
  badge: string;
  publisherKind: GamePublisherKind;
  productionKind: GameProductionKind;
  runtimeMode: GameRuntimeMode;
  reviewStatus: GameReviewStatus;
  visibilityScope: GameVisibilityScope;
  studio: string;
  sourceCharacterId?: string | null;
  sourceCharacterName?: string | null;
  aiHighlights: string[];
  tags: string[];
  updateNote: string;
  playersLabel: string;
  friendsLabel: string;
}

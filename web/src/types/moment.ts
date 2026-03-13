export interface MomentInteraction {
  characterId: string;
  characterName: string;
  characterAvatar: string;
  type: 'like' | 'comment';
  commentText?: string;
  createdAt: Date;
}

export interface UserInteraction {
  type: 'like' | 'comment';
  commentText?: string;
  createdAt: Date;
}

export interface Moment {
  id: string;
  authorId: string; // character id or 'user'
  authorName: string;
  authorAvatar: string;
  text: string;
  images?: string[];
  location?: string;
  postedAt: Date;
  interactions: MomentInteraction[];
  userInteraction?: UserInteraction;
}

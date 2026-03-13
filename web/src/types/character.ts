export type RelationshipType = 'family' | 'friend' | 'expert' | 'custom';

export type ExpertDomain =
  | 'law'
  | 'medicine'
  | 'finance'
  | 'tech'
  | 'psychology'
  | 'education'
  | 'management'
  | 'general';

export interface Character {
  id: string;
  name: string;
  avatar: string; // emoji or image url
  relationship: string; // display label e.g. "律师朋友"
  relationshipType: RelationshipType;
  expertDomains: ExpertDomain[];
  bio: string;
  personality: string; // short description
  isOnline: boolean;
  isTemplate: boolean;
}

export type RelationshipType = 'family' | 'friend' | 'expert' | 'custom';

export interface PersonalityTraits {
  speechPatterns: string[];
  catchphrases: string[];
  topicsOfInterest: string[];
  emotionalTone: string;
  responseLength: 'short' | 'medium' | 'long';
  emojiUsage: 'none' | 'occasional' | 'frequent';
}

export interface PersonalityProfile {
  characterId: string;
  name: string;
  relationship: string;
  expertDomains: string[];
  basePrompt?: string;
  traits: PersonalityTraits;
  memorySummary: string;
  systemPrompt?: string;
}

export interface Character {
  id: string;
  name: string;
  avatar: string;
  relationship: string;
  relationshipType: RelationshipType;
  expertDomains: string[];
  bio: string;
  personality?: string;
  isOnline: boolean;
  isTemplate: boolean;
  profile: PersonalityProfile;
}

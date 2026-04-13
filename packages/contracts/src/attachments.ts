import type { FavoriteNoteAsset } from "./favorites";

export interface StickerAttachment {
  kind: "sticker";
  packId: string;
  stickerId: string;
  url: string;
  width: number;
  height: number;
  label?: string;
}

export interface ImageAttachment {
  kind: "image";
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
  width?: number;
  height?: number;
}

export interface FileAttachment {
  kind: "file";
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
}

export interface VoiceAttachment {
  kind: "voice";
  url: string;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs?: number;
}

export interface ContactCardAttachment {
  kind: "contact_card";
  characterId: string;
  name: string;
  avatar?: string;
  relationship?: string;
  bio?: string;
}

export interface LocationCardAttachment {
  kind: "location_card";
  sceneId: string;
  title: string;
  subtitle?: string;
}

export interface NoteCardAttachment {
  kind: "note_card";
  noteId: string;
  title: string;
  excerpt: string;
  tags: string[];
  assets: FavoriteNoteAsset[];
  updatedAt: string;
}

export type MessageAttachment =
  | StickerAttachment
  | ImageAttachment
  | FileAttachment
  | VoiceAttachment
  | ContactCardAttachment
  | LocationCardAttachment
  | NoteCardAttachment;

export type UploadableAttachment =
  | ImageAttachment
  | FileAttachment
  | VoiceAttachment;

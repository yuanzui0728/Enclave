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

export type MessageAttachment =
  | StickerAttachment
  | ImageAttachment
  | ContactCardAttachment
  | LocationCardAttachment;

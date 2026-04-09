import type {
  ContactCardAttachment,
  LocationCardAttachment,
} from "@yinjie/contracts";

export type ChatComposerAttachmentPayload =
  | {
      type: "image";
      file: File;
      fileName: string;
      width?: number;
      height?: number;
    }
  | {
      type: "file";
      file: File;
      fileName: string;
      mimeType: string;
      size: number;
    }
  | {
      type: "contact_card";
      attachment: ContactCardAttachment;
    }
  | {
      type: "location_card";
      attachment: LocationCardAttachment;
    };

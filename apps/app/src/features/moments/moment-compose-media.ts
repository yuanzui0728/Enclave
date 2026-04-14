import { useEffect, useRef, useState } from "react";
import {
  createUserMoment,
  uploadMomentMedia,
  type CreateUserMomentRequest,
  type Moment,
  type MomentImageAsset,
  type MomentVideoAsset,
} from "@yinjie/contracts";

const MAX_IMAGE_COUNT = 9;
const MAX_VIDEO_DURATION_MS = 5 * 60 * 1000;

export type MomentImageDraft = {
  id: string;
  kind: "image";
  file: File;
  previewUrl: string;
  width: number;
  height: number;
};

export type MomentVideoDraft = {
  id: string;
  kind: "video";
  file: File;
  previewUrl: string;
  posterFile: File | null;
  posterPreviewUrl: string | null;
  width: number;
  height: number;
  durationMs: number;
};

export function useMomentComposeDraft() {
  const [text, setText] = useState("");
  const [imageDrafts, setImageDrafts] = useState<MomentImageDraft[]>([]);
  const [videoDraft, setVideoDraft] = useState<MomentVideoDraft | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const imageDraftsRef = useRef(imageDrafts);
  const videoDraftRef = useRef(videoDraft);

  useEffect(() => {
    imageDraftsRef.current = imageDrafts;
  }, [imageDrafts]);

  useEffect(() => {
    videoDraftRef.current = videoDraft;
  }, [videoDraft]);

  useEffect(() => {
    return () => {
      releaseMomentImageDrafts(imageDraftsRef.current);
      releaseMomentVideoDraft(videoDraftRef.current);
    };
  }, []);

  const hasMedia = imageDrafts.length > 0 || Boolean(videoDraft);
  const hasContent = Boolean(text.trim()) || hasMedia;

  return {
    text,
    setText,
    imageDrafts,
    videoDraft,
    mediaError,
    hasContent,
    canAddImages: !videoDraft && imageDrafts.length < MAX_IMAGE_COUNT,
    canAddVideo: imageDrafts.length === 0,
    async addImageFiles(files: FileList | File[] | null) {
      const pickedFiles = Array.from(files ?? []);
      if (!pickedFiles.length) {
        return;
      }

      setMediaError(null);

      if (videoDraftRef.current) {
        throw new Error("朋友圈当前不支持图片和视频混发。");
      }

      const remainingSlots = MAX_IMAGE_COUNT - imageDraftsRef.current.length;
      if (remainingSlots <= 0) {
        throw new Error(`图片朋友圈最多支持 ${MAX_IMAGE_COUNT} 张图片。`);
      }

      if (pickedFiles.length > remainingSlots) {
        throw new Error(`还可以继续添加 ${remainingSlots} 张图片。`);
      }

      const nextDrafts = await createMomentImageDrafts(pickedFiles);
      setImageDrafts((current) => [...current, ...nextDrafts]);
    },
    async replaceVideoFile(file: File | null | undefined) {
      if (!file) {
        return;
      }

      setMediaError(null);

      if (imageDraftsRef.current.length > 0) {
        throw new Error("朋友圈当前不支持图片和视频混发。");
      }

      const nextDraft = await createMomentVideoDraft(file);
      setVideoDraft((current) => {
        releaseMomentVideoDraft(current);
        return nextDraft;
      });
    },
    removeImageDraft(id: string) {
      setImageDrafts((current) => {
        const target = current.find((draft) => draft.id === id) ?? null;
        if (target) {
          releaseMomentImageDraft(target);
        }
        return current.filter((draft) => draft.id !== id);
      });
    },
    clearVideoDraft() {
      setVideoDraft((current) => {
        releaseMomentVideoDraft(current);
        return null;
      });
    },
    setMediaError,
    reset() {
      releaseMomentImageDrafts(imageDraftsRef.current);
      releaseMomentVideoDraft(videoDraftRef.current);
      setText("");
      setImageDrafts([]);
      setVideoDraft(null);
      setMediaError(null);
    },
  };
}

export async function publishMomentComposeDraft(input: {
  text: string;
  location?: string;
  imageDrafts: MomentImageDraft[];
  videoDraft: MomentVideoDraft | null;
  baseUrl?: string;
}): Promise<Moment> {
  const payload = await buildMomentCreateRequest(input);
  return createUserMoment(payload, input.baseUrl);
}

export function formatMomentDurationLabel(durationMs?: number) {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "00:00";
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return [
      String(hours).padStart(2, "0"),
      String(remainingMinutes).padStart(2, "0"),
      String(seconds).padStart(2, "0"),
    ].join(":");
  }

  return [
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

async function buildMomentCreateRequest(input: {
  text: string;
  location?: string;
  imageDrafts: MomentImageDraft[];
  videoDraft: MomentVideoDraft | null;
  baseUrl?: string;
}): Promise<CreateUserMomentRequest> {
  const text = input.text.trim();
  const location = input.location?.trim() || undefined;

  if (input.videoDraft) {
    const media = await uploadMomentVideoDraft(input.videoDraft, input.baseUrl);
    return {
      text: text || undefined,
      location,
      contentType: "video",
      media: [media],
    };
  }

  if (input.imageDrafts.length > 0) {
    const media: MomentImageAsset[] = [];
    for (const draft of input.imageDrafts) {
      media.push(await uploadMomentImageDraft(draft, input.baseUrl));
    }

    return {
      text: text || undefined,
      location,
      contentType: "image_album",
      media,
    };
  }

  return {
    text: text || undefined,
    location,
    contentType: "text",
  };
}

async function uploadMomentImageDraft(
  draft: MomentImageDraft,
  baseUrl?: string,
) {
  const formData = new FormData();
  formData.set("file", draft.file);
  formData.set("width", String(draft.width));
  formData.set("height", String(draft.height));

  const response = await uploadMomentMedia(formData, baseUrl);
  return response.media as MomentImageAsset;
}

async function uploadMomentVideoDraft(
  draft: MomentVideoDraft,
  baseUrl?: string,
) {
  const videoFormData = new FormData();
  videoFormData.set("file", draft.file);
  videoFormData.set("width", String(draft.width));
  videoFormData.set("height", String(draft.height));
  videoFormData.set("durationMs", String(draft.durationMs));
  const response = await uploadMomentMedia(videoFormData, baseUrl);
  const video = response.media as MomentVideoAsset;

  if (!draft.posterFile) {
    return video;
  }

  const posterFormData = new FormData();
  posterFormData.set("file", draft.posterFile);
  posterFormData.set("width", String(draft.width));
  posterFormData.set("height", String(draft.height));
  const posterResponse = await uploadMomentMedia(posterFormData, baseUrl);

  return {
    ...video,
    posterUrl: posterResponse.media.url,
  } satisfies MomentVideoAsset;
}

async function createMomentImageDrafts(files: File[]) {
  const drafts: MomentImageDraft[] = [];

  try {
    for (const file of files) {
      drafts.push(await createMomentImageDraft(file));
    }

    return drafts;
  } catch (error) {
    releaseMomentImageDrafts(drafts);
    throw error;
  }
}

async function createMomentImageDraft(file: File): Promise<MomentImageDraft> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件。");
  }

  const previewUrl = URL.createObjectURL(file);

  try {
    const size = await readImageDimensions(previewUrl);
    return {
      id: buildDraftId("moment-image"),
      kind: "image",
      file,
      previewUrl,
      width: size.width,
      height: size.height,
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}

async function createMomentVideoDraft(file: File): Promise<MomentVideoDraft> {
  if (!file.type.startsWith("video/")) {
    throw new Error("请选择视频文件。");
  }

  const previewUrl = URL.createObjectURL(file);
  let posterPreviewUrl: string | null = null;

  try {
    const metadata = await readVideoMetadata(previewUrl);
    if (metadata.durationMs > MAX_VIDEO_DURATION_MS) {
      throw new Error("朋友圈视频时长不能超过 5 分钟。");
    }

    const posterFile = await buildMomentVideoPoster(
      previewUrl,
      metadata.width,
      metadata.height,
      metadata.durationMs,
      file.name,
    );
    posterPreviewUrl = posterFile ? URL.createObjectURL(posterFile) : null;

    return {
      id: buildDraftId("moment-video"),
      kind: "video",
      file,
      previewUrl,
      posterFile,
      posterPreviewUrl,
      width: metadata.width,
      height: metadata.height,
      durationMs: metadata.durationMs,
    };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    if (posterPreviewUrl) {
      URL.revokeObjectURL(posterPreviewUrl);
    }
    throw error;
  }
}

function readImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error("图片解析失败，请换一张再试。"));
    image.src = url;
  });
}

function readVideoMetadata(url: string) {
  return new Promise<{
    width: number;
    height: number;
    durationMs: number;
  }>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const width = Math.max(1, Math.round(video.videoWidth || 0));
      const height = Math.max(1, Math.round(video.videoHeight || 0));
      const durationMs = Math.max(
        0,
        Math.round((Number.isFinite(video.duration) ? video.duration : 0) * 1000),
      );

      cleanup();
      resolve({
        width,
        height,
        durationMs,
      });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("视频解析失败，请换一个文件再试。"));
    };
    video.src = url;
  });
}

async function buildMomentVideoPoster(
  url: string,
  width: number,
  height: number,
  durationMs: number,
  fileName: string,
) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const video = await createPosterCaptureVideo(url, durationMs);
    context.drawImage(video, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, {
      mimeType: "image/jpeg",
      quality: 0.88,
      errorMessage: "视频封面生成失败，请稍后重试。",
    });
    const nextFileName = replaceFileExtension(fileName || "moment-video", "jpg");

    return new File([blob], nextFileName, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

function createPosterCaptureVideo(url: string, durationMs: number) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const captureSeconds = Math.max(
      0,
      Math.min(durationMs / 1000 * 0.15, 1),
    );

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      if (captureSeconds <= 0.05 || !Number.isFinite(video.duration)) {
        cleanup();
        resolve(video);
        return;
      }

      video.currentTime = Math.min(captureSeconds, video.duration);
    };
    video.onseeked = () => {
      cleanup();
      resolve(video);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("视频封面生成失败，请稍后重试。"));
    };
    video.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  options?: {
    mimeType?: string;
    quality?: number;
    errorMessage?: string;
  },
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new Error(options?.errorMessage ?? "图片处理失败，请稍后重试。"),
          );
          return;
        }

        resolve(blob);
      },
      options?.mimeType ?? "image/jpeg",
      options?.quality,
    );
  });
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const normalized = fileName.trim().replace(/\?.*$/, "").replace(/\.[^.]+$/, "");
  return `${normalized || "moment-media"}.${nextExtension}`;
}

function releaseMomentImageDrafts(drafts: MomentImageDraft[]) {
  drafts.forEach((draft) => releaseMomentImageDraft(draft));
}

function releaseMomentImageDraft(draft: MomentImageDraft | null) {
  if (!draft) {
    return;
  }

  URL.revokeObjectURL(draft.previewUrl);
}

function releaseMomentVideoDraft(draft: MomentVideoDraft | null) {
  if (!draft) {
    return;
  }

  URL.revokeObjectURL(draft.previewUrl);
  if (draft.posterPreviewUrl) {
    URL.revokeObjectURL(draft.posterPreviewUrl);
  }
}

function buildDraftId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

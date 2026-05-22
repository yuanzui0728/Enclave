import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import {
  createFeedPost,
  createUserMoment,
  uploadMomentMedia,
  type CreateFeedPostRequest,
  type CreateUserMomentRequest,
  type FeedPost,
  type FeedSurface,
  type Moment,
  type MomentImageAsset,
  type MomentVideoAsset,
} from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { track } from "@yinjie/analytics";
import type { StoredMomentDraft } from "./moment-draft-store";

const t = translateRuntimeMessage;

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
  const hydrateFromStored = useCallback((stored: StoredMomentDraft) => {
    // 草稿恢复路径：之前持久化的是裸 Blob（IDB structured-clone 原生支持），
    // previewUrl 是 createObjectURL 的产物不可序列化，必须每次 hydrate 用新的
    // Blob 重新生成。同时把可能残留的旧 draft 全部 release，避免重复 hydrate
    // 累积 blob URL 泄漏（虽然正常路径下进入发布页前一定先 reset，但壳层
    // back-forward cache 复用同一个 component instance 时这条 cleanup 是兜底）。
    // ?? "" 防御：旧 schema 或 IDB 篡改的情况下 stored.text 可能是 undefined / null。
    // setText(undefined) 会让受控 textarea 退到 uncontrolled，React 在 dev mode 会
    // 报"changing an uncontrolled input to be controlled"。
    setText(stored.text ?? "");
    setImageDrafts((current) => {
      releaseMomentImageDrafts(current);
      const nextDrafts: MomentImageDraft[] = stored.imageBlobs.map((entry) => {
        const file = new File([entry.blob], entry.name || "moment-image", {
          type: entry.type || entry.blob.type || "image/jpeg",
        });
        return {
          id: buildDraftId("moment-image"),
          kind: "image",
          file,
          previewUrl: URL.createObjectURL(file),
          width: entry.width,
          height: entry.height,
        };
      });
      return nextDrafts;
    });
    setVideoDraft((current) => {
      releaseMomentVideoDraft(current);
      if (!stored.videoBlob) {
        return null;
      }
      const entry = stored.videoBlob;
      const file = new File([entry.blob], entry.name || "moment-video", {
        type: entry.type || entry.blob.type || "video/mp4",
      });
      const posterFile = entry.posterBlob
        ? new File(
            [entry.posterBlob],
            replaceFileExtension(entry.name || "moment-video", "jpg"),
            { type: entry.posterBlob.type || "image/jpeg" },
          )
        : null;
      return {
        id: buildDraftId("moment-video"),
        kind: "video",
        file,
        previewUrl: URL.createObjectURL(file),
        posterFile,
        posterPreviewUrl: posterFile ? URL.createObjectURL(posterFile) : null,
        width: entry.width,
        height: entry.height,
        durationMs: entry.durationMs,
      };
    });
    setMediaError(null);
  }, []);
  const reset = useCallback(() => {
    setText((current) => (current ? "" : current));
    setImageDrafts((current) => {
      if (!current.length) {
        return current;
      }

      releaseMomentImageDrafts(current);
      return [];
    });
    setVideoDraft((current) => {
      if (!current) {
        return current;
      }

      releaseMomentVideoDraft(current);
      return null;
    });
    setMediaError((current) => (current ? null : current));
  }, []);

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
        throw new Error(t(msg`当前不支持图片和视频混发。`));
      }

      const remainingSlots = MAX_IMAGE_COUNT - imageDraftsRef.current.length;
      if (remainingSlots <= 0) {
        throw new Error(t(msg`图片动态最多支持 ${MAX_IMAGE_COUNT} 张图片。`));
      }

      if (pickedFiles.length > remainingSlots) {
        throw new Error(t(msg`还可以继续添加 ${remainingSlots} 张图片。`));
      }

      const nextDrafts = await createMomentImageDrafts(pickedFiles);
      // 二次校验：createMomentImageDrafts 之间用户可能已经走完另一边的「选择视频」
      // 流程把 videoDraft 塞进来；此时再 setImageDrafts 会让 imageDrafts + videoDraft
      // 同时存在，publish 时 buildMomentCreateRequest 只看 videoDraft 分支直接把图片
      // 静默丢掉。先把刚 decode 出来的 preview URL release 再抛错。
      if (videoDraftRef.current) {
        releaseMomentImageDrafts(nextDrafts);
        throw new Error(t(msg`当前不支持图片和视频混发。`));
      }
      // 同样的并发用户也可能在另一边并发添加图片把 remaining slot 吃光，二次卡
      // 「9 张上限」避免 setImageDrafts 之后总数超 9。
      if (
        imageDraftsRef.current.length + nextDrafts.length >
        MAX_IMAGE_COUNT
      ) {
        releaseMomentImageDrafts(nextDrafts);
        throw new Error(t(msg`图片动态最多支持 ${MAX_IMAGE_COUNT} 张图片。`));
      }
      setImageDrafts((current) => [...current, ...nextDrafts]);
    },
    async replaceVideoFile(file: File | null | undefined) {
      if (!file) {
        return;
      }

      setMediaError(null);

      if (imageDraftsRef.current.length > 0) {
        throw new Error(t(msg`当前不支持图片和视频混发。`));
      }

      const nextDraft = await createMomentVideoDraft(file);
      // 二次校验：createMomentVideoDraft 期间（视频元数据 + 封面生成可能要几秒）
      // 用户可能从初始 110×110 入口已经走完图片选择把 imageDrafts 塞进来。此时再
      // setVideoDraft 会让两者并存，publish 时只取 videoDraft 把图片静默丢掉。
      if (imageDraftsRef.current.length > 0) {
        releaseMomentVideoDraft(nextDraft);
        throw new Error(t(msg`当前不支持图片和视频混发。`));
      }
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
    reset,
    hydrateFromStored,
  };
}

export function extractMomentDraftSnapshot(input: {
  text: string;
  imageDrafts: MomentImageDraft[];
  videoDraft: MomentVideoDraft | null;
}): StoredMomentDraft {
  // image/video draft 的 .file 本身就是 Blob 的子类，IDB structured-clone 直接
  // 落盘；不要做任何 base64/ArrayBuffer 中转，否则 9 张图 + 5 分钟视频 base64
  // 化会先在主线程 sync 占 100MB+ 内存。
  return {
    text: input.text,
    imageBlobs: input.imageDrafts.map((draft) => ({
      id: draft.id,
      blob: draft.file,
      width: draft.width,
      height: draft.height,
      name: draft.file.name,
      type: draft.file.type,
    })),
    videoBlob: input.videoDraft
      ? {
          id: input.videoDraft.id,
          blob: input.videoDraft.file,
          posterBlob: input.videoDraft.posterFile ?? null,
          width: input.videoDraft.width,
          height: input.videoDraft.height,
          durationMs: input.videoDraft.durationMs,
          name: input.videoDraft.file.name,
          type: input.videoDraft.file.type,
        }
      : null,
    savedAt: Date.now(),
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
  const moment = await createUserMoment(payload, input.baseUrl);
  track("moment_published", {
    imageCount: input.imageDrafts.length,
    hasVideo: Boolean(input.videoDraft),
    hasLocation: Boolean(input.location?.trim()),
    textLength: input.text.length,
  });
  return moment;
}

export async function publishFeedComposeDraft(input: {
  text: string;
  title?: string;
  surface?: FeedSurface;
  topicTags?: string[];
  imageDrafts: MomentImageDraft[];
  videoDraft: MomentVideoDraft | null;
  baseUrl?: string;
}): Promise<FeedPost> {
  const payload = await buildFeedCreateRequest(input);
  const post = await createFeedPost(payload, input.baseUrl);
  track("feed_post_published", {
    surface: input.surface ?? null,
    imageCount: input.imageDrafts.length,
    hasVideo: Boolean(input.videoDraft),
    topicTagCount: input.topicTags?.length ?? 0,
  });
  return post;
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
    // 并发上传：原 for-await 串行在公网隧道 600ms+ RTT 下 9 张图要排 5s+，
    // 改 Promise.all 让 N 张图并发跑，总耗时收敛到 ≈ 最慢一张。
    const media = await Promise.all(
      input.imageDrafts.map((draft) =>
        uploadMomentImageDraft(draft, input.baseUrl),
      ),
    );

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

async function buildFeedCreateRequest(input: {
  text: string;
  title?: string;
  surface?: FeedSurface;
  topicTags?: string[];
  imageDrafts: MomentImageDraft[];
  videoDraft: MomentVideoDraft | null;
  baseUrl?: string;
}): Promise<CreateFeedPostRequest> {
  const text = input.text.trim();
  const title = input.title?.trim() || undefined;
  const topicTags = normalizeComposeTags(input.topicTags);

  if (input.videoDraft) {
    return {
      text: text || undefined,
      title,
      surface: input.surface,
      topicTags,
      media: [await uploadMomentVideoDraft(input.videoDraft, input.baseUrl)],
    };
  }

  if (input.imageDrafts.length > 0) {
    // 并发上传：见 buildMomentCreateRequest 注释。
    const media = await Promise.all(
      input.imageDrafts.map((draft) =>
        uploadMomentImageDraft(draft, input.baseUrl),
      ),
    );

    return {
      text: text || undefined,
      title,
      surface: input.surface,
      topicTags,
      media,
    };
  }

  return {
    text: text || undefined,
    title,
    surface: input.surface,
    topicTags,
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

  // 视频和封面并发上传，原来是先 await 视频再 await 封面 —— 公网隧道下白白多花一个 RTT。
  const posterFormData = draft.posterFile
    ? (() => {
        const fd = new FormData();
        fd.set("file", draft.posterFile);
        fd.set("width", String(draft.width));
        fd.set("height", String(draft.height));
        return fd;
      })()
    : null;

  // 走查 R3：原 Promise.all 一旦封面（KB 级）撞 CDN 抖动 / 偶发 5xx 就把已经上完
  // 的视频（MB 级）拖一起 reject——主要工作量已经成功落库到服务端临时目录但被
  // 这一拒前功尽弃；用户看到"上传失败"再传一次又是几十 MB。改 allSettled：视频
  // 必须成功；封面失败就退到无封面 video（卡片渲染端有 fallback 走视频首帧）。
  const [videoResult, posterResult] = await Promise.allSettled([
    uploadMomentMedia(videoFormData, baseUrl),
    posterFormData ? uploadMomentMedia(posterFormData, baseUrl) : Promise.resolve(null),
  ]);

  if (videoResult.status === "rejected") {
    throw videoResult.reason instanceof Error
      ? videoResult.reason
      : new Error(String(videoResult.reason));
  }

  const video = videoResult.value.media as MomentVideoAsset;
  if (posterResult.status === "rejected" || !posterResult.value) {
    return video;
  }

  return {
    ...video,
    posterUrl: posterResult.value.media.url,
  } satisfies MomentVideoAsset;
}

async function createMomentImageDrafts(files: File[]) {
  // 走查电脑端朋友圈 R6：原先 for-of 串行 await createMomentImageDraft —— 每张
  // 都走 URL.createObjectURL + Image() onload 解 width/height，单张 ~10-50ms。
  // 用户一次性选 9 张时主线程被串行卡 ~450ms，文件选择对话框关闭到 preview 出
  // 现这段时间用户看着像"卡死了"。改 Promise.allSettled 并发跑所有解码，总
  // 耗时收敛到 ≈ 最慢一张（~50ms），快接近秒级。
  //
  // 用 allSettled 而不是 Promise.all 是因为要在任一失败时把已成功的 URL 全部
  // 释放再抛错（不然 9 张里只 1 张坏，剩 8 张的 blob URL 全泄漏）。原串行版本
  // 第一张失败后续不跑就抛错；并发版本所有解码都跑完才决定，等价于"宽容收尾"。
  const results = await Promise.allSettled(files.map(createMomentImageDraft));
  const drafts: MomentImageDraft[] = [];
  let firstError: Error | null = null;
  for (const result of results) {
    if (result.status === "fulfilled") {
      drafts.push(result.value);
    } else if (!firstError) {
      firstError =
        result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
    }
  }
  if (firstError) {
    releaseMomentImageDrafts(drafts);
    throw firstError;
  }
  return drafts;
}

async function createMomentImageDraft(file: File): Promise<MomentImageDraft> {
  if (!file.type.startsWith("image/")) {
    throw new Error(t(msg`请选择图片文件。`));
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
    throw new Error(t(msg`请选择视频文件。`));
  }

  const previewUrl = URL.createObjectURL(file);
  let posterPreviewUrl: string | null = null;

  try {
    const metadata = await readVideoMetadata(previewUrl);
    if (metadata.durationMs > MAX_VIDEO_DURATION_MS) {
      throw new Error(t(msg`视频时长不能超过 5 分钟。`));
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

// 同 readVideoMetadata，HEIC / 未知容器 / WebView 沙箱屏蔽 decode 等场景下
// Image().onload / onerror 也可能都不 fire，外层 Promise.allSettled(files.map())
// 一旦卡一张就把 picker UX 拖到「点了相册关了 sheet 啥都没出现」。10s 超时兜底。
const IMAGE_METADATA_TIMEOUT_MS = 10_000;

function readImageDimensions(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();

    let timer: number | null = window.setTimeout(() => {
      timer = null;
      image.onload = null;
      image.onerror = null;
      reject(new Error(t(msg`图片解析超时，请换一张再试。`)));
    }, IMAGE_METADATA_TIMEOUT_MS);
    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    image.onload = () => {
      clearTimer();
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => {
      clearTimer();
      reject(new Error(t(msg`图片解析失败，请换一张再试。`)));
    };
    image.src = url;
  });
}

// 走查 R2：iOS Safari 部分 HEVC / Chrome 部分 VP9 变体撞解码不支持时，<video>
// 既不 fire onloadedmetadata 也不 fire onerror —— promise 永远悬着，外层
// handleVideoFileSelected 卡在 await 里，picker sheet 关了但视频既没出现也没报错，
// 用户看到的就是「点了选择视频啥也没发生」。给一个 15s 超时兜底，避免无限挂起。
const VIDEO_METADATA_TIMEOUT_MS = 15_000;

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

    let timer: number | null = window.setTimeout(() => {
      timer = null;
      cleanup();
      reject(new Error(t(msg`视频解析超时，请换一个文件再试。`)));
    }, VIDEO_METADATA_TIMEOUT_MS);
    const cleanup = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
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
        Math.round(
          (Number.isFinite(video.duration) ? video.duration : 0) * 1000,
        ),
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
      reject(new Error(t(msg`视频解析失败，请换一个文件再试。`)));
    };
    video.src = url;
  });
}

// 封面用的最大边长——4K (3840x2160) 视频直接铺满 canvas 是 33MB RAM + 几 MB JPEG
// blob，低内存机型可能 OOM。封面只是个缩略图，1280 足够清晰，把比例算回来即可。
const MAX_POSTER_DIMENSION = 1280;

async function buildMomentVideoPoster(
  url: string,
  width: number,
  height: number,
  durationMs: number,
  fileName: string,
) {
  try {
    const longestSide = Math.max(width, height);
    const scale =
      longestSide > MAX_POSTER_DIMENSION
        ? MAX_POSTER_DIMENSION / longestSide
        : 1;
    const posterWidth = Math.max(1, Math.round(width * scale));
    const posterHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = posterWidth;
    canvas.height = posterHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    const video = await createPosterCaptureVideo(url, durationMs);
    context.drawImage(video, 0, 0, posterWidth, posterHeight);
    // 走查移动端朋友圈 R1（perf）：createPosterCaptureVideo 走 preload="auto"
    // 把整段（最多 5 分钟）视频先 buffer 进内存才能在 onseeked 抓到帧；drawImage
    // 同步把帧 paint 到 canvas 之后这个 <video> 元素就没用了，但只丢 ref 不调
    // removeAttribute("src")+load() 的话 Chromium / iOS Safari 会把 decoded
    // 缓冲一直挂到 GC 才放（实测一支 480p/3min 视频 ≈40MB，跨多次 picker 累积
    // 容易把低内存机型推到 OOM）。和 readVideoMetadata 那条 cleanup 同模板，
    // 上传/保留草稿等后续路径只读 draft.posterFile blob，不再需要这个临时 video。
    video.removeAttribute("src");
    video.load();
    const blob = await canvasToBlob(canvas, {
      mimeType: "image/jpeg",
      quality: 0.88,
      errorMessage: t(msg`视频封面生成失败，请稍后重试。`),
    });
    const nextFileName = replaceFileExtension(
      fileName || "moment-video",
      "jpg",
    );

    return new File([blob], nextFileName, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

// 走查 R3：和 readVideoMetadata 一样，preload="auto" 触发的整段下载 + seek 之后
// 没有任何事件 fire 的灾难场景（codec 解码不支持但浏览器不抛错；seek 到 currentTime
// 后 onseeked 永不触发）会让 buildMomentVideoPoster 卡死，外层 createMomentVideoDraft
// → handleVideoFileSelected 一起挂起，UI 完全没反馈。15s 超时兜底——封面失败不影响
// 视频本身（buildMomentVideoPoster 外层 catch 直接 return null）。
const POSTER_CAPTURE_TIMEOUT_MS = 15_000;

function createPosterCaptureVideo(url: string, durationMs: number) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const captureSeconds = Math.max(0, Math.min((durationMs / 1000) * 0.15, 1));

    let timer: number | null = window.setTimeout(() => {
      timer = null;
      cleanup();
      reject(new Error(t(msg`视频封面生成超时。`)));
    }, POSTER_CAPTURE_TIMEOUT_MS);
    const cleanup = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
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
      reject(new Error(t(msg`视频封面生成失败，请稍后重试。`)));
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
            new Error(options?.errorMessage ?? t(msg`图片处理失败，请稍后重试。`)),
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
  const normalized = fileName
    .trim()
    .replace(/\?.*$/, "")
    .replace(/\.[^.]+$/, "");
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
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeComposeTags(tags?: string[]) {
  const normalized = (tags ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);

  return normalized.length > 0 ? normalized : undefined;
}

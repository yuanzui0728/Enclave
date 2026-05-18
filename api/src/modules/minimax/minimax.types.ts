// i18n-ignore-start: provider adapter — error/log strings only.

export type MinimaxVideoModel =
  | 'MiniMax-Hailuo-2.3-Fast'
  | 'MiniMax-Hailuo-2.3';

export type MinimaxMusicModel = 'music-2.6' | 'music-2.5';

export type MinimaxImageModel = 'image-01';

export interface MinimaxBaseResp {
  status_code: number;
  status_msg?: string;
}

export interface MinimaxVideoSubmitInput {
  model: MinimaxVideoModel;
  prompt: string;
  firstFrameImageUrl?: string;
  duration?: 6;
  resolution?: '768P' | '1080P';
}

export interface MinimaxVideoSubmitResult {
  taskId: string;
}

export type MinimaxVideoStatus =
  | 'Preparing'
  | 'Queueing'
  | 'Processing'
  | 'Success'
  | 'Fail'
  | 'Unknown';

export interface MinimaxVideoQueryResult {
  status: MinimaxVideoStatus;
  fileId?: string;
  failReason?: string;
}

export interface MinimaxFileRetrieveResult {
  downloadUrl: string;
  fileName?: string;
  size?: number;
}

export interface MinimaxImageInput {
  model: MinimaxImageModel;
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '3:4' | '4:3';
  n?: number;
}

export interface MinimaxImageResult {
  buffer: Buffer;
  mimeType: string;
}

export interface MinimaxMusicInput {
  model: MinimaxMusicModel;
  prompt?: string;
  lyrics?: string;
  referVoice?: string;
  sampleRate?: 32000 | 44100;
  bitrate?: 128000 | 256000;
  format?: 'mp3';
}

export type MinimaxMusicResult =
  | {
      kind: 'inline';
      buffer: Buffer;
      mimeType: 'audio/mpeg';
      durationMs?: number;
    }
  | { kind: 'task'; taskId: string };

// 音乐异步轮询：MiniMax 后续若启用异步生成会返回 task_id，
// 沿用与视频相同的 query 模式：返回状态 + 音频(inline)或 fileId(异步下载)。
export type MinimaxMusicStatus =
  | 'Preparing'
  | 'Queueing'
  | 'Processing'
  | 'Success'
  | 'Fail'
  | 'Unknown';

export interface MinimaxMusicQueryResult {
  status: MinimaxMusicStatus;
  audioHex?: string;
  fileId?: string;
  durationMs?: number;
  failReason?: string;
}

export interface MinimaxLyricsInput {
  prompt: string;
  // /v1/lyrics_generation 必填字段：'write_full_song' 让 minimax 输出完整歌曲
  // （含 [Intro]/[Verse]/[Chorus]/[Bridge]/[Outro] 段落 + 标题 + 风格标签），
  // 'edit' 用于在 existing lyrics 上微调。默认 write_full_song。
  mode?: 'write_full_song' | 'edit';
}

export interface MinimaxLyricsResult {
  lyrics: string;
  songTitle?: string;
  styleTags?: string;
}

export interface MinimaxBinary {
  buffer: Buffer;
  mimeType: string;
}

export interface MinimaxClientErrorContext {
  endpoint: string;
  status?: number;
  statusCode?: number;
  retriable: boolean;
  message: string;
}

// i18n-ignore-end

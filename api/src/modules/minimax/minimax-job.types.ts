// i18n-ignore-start: provider adapter — internal types only.

export type MinimaxJobKind = 'video' | 'music';

export type MinimaxJobStatus =
  | 'pending'
  | 'submitted'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MinimaxJobTargetType =
  | 'channel_post'
  | 'moment_post'
  // BGM 子任务：视频生成完成后追加的纯器乐 music job，
  // 完成回调里用 ffmpeg 混入同一 moment_post 的视频文件。
  | 'moment_post_video_bgm'
  // wiki 私有角色「自然语言造视频」：生成只发生在 wiki 进程，
  // 完成回调写 CharacterVideoEntity 并推到 cloud-api 中心存储扇出。
  | 'wiki_character_video';

export interface MinimaxVideoJobInputPayload {
  kind: 'video';
  prompt: string;
  firstFrameImageUrl?: string;
  resolution?: '768P' | '1080P';
}

export interface MinimaxMusicJobInputPayload {
  kind: 'music';
  prompt?: string;
  lyrics?: string;
}

export type MinimaxJobInputPayload =
  | MinimaxVideoJobInputPayload
  | MinimaxMusicJobInputPayload;

// i18n-ignore-end

// 隐界 · Wiki 私有角色「自然语言造视频」+ 视频号跨-world 分发 的共享契约。
//
// 设计要点：
// - 用户在 wiki 上选自己的【私有角色】+ 一句自然语言 → MiniMax Hailuo 文生视频（9:16/6s）。
//   只有本人私有角色可创造，其他角色一律不允许（后端按 owner 校验）。
// - 视频「由该私有角色发布」：生成一次后扇出到所有【导入了该角色】的 world 视频号
//   （channels feed），可见性完全交给现有 feed 逻辑（只有拥有该角色的人能看到）。
// - 生成发生在 wiki 进程；ready 后把视频推到 cloud-api 中心存储，再扇出。

/** 视频生成任务状态（异步：前端轮询拿终态）。 */
export type CharacterVideoStatus = "generating" | "ready" | "failed";

/** 中心发布 / 扇出状态。 */
export type CharacterVideoPublishState =
  | "not_published"
  | "pending"
  | "published"
  | "failed";

/** 我的视频列表卡 / 详情视图。 */
export interface CharacterVideoView {
  id: string;
  /** 关联的私有角色 id（= 扇出登记键 sourceCharacterId）。 */
  privateCharacterId: string;
  characterName: string;
  characterAvatar: string;
  /** 用户输入的自然语言。 */
  prompt: string;
  status: CharacterVideoStatus;
  publishState: CharacterVideoPublishState;
  /** 生成完成后的可播放地址（wiki 本地相对路径，前端按自身 origin 拼）。 */
  videoUrl: string | null;
  coverUrl: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /wiki/my-character-videos 入参。 */
export interface CreateCharacterVideoInput {
  privateCharacterId: string;
  prompt: string;
}

/** 创建后立即返回（异步生成）。 */
export interface CharacterVideoEnqueueResult {
  videoId: string;
  status: "generating";
}

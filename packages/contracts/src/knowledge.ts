// 知识库（个人 context）契约。后端 owner-scoped 入口在 world :4100 的
// /api/knowledge/*（经 cloud-api 注入 x-cloud-user-phone 建租户帧）。
// owner   = 用户个人知识库（该 owner 全世界角色都能引用）
// character= 绑定到某角色的专业知识库
// global   = 平台预设专家共享库（admin 录入，跨 owner 只读）
export type KnowledgeScope = "owner" | "character" | "global";

export type KnowledgeSourceType =
  | "text"
  | "upload"
  | "url"
  | "world_content"
  | "wiki_recipe";

// pending=已落库待向量化；embedding=向量化中；ready=可召回；failed=向量化失败（词法兜底）。
export type KnowledgeDocumentStatus =
  | "pending"
  | "embedding"
  | "ready"
  | "failed";

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  scope: KnowledgeScope;
  characterId: string | null;
  sourceType: KnowledgeSourceType;
  status: string;
  chunkCount: number;
  charCount: number;
  embedded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListKnowledgeDocumentsParams {
  scope?: KnowledgeScope;
  characterId?: string;
}

export interface IngestKnowledgeTextRequest {
  title?: string;
  text: string;
}

export interface IngestKnowledgeUrlRequest {
  url: string;
  title?: string;
}

export interface ImportKnowledgeWorldMemoryResult {
  ingested: number;
  skipped: number;
}

// 平台运营态：录入全局预设知识（scope='global'，ownerId NULL）。仅 admin 入口。
export interface IngestGlobalKnowledgeRequest {
  title?: string;
  text: string;
  characterId?: string | null;
}

export interface DeleteKnowledgeDocumentResult {
  deleted: boolean;
}

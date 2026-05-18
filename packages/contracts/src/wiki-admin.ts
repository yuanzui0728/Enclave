// cloud-console "Wiki 用户" tab 用的 admin 接口契约。
// 服务端实现：api/src/modules/admin/wiki-users-admin.service.ts
// 代理实现：apps/cloud-api/src/admin/wiki-admin-proxy.service.ts
// 前端调用：apps/cloud-console/src/lib/cloud-admin-api.ts

export type WikiUserListQuery = {
  q?: string;
  page?: number;
  pageSize?: number;
};

export type WikiUserSummary = {
  id: string;
  username: string;
  email: string | null;
  role: string;
  userType: string;
  createdAt: string;
  roleGrantedAt: string | null;
  privateCharacterCount: number;
  editCount: number;
  approvedEditCount: number;
  revertedCount: number;
  lastEditAt: string | null;
};

export type WikiUserListResponse = {
  items: WikiUserSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type WikiPrivateCharacterDetail = {
  id: string;
  ownerUserId: string;
  name: string;
  avatar: string;
  bio: string;
  personality: string | null;
  relationship: string;
  relationshipType: string;
  expertDomains: string[];
  triggerScenes: string[] | null;
  recipe: unknown | null;
  profile: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export type WikiUserPrivateCharacterListResponse = {
  ownerUserId: string;
  username: string;
  items: WikiPrivateCharacterDetail[];
};

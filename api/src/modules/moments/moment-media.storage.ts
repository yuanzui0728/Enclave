import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  resolveApiPath,
  resolveOwnerDataPath,
  resolveSpecificOwnerDataPath,
} from '../../database/database-path';
import {
  GLOBAL_WORLD_OWNER_ID,
  isSharedWorldMode,
} from '../tenancy/tenant-context';

export function resolvePrimaryMomentMediaStorageDir() {
  // 共享模式 → <dataRoot>/owners/<ownerId>/moments-media；LPP → 扁平（每账号独立 root）。
  return resolveOwnerDataPath('moments-media');
}

export function resolveLegacyMomentMediaStorageDir() {
  return resolveApiPath('storage', 'moments-media');
}

// 全局共享池(global-world-owner)的媒体目录。该 owner 是「公共内容池」——其帖子对
// 所有租户可见（视频号/广场全局帖），故其媒体也必须对所有租户可读。这不是「跨到
// 另一个真实用户目录」（那才会串号），而是回退到公开池，安全。
export function resolveGlobalPoolMomentMediaStorageDir() {
  return resolveSpecificOwnerDataPath(GLOBAL_WORLD_OWNER_ID, 'moments-media');
}

export function resolveReadableMomentMediaPath(fileName: string) {
  // 共享模式：先在当前 owner 子树找；找不到再回退到【全局公共池】目录（仅此一个公开
  // owner，绝不回退到其他真实用户目录或扁平 legacy 目录 → 不串号）。这样全局池帖
  // (ownerId=global-world-owner)的视频/图片才能被所有租户播放/查看。
  const candidatePaths = isSharedWorldMode()
    ? [
        path.join(resolvePrimaryMomentMediaStorageDir(), fileName),
        path.join(resolveGlobalPoolMomentMediaStorageDir(), fileName),
      ]
    : [
        path.join(resolvePrimaryMomentMediaStorageDir(), fileName),
        path.join(resolveLegacyMomentMediaStorageDir(), fileName),
      ];

  return (
    candidatePaths.find((candidatePath) => existsSync(candidatePath)) ??
    candidatePaths[0]
  );
}

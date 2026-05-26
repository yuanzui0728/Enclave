import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  resolveApiPath,
  resolveOwnerDataPath,
} from '../../database/database-path';
import { isSharedWorldMode } from '../tenancy/tenant-context';

export function resolvePrimaryMomentMediaStorageDir() {
  // 共享模式 → <dataRoot>/owners/<ownerId>/moments-media；LPP → 扁平（每账号独立 root）。
  return resolveOwnerDataPath('moments-media');
}

export function resolveLegacyMomentMediaStorageDir() {
  return resolveApiPath('storage', 'moments-media');
}

export function resolveReadableMomentMediaPath(fileName: string) {
  // 共享模式只在当前 owner 子树找：绝不回退到扁平 legacy 目录（那是跨 owner 共享的，会串号）。
  const candidatePaths = isSharedWorldMode()
    ? [path.join(resolvePrimaryMomentMediaStorageDir(), fileName)]
    : [
        path.join(resolvePrimaryMomentMediaStorageDir(), fileName),
        path.join(resolveLegacyMomentMediaStorageDir(), fileName),
      ];

  return (
    candidatePaths.find((candidatePath) => existsSync(candidatePath)) ??
    candidatePaths[0]
  );
}

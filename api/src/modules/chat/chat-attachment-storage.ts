import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  resolveApiPath,
  resolveOwnerDataPath,
} from '../../database/database-path';
import { isSharedWorldMode } from '../tenancy/tenant-context';

export function resolvePrimaryChatAttachmentStorageDir() {
  // 共享模式 → owners/<ownerId>/chat-attachments；LPP → 扁平。
  return resolveOwnerDataPath('chat-attachments');
}

export function resolveLegacyChatAttachmentStorageDir() {
  return resolveApiPath('storage', 'chat-attachments');
}

export function resolveReadableChatAttachmentPath(fileName: string) {
  // 共享模式只在当前 owner 子树找；绝不回退扁平 legacy（跨 owner）。
  const candidatePaths = isSharedWorldMode()
    ? [path.join(resolvePrimaryChatAttachmentStorageDir(), fileName)]
    : [
        path.join(resolvePrimaryChatAttachmentStorageDir(), fileName),
        path.join(resolveLegacyChatAttachmentStorageDir(), fileName),
      ];

  return (
    candidatePaths.find((candidatePath) => existsSync(candidatePath)) ??
    candidatePaths[0]
  );
}

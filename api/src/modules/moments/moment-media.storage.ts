import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  resolveApiPath,
  resolveRepoPath,
} from '../../database/database-path';

export function resolvePrimaryMomentMediaStorageDir() {
  return resolveRepoPath('data', 'moments-media');
}

export function resolveLegacyMomentMediaStorageDir() {
  return resolveApiPath('storage', 'moments-media');
}

export function resolveReadableMomentMediaPath(fileName: string) {
  const candidatePaths = [
    path.join(resolvePrimaryMomentMediaStorageDir(), fileName),
    path.join(resolveLegacyMomentMediaStorageDir(), fileName),
  ];

  return (
    candidatePaths.find((candidatePath) => existsSync(candidatePath)) ??
    candidatePaths[0]
  );
}

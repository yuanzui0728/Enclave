import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import {
  isSharedWorldMode,
  TenantContextStore,
} from '../modules/tenancy/tenant-context';

const API_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(API_ROOT, '..');

type DatabaseFileCandidate = {
  path: string;
  mtimeMs: number;
  size: number;
  contentScore: number;
};

export function resolveApiPath(...segments: string[]) {
  return path.resolve(API_ROOT, ...segments);
}

export function resolveRepoPath(...segments: string[]) {
  return path.resolve(REPO_ROOT, ...segments);
}

export function resolveDataRoot() {
  const configured = process.env.YINJIE_DATA_ROOT?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(REPO_ROOT, configured);
  }
  return path.resolve(REPO_ROOT, 'data');
}

export function resolveDataPath(...segments: string[]) {
  return path.resolve(resolveDataRoot(), ...segments);
}

// 共享 world 多租户：媒体/文件按 owner 子目录隔离 —— <dataRoot>/owners/<ownerId>/<seg...>。
// LPP/wiki 透传到扁平 <dataRoot>/<seg...>（每账号独立 data root，行为逐字不变）。
// ownerId 从 ALS 租户帧取；shared 模式无帧即 fail-closed 抛 TENANT_CONTEXT_MISSING（绝不
// 把别人的媒体目录返给当前请求）。媒体存储/服务统一改走这个，避免全 owner 挤一个扁平目录
// 互相覆盖 / 跨用户取文件。delete process.env 不影响——纯读 env + ALS。
export function resolveOwnerDataPath(...segments: string[]) {
  if (!isSharedWorldMode()) return resolveDataPath(...segments);
  const ownerId = TenantContextStore.getOrThrow().ownerId;
  return resolveDataPath('owners', ownerId, ...segments);
}

// 显式指定 ownerId 的子目录解析（不依赖当前 ALS 租户帧）。仅用于「公开/全局池」
// 这类需要跨租户读取的固定 owner（如 global-world-owner 的公共媒体），调用方需自行
// 保证传入的是公开 owner，绝不可拿它去取某个真实用户的私有目录绕过租户隔离。
// LPP/wiki（非共享模式）回落到扁平 data root，与 resolveOwnerDataPath 行为一致。
export function resolveSpecificOwnerDataPath(
  ownerId: string,
  ...segments: string[]
) {
  if (!isSharedWorldMode()) return resolveDataPath(...segments);
  return resolveDataPath('owners', ownerId, ...segments);
}

export function resolveDatabasePath(configuredPath?: string | null) {
  const normalizedPath = configuredPath?.trim();
  if (normalizedPath) {
    return path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.resolve(REPO_ROOT, normalizedPath);
  }
  return resolveDataPath('database.sqlite');
}

function readDatabaseFileCandidate(filePath: string): DatabaseFileCandidate | null {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return null;
    }

    return {
      path: filePath,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
      contentScore: readDatabaseContentScore(filePath),
    };
  } catch {
    return null;
  }
}

function readDatabaseContentScore(filePath: string) {
  let database: Database.Database | null = null;

  try {
    database = new Database(filePath, {
      readonly: true,
      fileMustExist: true,
    });

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>;

    return tables.reduce((total, table) => {
      if (table.name === 'typeorm_metadata') {
        return total;
      }

      const escapedTableName = table.name.replace(/"/g, '""');
      const row = database!
        .prepare(`SELECT COUNT(*) AS count FROM "${escapedTableName}"`)
        .get() as { count: number };

      return total + row.count;
    }, 0);
  } catch {
    return 0;
  } finally {
    database?.close();
  }
}

function findPreferredDatabaseFile(paths: string[]) {
  return paths
    .map((filePath) => readDatabaseFileCandidate(filePath))
    .filter((candidate): candidate is DatabaseFileCandidate => candidate !== null)
    .sort((left, right) => {
      if (right.contentScore !== left.contentScore) {
        return right.contentScore - left.contentScore;
      }

      if (right.mtimeMs !== left.mtimeMs) {
        return right.mtimeMs - left.mtimeMs;
      }

      return right.size - left.size;
    })[0];
}

function copySidecarFile(sourcePath: string, targetPath: string, suffix: string) {
  const sourceSidecarPath = `${sourcePath}${suffix}`;
  if (!fs.existsSync(sourceSidecarPath)) {
    return;
  }

  fs.copyFileSync(sourceSidecarPath, `${targetPath}${suffix}`);
}

export function prepareDatabasePath(configuredPath?: string | null) {
  const targetPath = resolveDatabasePath(configuredPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  // Once the target database has any user data, it's the source of truth — never
  // overwrite it. Previously this function compared the target against legacy
  // single-tenant paths (`/data/database.sqlite`, `/api/database.sqlite`, ...)
  // by mtime+row-count and would copy whichever scored highest into the target.
  // In multi-tenant cloud mode that meant a per-account database (e.g.
  // `/data/accounts/<phone>/database.sqlite`) could get clobbered by a stale
  // legacy DB on every restart, wiping the user's comments / messages /
  // conversations / friendships — anything held in SQL.
  const targetCandidate = readDatabaseFileCandidate(targetPath);
  if (targetCandidate && targetCandidate.contentScore > 0) {
    return targetPath;
  }

  // Cloud multi-tenant mode: cloud-api spawns one child per phone with
  // YINJIE_DATA_ROOT=/data/accounts/<phone>. A "fresh" account must start
  // empty — adopting /data/database.sqlite (legacy single-tenant DB) here
  // means every new world inherits the same 28 seed messages / characters /
  // users / conversations, and in the admin console it looks like worlds
  // are sharing chat history. Skip the legacy fallback whenever
  // YINJIE_DATA_ROOT is set; TypeORM synchronize will build an empty schema.
  if (process.env.YINJIE_DATA_ROOT?.trim()) {
    return targetPath;
  }

  // Single-tenant / dev mode without YINJIE_DATA_ROOT: keep the one-time
  // bootstrap so a fresh account dir can adopt existing data from legacy paths.
  const legacyCandidatePaths = Array.from(
    new Set([
      resolveApiPath('database.sqlite'),
      resolveApiPath('data', 'database.sqlite'),
      path.resolve(REPO_ROOT, 'data', 'database.sqlite'),
    ]),
  ).filter((candidatePath) => candidatePath !== targetPath);

  const preferredDatabaseFile = findPreferredDatabaseFile(legacyCandidatePaths);
  if (!preferredDatabaseFile || preferredDatabaseFile.contentScore <= 0) {
    return targetPath;
  }

  // If the source is in WAL mode, fold any pending frames into the main DB
  // before we file-copy it, so the legacy `-wal` sidecar isn't needed to read
  // the snapshot we just took. Failure is non-fatal (we still copy sidecars).
  try {
    const src = new Database(preferredDatabaseFile.path);
    try {
      src.pragma('wal_checkpoint(TRUNCATE)');
    } finally {
      src.close();
    }
  } catch (err) {
    console.warn('[database] pre-bootstrap checkpoint failed (continuing):', err);
  }

  fs.copyFileSync(preferredDatabaseFile.path, targetPath);
  copySidecarFile(preferredDatabaseFile.path, targetPath, '-journal');
  copySidecarFile(preferredDatabaseFile.path, targetPath, '-wal');
  copySidecarFile(preferredDatabaseFile.path, targetPath, '-shm');

  const sourceLabel = path.relative(REPO_ROOT, preferredDatabaseFile.path) || preferredDatabaseFile.path;
  const targetLabel = path.relative(REPO_ROOT, targetPath) || targetPath;
  console.info(`[database] bootstrapped empty target from ${sourceLabel} to ${targetLabel}`);

  return targetPath;
}

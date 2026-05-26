import { Column, PrimaryColumn } from 'typeorm';
import { isSharedWorldMode } from './tenant-context';

// 模式感知的 owner 归属列。
//
// shared 模式：把 owner 列声明为**复合主键的一部分**（DB 已由迁移 step1b 建成
// (ownerId, <原 id>) 复合主键）。这样 TypeORM 的 save()/存在性检查/delete(entity) 都用
// 完整复合主键定位行 —— 固定/模板 id（char-default-self、direct_<charId>、模板播种而
// 跨租户重复的 ai_relationships / character_friendships id 等）就不会被某个租户的
// `repo.save(loadedRow)` 按 `UPDATE ... WHERE id=?` 误命中并覆盖其他租户的同 id 行
// （那是比读泄漏更糟的数据损坏）。
//
// LPP / wiki / 迁移 prep 模式：保持普通列（单 id 主键不变），行为与今天逐字一致；存量
// 单库下该列保持 NULL、被忽略。
//
// ⚠️ 依赖装饰期的 MAIN_MODE：实体文件被 import 时就读 isSharedWorldMode() 决定主键形状。
// nodenext/ESM 下 import 求值早于模块体语句，所以 shared 进程必须由最先被 import 的
// `shared-world-mode.ts` 把 MAIN_MODE 设好；LPP/prep 进程不设（prep 脚本显式清除）。
export function applyOwnerIdColumn(
  prototype: object,
  propertyName: string,
  options: { name?: string; type?: 'text' | 'varchar'; nullable?: boolean } = {},
): void {
  const type = options.type ?? 'text';
  if (isSharedWorldMode()) {
    // 复合主键的一部分：name 透传（如 conversations 的 ownerId 落在列 userId）。
    PrimaryColumn({ type, name: options.name })(prototype, propertyName);
  } else {
    Column({ type, name: options.name, nullable: options.nullable ?? true })(
      prototype,
      propertyName,
    );
  }
}

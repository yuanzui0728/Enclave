import type {
  DeepPartial,
  DeleteResult,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
  SelectQueryBuilder,
  UpdateResult,
} from 'typeorm';
import { isSharedWorldMode, TenantContextStore } from './tenant-context';

// 包一层 TypeORM Repository，把当前租户的 ownerId 自动并进 where / 自动盖到写入行。
// 新加 ownerId 的表 (characters / feed / moments / messages / groups …) 的查询本来
// 不按 owner 过滤 (靠 DB 物理隔离)，迁到共享库后必须经此包装层，避免「忘了写
// WHERE ownerId」直接读到别人数据。已带 ownerId 且查询已显式过滤的存量表可不强制改。
//
// **模式感知**：仅在 shared 模式注入/盖 ownerId。LPP / wiki 进程是单 owner 独占库，
// 此包装层完全透传（不过滤、不盖章），行为与今天逐字一致——所以 service 可以放心地把
// 裸 repo 换成 scoped(repo)，对存量每用户进程零影响；存量库刚加的 nullable ownerId 列
// 在 LPP 下保持 NULL、被忽略。
//
// 用法：service 里经 TenantService.scoped(repo) 取。shared 模式下读上下文用 fail-closed
// 的 getOrThrow——没有租户帧宁可抛 TENANT_CONTEXT_MISSING，绝不静默查全库。
export class TenantRepository<T extends ObjectLiteral> {
  constructor(private readonly repo: Repository<T>) {}

  get inner(): Repository<T> {
    return this.repo;
  }

  private get passthrough(): boolean {
    return !isSharedWorldMode();
  }

  private ownerId(): string {
    return TenantContextStore.getOrThrow().ownerId;
  }

  private mergeWhere(
    where?: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  ): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    const ownerId = this.ownerId();
    if (!where) {
      return { ownerId } as unknown as FindOptionsWhere<T>;
    }
    if (Array.isArray(where)) {
      return where.map((clause) => ({
        ...clause,
        ownerId,
      })) as FindOptionsWhere<T>[];
    }
    return { ...where, ownerId } as FindOptionsWhere<T>;
  }

  find(options?: FindManyOptions<T>): Promise<T[]> {
    if (this.passthrough) return this.repo.find(options);
    return this.repo.find({ ...options, where: this.mergeWhere(options?.where) });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    if (this.passthrough) return this.repo.findOne(options);
    return this.repo.findOne({ ...options, where: this.mergeWhere(options.where) });
  }

  findOneBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null> {
    if (this.passthrough) return this.repo.findOneBy(where);
    return this.repo.findOneBy(this.mergeWhere(where));
  }

  findBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
    if (this.passthrough) return this.repo.findBy(where);
    return this.repo.findBy(this.mergeWhere(where));
  }

  count(options?: FindManyOptions<T>): Promise<number> {
    if (this.passthrough) return this.repo.count(options);
    return this.repo.count({ ...options, where: this.mergeWhere(options?.where) });
  }

  update(
    where: FindOptionsWhere<T>,
    partial: Parameters<Repository<T>['update']>[1],
  ): Promise<UpdateResult> {
    if (this.passthrough) return this.repo.update(where, partial);
    return this.repo.update(this.mergeWhere(where) as FindOptionsWhere<T>, partial);
  }

  delete(where: FindOptionsWhere<T>): Promise<DeleteResult> {
    if (this.passthrough) return this.repo.delete(where);
    return this.repo.delete(this.mergeWhere(where) as FindOptionsWhere<T>);
  }

  // 写入：shared 模式盖上当前租户 ownerId 再存（subscriber 还会再校验一致性）；
  // LPP 透传，ownerId 列保持 NULL 不影响单库逻辑。
  create(entityLike: DeepPartial<T>): T {
    if (this.passthrough) return this.repo.create(entityLike);
    return this.repo.create({ ...entityLike, ownerId: this.ownerId() } as DeepPartial<T>);
  }

  save(entity: DeepPartial<T>): Promise<T> {
    if (this.passthrough) return this.repo.save(entity);
    return this.repo.save({ ...entity, ownerId: this.ownerId() } as DeepPartial<T>);
  }

  // 需要复杂查询时用：shared 模式自动 andWhere ownerId；LPP 透传返回裸 builder。
  createScopedQueryBuilder(alias: string): SelectQueryBuilder<T> {
    const qb = this.repo.createQueryBuilder(alias);
    if (this.passthrough) return qb;
    return qb.andWhere(`${alias}.ownerId = :__tenantOwnerId`, {
      __tenantOwnerId: this.ownerId(),
    });
  }
}

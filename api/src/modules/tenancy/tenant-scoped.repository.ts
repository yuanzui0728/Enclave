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
import { TenantContextStore } from './tenant-context';

// 包一层 TypeORM Repository，把当前租户的 ownerId 自动并进 where / 自动盖到写入行。
// 新加 ownerId 的表 (characters / feed / moments / messages / groups …) 的查询本来
// 不按 owner 过滤 (靠 DB 物理隔离)，迁到共享库后必须经此包装层，避免「忘了写
// WHERE ownerId」直接读到别人数据。已带 ownerId 且查询已显式过滤的存量表可不强制改。
//
// 用法：在 service 里把 @InjectRepository(X) repo 包成 new TenantRepository(repo)，
// 或经 TenantService.scoped(repo) 取。读上下文用 fail-closed 的 getOrThrow——
// 没有租户帧时宁可抛 TENANT_CONTEXT_MISSING，不静默查全库。
export class TenantRepository<T extends ObjectLiteral> {
  constructor(private readonly repo: Repository<T>) {}

  get inner(): Repository<T> {
    return this.repo;
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
    return this.repo.find({ ...options, where: this.mergeWhere(options?.where) });
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.repo.findOne({ ...options, where: this.mergeWhere(options.where) });
  }

  findOneBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T | null> {
    return this.repo.findOneBy(this.mergeWhere(where));
  }

  findBy(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<T[]> {
    return this.repo.findBy(this.mergeWhere(where));
  }

  count(options?: FindManyOptions<T>): Promise<number> {
    return this.repo.count({ ...options, where: this.mergeWhere(options?.where) });
  }

  update(
    where: FindOptionsWhere<T>,
    partial: Parameters<Repository<T>['update']>[1],
  ): Promise<UpdateResult> {
    return this.repo.update(this.mergeWhere(where) as FindOptionsWhere<T>, partial);
  }

  delete(where: FindOptionsWhere<T>): Promise<DeleteResult> {
    return this.repo.delete(this.mergeWhere(where) as FindOptionsWhere<T>);
  }

  // 写入：盖上当前租户 ownerId 再存。subscriber 还会再校验一次一致性。
  create(entityLike: DeepPartial<T>): T {
    return this.repo.create({ ...entityLike, ownerId: this.ownerId() } as DeepPartial<T>);
  }

  save(entity: DeepPartial<T>): Promise<T> {
    return this.repo.save({ ...entity, ownerId: this.ownerId() } as DeepPartial<T>);
  }

  // 需要复杂查询时用：自动 andWhere ownerId，调用方继续链式补条件。
  createScopedQueryBuilder(alias: string): SelectQueryBuilder<T> {
    return this.repo
      .createQueryBuilder(alias)
      .andWhere(`${alias}.ownerId = :__tenantOwnerId`, {
        __tenantOwnerId: this.ownerId(),
      });
  }
}

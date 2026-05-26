// 标记哪些实体是「租户级」(按 ownerId 隔离)。TenantRepository 与
// TenantOwnershipSubscriber 共用这一份注册表作为唯一真相来源：
//   - 写入时自动盖 ownerId / 校验归属
//   - CI 静态守卫 (check-unscoped-queries) 据此判断哪些表的裸查询要拦
//
// 已带 ownerId 的存量实体与本轮新加 ownerId 的实体都应注册。真·全局表
// (inference 目录 / games 目录 / official-account 文章本体等) 不注册。
const TENANT_SCOPED_ENTITIES = new Set<Function>();

// 既支持装饰器写法 @TenantScoped()，也支持在 app.module 集中 register（避免改 93 个
// 实体文件、且让注册表在不 import 实体类时也能被 CI 脚本读到一份静态清单）。
export function TenantScoped(): ClassDecorator {
  return (target) => {
    TENANT_SCOPED_ENTITIES.add(target);
  };
}

export function registerTenantScopedEntity(target: Function): void {
  TENANT_SCOPED_ENTITIES.add(target);
}

export function isTenantScopedEntity(target: Function | undefined | null): boolean {
  if (!target) return false;
  return TENANT_SCOPED_ENTITIES.has(target);
}

export function listTenantScopedEntities(): Function[] {
  return [...TENANT_SCOPED_ENTITIES];
}

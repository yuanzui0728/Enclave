import { AsyncLocalStorage } from 'node:async_hooks';

// 共享 world 进程多租户的请求级身份载体。每个 HTTP 请求 / WS 事件 / cron per-owner
// 迭代 / 后台 job 都在一个 TenantContext 帧里跑，下游 service 通过它拿「当前是哪个
// 用户」，而不再依赖「一个进程只服务一个 owner」的物理隔离。
export interface TenantContext {
  ownerId: string;
  phone: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const TenantContextStore = {
  run<T>(ctx: TenantContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): TenantContext | undefined {
    return storage.getStore();
  },
  // fail-closed：拿不到上下文宁可抛错，绝不静默回退到「第一个 owner」（那会串号）。
  getOrThrow(): TenantContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error('TENANT_CONTEXT_MISSING');
    }
    return ctx;
  },
};

// 共享 world 运行模式开关。main-shared-world.ts 启动时设 MAIN_MODE='shared-world'；
// LPP 每用户进程（默认 main.ts）/ wiki 进程不设此值，行为完全不变。
export function isSharedWorldMode(): boolean {
  return process.env.MAIN_MODE === 'shared-world';
}

// 「世界居民」全局共享池的保留哨兵 owner。广场动态（feed surface='feed'）里 preset 角色
// 的公开帖 + 角色间 AI 互动都写在这个 owner 名下，所有真实用户（含新用户）读路径 union
// 进来 → 全员看到同一份历史。固定保留串（绝不用 randomUUID），且绝不进 listTenantOwners()
// （否则 per-owner cron 会把它当普通用户跑一遍）。
//   - 读：afterLoad 读守卫放行该 ownerId 的行（世界居民内容本就全员可读）
//   - 写：只能由「全局帧」(runForOwner(GLOBAL_WORLD_OWNER_ID)) 写；用户帧改/删全局行仍被写守卫拦
export const GLOBAL_WORLD_OWNER_ID = 'global-world-owner';
// 哨兵 owner 的占位 phone：永远不是真实 cloud phone。subscription 对它短路成 active，
// 避免 lookup 落空 → fallback hardBlock 把全局生成挡住。
export const GLOBAL_WORLD_OWNER_PHONE = '__global_world__';

export function isGlobalWorldOwner(ownerId?: string | null): boolean {
  return ownerId === GLOBAL_WORLD_OWNER_ID;
}

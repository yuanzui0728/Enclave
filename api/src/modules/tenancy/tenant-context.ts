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

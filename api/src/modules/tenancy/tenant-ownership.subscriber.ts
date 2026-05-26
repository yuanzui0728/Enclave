import { Logger } from '@nestjs/common';
import {
  EntitySubscriberInterface,
  EventSubscriber,
  type InsertEvent,
  type LoadEvent,
  type RemoveEvent,
  type UpdateEvent,
} from 'typeorm';
import { isSharedWorldMode, TenantContextStore } from './tenant-context';
import { isTenantScopedEntity } from './tenant-scoped.decorator';

// 写入侧的纵深防御：兜住绕过 TenantRepository 的裸 manager.save / 级联写。
//   - beforeInsert：租户实体缺 ownerId 就用当前上下文盖章；已有则校验一致。
//   - beforeUpdate / beforeRemove：断言被改/删的行属于当前 owner，挡跨租户写。
// 只在 shared 模式生效；LPP / wiki 进程没有 TenantContext，整段 no-op，行为不变。
// 读漏 WHERE 这层兜不住（select 不触发 subscriber）—— 那靠 TenantRepository 自动
// 注入 + CI 静态守卫 + 双租户 leak 测试三层堵。
@EventSubscriber()
export class TenantOwnershipSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(TenantOwnershipSubscriber.name);

  // 读取侧 fail-closed 安全网：shared 模式下，任何被加载的租户实体若 ownerId 与当前
  // 租户不符，直接抛 —— 把「忘了写 WHERE ownerId 的查询读到别人数据」从静默泄漏变成
  // 响亮的错误。配合 leak 测试，逐个 service 的读查询改写就变成「修被它拦下来的查询」，
  // 而不是盲目审计上百处。NULL ownerId（理论上 shared 库新数据不会有）放行，避免误伤
  // 偶发的全局种子行。
  afterLoad(
    entity: Record<string, unknown>,
    event?: LoadEvent<Record<string, unknown>>,
  ): void {
    if (!isSharedWorldMode()) return;
    if (!event || !isTenantScopedEntity(event.metadata.target as Function)) return;
    const ctx = TenantContextStore.get();
    if (!ctx) return;
    if (!entity) return;
    const owned = entity['ownerId'];
    if (owned !== undefined && owned !== null && owned !== ctx.ownerId) {
      throw new Error(
        `TENANT_READ_LEAK entity=${event.metadata.name} row=${String(owned)} ctx=${ctx.ownerId}`,
      );
    }
  }

  beforeInsert(event: InsertEvent<Record<string, unknown>>): void {
    if (!isSharedWorldMode()) return;
    if (!isTenantScopedEntity(event.metadata.target as Function)) return;
    const entity = event.entity;
    if (!entity) return;

    const ctx = TenantContextStore.get();
    const current = entity['ownerId'];
    if (current === undefined || current === null || current === '') {
      if (!ctx) {
        // shared 模式下往租户表写但没上下文 = 来源不明，必须挡住而不是猜 owner。
        throw new Error(
          `TENANT_WRITE_WITHOUT_CONTEXT entity=${event.metadata.name}`,
        );
      }
      entity['ownerId'] = ctx.ownerId;
      return;
    }
    if (ctx && current !== ctx.ownerId) {
      throw new Error(
        `TENANT_WRITE_OWNER_MISMATCH entity=${event.metadata.name} row=${String(current)} ctx=${ctx.ownerId}`,
      );
    }
  }

  beforeUpdate(event: UpdateEvent<Record<string, unknown>>): void {
    if (!isSharedWorldMode()) return;
    if (!isTenantScopedEntity(event.metadata.target as Function)) return;
    const ctx = TenantContextStore.get();
    if (!ctx) return;
    // databaseEntity 是改前从库里 load 的旧值；它的 ownerId 才是权威归属。
    const owned = event.databaseEntity?.['ownerId'] ?? event.entity?.['ownerId'];
    if (owned !== undefined && owned !== null && owned !== ctx.ownerId) {
      throw new Error(
        `TENANT_UPDATE_OWNER_MISMATCH entity=${event.metadata.name} row=${String(owned)} ctx=${ctx.ownerId}`,
      );
    }
  }

  beforeRemove(event: RemoveEvent<Record<string, unknown>>): void {
    if (!isSharedWorldMode()) return;
    if (!isTenantScopedEntity(event.metadata.target as Function)) return;
    const ctx = TenantContextStore.get();
    if (!ctx) return;
    const owned = event.databaseEntity?.['ownerId'] ?? event.entity?.['ownerId'];
    if (owned !== undefined && owned !== null && owned !== ctx.ownerId) {
      throw new Error(
        `TENANT_REMOVE_OWNER_MISMATCH entity=${event.metadata.name} row=${String(owned)} ctx=${ctx.ownerId}`,
      );
    }
  }
}

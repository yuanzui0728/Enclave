import { TenantOwnershipSubscriber } from './tenant-ownership.subscriber';
import { TenantContextStore } from './tenant-context';
import {
  isTenantScopedEntity,
  registerTenantScopedEntity,
} from './tenant-scoped.decorator';
import { registerAllScopedEntities } from './scoped-entities';
import { FriendshipEntity } from '../social/friendship.entity';
import { ConversationEntity } from '../chat/conversation.entity';
import { CharacterEntity } from '../characters/character.entity';

// 一个用于测试的、确定被注册为 scoped 的实体类。
class ScopedThing {
  ownerId?: string | null;
  id?: string;
}
registerTenantScopedEntity(ScopedThing);

// 一个明确不注册的全局实体。
class GlobalThing {
  id?: string;
}

function insertEvent(entity: object, target: Function, name = target.name) {
  return {
    entity,
    metadata: { target, name },
  } as never;
}

describe('scoped entity registry', () => {
  it('registers the 30 already-ownerId entities', () => {
    registerAllScopedEntities();
    expect(isTenantScopedEntity(FriendshipEntity)).toBe(true);
    expect(isTenantScopedEntity(ConversationEntity)).toBe(true);
  });

  it('does NOT register tables that still need ownerId (characters)', () => {
    registerAllScopedEntities();
    // characters 复合主键 + ownerId 迁移尚未做，暂不登记，避免 subscriber 误盖到无列实体。
    expect(isTenantScopedEntity(CharacterEntity)).toBe(false);
    expect(isTenantScopedEntity(GlobalThing)).toBe(false);
  });
});

describe('TenantOwnershipSubscriber (shared mode)', () => {
  const originalMode = process.env.MAIN_MODE;
  const subscriber = new TenantOwnershipSubscriber();

  beforeEach(() => {
    process.env.MAIN_MODE = 'shared-world';
  });
  afterEach(() => {
    if (originalMode === undefined) delete process.env.MAIN_MODE;
    else process.env.MAIN_MODE = originalMode;
  });

  it('stamps ownerId from context on insert when absent', () => {
    const entity: { ownerId?: string | null } = {};
    TenantContextStore.run({ ownerId: 'owner-A', phone: 'pa' }, () => {
      subscriber.beforeInsert(insertEvent(entity, ScopedThing));
    });
    expect(entity.ownerId).toBe('owner-A');
  });

  it('throws on insert to a scoped table without context', () => {
    const entity: { ownerId?: string | null } = {};
    expect(() =>
      subscriber.beforeInsert(insertEvent(entity, ScopedThing)),
    ).toThrow(/TENANT_WRITE_WITHOUT_CONTEXT/);
  });

  it('throws when insert ownerId mismatches context owner', () => {
    const entity = { ownerId: 'owner-B' };
    TenantContextStore.run({ ownerId: 'owner-A', phone: 'pa' }, () => {
      expect(() =>
        subscriber.beforeInsert(insertEvent(entity, ScopedThing)),
      ).toThrow(/TENANT_WRITE_OWNER_MISMATCH/);
    });
  });

  it('ignores non-scoped (global) entities entirely', () => {
    const entity: { ownerId?: string | null } = {};
    // 无上下文也不抛——全局表不归 subscriber 管。
    expect(() =>
      subscriber.beforeInsert(insertEvent(entity, GlobalThing)),
    ).not.toThrow();
    expect(entity.ownerId).toBeUndefined();
  });

  it('is a complete no-op outside shared mode', () => {
    delete process.env.MAIN_MODE;
    const entity: { ownerId?: string | null } = {};
    // LPP 模式：即便是 scoped 实体、即便无上下文，也不盖、不抛。
    expect(() =>
      subscriber.beforeInsert(insertEvent(entity, ScopedThing)),
    ).not.toThrow();
    expect(entity.ownerId).toBeUndefined();
  });
});

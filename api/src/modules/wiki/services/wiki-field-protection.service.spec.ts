import { AppError } from '../../../common/app-error.exception';
import { WikiFieldProtectionService } from './wiki-field-protection.service';
import type { WikiFieldProtectionEntity } from '../entities/wiki-field-protection.entity';

function makeSvc(rows: Partial<WikiFieldProtectionEntity>[]) {
  const repo = {
    find: jest.fn().mockResolvedValue(rows),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((x) => x),
    update: jest.fn(),
    delete: jest.fn(),
  };
  return new WikiFieldProtectionService(repo as never);
}

describe('WikiFieldProtectionService', () => {
  it('blocks newcomer from editing prompting.coreLogic when global rule requires autoconfirmed', async () => {
    const svc = makeSvc([
      {
        characterId: '*',
        fieldPath: 'prompting.coreLogic',
        minRoleToEdit: 'autoconfirmed',
      },
    ]);
    await expect(
      svc.assertCanEditPaths(
        { id: 'u1', role: 'newcomer', username: 'n' } as never,
        'char_x',
        ['prompting.coreLogic'],
      ),
    ).rejects.toThrow(AppError);
  });

  it('allows autoconfirmed when rule says autoconfirmed', async () => {
    const svc = makeSvc([
      {
        characterId: '*',
        fieldPath: 'prompting.coreLogic',
        minRoleToEdit: 'autoconfirmed',
      },
    ]);
    await expect(
      svc.assertCanEditPaths(
        { id: 'u1', role: 'autoconfirmed', username: 'a' } as never,
        'char_x',
        ['prompting.coreLogic'],
      ),
    ).resolves.toBeUndefined();
  });

  it('character-specific rule overrides global', async () => {
    const svc = makeSvc([
      {
        characterId: '*',
        fieldPath: 'prompting.coreLogic',
        minRoleToEdit: 'autoconfirmed',
      },
      {
        characterId: 'char_x',
        fieldPath: 'prompting.coreLogic',
        minRoleToEdit: 'admin',
      },
    ]);
    await expect(
      svc.assertCanEditPaths(
        { id: 'u1', role: 'patroller', username: 'p' } as never,
        'char_x',
        ['prompting.coreLogic'],
      ),
    ).rejects.toThrow(AppError);
  });

  it('matches subpaths (changed = parent of protected)', async () => {
    const svc = makeSvc([
      {
        characterId: '*',
        fieldPath: 'prompting.scenePrompts.chat',
        minRoleToEdit: 'patroller',
      },
    ]);
    await expect(
      svc.assertCanEditPaths(
        { id: 'u1', role: 'autoconfirmed', username: 'a' } as never,
        'char_x',
        ['prompting'], // higher-level path encompassing protected one
      ),
    ).rejects.toThrow(AppError);
  });

  it('does nothing when no policies match', async () => {
    const svc = makeSvc([
      { characterId: '*', fieldPath: 'tone.workStyle', minRoleToEdit: 'admin' },
    ]);
    await expect(
      svc.assertCanEditPaths(
        { id: 'u1', role: 'newcomer', username: 'n' } as never,
        'char_x',
        ['identity.name'],
      ),
    ).resolves.toBeUndefined();
  });
});

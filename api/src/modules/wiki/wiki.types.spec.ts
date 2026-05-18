// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import { AppError } from '../../common/app-error.exception';
import {
  WIKI_CONTENT_SCHEMA_VERSION,
  WIKI_REJECTED_FIELDS,
  assertWikiEditSummary,
  assertWikiNameNotVisuallyEmpty,
  isHighRiskRecipeChange,
  isNameVisuallyEmpty,
  pickWikiContent,
  resolveMinorEdit,
  snapshotFromCharacter,
  snapshotFromRecipe,
  createDefaultWikiRecipe,
} from './wiki.types';

describe('isHighRiskRecipeChange', () => {
  it('marks identity.background as high-risk (legacy core_logic injection)', () => {
    const report = isHighRiskRecipeChange(['identity.background']);
    expect(report.highRisk).toBe(true);
    expect(report.reasons).toContain('identity.background');
  });

  it('marks identity.motivation and identity.worldview as high-risk', () => {
    expect(isHighRiskRecipeChange(['identity.motivation']).highRisk).toBe(true);
    expect(isHighRiskRecipeChange(['identity.worldview']).highRisk).toBe(true);
  });

  it('keeps identity.name / avatar / bio / occupation as low-risk (content channel)', () => {
    const report = isHighRiskRecipeChange([
      'identity.name',
      'identity.avatar',
      'identity.bio',
      'identity.relationship',
      'identity.relationshipType',
      'identity.occupation',
    ]);
    expect(report.highRisk).toBe(false);
    expect(report.reasons).toEqual([]);
  });

  it('marks any prompting / memorySeed / tone / lifeStrategy paths as high-risk', () => {
    expect(
      isHighRiskRecipeChange(['prompting.scenePrompts.chat']).highRisk,
    ).toBe(true);
    expect(isHighRiskRecipeChange(['memorySeed.coreMemory']).highRisk).toBe(
      true,
    );
    expect(isHighRiskRecipeChange(['tone.emotionalTone']).highRisk).toBe(true);
    expect(
      isHighRiskRecipeChange(['lifeStrategy.activityFrequency']).highRisk,
    ).toBe(true);
  });

  it('marks realityLink subpaths as high-risk', () => {
    expect(isHighRiskRecipeChange(['realityLink']).highRisk).toBe(true);
    expect(isHighRiskRecipeChange(['realityLink.source']).highRisk).toBe(true);
  });

  it('returns empty reasons when only low-risk paths changed', () => {
    expect(isHighRiskRecipeChange([]).highRisk).toBe(false);
    expect(
      isHighRiskRecipeChange(['identity.name']).reasons,
    ).toEqual([]);
  });

  it('aggregates multiple high-risk reasons', () => {
    const report = isHighRiskRecipeChange([
      'identity.motivation',
      'prompting.coreLogic',
      'identity.name',
    ]);
    expect(report.highRisk).toBe(true);
    expect(report.reasons).toEqual([
      'identity.motivation',
      'prompting.coreLogic',
    ]);
  });
});

describe('pickWikiContent', () => {
  it('rejects D/E class fields with AppError', () => {
    for (const field of WIKI_REJECTED_FIELDS) {
      expect(() =>
        pickWikiContent({
          name: 'X',
          avatar: 'a',
          bio: 'b',
          relationship: 'r',
          relationshipType: 'rt',
          expertDomains: [],
          [field]: 'leak',
        }),
      ).toThrow(AppError);
    }
  });

  it('passes when only A class fields are present', () => {
    const out = pickWikiContent({
      name: 'X',
      avatar: 'a',
      bio: 'b',
      personality: 'p',
      relationship: 'r',
      relationshipType: 'rt',
      expertDomains: ['d1'],
      triggerScenes: ['s1'],
    });
    expect(out.schemaVersion).toBe(WIKI_CONTENT_SCHEMA_VERSION);
    expect(out.name).toBe('X');
    expect(out.expertDomains).toEqual(['d1']);
    expect(out.triggerScenes).toEqual(['s1']);
  });

  it('treats undefined rejected fields as absent (not present in input)', () => {
    expect(() =>
      pickWikiContent({
        name: 'X',
        avatar: 'a',
        bio: 'b',
        relationship: 'r',
        relationshipType: 'rt',
        expertDomains: [],
        modelRoutingMode: undefined,
      }),
    ).not.toThrow();
  });
});

describe('snapshotFromCharacter', () => {
  it('strips D/E fields silently (internal path, not user input)', () => {
    const snap = snapshotFromCharacter({
      id: 'char_1',
      name: 'N',
      avatar: 'a',
      bio: 'b',
      relationship: 'r',
      relationshipType: 'rt',
      expertDomains: [],
      isOnline: true,
      modelRoutingMode: 'override',
      sourceType: 'manual_admin',
    });
    expect(snap.schemaVersion).toBe(WIKI_CONTENT_SCHEMA_VERSION);
    expect(snap.name).toBe('N');
    expect(Object.keys(snap)).not.toContain('isOnline');
    expect(Object.keys(snap)).not.toContain('modelRoutingMode');
  });
});

describe('assertWikiEditSummary', () => {
  it('requires ≥10 chars for create operation', () => {
    expect(() =>
      assertWikiEditSummary({
        operation: 'create',
        riskLevel: 'high',
        revisionKind: 'recipe',
        summary: '',
      }),
    ).toThrow(AppError);
    expect(() =>
      assertWikiEditSummary({
        operation: 'create',
        riskLevel: 'high',
        revisionKind: 'recipe',
        summary: '太短',
      }),
    ).toThrow(AppError);
    expect(() =>
      assertWikiEditSummary({
        operation: 'create',
        riskLevel: 'high',
        revisionKind: 'recipe',
        summary: '创建一个全新的角色词条',
      }),
    ).not.toThrow();
  });

  it('requires ≥10 chars for high-risk edits', () => {
    expect(() =>
      assertWikiEditSummary({
        operation: 'edit',
        riskLevel: 'high',
        revisionKind: 'recipe',
        summary: '',
      }),
    ).toThrow(AppError);
  });

  it('requires ≥10 chars for lifecycle ops', () => {
    expect(() =>
      assertWikiEditSummary({
        operation: 'soft_delete',
        riskLevel: 'high',
        revisionKind: 'lifecycle',
        summary: '想删',
      }),
    ).toThrow(AppError);
  });

  it('does not require summary for low-risk content edits', () => {
    expect(() =>
      assertWikiEditSummary({
        operation: 'edit',
        riskLevel: 'low',
        revisionKind: 'content',
        summary: '',
      }),
    ).not.toThrow();
  });

  it('treats whitespace-only summary as empty', () => {
    expect(() =>
      assertWikiEditSummary({
        operation: 'create',
        riskLevel: 'high',
        revisionKind: 'recipe',
        summary: '          ',
      }),
    ).toThrow(AppError);
  });
});

describe('resolveMinorEdit', () => {
  // newcomer=0, autoconfirmed=1
  it('returns false when input is undefined or false', () => {
    expect(resolveMinorEdit(undefined, 5, 1)).toBe(false);
    expect(resolveMinorEdit(false, 5, 1)).toBe(false);
  });

  it('returns true only when role rank ≥ autoconfirmed rank', () => {
    expect(resolveMinorEdit(true, 0, 1)).toBe(false); // newcomer
    expect(resolveMinorEdit(true, 1, 1)).toBe(true); // autoconfirmed
    expect(resolveMinorEdit(true, 2, 1)).toBe(true); // patroller
  });

  it('returns false for unknown role (rank -1)', () => {
    expect(resolveMinorEdit(true, -1, 1)).toBe(false);
  });
});

describe('snapshotFromRecipe', () => {
  it('produces a snapshot with schemaVersion stamped', () => {
    const recipe = createDefaultWikiRecipe({
      name: 'R',
      avatar: 'a',
      bio: 'b',
      relationship: '友',
      relationshipType: 'friend',
    });
    const snap = snapshotFromRecipe(recipe);
    expect(snap.schemaVersion).toBe(WIKI_CONTENT_SCHEMA_VERSION);
    expect(snap.name).toBe('R');
  });
});

// 2026-05-15 走查发现：createPage / submit / submitRecipeEdit 三条路径都漏 ZWS-only
// 名校验，导致 curl 可起一条「未命名角色」占位词条或把已发布角色 name 改成空白行。
// 私有角色那侧 2026-05-15 v2/v3 走查已修，这里把规则抽到 wiki.types.ts 并由三个写入
// 路径统一调用，锁一组 spec 防回归。
describe('isNameVisuallyEmpty', () => {
  it('returns true for empty / whitespace / ZWS-only inputs', () => {
    expect(isNameVisuallyEmpty('')).toBe(true);
    expect(isNameVisuallyEmpty('   ')).toBe(true);
    expect(isNameVisuallyEmpty('\t \n')).toBe(true);
    // U+200B / U+200C / U+200D / U+FEFF / U+2060
    expect(isNameVisuallyEmpty('​‌‍')).toBe(true);
    expect(isNameVisuallyEmpty('﻿⁠')).toBe(true);
    // Consecutive ZWS chars with no whitespace in between still strip to empty.
    expect(isNameVisuallyEmpty('​​‌‌‍‍')).toBe(true);
  });

  it('returns false when any visible char remains', () => {
    expect(isNameVisuallyEmpty('a')).toBe(false);
    expect(isNameVisuallyEmpty(' A ')).toBe(false);
    // ZWS jammed into a real name should still count as a real name.
    expect(isNameVisuallyEmpty('A​B')).toBe(false);
    expect(isNameVisuallyEmpty('阿巡')).toBe(false);
    expect(isNameVisuallyEmpty('🌙')).toBe(false);
  });
});

describe('assertWikiNameNotVisuallyEmpty', () => {
  it('throws WIKI_VALIDATION_FAILED with "name 不能为空" for visually-empty inputs', () => {
    for (const value of ['', '  ', '​‌‍']) {
      let caught: unknown;
      try {
        assertWikiNameNotVisuallyEmpty(value);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AppError);
      const body = (caught as AppError).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('WIKI_VALIDATION_FAILED');
      expect(body.legacyMessage).toBe('name 不能为空');
    }
  });

  it('does not throw for any visibly non-empty input', () => {
    expect(() => assertWikiNameNotVisuallyEmpty('阿巡')).not.toThrow();
    expect(() => assertWikiNameNotVisuallyEmpty(' A ')).not.toThrow();
    expect(() => assertWikiNameNotVisuallyEmpty('A​B')).not.toThrow();
  });
});
// i18n-ignore-end

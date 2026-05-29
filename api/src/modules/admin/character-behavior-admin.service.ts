// i18n-ignore-start: 平台运营后台，非终端用户可见 UI。
import { BadRequestException, Injectable } from '@nestjs/common';
import type { PersonalityProfile } from '../ai/ai.types';
import { CharactersService } from '../characters/characters.service';
import { CharacterBehaviorBlueprintService } from '../characters/character-behavior-blueprint.service';
import type { CharacterBehaviorDefinition } from '../characters/character-behavior-blueprint.types';

export interface CharacterBehaviorCatalogItem {
  blueprintKey: string;
  sourceType: string | null;
  sourceKey: string | null;
  name: string;
  avatar: string | null;
  // code-seed 默认行为（从预设 profile 抽出）；编辑器未保存前展示这份。
  codeSeedDefault: CharacterBehaviorDefinition;
  // 平台是否已显式编辑过该角色行为（蓝图键已存在）。
  hasBlueprint: boolean;
  blueprint: CharacterBehaviorDefinition | null;
}

export interface CharacterBehaviorOverview {
  catalog: CharacterBehaviorCatalogItem[];
}

@Injectable()
export class CharacterBehaviorAdminService {
  constructor(
    private readonly blueprintService: CharacterBehaviorBlueprintService,
    private readonly charactersService: CharactersService,
  ) {}

  // 预设/系统种子角色目录（去重 blueprintKey）。私有 wiki 角色不在此列（resolveBlueprintKey 返回 null）。
  private buildCatalogBase(): Omit<
    CharacterBehaviorCatalogItem,
    'hasBlueprint' | 'blueprint'
  >[] {
    const presets = this.charactersService.listPresetCatalog();
    const seen = new Set<string>();
    const out: Omit<
      CharacterBehaviorCatalogItem,
      'hasBlueprint' | 'blueprint'
    >[] = [];
    for (const char of presets) {
      const key = this.blueprintService.resolveBlueprintKey(char);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        blueprintKey: key,
        sourceType: char.sourceType ?? null,
        sourceKey: char.sourceKey ?? null,
        name: char.name,
        avatar: char.avatar ?? null,
        codeSeedDefault: this.blueprintService.extractBlueprintFromProfile(
          char.profile as PersonalityProfile | null | undefined,
        ),
      });
    }
    return out;
  }

  async getOverview(): Promise<CharacterBehaviorOverview> {
    const blueprints = await this.blueprintService.getBlueprints();
    const catalog: CharacterBehaviorCatalogItem[] = this.buildCatalogBase().map(
      (item) => ({
        ...item,
        hasBlueprint: Boolean(blueprints[item.blueprintKey]),
        blueprint: blueprints[item.blueprintKey] ?? null,
      }),
    );
    return { catalog };
  }

  // 单个 blueprintKey 的 code-seed 默认值（供「恢复默认」按钮，不落库）。
  getSeedDefault(blueprintKey: string): {
    blueprintKey: string;
    codeSeedDefault: CharacterBehaviorDefinition | null;
  } {
    const item = this.buildCatalogBase().find(
      (c) => c.blueprintKey === blueprintKey,
    );
    return {
      blueprintKey,
      codeSeedDefault: item ? item.codeSeedDefault : null,
    };
  }

  async putBlueprint(
    blueprintKey: string,
    definition: CharacterBehaviorDefinition,
  ): Promise<CharacterBehaviorDefinition> {
    const key = blueprintKey?.trim();
    if (!key) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: 'BLUEPRINT_KEY_REQUIRED',
        message: 'blueprintKey is required.',
      });
    }
    // 只允许给目录里真实存在的预设角色写蓝图（防写脏键）。
    const exists = this.buildCatalogBase().some((c) => c.blueprintKey === key);
    if (!exists) {
      throw new BadRequestException({
        statusCode: 400,
        errorCode: 'BLUEPRINT_KEY_UNKNOWN',
        message: `Unknown blueprint key: ${key}`,
      });
    }
    return this.blueprintService.setBlueprint(key, definition ?? {});
  }

  // 删除蓝图 = 该角色回落 code-seed / per-owner profile（恢复默认）。
  async deleteBlueprint(blueprintKey: string): Promise<{ ok: true }> {
    const key = blueprintKey?.trim();
    if (key) {
      await this.blueprintService.deleteBlueprint(key);
    }
    return { ok: true };
  }
}
// i18n-ignore-end

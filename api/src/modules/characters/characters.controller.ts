import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { CharactersService } from './characters.service';
import { CharacterEntity } from './character.entity';
import { AdminGuard } from '../admin/admin.guard';

@Controller('characters')
export class CharactersController {
  constructor(private readonly charactersService: CharactersService) {}

  @Get()
  findAll() {
    return this.charactersService.findAllVisibleToOwner();
  }

  @Get('preset-catalog')
  listPresetCatalog() {
    return this.charactersService.listPresetCatalog();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const char =
      (await this.charactersService.findById(id)) ??
      (await this.charactersService.ensurePresetCharacterInstalled(id));
    if (!char)
      throw new AppError('CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { id },
        legacyMessage: `Character ${id} not found`,
      });
    return char;
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(@Body() body: Partial<CharacterEntity>) {
    const char = {
      ...body,
      id: body.id ?? `char_${Date.now()}`,
    } as CharacterEntity;
    await this.charactersService.upsert(char);
    return char;
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  async update(@Param('id') id: string, @Body() body: Partial<CharacterEntity>) {
    const existing = await this.charactersService.findById(id);
    if (!existing)
      throw new AppError('CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { id },
        legacyMessage: `Character ${id} not found`,
      });
    // 后台不允许改变历史角色的 sourceType——不同 sourceType 走的运行时分支不同
    // （wechat_import/preset_catalog 等强绑定 import 流程），改错会让删除策略、
    // 校验、迁移路径全部错位。
    const sanitized = { ...body };
    if (
      sanitized.sourceType != null &&
      sanitized.sourceType !== existing.sourceType
    ) {
      delete sanitized.sourceType;
    }
    const updated = { ...existing, ...sanitized, id } as CharacterEntity;
    await this.charactersService.upsert(updated);
    return updated;
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  async remove(@Param('id') id: string) {
    await this.charactersService.delete(id);
    return { success: true };
  }

  // 用户可切换某角色的"默认用语音回复"开关。
  // 开启后所有 assistant 回复都自动转 TTS（受 speech-02-hd token plan 配额节流）。
  // 不挂 guard：跟 social.controller 的 setFriendStarred/updateFriendProfile
  // 等用户级 toggle 保持一致；多租户隔离由 nginx + 端口分配那一层负责，
  // 本地单机模式下根本不发 Authorization Bearer，挂 JwtAuthGuard 会 401。
  @Patch(':id/default-voice-reply')
  async setDefaultVoiceReply(
    @Param('id') id: string,
    @Body() body: { enabled: boolean },
  ) {
    const existing = await this.charactersService.findById(id);
    if (!existing) {
      throw new AppError('CHARACTER_NOT_FOUND', {
        status: HttpStatus.NOT_FOUND,
        params: { id },
        legacyMessage: `Character ${id} not found`,
      });
    }
    existing.defaultVoiceReply = Boolean(body?.enabled);
    await this.charactersService.upsert(existing);
    return { id, defaultVoiceReply: existing.defaultVoiceReply };
  }

  /**
   * Tenant-facing 导入端点：接收 wiki "我的私有角色" 导出 JSON，按 name upsert
   * 到 characters 表，并自动为 world-owner 建 friendship。
   * 同名→覆盖（仅限 sourceType='private_import' 的旧记录）；不存在→新建。
   *
   * 不挂 JwtAuthGuard / PrivateCharacterRateLimitGuard：world API 是单租户
   * 进程，与 social.controller / setDefaultVoiceReply 等用户级 mutation 一致，
   * 隔离靠 nginx + 端口分配。多租户公网部署时 cloud-api 反代会把客户端的
   * Authorization 剥掉（避免泄漏给 child world），所以这条路径根本拿不到
   * JWT，挂 JwtAuthGuard 必 401。RateLimitGuard 同样依赖 req.user，会跟着 401。
   * 滥用防护可在 cloud-api 反代层（已知 cloud phone）按需补，不在这一层做。
   */
  @Post('import-personal')
  async importPersonal(@Body() body: unknown) {
    const parsed = parsePrivateCharacterImportBody(body);
    type ServiceInput = Parameters<
      CharactersService['importPersonalCharacter']
    >[0];
    return this.charactersService.importPersonalCharacter({
      ...parsed,
      recipe: parsed.recipe as ServiceInput['recipe'],
      profile: parsed.profile as ServiceInput['profile'],
    });
  }
}

const PRIVATE_CHARACTER_EXPORT_SCHEMA = 'yinjie-private-character/v1' as const;

function parsePrivateCharacterImportBody(payload: unknown): {
  name: string;
  avatar?: string;
  bio?: string;
  personality?: string | null;
  relationship?: string;
  relationshipType?: string;
  expertDomains?: string[];
  triggerScenes?: string[] | null;
  recipe?: unknown;
  profile?: unknown;
  isOnline?: boolean;
  onlineMode?: string;
  activityMode?: string;
  currentActivity?: string | null;
  sourceType?: string;
  sourceKey?: string | null;
  deletionPolicy?: string;
  isTemplate?: boolean;
  socialOpenness?: string;
  proactiveBrowseChance?: number;
  intimacyLevel?: number;
  aiRelationships?:
    | { characterId: string; relationshipType: string; strength: number }[]
    | null;
} {
  if (!payload || typeof payload !== 'object') {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: '导入内容不是合法 JSON。',
    });
  }
  // 第 5 次走查 R4：typeof [] === 'object'，所以 Array 在前面那条 if 里溜过去。
  // 走 `const p = ... as Record`，下游读 p.name 取到 undefined，于是 400 报
  // "缺少 name 字段" ——用户看着 bundle 里明明就有 name 完全摸不到头脑，
  // 真实问题是 bundle 被错误地 wrap 成 array（典型来源：从某个 list endpoint
  // 复制 JSON 时连 [...] 一起拿过来了）。提前 reject 给一条更准确的提示。
  if (Array.isArray(payload)) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage:
        '导入内容必须是 JSON 对象（一个角色 bundle），而不是数组。请去掉外层的 [...]。',
    });
  }
  const p = payload as Record<string, unknown>;
  const schema = typeof p.$schema === 'string' ? p.$schema : null;
  if (schema && schema !== PRIVATE_CHARACTER_EXPORT_SCHEMA) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: `不支持的 schema：${schema}`,
    });
  }
  const name = typeof p.name === 'string' ? p.name.trim() : '';
  if (!name) {
    throw new AppError('PRIVATE_IMPORT_INVALID', {
      status: HttpStatus.BAD_REQUEST,
      legacyMessage: '导入文件缺少 name 字段。',
    });
  }
  // 缺失字段一律返回 undefined（不返回 null/空），由 service 决定是否跳过。
  // 这样 round-trip 后 bundle 里没写的字段不会把已存在角色的字段清空。
  return {
    name,
    avatar: typeof p.avatar === 'string' ? p.avatar : undefined,
    bio: typeof p.bio === 'string' ? p.bio : undefined,
    personality: typeof p.personality === 'string' ? p.personality : undefined,
    relationship:
      typeof p.relationship === 'string' ? p.relationship : undefined,
    relationshipType:
      typeof p.relationshipType === 'string' ? p.relationshipType : undefined,
    expertDomains: Array.isArray(p.expertDomains)
      ? (p.expertDomains as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : undefined,
    triggerScenes: Array.isArray(p.triggerScenes)
      ? (p.triggerScenes as unknown[]).filter(
          (x): x is string => typeof x === 'string',
        )
      : undefined,
    // typeof [] === 'object'，要再排掉 Array；否则 {"recipe":[1,2,3]} /
    // {"profile":[1,2,3]} 会被当成合法 object 存进去，下游读 .xxx 会炸。
    recipe:
      p.recipe && typeof p.recipe === 'object' && !Array.isArray(p.recipe)
        ? p.recipe
        : undefined,
    profile:
      p.profile && typeof p.profile === 'object' && !Array.isArray(p.profile)
        ? p.profile
        : undefined,
    isOnline: typeof p.isOnline === 'boolean' ? p.isOnline : undefined,
    onlineMode: typeof p.onlineMode === 'string' ? p.onlineMode : undefined,
    activityMode:
      typeof p.activityMode === 'string' ? p.activityMode : undefined,
    currentActivity:
      typeof p.currentActivity === 'string' ? p.currentActivity : undefined,
    sourceType: typeof p.sourceType === 'string' ? p.sourceType : undefined,
    sourceKey: typeof p.sourceKey === 'string' ? p.sourceKey : undefined,
    deletionPolicy:
      typeof p.deletionPolicy === 'string' ? p.deletionPolicy : undefined,
    isTemplate: typeof p.isTemplate === 'boolean' ? p.isTemplate : undefined,
    socialOpenness:
      typeof p.socialOpenness === 'string' ? p.socialOpenness : undefined,
    proactiveBrowseChance:
      typeof p.proactiveBrowseChance === 'number'
        ? p.proactiveBrowseChance
        : undefined,
    intimacyLevel:
      typeof p.intimacyLevel === 'number' ? p.intimacyLevel : undefined,
    aiRelationships: Array.isArray(p.aiRelationships)
      ? (p.aiRelationships as unknown[])
          .filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === 'object' && !Array.isArray(item),
          )
          .map((it) => ({
            characterId: String(it.characterId ?? '').trim(),
            relationshipType:
              typeof it.relationshipType === 'string'
                ? it.relationshipType
                : 'friend',
            strength:
              typeof it.strength === 'number' && Number.isFinite(it.strength)
                ? Math.max(0, Math.min(1, it.strength))
                : 0.5,
          }))
          .filter((rel) => rel.characterId.length > 0)
      : undefined,
  };
}

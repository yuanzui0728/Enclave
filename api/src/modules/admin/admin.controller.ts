import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CharacterEntity } from '../characters/character.entity';
import { CharacterBlueprintService } from '../characters/character-blueprint.service';
import { ReplyLogicAdminService } from './reply-logic-admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly replyLogicAdminService: ReplyLogicAdminService,
    private readonly characterBlueprintService: CharacterBlueprintService,
  ) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('system')
  getSystem() {
    return this.adminService.getSystemInfo();
  }

  @Get('config')
  getConfig() {
    return this.adminService.getConfig();
  }

  @Patch('config')
  setConfig(@Body() body: { key: string; value: string }) {
    return this.adminService.setConfig(body.key, body.value);
  }

  @Get('characters')
  getCharacters() {
    return this.adminService.findAllCharacters();
  }

  @Post('characters')
  createCharacter(@Body() body: Partial<CharacterEntity>) {
    return this.adminService.createCharacter(body);
  }

  @Patch('characters/:id')
  updateCharacter(@Param('id') id: string, @Body() body: Partial<CharacterEntity>) {
    return this.adminService.updateCharacter(id, body);
  }

  @Delete('characters/:id')
  deleteCharacter(@Param('id') id: string) {
    return this.adminService.deleteCharacter(id);
  }

  @Get('characters/:id/factory')
  getCharacterFactory(@Param('id') id: string) {
    return this.characterBlueprintService.getFactorySnapshot(id);
  }

  @Patch('characters/:id/factory')
  updateCharacterFactory(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.characterBlueprintService.updateDraft(
      id,
      body as Parameters<CharacterBlueprintService['updateDraft']>[1],
    );
  }

  @Post('characters/:id/factory/publish')
  publishCharacterFactory(
    @Param('id') id: string,
    @Body() body?: { summary?: string | null },
  ) {
    return this.characterBlueprintService.publish(id, body?.summary);
  }

  @Get('characters/:id/factory/revisions')
  listCharacterFactoryRevisions(@Param('id') id: string) {
    return this.characterBlueprintService.listRevisions(id);
  }

  @Post('characters/:id/factory/revisions/:revisionId/restore')
  restoreCharacterFactoryRevision(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
  ) {
    return this.characterBlueprintService.restoreRevisionToDraft(
      id,
      revisionId,
    );
  }

  @Get('reply-logic/overview')
  getReplyLogicOverview() {
    return this.replyLogicAdminService.getOverview();
  }

  @Get('reply-logic/rules')
  getReplyLogicRules() {
    return this.replyLogicAdminService.getRuntimeRules();
  }

  @Patch('reply-logic/rules')
  setReplyLogicRules(@Body() body: Record<string, unknown>) {
    return this.replyLogicAdminService.setRuntimeRules(body);
  }

  @Get('reply-logic/characters/:id')
  getReplyLogicCharacter(@Param('id') id: string) {
    return this.replyLogicAdminService.getCharacterSnapshot(id);
  }

  @Get('reply-logic/conversations/:id')
  getReplyLogicConversation(@Param('id') id: string) {
    return this.replyLogicAdminService.getConversationSnapshot(id);
  }
}

import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CharacterEntity } from '../characters/character.entity';
import { ReplyLogicAdminService } from './reply-logic-admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly replyLogicAdminService: ReplyLogicAdminService,
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

  @Get('reply-logic/overview')
  getReplyLogicOverview() {
    return this.replyLogicAdminService.getOverview();
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

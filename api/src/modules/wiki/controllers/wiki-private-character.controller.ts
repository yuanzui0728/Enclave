import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { WikiPrivateCharacterService } from '../services/wiki-private-character.service';
import type { PrivateCharacterDto } from '../services/wiki-private-character.service';

@Controller('wiki/my-characters')
@UseGuards(JwtAuthGuard)
export class WikiPrivateCharacterController {
  constructor(private readonly service: WikiPrivateCharacterService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForOwner(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: PrivateCharacterDto,
  ) {
    return this.service.create(user.id, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.service.getById(user.id, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PrivateCharacterDto,
  ) {
    return this.service.update(user.id, id, body);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.service.delete(user.id, id);
    return { success: true };
  }

  @Get(':id/export')
  @Header('Content-Type', 'application/json; charset=utf-8')
  async exportOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: false }) res: Response,
  ) {
    const record = await this.service.getById(user.id, id);
    const bundle = this.service.toExportBundle(record, user.id);
    const safeName = record.name.replace(/[\\/:*?"<>|\r\n\t]+/g, '_').slice(
      0,
      80,
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(safeName || 'character')}.character.json"`,
    );
    res.send(JSON.stringify(bundle, null, 2));
  }

  @Post('import')
  async importOne(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    const dto = this.service.parseImportBundle(body);
    const before = await this.service.listForOwner(user.id);
    const overwrote = before.some((r) => r.name === dto.name);
    const saved = await this.service.upsertByName(user.id, dto);
    return { record: saved, overwrote };
  }
}

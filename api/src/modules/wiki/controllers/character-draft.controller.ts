// i18n-ignore-start: backend controller, errors are domain codes (not user-facing zh strings).
import {
  Controller,
  Delete,
  Get,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { CharacterDraftService } from '../services/character-draft.service';

@Controller('wiki/my-drafts')
@UseGuards(JwtAuthGuard)
export class CharacterDraftController {
  constructor(private readonly service: CharacterDraftService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listByOwner(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.getById(user.id, id);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.service.delete(user.id, id);
    return { success: true };
  }
}
// i18n-ignore-end

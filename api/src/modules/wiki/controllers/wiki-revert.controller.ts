import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { RequireRole } from '../decorators/require-role.decorator';
import { WikiRoleGuard } from '../guards/wiki-role.guard';
import { WikiReviewService } from '../services/wiki-review.service';

@Controller('wiki/pages')
@UseGuards(JwtAuthGuard, WikiRoleGuard)
export class WikiRevertController {
  constructor(private readonly review: WikiReviewService) {}

  @Post(':id/revert')
  @RequireRole('patroller')
  revert(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { toRevisionId: string; reason: string },
  ) {
    return this.review.revert(id, user, body);
  }
}

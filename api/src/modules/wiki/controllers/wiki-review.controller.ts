import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import {
  JwtAuthGuard,
  type AuthenticatedUser,
} from '../../auth/jwt-auth.guard';
import { RequireRole } from '../decorators/require-role.decorator';
import { WikiRoleGuard } from '../guards/wiki-role.guard';
import { WikiReviewService } from '../services/wiki-review.service';

@Controller('wiki')
@UseGuards(JwtAuthGuard, WikiRoleGuard)
export class WikiReviewController {
  constructor(private readonly review: WikiReviewService) {}

  @Get('pending-reviews')
  @RequireRole('patroller')
  list(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.review.listPending(limit);
  }

  @Post('edits/:revisionId/review')
  @RequireRole('patroller')
  decide(
    @Param('revisionId') revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { decision: 'approve' | 'reject' | 'request_changes'; note?: string },
  ) {
    return this.review.decide(revisionId, user, body);
  }
}

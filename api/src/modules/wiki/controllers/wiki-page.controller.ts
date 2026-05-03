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
import { WikiEditService } from '../services/wiki-edit.service';
import { WikiPageService } from '../services/wiki-page.service';

@Controller('wiki')
export class WikiPageController {
  constructor(
    private readonly pages: WikiPageService,
    private readonly edits: WikiEditService,
  ) {}

  @Get('recent-changes')
  recentChanges(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('onlyUnpatrolled') onlyUnpatrolled?: string,
  ) {
    return this.pages.listRecentChanges({
      limit,
      onlyUnpatrolled:
        onlyUnpatrolled === '1' || onlyUnpatrolled === 'true',
    });
  }

  @Get('pages/:id')
  view(@Param('id') id: string) {
    return this.pages.getPageView(id);
  }

  @Get('pages/:id/history')
  history(
    @Param('id') id: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.pages.getHistory(id, limit);
  }

  @Get('pages/:id/revisions/:revisionId')
  revision(@Param('revisionId') revisionId: string) {
    return this.pages.getRevisionOrThrow(revisionId);
  }

  @Post('pages/:id/edits')
  @UseGuards(JwtAuthGuard)
  submit(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      contentSnapshot: Record<string, unknown>;
      baseRevisionId?: string | null;
      editSummary?: string;
      isMinor?: boolean;
    },
  ) {
    return this.edits.submit(id, user, body);
  }
}

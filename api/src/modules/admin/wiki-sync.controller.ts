// i18n-ignore-start: admin-only API, returns JSON for the cloud console.
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { WikiSyncAdminService } from './wiki-sync-admin.service';
import type {
  WikiSyncApplyRequest,
  WikiSyncImportRequest,
  WikiSyncPreviewFilter,
} from './wiki-sync.types';

@Controller('admin/characters/wiki-sync')
@UseGuards(AdminGuard)
export class WikiSyncController {
  constructor(private readonly wikiSyncAdminService: WikiSyncAdminService) {}

  @Get('preview')
  previewWikiSync(
    @Query('characterId') characterId?: string,
    @Query('filter') filter?: string,
  ) {
    const allowed: WikiSyncPreviewFilter[] = ['drift', 'all', 'wiki_only'];
    const safeFilter: WikiSyncPreviewFilter | undefined =
      filter && (allowed as string[]).includes(filter)
        ? (filter as WikiSyncPreviewFilter)
        : undefined;
    return this.wikiSyncAdminService.preview({
      characterId: characterId?.trim() || undefined,
      filter: safeFilter,
    });
  }

  @Post('apply')
  applyWikiSync(@Body() body: WikiSyncApplyRequest) {
    return this.wikiSyncAdminService.applyBatch(body);
  }

  @Post('import-missing')
  importMissingFromWiki(@Body() body: WikiSyncImportRequest) {
    return this.wikiSyncAdminService.importMissing(body);
  }
}
// i18n-ignore-end

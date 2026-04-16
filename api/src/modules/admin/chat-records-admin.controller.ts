import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { ChatRecordsAdminService } from './chat-records-admin.service';

@Controller('admin/chat-records')
@UseGuards(AdminGuard)
export class ChatRecordsAdminController {
  constructor(
    private readonly chatRecordsAdminService: ChatRecordsAdminService,
  ) {}

  @Get('overview')
  getOverview() {
    return this.chatRecordsAdminService.getOverview();
  }

  @Get('conversations')
  listConversations(
    @Query()
    query: {
      characterId?: string;
      includeHidden?: string;
      dateFrom?: string;
      dateTo?: string;
      activityWindow?: string;
      sortBy?: string;
      page?: number | string;
      pageSize?: number | string;
    },
  ) {
    return this.chatRecordsAdminService.listConversations(query);
  }

  @Get('conversations/:id')
  getConversationDetail(
    @Param('id') id: string,
    @Query('includeClearedHistory') includeClearedHistory?: string,
  ) {
    return this.chatRecordsAdminService.getConversationDetail(id, {
      includeClearedHistory,
    });
  }

  @Get('conversations/:id/messages')
  getConversationMessages(
    @Param('id') id: string,
    @Query()
    query: {
      cursor?: string;
      limit?: number | string;
      aroundMessageId?: string;
      before?: number | string;
      after?: number | string;
      includeClearedHistory?: string;
    },
  ) {
    return this.chatRecordsAdminService.getConversationMessages(id, query);
  }

  @Get('conversations/:id/search')
  searchConversationMessages(
    @Param('id') id: string,
    @Query()
    query: {
      keyword?: string;
      category?: string;
      messageType?: string;
      senderId?: string;
      dateFrom?: string;
      dateTo?: string;
      cursor?: string;
      limit?: number | string;
      includeClearedHistory?: string;
    },
  ) {
    return this.chatRecordsAdminService.searchConversationMessages(id, query);
  }

  @Get('conversations/:id/token-usage')
  getConversationTokenUsage(@Param('id') id: string) {
    return this.chatRecordsAdminService.getConversationTokenUsage(id);
  }
}

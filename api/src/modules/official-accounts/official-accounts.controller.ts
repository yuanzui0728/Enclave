import { Controller, Get, Param, Post } from '@nestjs/common';
import { OfficialAccountsService } from './official-accounts.service';

@Controller('official-accounts')
export class OfficialAccountsController {
  constructor(
    private readonly officialAccountsService: OfficialAccountsService,
  ) {}

  @Get()
  listAccounts() {
    return this.officialAccountsService.listAccounts();
  }

  @Get('articles/:articleId')
  getArticle(@Param('articleId') articleId: string) {
    return this.officialAccountsService.getArticle(articleId);
  }

  @Get('message-entries')
  getMessageEntries() {
    return this.officialAccountsService.getMessageEntries();
  }

  @Get('subscription-inbox')
  getSubscriptionInbox() {
    return this.officialAccountsService.getSubscriptionInbox();
  }

  @Get('service-conversations')
  getServiceConversations() {
    return this.officialAccountsService.getServiceConversations();
  }

  @Post('subscription-inbox/read')
  markSubscriptionInboxRead() {
    return this.officialAccountsService.markSubscriptionInboxRead();
  }

  @Post('deliveries/:deliveryId/read')
  markDeliveryRead(@Param('deliveryId') deliveryId: string) {
    return this.officialAccountsService.markDeliveryRead(deliveryId);
  }

  @Post('articles/:articleId/read')
  markArticleRead(@Param('articleId') articleId: string) {
    return this.officialAccountsService.markArticleRead(articleId);
  }

  @Get(':id/articles')
  listAccountArticles(@Param('id') id: string) {
    return this.officialAccountsService.listAccountArticles(id);
  }

  @Get(':id/service-messages')
  getServiceMessages(@Param('id') id: string) {
    return this.officialAccountsService.getServiceMessages(id);
  }

  @Post(':id/service-messages/read')
  markServiceMessagesRead(@Param('id') id: string) {
    return this.officialAccountsService.markServiceMessagesRead(id);
  }

  @Get(':id')
  getAccount(@Param('id') id: string) {
    return this.officialAccountsService.getAccount(id);
  }

  @Post(':id/follow')
  follow(@Param('id') id: string) {
    return this.officialAccountsService.followAccount(id);
  }

  @Post(':id/unfollow')
  unfollow(@Param('id') id: string) {
    return this.officialAccountsService.unfollowAccount(id);
  }
}

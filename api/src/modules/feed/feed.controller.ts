import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  getFeed(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('surface') surface: 'feed' | 'channels' | undefined,
  ) {
    return this.feedService.getFeed(Number(page), Number(limit), surface);
  }

  @Get(':id')
  getPost(@Param('id') id: string) {
    return this.feedService.getPostWithComments(id);
  }

  @Post()
  createPost(
    @Body()
    body: {
      text: string;
      mediaType?: 'text' | 'image' | 'video';
      mediaUrl?: string;
      surface?: 'feed' | 'channels';
    },
  ) {
    return this.feedService.createOwnerPost(body.text, {
      mediaType: body.mediaType,
      mediaUrl: body.mediaUrl,
      surface: body.surface,
    });
  }

  @Post('channels/generate')
  generateChannelPost() {
    return this.feedService.generateChannelPost();
  }

  @Post(':id/comment')
  addComment(
    @Param('id') postId: string,
    @Body() body: { text: string },
  ) {
    return this.feedService.addOwnerComment(postId, body.text);
  }

  @Post(':id/like')
  likePost(@Param('id') postId: string) {
    return this.feedService.likeOwnerPost(postId);
  }
}

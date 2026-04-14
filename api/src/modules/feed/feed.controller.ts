import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get('channels/home')
  getChannelHome(
    @Query('section')
    section: 'recommended' | 'friends' | 'following' | 'live' | undefined,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.feedService.getChannelHome({
      section,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('channels/authors/:authorId')
  getChannelAuthor(@Param('authorId') authorId: string) {
    return this.feedService.getChannelAuthorProfile(authorId);
  }

  @Post('channels/authors/:authorId/follow')
  followChannelAuthor(@Param('authorId') authorId: string) {
    return this.feedService.followChannelAuthor(authorId);
  }

  @Delete('channels/authors/:authorId/follow')
  unfollowChannelAuthor(@Param('authorId') authorId: string) {
    return this.feedService.unfollowChannelAuthor(authorId);
  }

  @Get()
  getFeed(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('surface') surface: 'feed' | 'channels' | undefined,
  ) {
    return this.feedService.getFeed(Number(page), Number(limit), surface);
  }

  @Post()
  createPost(
    @Body()
    body: {
      text: string;
      title?: string;
      mediaType?: 'text' | 'image' | 'video';
      mediaUrl?: string;
      coverUrl?: string;
      durationMs?: number;
      aspectRatio?: number;
      topicTags?: string[];
      surface?: 'feed' | 'channels';
    },
  ) {
    return this.feedService.createOwnerPost(body.text, {
      title: body.title,
      mediaType: body.mediaType,
      mediaUrl: body.mediaUrl,
      coverUrl: body.coverUrl,
      durationMs: body.durationMs,
      aspectRatio: body.aspectRatio,
      topicTags: body.topicTags,
      surface: body.surface,
    });
  }

  @Post('channels/generate')
  generateChannelPost() {
    return this.feedService.generateChannelPost();
  }

  @Get(':id/comments')
  getFeedComments(@Param('id') postId: string) {
    return this.feedService.getComments(postId);
  }

  @Get(':id')
  getPost(@Param('id') id: string) {
    return this.feedService.getPostWithComments(id);
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

  @Post(':id/favorite')
  favoritePost(@Param('id') postId: string) {
    return this.feedService.favoriteOwnerPost(postId);
  }

  @Delete(':id/favorite')
  unfavoritePost(@Param('id') postId: string) {
    return this.feedService.unfavoriteOwnerPost(postId);
  }

  @Post(':id/share')
  sharePost(
    @Param('id') postId: string,
    @Body() body: { channel?: 'native' | 'copy' | 'system' | 'unknown' },
  ) {
    return this.feedService.shareOwnerPost(postId, body.channel);
  }

  @Post(':id/view')
  viewPost(
    @Param('id') postId: string,
    @Body() body: { progressSeconds?: number; completed?: boolean },
  ) {
    return this.feedService.viewOwnerPost(postId, body);
  }

  @Post(':id/not-interested')
  markNotInterested(@Param('id') postId: string) {
    return this.feedService.markOwnerPostNotInterested(postId);
  }

  @Post('comments/:id/like')
  likeComment(@Param('id') commentId: string) {
    return this.feedService.likeOwnerComment(commentId);
  }

  @Post('comments/:id/reply')
  replyComment(
    @Param('id') commentId: string,
    @Body() body: { text: string },
  ) {
    return this.feedService.replyToComment(commentId, body.text);
  }
}

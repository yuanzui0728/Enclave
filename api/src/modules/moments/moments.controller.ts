import { Controller, Get, Post, Param, Body, Query } from '@nestjs/common';
import { MomentsService } from './moments.service';

@Controller('moments')
export class MomentsController {
  constructor(private readonly momentsService: MomentsService) {}

  @Get()
  getFeed(@Query('authorId') authorId?: string) {
    if (authorId) return this.momentsService.getFeedByAuthor(authorId);
    return this.momentsService.getFeed();
  }

  @Post('user-post')
  createUserMoment(@Body() body: { userId: string; authorName: string; authorAvatar: string; text: string }) {
    return this.momentsService.createUserMoment(body.userId, body.authorName, body.authorAvatar, body.text);
  }

  @Get(':id')
  getPost(@Param('id') id: string) {
    return this.momentsService.getPost(id);
  }

  @Post('generate/:characterId')
  generateForCharacter(@Param('characterId') characterId: string) {
    return this.momentsService.generateMomentForCharacter(characterId);
  }

  @Post('generate-all')
  generateAll() {
    return this.momentsService.generateAllMoments();
  }

  @Post(':id/comment')
  addComment(
    @Param('id') postId: string,
    @Body() body: { authorId: string; authorName: string; authorAvatar: string; text: string },
  ) {
    return this.momentsService.addComment(postId, body.authorId, body.authorName, body.authorAvatar, body.text, 'user');
  }

  @Post(':id/like')
  toggleLike(
    @Param('id') postId: string,
    @Body() body: { authorId: string; authorName: string; authorAvatar: string },
  ) {
    return this.momentsService.toggleLike(postId, body.authorId, body.authorName, body.authorAvatar, 'user');
  }
}

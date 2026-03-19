import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('friend-requests')
  getPendingRequests(@Query('userId') userId: string) {
    return this.socialService.getPendingRequests(userId);
  }

  @Post('friend-requests/:id/accept')
  acceptRequest(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.socialService.acceptRequest(id, body.userId);
  }

  @Post('friend-requests/:id/decline')
  declineRequest(@Param('id') id: string, @Body() body: { userId: string }) {
    return this.socialService.declineRequest(id, body.userId);
  }

  @Get('friends')
  getFriends(@Query('userId') userId: string) {
    return this.socialService.getFriends(userId);
  }

  @Post('shake')
  shake(@Body() body: { userId: string }) {
    return this.socialService.shake(body.userId);
  }

  @Post('friend-requests/send')
  sendFriendRequest(@Body() body: { userId: string; characterId: string; greeting: string }) {
    return this.socialService.sendFriendRequest(body.userId, body.characterId, body.greeting);
  }

  @Post('trigger-scene')
  triggerScene(@Body() body: { userId: string; scene: string }) {
    return this.socialService.triggerSceneFriendRequest(body.userId, body.scene);
  }
}

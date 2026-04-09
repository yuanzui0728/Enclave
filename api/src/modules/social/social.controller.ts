import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('friend-requests')
  getPendingRequests() {
    return this.socialService.getPendingRequests();
  }

  @Post('friend-requests/:id/accept')
  acceptRequest(@Param('id') id: string) {
    return this.socialService.acceptRequest(id);
  }

  @Post('friend-requests/:id/decline')
  declineRequest(@Param('id') id: string) {
    return this.socialService.declineRequest(id);
  }

  @Get('friends')
  getFriends() {
    return this.socialService.getFriends();
  }

  @Get('blocks')
  getBlockedCharacters() {
    return this.socialService.getBlockedCharacters();
  }

  @Post('shake')
  shake() {
    return this.socialService.shake();
  }

  @Post('friend-requests/send')
  sendFriendRequest(@Body() body: { characterId: string; greeting: string }) {
    return this.socialService.sendFriendRequest(body.characterId, body.greeting);
  }

  @Post('block')
  blockCharacter(@Body() body: { characterId: string; reason?: string }) {
    return this.socialService.blockCharacter(body.characterId, body.reason);
  }

  @Post('unblock')
  unblockCharacter(@Body() body: { characterId: string }) {
    return this.socialService.unblockCharacter(body.characterId);
  }

  @Post('trigger-scene')
  triggerScene(@Body() body: { scene: string }) {
    return this.socialService.triggerSceneFriendRequest(body.scene);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ShakeDiscoveryService } from './shake-discovery.service';
import { SocialService } from './social.service';

@Controller('social')
export class SocialController {
  constructor(
    private readonly socialService: SocialService,
    private readonly shakeDiscoveryService: ShakeDiscoveryService,
  ) {}

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

  @Post('friends/:characterId/star')
  setFriendStarred(
    @Param('characterId') characterId: string,
    @Body() body: { starred: boolean },
  ) {
    return this.socialService.setFriendStarred(characterId, body.starred);
  }

  @Patch('friends/:characterId/profile')
  updateFriendProfile(
    @Param('characterId') characterId: string,
    @Body()
    body: {
      remarkName?: string | null;
      tags?: string[] | null;
    },
  ) {
    return this.socialService.updateFriendProfile(characterId, body);
  }

  @Delete('friends/:characterId')
  deleteFriend(@Param('characterId') characterId: string) {
    return this.socialService.deleteFriend(characterId);
  }

  @Get('blocks')
  getBlockedCharacters() {
    return this.socialService.getBlockedCharacters();
  }

  @Post('shake')
  shake(
    @Body()
    body?: {
      mode?: 'new' | 'reroll';
    },
  ) {
    return this.shakeDiscoveryService.createSessionPreview({
      mode: body?.mode === 'reroll' ? 'reroll' : 'new',
    });
  }

  @Get('shake/active')
  getActiveShake() {
    return this.shakeDiscoveryService.getActiveSession();
  }

  @Post('shake/:id/keep')
  keepShake(@Param('id') id: string) {
    return this.shakeDiscoveryService.keepSession(id);
  }

  @Post('shake/:id/dismiss')
  dismissShake(
    @Param('id') id: string,
    @Body() body: { reason?: string | null },
  ) {
    return this.shakeDiscoveryService.dismissSession(id, body.reason);
  }

  @Post('friend-requests/send')
  sendFriendRequest(
    @Body()
    body: { characterId: string; greeting: string; autoAccept?: boolean },
  ) {
    return this.socialService.sendFriendRequest(
      body.characterId,
      body.greeting,
      { autoAccept: body.autoAccept === true },
    );
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

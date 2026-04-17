import { Body, Controller, Param, Post } from '@nestjs/common';
import { FollowupRuntimeService } from './followup-runtime.service';

@Controller('followup-runtime')
export class FollowupRuntimeController {
  constructor(
    private readonly followupRuntimeService: FollowupRuntimeService,
  ) {}

  @Post('recommendations/:id/opened')
  markRecommendationOpened(@Param('id') id: string) {
    return this.followupRuntimeService.markRecommendationOpened(id);
  }

  @Post('recommendations/:id/friend-request-pending')
  markRecommendationFriendRequestPending(
    @Param('id') id: string,
    @Body() body: { friendRequestId?: string },
  ) {
    return this.followupRuntimeService.markRecommendationFriendRequestPending(
      id,
      body.friendRequestId?.trim() ?? '',
    );
  }

  @Post('recommendations/:id/chat-started')
  markRecommendationChatStarted(@Param('id') id: string) {
    return this.followupRuntimeService.markRecommendationChatStarted(id);
  }
}

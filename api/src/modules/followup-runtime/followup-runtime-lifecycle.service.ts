import { Injectable } from '@nestjs/common';
import { AppEvents, EventBusService } from '../events/event-bus.service';
import { FollowupRuntimeService } from './followup-runtime.service';

@Injectable()
export class FollowupRuntimeLifecycleService {
  constructor(
    private readonly eventBus: EventBusService,
    private readonly followupRuntimeService: FollowupRuntimeService,
  ) {
    this.eventBus.on(AppEvents.FRIEND_REQUEST_ACCEPTED, (payload) => {
      const event = payload as {
        requestId: string;
        acceptedAt: Date;
      };
      void this.followupRuntimeService.handleFriendRequestAccepted({
        requestId: event.requestId,
        acceptedAt: new Date(event.acceptedAt),
      });
    });
    this.eventBus.on(AppEvents.FRIEND_REQUEST_DECLINED, (payload) => {
      const event = payload as {
        requestId: string;
        declinedAt: Date;
      };
      void this.followupRuntimeService.handleFriendRequestDeclined({
        requestId: event.requestId,
        declinedAt: new Date(event.declinedAt),
      });
    });
    this.eventBus.on(AppEvents.FRIEND_REQUEST_EXPIRED, (payload) => {
      const event = payload as {
        requestId: string;
        expiredAt: Date;
      };
      void this.followupRuntimeService.handleFriendRequestExpired({
        requestId: event.requestId,
        expiredAt: new Date(event.expiredAt),
      });
    });
  }
}

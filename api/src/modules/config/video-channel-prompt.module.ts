import { Global, Module } from '@nestjs/common';
import { VideoChannelPromptClient } from './video-channel-prompt.client';

// 视频号生成提示词模板 client 全局可用（与 BillingModule / SubscriptionModule 同为
// @Global）：feed.service（shared-world）与 wiki-character-video.service（wiki）共用一份。
@Global()
@Module({
  providers: [VideoChannelPromptClient],
  exports: [VideoChannelPromptClient],
})
export class VideoChannelPromptModule {}

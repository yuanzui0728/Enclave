import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { InferenceService } from './inference.service';

@Controller('admin/inference')
@UseGuards(AdminGuard)
export class InferenceAdminController {
  constructor(private readonly inferenceService: InferenceService) {}

  @Get('overview')
  getOverview() {
    return this.inferenceService.getOverview();
  }

  @Post('providers')
  createProviderAccount(
    @Body()
    body: {
      name?: string;
      endpoint?: string;
      defaultModelId?: string;
      apiKey?: string;
      mode?: string;
      apiStyle?: string;
      transcriptionEndpoint?: string;
      transcriptionModel?: string;
      transcriptionApiKey?: string;
      ttsModel?: string;
      ttsVoice?: string;
      isEnabled?: boolean;
      notes?: string | null;
    },
  ) {
    return this.inferenceService.createProviderAccount(body);
  }

  @Patch('providers/:id')
  updateProviderAccount(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      endpoint?: string;
      defaultModelId?: string;
      apiKey?: string;
      mode?: string;
      apiStyle?: string;
      transcriptionEndpoint?: string;
      transcriptionModel?: string;
      transcriptionApiKey?: string;
      ttsModel?: string;
      ttsVoice?: string;
      isEnabled?: boolean;
      notes?: string | null;
    },
  ) {
    return this.inferenceService.updateProviderAccount(id, body);
  }

  @Post('providers/:id/default')
  setDefaultProviderAccount(@Param('id') id: string) {
    return this.inferenceService.setDefaultProviderAccount(id);
  }

  @Post('providers/test')
  testProviderConnection(
    @Body()
    body: {
      endpoint?: string;
      defaultModelId?: string;
      model?: string;
      apiKey?: string;
      mode?: string;
      apiStyle?: string;
      transcriptionEndpoint?: string;
      transcriptionModel?: string;
      transcriptionApiKey?: string;
    },
  ) {
    return this.inferenceService.testProviderConnection(body);
  }

  @Post('model-personas/install')
  installModelPersonas(
    @Body()
    body: {
      modelIds?: string[];
      providerAccountId?: string;
      forceUpdateExisting?: boolean;
    },
  ) {
    return this.inferenceService.installModelPersonas(body);
  }
}

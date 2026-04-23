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
      ttsEndpoint?: string;
      ttsApiKey?: string;
      ttsModel?: string;
      ttsVoice?: string;
      imageGenerationEndpoint?: string;
      imageGenerationModel?: string;
      imageGenerationApiKey?: string;
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
      ttsEndpoint?: string;
      ttsApiKey?: string;
      ttsModel?: string;
      ttsVoice?: string;
      imageGenerationEndpoint?: string;
      imageGenerationModel?: string;
      imageGenerationApiKey?: string;
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
      ttsEndpoint?: string;
      ttsApiKey?: string;
      ttsModel?: string;
      ttsVoice?: string;
      imageGenerationEndpoint?: string;
      imageGenerationModel?: string;
      imageGenerationApiKey?: string;
    },
  ) {
    return this.inferenceService.testProviderConnection(body);
  }

  @Post('diagnostics/text')
  diagnoseText(
    @Body()
    body: {
      providerAccountId?: string;
      characterId?: string;
      prompt?: string;
    },
  ) {
    return this.inferenceService.runDiagnostic('text', body);
  }

  @Post('diagnostics/image-input')
  diagnoseImageInput(
    @Body()
    body: {
      providerAccountId?: string;
      characterId?: string;
      prompt?: string;
    },
  ) {
    return this.inferenceService.runDiagnostic('image_input', body);
  }

  @Post('diagnostics/transcription')
  diagnoseTranscription(
    @Body()
    body: {
      providerAccountId?: string;
      characterId?: string;
    },
  ) {
    return this.inferenceService.runDiagnostic('transcription', body);
  }

  @Post('diagnostics/tts')
  diagnoseTts(
    @Body()
    body: {
      providerAccountId?: string;
      characterId?: string;
      prompt?: string;
    },
  ) {
    return this.inferenceService.runDiagnostic('tts', body);
  }

  @Post('diagnostics/image-generation')
  diagnoseImageGeneration(
    @Body()
    body: {
      providerAccountId?: string;
      characterId?: string;
      prompt?: string;
    },
  ) {
    return this.inferenceService.runDiagnostic('image_generation', body);
  }

  @Post('diagnostics/digital-human')
  diagnoseDigitalHuman() {
    return this.inferenceService.runDiagnostic('digital_human', {});
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

  @Post('model-personas/rebind')
  rebindModelPersonas(
    @Body()
    body: {
      modelIds?: string[];
      providerAccountId?: string;
    },
  ) {
    return this.inferenceService.rebindModelPersonas(body);
  }
}

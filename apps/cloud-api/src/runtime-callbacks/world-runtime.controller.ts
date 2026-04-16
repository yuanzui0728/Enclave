import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { WorldRuntimeService } from "./world-runtime.service";

type RuntimeCallbackPayload = {
  callbackToken?: string | null;
  apiBaseUrl?: string | null;
  adminUrl?: string | null;
  runtimeVersion?: string | null;
  healthStatus?: string | null;
  healthMessage?: string | null;
  reportedAt?: string | null;
  lastInteractiveAt?: string | null;
};

type RuntimeFailurePayload = RuntimeCallbackPayload & {
  failureCode?: string | null;
  failureMessage?: string | null;
};

@Controller("internal/worlds")
export class WorldRuntimeController {
  constructor(private readonly worldRuntimeService: WorldRuntimeService) {}

  @Post(":worldId/bootstrap")
  bootstrapWorld(
    @Param("worldId") worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackPayload,
  ) {
    return this.worldRuntimeService.reportBootstrap(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/heartbeat")
  heartbeatWorld(
    @Param("worldId") worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackPayload,
  ) {
    return this.worldRuntimeService.reportHeartbeat(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/activity")
  reportWorldActivity(
    @Param("worldId") worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackPayload,
  ) {
    return this.worldRuntimeService.reportActivity(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/health")
  reportWorldHealth(
    @Param("worldId") worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackPayload,
  ) {
    return this.worldRuntimeService.reportHealth(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/fail")
  failWorld(
    @Param("worldId") worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeFailurePayload,
  ) {
    return this.worldRuntimeService.reportFailure(worldId, body ?? {}, callbackToken);
  }
}

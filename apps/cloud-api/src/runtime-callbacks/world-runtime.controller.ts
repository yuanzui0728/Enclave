import { Body, Controller, Headers, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { RuntimeCallbackDto, RuntimeFailureDto } from "../http-dto/cloud-api.dto";
import { WorldRuntimeService } from "./world-runtime.service";

@Controller("internal/worlds")
export class WorldRuntimeController {
  constructor(private readonly worldRuntimeService: WorldRuntimeService) {}

  @Post(":worldId/bootstrap")
  bootstrapWorld(
    @Param("worldId", new ParseUUIDPipe()) worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackDto,
  ) {
    return this.worldRuntimeService.reportBootstrap(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/heartbeat")
  heartbeatWorld(
    @Param("worldId", new ParseUUIDPipe()) worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackDto,
  ) {
    return this.worldRuntimeService.reportHeartbeat(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/activity")
  reportWorldActivity(
    @Param("worldId", new ParseUUIDPipe()) worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackDto,
  ) {
    return this.worldRuntimeService.reportActivity(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/health")
  reportWorldHealth(
    @Param("worldId", new ParseUUIDPipe()) worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeCallbackDto,
  ) {
    return this.worldRuntimeService.reportHealth(worldId, body ?? {}, callbackToken);
  }

  @Post(":worldId/fail")
  failWorld(
    @Param("worldId", new ParseUUIDPipe()) worldId: string,
    @Headers("x-world-callback-token") callbackToken: string | undefined,
    @Body() body: RuntimeFailureDto,
  ) {
    return this.worldRuntimeService.reportFailure(worldId, body ?? {}, callbackToken);
  }
}

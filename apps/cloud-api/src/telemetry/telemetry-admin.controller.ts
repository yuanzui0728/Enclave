import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  MinimaxHourlyTelemetryResponse,
  TelemetryApiHealthResponse,
  TelemetryAppId,
  TelemetryErrorsResponse,
  TelemetryFunnelResponse,
  TelemetryOverviewResponse,
  TelemetryRange,
  TelemetryTimeseriesResponse,
  TelemetryTopEventsResponse,
  TelemetryTopWorldsResponse,
  TelemetryTopWorldsSortDir,
  TelemetryTopWorldsSortKey,
  TelemetryWorldRow,
} from "@yinjie/contracts";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { AdminGuard } from "../auth/admin.guard";
import { MinimaxUsageService } from "./minimax-usage.service";
import { TelemetryService } from "./telemetry.service";

const RANGE_VALUES = ["24h", "7d", "30d"] as const;
const APP_ID_VALUES = ["app", "site", "wiki"] as const;

function trimString({ value }: { value: unknown }) {
  return typeof value === "string" ? value.trim() : value;
}

class RangeQueryDto {
  @Transform(trimString)
  @IsOptional()
  @IsIn(RANGE_VALUES, { message: "range 不合法。" })
  range?: (typeof RANGE_VALUES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsIn(APP_ID_VALUES, { message: "appId 不合法。" })
  appId?: (typeof APP_ID_VALUES)[number];

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  worldId?: string;
}

class TimeseriesQueryDto extends RangeQueryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  eventName: string;

  @Transform(trimString)
  @IsOptional()
  @IsIn(["appId", "none"] as const, { message: "groupBy 不合法。" })
  groupBy?: "appId" | "none";
}

class FunnelQueryDto extends RangeQueryDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  steps: string;
}

const TOP_WORLDS_SORT_BY_VALUES = [
  "eventCount",
  "uniqueUsers",
  "errorCount",
] as const;
const TOP_WORLDS_SORT_DIR_VALUES = ["asc", "desc"] as const;

class TopWorldsQueryDto extends RangeQueryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @Transform(trimString)
  @IsOptional()
  @IsIn(TOP_WORLDS_SORT_BY_VALUES, { message: "sortBy 不合法。" })
  sortBy?: TelemetryTopWorldsSortKey;

  @Transform(trimString)
  @IsOptional()
  @IsIn(TOP_WORLDS_SORT_DIR_VALUES, { message: "sortDir 不合法。" })
  sortDir?: TelemetryTopWorldsSortDir;
}

@Controller("admin/cloud/telemetry")
@UseGuards(AdminGuard)
export class TelemetryAdminController {
  constructor(
    private readonly telemetry: TelemetryService,
    private readonly minimaxUsage: MinimaxUsageService,
  ) {}

  @Get("overview")
  overview(@Query() q: RangeQueryDto): Promise<TelemetryOverviewResponse> {
    return this.telemetry.overview(
      (q.range ?? "7d") as TelemetryRange,
      q.appId as TelemetryAppId | undefined,
      q.worldId,
    );
  }

  @Get("timeseries")
  timeseries(@Query() q: TimeseriesQueryDto): Promise<TelemetryTimeseriesResponse> {
    return this.telemetry.timeseries(
      q.eventName,
      (q.range ?? "7d") as TelemetryRange,
      q.groupBy ?? "none",
      q.appId as TelemetryAppId | undefined,
      q.worldId,
    );
  }

  @Get("top-events")
  topEvents(@Query() q: RangeQueryDto): Promise<TelemetryTopEventsResponse> {
    return this.telemetry.topEvents(
      (q.range ?? "7d") as TelemetryRange,
      q.appId as TelemetryAppId | undefined,
      q.worldId,
    );
  }

  @Get("funnel")
  funnel(@Query() q: FunnelQueryDto): Promise<TelemetryFunnelResponse> {
    const steps = q.steps
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 8);
    return this.telemetry.funnel(
      steps,
      (q.range ?? "7d") as TelemetryRange,
      q.appId as TelemetryAppId | undefined,
      q.worldId,
    );
  }

  @Get("api-health")
  apiHealth(@Query() q: RangeQueryDto): Promise<TelemetryApiHealthResponse> {
    return this.telemetry.apiHealth(
      (q.range ?? "7d") as TelemetryRange,
      q.appId as TelemetryAppId | undefined,
      q.worldId,
    );
  }

  @Get("errors")
  errors(@Query() q: RangeQueryDto): Promise<TelemetryErrorsResponse> {
    return this.telemetry.errors(
      (q.range ?? "7d") as TelemetryRange,
      q.appId as TelemetryAppId | undefined,
      q.worldId,
    );
  }

  @Get("top-worlds")
  topWorlds(@Query() q: TopWorldsQueryDto): Promise<TelemetryTopWorldsResponse> {
    return this.telemetry.topWorlds((q.range ?? "7d") as TelemetryRange, {
      page: q.page,
      pageSize: q.pageSize,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
    });
  }

  @Get("worlds")
  worlds(@Query() q: RangeQueryDto): Promise<TelemetryWorldRow[]> {
    return this.telemetry.listWorldsForFilter(
      (q.range ?? "7d") as TelemetryRange,
    );
  }

  @Get("minimax-hourly")
  minimaxHourly(
    @Query() q: RangeQueryDto,
  ): Promise<MinimaxHourlyTelemetryResponse> {
    return this.minimaxUsage.getHourly(
      (q.range ?? "24h") as TelemetryRange,
      q.worldId,
    );
  }
}
// i18n-ignore-end

import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import type { FarmPlot } from "@yinjie/contracts";
import { useFarmAdjustedNow } from "../farm-clock-context";

const t = translateRuntimeMessage;
import { formatRemainingMs, getStageEmoji } from "../crop-presentation";
import { CropStageSvg } from "../svg/crop-stage-svg";
import type { PlotPulseKind } from "./plot-action-bar";

export interface FarmIsoTileProps {
  plot: FarmPlot;
  selected?: boolean;
  pulseRipe?: boolean;
  pulse?: { kind: PlotPulseKind; tick: number } | null;
  onClick?: () => void;
}

const PULSE_EMOJI: Record<PlotPulseKind, string> = {
  plant: "🌫️",
  water: "💧",
  weed: "🌿",
  debug: "🐛",
  fertilize: "💩",
  pesticide: "🧴",
  uproot: "🪓",
  harvest: "🪙",
};

export function FarmIsoTile({
  plot,
  selected,
  pulseRipe,
  pulse,
  onClick,
}: FarmIsoTileProps) {
  const nowMs = useFarmAdjustedNow();
  const isRipe =
    plot.cropId != null && plot.maturedAt != null && nowMs >= plot.maturedAt;
  const isRotten =
    plot.cropId != null &&
    plot.plantedAt != null &&
    plot.maturedAt != null &&
    nowMs >= plot.maturedAt + 24 * 3600 * 1000;
  const remainingMs =
    plot.maturedAt != null && plot.cropId ? plot.maturedAt - nowMs : 0;

  const stage = plot.cropId
    ? isRotten
      ? "rotten"
      : isRipe
        ? "ripe"
        : plot.stage
    : "empty";

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "farm-iso-tile group relative aspect-square select-none",
        selected ? "is-selected" : "",
        isRipe && !isRotten ? "is-ripe" : "",
        isRipe && !isRotten && pulseRipe ? "is-ripe-pulse" : "",
        isRotten ? "is-rotten" : "",
      ].join(" ")}
    >
      <span aria-hidden className="farm-iso-tile__dirt" />
      <span aria-hidden className="farm-iso-tile__edge" />

      <span className="farm-iso-tile__content">
        <span className="farm-iso-tile__crop">
          {plot.cropId ? (
            <CropStageSvg cropId={plot.cropId} stage={stage} size={40} />
          ) : (
            getStageEmoji(stage, plot.cropId)
          )}
        </span>

        {plot.cropId && (
          <span className="farm-iso-tile__caption">
            {isRotten ? t(msg`腐烂`) : isRipe ? t(msg`成熟`) : formatRemainingMs(remainingMs)}
          </span>
        )}
        {!plot.cropId && (
          <span className="farm-iso-tile__caption text-stone-400">{t(msg`空地`)}</span>
        )}

        <span className="farm-iso-tile__badges">
          {plot.weeds > 0 && <span title={t(msg`杂草`)}>🌿</span>}
          {plot.bugs > 0 && <span title={t(msg`害虫`)}>🐛</span>}
          {plot.watered && !isRipe && <span title={t(msg`已浇水`)}>💧</span>}
          {plot.fertilized && !isRipe && (
            <span title={t(msg`已施肥`)} className="text-amber-600">💩</span>
          )}
          {plot.pesticideUntilMs != null &&
            nowMs < plot.pesticideUntilMs && (
              <span title={t(msg`农药生效中`)} className="text-lime-600">🧴</span>
            )}
          {(plot.stolenBy?.length ?? 0) > 0 && (
            <span title={t(msg`被偷过`)} className="text-rose-500">⚠️</span>
          )}
        </span>

        {isRipe && !isRotten && (
          <span aria-hidden className="farm-iso-tile__sparkle">✨</span>
        )}

        {pulse && (
          <span
            key={`${pulse.kind}-${pulse.tick}`}
            aria-hidden
            className={`farm-iso-tile__pulse farm-iso-tile__pulse--${pulse.kind}`}
          >
            {PULSE_EMOJI[pulse.kind]}
          </span>
        )}
      </span>
    </button>
  );
}

import type { FarmPlot } from "@yinjie/contracts";
import { useFarmAdjustedNow } from "../farm-clock-context";
import { FarmIsoTile } from "./farm-iso-tile";
import type { PlotPulseKind } from "./plot-action-bar";

interface FarmIsoGridProps {
  plots: FarmPlot[];
  selectedIndex: number | null;
  pulse?: { plotIndex: number; kind: PlotPulseKind; tick: number } | null;
  onSelect: (plotIndex: number) => void;
}

export function FarmIsoGrid({ plots, selectedIndex, pulse, onSelect }: FarmIsoGridProps) {
  const cols = plots.length <= 6 ? 3 : plots.length <= 9 ? 3 : 4;
  // 之前用裸 Date.now() — FarmIsoGrid 没订阅 farm-clock-context，
  // 所以只在 plots/pulse/selectedIndex 变化时才重算 ripeIndexesToPulse。
  // 玩家进页面后一直挂着，一块田穿过成熟边界后，金黄发光要等他下次点田才会刷出来。
  // 子 tile 已经按 useFarmAdjustedNow 每秒重渲染，父也跟着订阅 nowMs 让 pulse 实时更新。
  const nowMs = useFarmAdjustedNow();

  // Limit how many ripe pulses run simultaneously to keep frame rate sane on mobile.
  const ripeIndexesToPulse = new Set<number>();
  let pulseBudget = 3;
  for (let i = 0; i < plots.length && pulseBudget > 0; i += 1) {
    const plot = plots[i]!;
    if (
      plot.cropId &&
      plot.maturedAt != null &&
      nowMs >= plot.maturedAt &&
      nowMs < plot.maturedAt + 24 * 3600 * 1000
    ) {
      ripeIndexesToPulse.add(i);
      pulseBudget -= 1;
    }
  }

  return (
    <div className="farm-iso-board">
      <div
        className="farm-iso-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {plots.map((plot, index) => (
          <FarmIsoTile
            key={plot.index ?? index}
            plot={plot}
            selected={selectedIndex === index}
            pulseRipe={ripeIndexesToPulse.has(index)}
            pulse={
              pulse && pulse.plotIndex === index
                ? { kind: pulse.kind, tick: pulse.tick }
                : null
            }
            onClick={() => onSelect(index)}
          />
        ))}
      </div>

      <style>{`
        .farm-iso-board {
          perspective: 1200px;
          padding: 24px 12px 32px;
          overflow: visible;
        }
        .farm-iso-grid {
          display: grid;
          gap: 14px;
          margin: 0 auto;
          max-width: 480px;
          transform: rotateX(46deg) rotate(-32deg);
          transform-origin: center;
          transform-style: preserve-3d;
          transition: transform 240ms ease;
        }
        @media (max-width: 640px) {
          .farm-iso-grid {
            transform: rotateX(34deg) rotate(-16deg);
            max-width: 92vw;
            gap: 10px;
          }
        }

        .farm-iso-tile {
          position: relative;
          border-radius: 14px;
          background: transparent;
          border: 0;
          padding: 0;
          cursor: pointer;
          transition: transform 180ms ease, filter 220ms ease;
          transform-style: preserve-3d;
          outline: none;
        }
        .farm-iso-tile:hover { transform: translateZ(2px) scale(1.02); }
        .farm-iso-tile.is-selected { transform: translateZ(8px) scale(1.06); }
        .farm-iso-tile.is-rotten { filter: grayscale(0.5) brightness(0.85); }

        .farm-iso-tile__dirt {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          background:
            radial-gradient(ellipse at 30% 20%, rgba(207, 194, 241, 0.55), transparent 60%),
            linear-gradient(140deg, #5939b0 0%, #442a8a 55%, #2e1968 100%);
          box-shadow:
            inset 0 -3px 0 rgba(0, 0, 0, 0.18),
            inset 0 2px 0 rgba(255, 255, 255, 0.18),
            0 6px 10px rgba(23, 12, 53, 0.30);
        }
        .farm-iso-tile.is-selected .farm-iso-tile__dirt {
          box-shadow:
            inset 0 -3px 0 rgba(0, 0, 0, 0.18),
            inset 0 2px 0 rgba(255, 255, 255, 0.22),
            0 0 0 3px rgba(71, 38, 163, 0.85),
            0 0 0 6px rgba(71, 38, 163, 0.25),
            0 8px 14px rgba(0, 0, 0, 0.32);
        }
        .farm-iso-tile.is-ripe .farm-iso-tile__dirt {
          box-shadow:
            inset 0 -3px 0 rgba(0, 0, 0, 0.18),
            inset 0 2px 0 rgba(255, 255, 255, 0.22),
            0 0 0 2px rgba(138, 108, 221, 0.85),
            0 6px 12px rgba(46, 25, 105, 0.45);
        }
        .farm-iso-tile.is-ripe-pulse .farm-iso-tile__dirt {
          animation: farm-iso-ripe-pulse 1.6s ease-in-out infinite;
        }
        @keyframes farm-iso-ripe-pulse {
          0%, 100% { box-shadow:
            inset 0 -3px 0 rgba(0, 0, 0, 0.18),
            inset 0 2px 0 rgba(255, 255, 255, 0.22),
            0 0 0 2px rgba(138, 108, 221, 0.85),
            0 6px 12px rgba(46, 25, 105, 0.45);
          }
          50% { box-shadow:
            inset 0 -3px 0 rgba(0, 0, 0, 0.18),
            inset 0 2px 0 rgba(255, 255, 255, 0.22),
            0 0 0 4px rgba(138, 108, 221, 1),
            0 0 18px rgba(138, 108, 221, 0.5),
            0 6px 12px rgba(46, 25, 105, 0.45);
          }
        }

        .farm-iso-tile__edge {
          position: absolute;
          inset: auto 0 -8px 0;
          height: 8px;
          border-radius: 0 0 12px 12px;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0));
          transform: translateZ(-4px);
        }

        .farm-iso-tile__content {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          /* Counter-transform so the upright layer stays upright relative to viewer. */
          transform: rotate(32deg) rotateX(-46deg) translateZ(14px);
          transform-origin: center;
          transform-style: preserve-3d;
        }
        @media (max-width: 640px) {
          .farm-iso-tile__content {
            transform: rotate(16deg) rotateX(-34deg) translateZ(12px);
          }
        }

        .farm-iso-tile__crop {
          font-size: 30px;
          line-height: 1;
          filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.3));
        }
        .farm-iso-tile__caption {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.92);
          background: rgba(0, 0, 0, 0.35);
          padding: 1px 6px;
          border-radius: 999px;
          backdrop-filter: blur(4px);
        }
        @media (max-width: 380px) {
          .farm-iso-tile__crop { font-size: 24px; }
          .farm-iso-tile__caption { font-size: 9px; padding: 0 4px; }
        }
        .farm-iso-tile__badges {
          position: absolute;
          top: 4px;
          right: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 11px;
          line-height: 1;
        }
        .farm-iso-tile__sparkle {
          position: absolute;
          top: -10px;
          right: -10px;
          font-size: 16px;
          animation: farm-iso-sparkle 1.4s ease-in-out infinite;
        }
        @keyframes farm-iso-sparkle {
          0%, 100% { opacity: 0.6; transform: rotate(0deg) scale(1); }
          50% { opacity: 1; transform: rotate(15deg) scale(1.2); }
        }

        .farm-iso-tile__pulse {
          position: absolute;
          left: 50%;
          top: 50%;
          font-size: 22px;
          line-height: 1;
          pointer-events: none;
          will-change: transform, opacity;
          filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
        }
        .farm-iso-tile__pulse--water {
          animation: farm-iso-pulse-water 1200ms ease-out forwards;
        }
        .farm-iso-tile__pulse--plant {
          animation: farm-iso-pulse-plant 1200ms ease-out forwards;
          font-size: 28px;
        }
        .farm-iso-tile__pulse--weed,
        .farm-iso-tile__pulse--debug {
          animation: farm-iso-pulse-fade 1200ms ease-out forwards;
        }
        .farm-iso-tile__pulse--harvest {
          animation: farm-iso-pulse-coin 1200ms ease-out forwards;
          font-size: 26px;
        }
        @keyframes farm-iso-pulse-water {
          0%   { transform: translate(-50%, -120%) scale(0.6); opacity: 0; }
          25%  { transform: translate(-50%, -110%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, 30%)   scale(0.9); opacity: 0; }
        }
        @keyframes farm-iso-pulse-plant {
          0%   { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
          30%  { transform: translate(-50%, -90%) scale(1.1); opacity: 0.85; }
          100% { transform: translate(-50%, -130%) scale(1.6); opacity: 0; }
        }
        @keyframes farm-iso-pulse-fade {
          0%   { transform: translate(-50%, -60%) scale(0.6); opacity: 0; }
          30%  { transform: translate(-50%, -90%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -130%) scale(1.4); opacity: 0; }
        }
        @keyframes farm-iso-pulse-coin {
          0%   { transform: translate(-50%, -40%) scale(0.6); opacity: 0; }
          20%  { transform: translate(-50%, -90%) scale(1.2); opacity: 1; }
          100% { transform: translate(-50%, -200%) scale(1); opacity: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .farm-iso-tile,
          .farm-iso-grid,
          .farm-iso-tile__sparkle,
          .farm-iso-tile__pulse,
          .farm-iso-tile.is-ripe-pulse .farm-iso-tile__dirt {
            transition: none;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

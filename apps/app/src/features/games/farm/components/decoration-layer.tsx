import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  FARM_DECORATION_CATALOG,
  type FarmDecorationPlacement,
} from "@yinjie/contracts";
import { useRemoveFarmDecoration } from "../use-farm-state";

const t = translateRuntimeMessage;

interface DecorationLayerProps {
  placements: FarmDecorationPlacement[];
}

export function DecorationLayer({ placements }: DecorationLayerProps) {
  const removeMutation = useRemoveFarmDecoration();
  if (placements.length === 0) return null;
  return (
    <div
      aria-hidden={false}
      className="pointer-events-none absolute inset-0 z-[5]"
    >
      {placements.map((p) => {
        const def = FARM_DECORATION_CATALOG[p.type];
        if (!def) return null;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  t(msg`收回 ${def.nameZh}？库存里会留着，可重新摆放。`),
                )
              ) {
                removeMutation.mutate({ placementId: p.id });
              }
            }}
            title={`${def.nameZh} · ${t(msg`点一下收回`)}`}
            className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 select-none text-3xl drop-shadow-md transition hover:scale-110"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              animation:
                p.type === "windmill"
                  ? "farm-deco-spin 6s linear infinite"
                  : p.type === "lantern"
                    ? "farm-deco-sway 3s ease-in-out infinite"
                    : undefined,
            }}
          >
            {def.emoji}
          </button>
        );
      })}
      <style>{`
        @keyframes farm-deco-spin {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }
        @keyframes farm-deco-sway {
          0%, 100% { transform: translate(-50%, -50%) rotate(-6deg); }
          50% { transform: translate(-50%, -50%) rotate(6deg); }
        }
      `}</style>
    </div>
  );
}

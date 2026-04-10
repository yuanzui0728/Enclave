import {
  STICKER_PACKS,
  getStickerAttachment,
  type StickerAttachment,
} from "@yinjie/contracts";
import type { RecentStickerItem } from "./recent-stickers";

type StickerPanelProps = {
  variant: "mobile" | "desktop";
  activePackId: string;
  recentItems: RecentStickerItem[];
  onClose: () => void;
  onPackChange: (packId: string) => void;
  onSelect: (sticker: StickerAttachment) => void;
};

export function StickerPanel({
  variant,
  activePackId,
  recentItems,
  onClose,
  onPackChange,
  onSelect,
}: StickerPanelProps) {
  const recentStickers = recentItems
    .map((item) => getStickerAttachment(item.packId, item.stickerId))
    .filter((item): item is StickerAttachment => Boolean(item));

  const activePack =
    STICKER_PACKS.find((item) => item.id === activePackId) ?? STICKER_PACKS[0];
  const isMobile = variant === "mobile";

  return (
    <div
      className={
        isMobile
          ? "mt-2 overflow-hidden border-t border-black/6 bg-[#f1f1f1]"
          : "absolute bottom-full left-0 z-40 mb-3 w-[360px] rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,250,0.98),rgba(255,246,235,0.98))] p-3 shadow-[0_16px_32px_rgba(120,74,22,0.16)]"
      }
    >
      <div className={isMobile ? "flex h-[248px] flex-col" : undefined}>
        <div
          className={
            isMobile
              ? "flex items-center justify-between px-3 pb-2 pt-3"
              : "flex items-center justify-between px-1 pb-2"
          }
        >
          <div className="text-sm font-medium text-[color:var(--text-primary)]">
            表情包
          </div>
          <button
            type="button"
            onClick={onClose}
            className={
              isMobile
                ? "rounded-full px-2 py-1 text-xs text-[#7b7f84] transition active:bg-[#e5e5e5]"
                : "rounded-full px-2 py-1 text-xs text-[color:var(--text-secondary)] transition hover:bg-white/80"
            }
          >
            收起
          </button>
        </div>

        <div className={isMobile ? "min-h-0 flex-1 overflow-y-auto px-3 pb-3" : undefined}>
          {recentStickers.length ? (
            <section className="pb-3">
              <div
                className={
                  isMobile
                    ? "pb-2 text-[12px] text-[#7b7f84]"
                    : "px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--text-muted)]"
                }
              >
                {isMobile ? "最近使用" : "最近"}
              </div>
              <div className="grid grid-cols-4 gap-2">
                {recentStickers.slice(0, 4).map((sticker) => (
                  <StickerButton
                    key={`recent-${sticker.packId}-${sticker.stickerId}`}
                    compact={isMobile}
                    sticker={sticker}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-4 gap-2">
            {activePack.stickers.map((sticker) => (
              <StickerButton
                key={`${activePack.id}-${sticker.id}`}
                compact={isMobile}
                sticker={{
                  kind: "sticker",
                  packId: activePack.id,
                  stickerId: sticker.id,
                  url: sticker.src,
                  width: sticker.width,
                  height: sticker.height,
                  label: sticker.label,
                }}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>

        <div
          className={
            isMobile
              ? "flex gap-2 overflow-x-auto border-t border-black/6 bg-[#f7f7f7] px-3 py-2"
              : "flex gap-2 overflow-x-auto pb-3"
          }
        >
          {STICKER_PACKS.map((pack) => {
            const active = pack.id === activePack.id;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => onPackChange(pack.id)}
                className={
                  isMobile
                    ? `shrink-0 rounded-[10px] border px-3 py-1.5 text-xs transition ${
                        active
                          ? "border-black/10 bg-white text-[#111827]"
                          : "border-transparent bg-transparent text-[#7b7f84]"
                      }`
                    : `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? "bg-[var(--brand-gradient)] text-[color:var(--text-on-brand)] shadow-[0_6px_14px_rgba(160,90,10,0.20)]"
                          : "border border-white/80 bg-white/72 text-[color:var(--text-secondary)]"
                      }`
                }
              >
                {pack.title}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StickerButton({
  compact = false,
  sticker,
  onSelect,
}: {
  compact?: boolean;
  sticker: StickerAttachment;
  onSelect: (sticker: StickerAttachment) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(sticker)}
      className={
        compact
          ? "group flex flex-col items-center justify-center rounded-[12px] border border-black/[0.06] bg-white p-2.5 transition active:bg-[#f5f5f5]"
          : "group flex flex-col items-center gap-1 rounded-[18px] border border-white/80 bg-white/76 p-2 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_18px_rgba(160,90,10,0.12)]"
      }
      title={sticker.label ?? sticker.stickerId}
    >
      <img
        src={sticker.url}
        alt={sticker.label ?? sticker.stickerId}
        className={
          compact
            ? "h-14 w-14 rounded-[12px] object-contain"
            : "h-16 w-16 rounded-[16px] object-contain"
        }
        loading="lazy"
      />
      {!compact ? (
        <span className="line-clamp-1 text-[11px] text-[color:var(--text-secondary)]">
          {sticker.label ?? sticker.stickerId}
        </span>
      ) : null}
    </button>
  );
}

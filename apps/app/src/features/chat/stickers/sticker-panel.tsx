import { STICKER_PACKS, getStickerAttachment, type StickerAttachment } from "@yinjie/contracts";
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

  const activePack = STICKER_PACKS.find((item) => item.id === activePackId) ?? STICKER_PACKS[0];
  const isMobile = variant === "mobile";

  return (
    <>
      {isMobile ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-[rgba(52,34,12,0.18)] backdrop-blur-[2px]"
          aria-label="关闭表情面板"
          onClick={onClose}
        />
      ) : null}
      <div
        className={
          isMobile
            ? "fixed inset-x-0 bottom-0 z-40 rounded-t-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,253,248,0.98),rgba(255,246,235,0.98))] px-4 pb-4 pt-3 shadow-[0_-12px_28px_rgba(120,74,22,0.16)]"
            : "absolute bottom-full left-0 z-40 mb-3 w-[360px] rounded-[24px] border border-[color:var(--border-faint)] bg-[linear-gradient(180deg,rgba(255,254,250,0.98),rgba(255,246,235,0.98))] p-3 shadow-[0_16px_32px_rgba(120,74,22,0.16)]"
        }
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <div className="text-sm font-medium text-[color:var(--text-primary)]">表情包</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-xs text-[color:var(--text-secondary)] transition hover:bg-white/80"
          >
            收起
          </button>
        </div>

        {recentStickers.length ? (
          <section className="pb-3">
            <div className="px-1 pb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
              最近
            </div>
            <div className="grid grid-cols-4 gap-2">
              {recentStickers.slice(0, 4).map((sticker) => (
                <StickerButton key={`recent-${sticker.packId}-${sticker.stickerId}`} sticker={sticker} onSelect={onSelect} />
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex gap-2 overflow-x-auto pb-3">
          {STICKER_PACKS.map((pack) => {
            const active = pack.id === activePack.id;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => onPackChange(pack.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-[var(--brand-gradient)] text-white shadow-[0_6px_14px_rgba(160,90,10,0.20)]"
                    : "border border-white/80 bg-white/72 text-[color:var(--text-secondary)]"
                }`}
              >
                {pack.title}
              </button>
            );
          })}
        </div>

        <div className={`grid ${isMobile ? "grid-cols-4" : "grid-cols-4"} gap-2`}>
          {activePack.stickers.map((sticker) => (
            <StickerButton
              key={`${activePack.id}-${sticker.id}`}
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
    </>
  );
}

function StickerButton({
  sticker,
  onSelect,
}: {
  sticker: StickerAttachment;
  onSelect: (sticker: StickerAttachment) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(sticker)}
      className="group flex flex-col items-center gap-1 rounded-[18px] border border-white/80 bg-white/76 p-2 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_8px_18px_rgba(160,90,10,0.12)]"
      title={sticker.label ?? sticker.stickerId}
    >
      <img
        src={sticker.url}
        alt={sticker.label ?? sticker.stickerId}
        className="h-16 w-16 rounded-[16px] object-contain"
        loading="lazy"
      />
      <span className="line-clamp-1 text-[11px] text-[color:var(--text-secondary)]">{sticker.label ?? sticker.stickerId}</span>
    </button>
  );
}

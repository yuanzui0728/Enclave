import { cn } from "@yinjie/ui";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  getMiniProgramToneStyle,
  type MiniProgramEntry,
} from "./mini-programs-data";

const t = translateRuntimeMessage;

type MiniProgramGlyphProps = {
  miniProgram: MiniProgramEntry;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClassName = {
  sm: "h-10 w-10 rounded-[var(--radius-md)] text-[length:var(--text-eyebrow)]",
  md: "h-12 w-12 rounded-[var(--radius-md)] text-sm",
  lg: "h-16 w-16 rounded-[var(--radius-lg)] text-base",
};

function getGlyphLabel(name: string) {
  return name.length <= 2 ? name : name.slice(0, 2);
}

export function MiniProgramGlyph({
  miniProgram,
  size = "md",
  className,
}: MiniProgramGlyphProps) {
  const tone = getMiniProgramToneStyle(miniProgram.tone);

  return (
    <div
      className={cn(
        "flex items-center justify-center border border-white/35 font-semibold tracking-[0.08em] shadow-[var(--shadow-soft)]",
        tone.heroCardClassName,
        sizeClassName[size],
        className,
      )}
    >
      {getGlyphLabel(t(miniProgram.nameMessage))}
    </div>
  );
}

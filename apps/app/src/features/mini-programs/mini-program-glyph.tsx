import { cn } from "@yinjie/ui";
import {
  getMiniProgramToneStyle,
  type MiniProgramEntry,
} from "./mini-programs-data";

type MiniProgramGlyphProps = {
  miniProgram: MiniProgramEntry;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClassName = {
  sm: "h-10 w-10 rounded-[14px] text-[11px]",
  md: "h-12 w-12 rounded-[16px] text-sm",
  lg: "h-16 w-16 rounded-[20px] text-base",
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
      {getGlyphLabel(miniProgram.name)}
    </div>
  );
}

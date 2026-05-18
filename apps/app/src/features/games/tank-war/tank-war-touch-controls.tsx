import { useCallback, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Target } from "lucide-react";
import { cn } from "@yinjie/ui";
import type { InputState } from "./tank-war-types";

type Props = {
  inputRef: React.MutableRefObject<InputState>;
};

type Dir = "up" | "down" | "left" | "right";

function setDir(input: InputState, dir: Dir, down: boolean) {
  if (dir === "up") input.p1Up = down;
  if (dir === "down") input.p1Down = down;
  if (dir === "left") input.p1Left = down;
  if (dir === "right") input.p1Right = down;
}

function setFire(input: InputState, down: boolean) {
  input.p1Fire = down;
}

export function TankWarTouchControls({ inputRef }: Props) {
  const press = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, dir: Dir | "fire", down: boolean) => {
      e.preventDefault();
      const input = inputRef.current;
      if (dir === "fire") {
        setFire(input, down);
        return;
      }
      // 互斥四方向（移动端单方向按住即可）
      if (down) {
        input.p1Up = false;
        input.p1Down = false;
        input.p1Left = false;
        input.p1Right = false;
      }
      setDir(input, dir, down);
    },
    [inputRef],
  );

  const dirBtnClass = "flex h-12 w-12 items-center justify-center rounded-lg bg-white/20 text-white active:bg-white/40";

  const onPointerHandlers = (dir: Dir | "fire") => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => press(e, dir, true),
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => press(e, dir, false),
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => press(e, dir, false),
    onPointerLeave: (e: ReactPointerEvent<HTMLButtonElement>) => press(e, dir, false),
  });

  return (
    <div className="mt-2 flex w-full max-w-[520px] items-center justify-between gap-3 px-3 pb-2">
      <div className="grid grid-cols-3 grid-rows-3 gap-1 select-none touch-none">
        <span />
        <button type="button" className={dirBtnClass} {...onPointerHandlers("up")}>
          <ChevronUp size={20} />
        </button>
        <span />
        <button type="button" className={dirBtnClass} {...onPointerHandlers("left")}>
          <ChevronLeft size={20} />
        </button>
        <span />
        <button type="button" className={dirBtnClass} {...onPointerHandlers("right")}>
          <ChevronRight size={20} />
        </button>
        <span />
        <button type="button" className={dirBtnClass} {...onPointerHandlers("down")}>
          <ChevronDown size={20} />
        </button>
        <span />
      </div>
      <button
        type="button"
        {...onPointerHandlers("fire")}
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg active:bg-red-700 select-none touch-none",
        )}
      >
        <Target size={28} />
      </button>
    </div>
  );
}

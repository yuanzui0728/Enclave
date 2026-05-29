import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";
import {
// i18n-ignore-start: data / seed / preset content — not user-facing UI.
  Award,
  Heart,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Sword,
  X,
  Zap,
} from "lucide-react";
import {
  FIGHTERS,
  ROUND_COUNT,
  type Fighter,
  type Move,
  getFighter,
} from "./pixel-arena-data";
import { usePixelArenaState } from "./use-pixel-arena-state";

const t = translateRuntimeMessage;

type Variant = "embedded" | "fullscreen";

type PixelArenaGameProps = {
  variant?: Variant;
  onExit?: () => void;
};

function moveLabel(move: Move): string {
  switch (move) {
    case "attack":
      return t(msg`攻击`);
    case "defend":
      return t(msg`防御`);
    case "special":
      return t(msg`必杀`);
  }
}

function fighterMaxHp(fighter: Fighter | undefined): number {
  return fighter?.hp ?? 70;
}

export function PixelArenaGame({
  variant = "fullscreen",
  onExit,
}: PixelArenaGameProps) {
  const { state, actions } = usePixelArenaState();
  const isFighting = state.status === "fighting";
  const isEnded = state.status === "ended";
  const containerCls =
    variant === "embedded"
      ? "rounded-[var(--radius-md)] bg-[color:var(--surface-card)]"
      : "min-h-screen bg-[color:var(--bg-app)]";
  const player = getFighter(state.playerFighterId);
  const npc = getFighter(state.npcFighterId);
  const playerMaxHp = fighterMaxHp(player);
  const npcMaxHp = fighterMaxHp(npc);

  const lastRound = state.history[state.history.length - 1];

  return (
    <section className={cn("flex flex-col gap-3 p-3", containerCls)}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`像素擂台`)}
          </span>
          <span className="rounded-full bg-[color:var(--brand-soft)] px-2 py-0.5 text-[length:var(--text-eyebrow)] font-medium text-[color:var(--brand-primary)]">
            {t(msg`5 回合制`)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full bg-[color:var(--brand-soft)] px-2 py-1 text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)]">
            <Award size={12} />
            {t(msg`连胜 ${state.winStreak}`)}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-[color:var(--brand-soft)] px-2 py-1 text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)]">
            <Sparkles size={12} />
            ×{state.skinTokens}
          </span>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-secondary)] hover:bg-black/[0.04]"
              aria-label={t(msg`退出游戏`)}
            >
              <X size={15} />
            </button>
          ) : null}
        </div>
      </header>

      {/* 双人对面板 */}
      <div className="grid grid-cols-2 gap-2">
        <FighterCard
          fighter={player}
          hp={state.playerHp}
          maxHp={playerMaxHp}
          tone="violet"
          align="left"
        />
        <FighterCard
          fighter={npc}
          hp={state.npcHp}
          maxHp={npcMaxHp}
          tone="rose"
          align="right"
        />
      </div>

      {/* 最近回合 / 状态 */}
      {lastRound ? (
        <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-3 py-2 text-center text-[length:var(--text-caption)]">
          {t(
            msg`第 ${lastRound.round} 回合：你${moveLabel(lastRound.playerMove)} / 对手${moveLabel(lastRound.npcMove)}`,
          )}
          {lastRound.outcome.summary === "p_hits" ? (
            <span className="ml-2 text-[color:var(--brand-primary)]">
              {t(msg`命中 -${lastRound.outcome.npcDamage}`)}
            </span>
          ) : null}
          {lastRound.outcome.summary === "n_hits" ? (
            <span className="ml-2 text-[color:var(--brand-primary)]">
              {t(msg`受击 -${lastRound.outcome.playerDamage}`)}
            </span>
          ) : null}
          {lastRound.outcome.summary === "trade" ? (
            <span className="ml-2 text-[color:var(--brand-primary)]">
              {t(
                msg`互伤：你 -${lastRound.outcome.playerDamage} / 对手 -${lastRound.outcome.npcDamage}`,
              )}
            </span>
          ) : null}
          {lastRound.outcome.summary === "block" ? (
            <span className="ml-2 text-[color:var(--text-secondary)]">
              {t(msg`攻击被防住`)}
            </span>
          ) : null}
          {lastRound.outcome.summary === "stalemate" ? (
            <span className="ml-2 text-[color:var(--text-secondary)]">
              {t(msg`两人对峙`)}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* 出招按钮 */}
      {isFighting ? (
        <div className="grid grid-cols-3 gap-2">
          <ActionButton
            icon={<Sword size={16} />}
            label={t(msg`攻击`)}
            hint={t(msg`-${8 + (player?.atkBonus ?? 0)}`)}
            onClick={() => actions.play("attack")}
            tone="rose"
          />
          <ActionButton
            icon={<Shield size={16} />}
            label={t(msg`防御`)}
            hint={t(msg`挡攻击`)}
            onClick={() => actions.play("defend")}
            tone="sky"
          />
          <ActionButton
            icon={<Zap size={16} />}
            label={t(msg`必杀`)}
            hint={t(msg`-${12 + (player?.atkBonus ?? 0)}`)}
            onClick={() => actions.play("special")}
            tone="violet"
          />
        </div>
      ) : null}

      {!isFighting ? (
        <button
          type="button"
          onClick={actions.start}
          className="flex items-center justify-center gap-1.5 rounded-full bg-[color:var(--brand-primary)] px-4 py-2 text-[length:var(--text-caption)] font-medium text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)]"
        >
          <Play size={14} />
          {isEnded ? t(msg`再战一场`) : t(msg`开始对打`)}
        </button>
      ) : (
        <div className="rounded-[var(--radius-sm)] bg-[color:var(--brand-soft)] px-3 py-1.5 text-center text-[length:var(--text-caption)] text-[color:var(--brand-primary)]">
          {t(msg`第 ${state.round} / ${ROUND_COUNT} 回合`)}
        </div>
      )}

      {/* 选角 */}
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3">
        <div className="mb-2 text-[length:var(--text-caption)] font-medium">{t(msg`选择我的角色`)}</div>
        <ul className="grid grid-cols-2 gap-2">
          {FIGHTERS.map((f) => {
            const active = f.id === state.playerFighterId;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => actions.selectPlayer(f.id)}
                  disabled={isFighting}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-2 text-left text-[length:var(--text-caption)]",
                    active
                      ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)]"
                      : "border-[color:var(--border-faint)] bg-[color:var(--surface-card)]",
                    isFighting && "opacity-60",
                  )}
                >
                  <span className="text-[20px]">{f.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[color:var(--text-primary)]">
                      {f.name}{" "}
                      <span className="text-[10px] text-[color:var(--text-secondary)]">
                        HP {f.hp} · ATK {f.atkBonus >= 0 ? `+${f.atkBonus}` : f.atkBonus} · DEF {f.defBonus}
                      </span>
                    </div>
                    <div className="text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
                      {f.blurb}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 战绩 */}
      <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] p-3 text-center text-[length:var(--text-caption)]">
        <Stat label={t(msg`总胜场`)} value={state.totalWins} />
        <Stat label={t(msg`最佳连胜`)} value={state.bestStreak} />
        <Stat label={t(msg`连胜章`)} value={state.badge} />
      </div>

      {/* 结算 */}
      {isEnded ? (
        <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-brand)] bg-[color:var(--brand-soft)] p-3 text-center">
          <p className="text-[length:var(--text-caption)] font-medium text-[color:var(--brand-primary)]">
            {state.playerHp > state.npcHp
              ? t(msg`赢下这场！`)
              : state.playerHp < state.npcHp
                ? t(msg`这场让对手压制了。`)
                : t(msg`平局，下次见胜负。`)}
          </p>
          <p className="mt-1 text-[length:var(--text-caption)] text-[color:var(--brand-primary)]/80">
            {t(
              msg`HP 残：你 ${state.playerHp} / 对手 ${state.npcHp} · 当前连胜 ${state.winStreak}`,
            )}
          </p>
          <div className="mt-2 flex justify-center gap-2">
            <button
              type="button"
              onClick={actions.start}
              className="rounded-full bg-[color:var(--brand-primary)] px-4 py-1.5 text-[length:var(--text-caption)] font-medium text-[color:var(--text-on-brand)] hover:bg-[color:var(--brand-primary)]"
            >
              {t(msg`再战一场`)}
            </button>
            <button
              type="button"
              onClick={actions.backIdle}
              className="rounded-full border border-[color:var(--border-faint)] px-4 py-1.5 text-[length:var(--text-caption)] text-[color:var(--text-secondary)]"
            >
              {t(msg`回到擂台`)}
            </button>
          </div>
        </div>
      ) : null}

      {/* 日志 */}
      <div className="rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]">
        <div className="flex items-center justify-between border-b border-[color:var(--border-faint)] px-3 py-1.5 text-[length:var(--text-caption)] text-[color:var(--text-secondary)]">
          <span>{t(msg`擂台日志`)}</span>
          <button
            type="button"
            onClick={actions.reset}
            className="flex items-center gap-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]"
          >
            <RotateCcw size={11} />
            {t(msg`重置`)}
          </button>
        </div>
        <ul className="max-h-44 overflow-y-auto px-3 py-2">
          {state.log.length === 0 ? (
            <li className="py-1 text-[length:var(--text-caption)] text-[color:var(--text-tertiary)]">
              {t(msg`等待开局…`)}
            </li>
          ) : (
            state.log.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "py-1 text-[length:var(--text-caption)] leading-[1.5rem]",
                  entry.tone === "success" && "text-[color:var(--brand-primary)]",
                  entry.tone === "warn" && "text-[color:var(--brand-primary)]",
                  entry.tone === "info" && "text-[color:var(--text-secondary)]",
                )}
              >
                {entry.text}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

function FighterCard({
  fighter,
  hp,
  maxHp,
  tone,
  align,
}: {
  fighter: Fighter | undefined;
  hp: number;
  maxHp: number;
  tone: "violet" | "rose";
  align: "left" | "right";
}) {
  const pct = Math.max(0, Math.round((hp / maxHp) * 100));
  if (!fighter) return null;
  const toneCls =
    tone === "violet"
      ? "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)]"
      : "border-[color:var(--border-brand)] bg-[color:var(--brand-soft)]";
  return (
    <div className={cn("rounded-[var(--radius-sm)] border p-3", toneCls)}>
      <div
        className={cn(
          "flex items-center gap-2",
          align === "right" && "flex-row-reverse text-right",
        )}
      >
        <span className="text-[length:var(--text-display)]">{fighter.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
            {fighter.name}
          </div>
          <div className="text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
            HP {hp}/{maxHp}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1">
        <Heart
          size={11}
          className={tone === "violet" ? "text-[color:var(--brand-primary)]" : "text-[color:var(--brand-primary)]"}
        />
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-card)]">
          <div
            className={cn(
              "h-full rounded-full",
              tone === "violet" ? "bg-[color:var(--brand-primary)]" : "bg-[color:var(--brand-primary)]",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  hint,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  tone: "rose" | "sky" | "violet";
}) {
  const toneCls =
    tone === "rose"
      ? "bg-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]"
      : tone === "sky"
        ? "bg-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]"
        : "bg-[color:var(--brand-primary)] hover:bg-[color:var(--brand-primary)]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-sm)] py-3 text-[color:var(--text-on-brand)] shadow-md",
        toneCls,
      )}
    >
      <span className="flex items-center gap-1 text-[length:var(--text-body)] font-medium">
        {icon}
        {label}
      </span>
      <span className="text-[length:var(--text-eyebrow)] opacity-90">{hint}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[length:var(--text-title)] font-semibold text-[color:var(--text-primary)]">
        {value}
      </div>
      <div className="text-[length:var(--text-eyebrow)] text-[color:var(--text-secondary)]">
        {label}
      </div>
    </div>
  );
}
// i18n-ignore-end

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { asset } from "@/lib/asset";
import { getCard, RARITY_LABEL } from "@/game/cards";
import type { CardDef, Keyword } from "@/game/types";

const SIZE = {
  xs: "w-[4.4rem] h-[6.15rem] text-[0.55rem] rounded-[0.7rem]",
  sm: "w-[5.15rem] h-[7.25rem] text-[0.6rem] rounded-[0.8rem]",
  hand: "w-[6.5rem] h-[9.15rem] text-[0.6rem] rounded-[0.85rem]",
  board: "w-full h-full text-[0.58rem] rounded-[0.7rem]",
  tile: "block w-full min-w-0 aspect-[5/7] h-auto text-[0.62rem] rounded-[0.85rem]",
  md: "w-[8.4rem] h-[11.8rem] text-[0.7rem] rounded-[1rem]",
  lg: "w-[12.6rem] h-[17.7rem] text-sm rounded-[1.15rem]",
} as const;

const INNER = {
  xs: "rounded-[0.55rem]",
  sm: "rounded-[0.62rem]",
  hand: "rounded-[0.68rem]",
  board: "rounded-[0.55rem]",
  tile: "rounded-[0.68rem]",
  md: "rounded-[0.8rem]",
  lg: "rounded-[0.95rem]",
} as const;

const FACTION_GLOW: Record<string, string> = {
  shadowborn: "shadow-[0_0_16px_rgb(196_183_160_/_0.35)]",
  crimson: "shadow-[0_0_16px_rgb(180_35_24_/_0.4)]",
  abyssal: "shadow-[0_0_16px_rgb(111_143_138_/_0.4)]",
  revenant: "shadow-[0_0_16px_rgb(207_198_184_/_0.3)]",
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function liveVars(id: string): CSSProperties {
  const t = hashId(id);
  const x = ((t % 11) - 5) * 0.95;
  const y = (((t >> 4) % 9) - 4) * 0.85;
  const artDur = 13 + (t % 10);
  const auraDur = 8 + ((t >> 8) % 7);
  return {
    "--art-x": `${x}%`,
    "--art-y": `${y}%`,
    "--art-dur": `${artDur}s`,
    "--art-delay": `-${(t >> 6) % artDur}s`,
    "--aura-dur": `${auraDur}s`,
    "--aura-delay": `-${(t >> 10) % auraDur}s`,
  } as CSSProperties;
}

function auraKind(card: CardDef): string {
  const t = card.keywords[0];
  if (t === "rush" || t === "frenzy") return "rush";
  if (t === "guard" || t === "ward") return "ward";
  if (t === "stalk") return "mist";
  if (t === "reborn") return "ash";
  if (t === "cleave" || t === "pierce" || t === "overwhelm") return "tide";
  if (t === "pack" || t === "lifesteal" || t === "venom") return "ember";
  if (t === "apex" || card.rarity === "legendary") return "gold";
  return card.faction;
}

export function CardFace({
  cardId,
  size = "md",
  selected = false,
  dim = false,
  count,
  locked = false,
  onClick,
  attack,
  health,
  canAttack,
  hit = false,
  keywords,
}: {
  cardId: string;
  size?: keyof typeof SIZE;
  selected?: boolean;
  dim?: boolean;
  count?: number;
  locked?: boolean;
  onClick?: () => void;
  attack?: number;
  health?: number;
  canAttack?: boolean;
  hit?: boolean;
  keywords?: Keyword[];
}) {
  const card = getCard(cardId);
  const marks = keywords ?? card.keywords;
  const atk = attack ?? card.attack;
  const hp = health ?? card.health;
  const showText = size === "md" || size === "lg" || size === "hand";
  const detailed = size === "lg";
  const aura = auraKind(card);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={liveVars(card.id)}
      className={cn(
        "card-frame relative overflow-hidden text-left transition-transform duration-(--motion-quick) touch-manipulation",
        `card-frame-${card.faction}`,
        SIZE[size],
        selected && "card-lit ring-2 ring-accent",
        dim && "opacity-45",
        marks.includes("stalk") && "card-stalk",
        canAttack && "card-ready",
        canAttack && FACTION_GLOW[card.faction],
        onClick && "[@media(hover:hover)]:hover:-translate-y-0.5",
        locked && "grayscale",
      )}
    >
      <div className={cn("card-inner relative h-full overflow-hidden bg-surface-2", INNER[size])}>
        <div
          className="card-art"
          style={{ backgroundImage: `url(${asset(`cards/${card.id}.jpg`)})` }}
        />
        <span className={cn("card-aura", `card-aura-${aura}`)} data-aura={aura} aria-hidden />
        <div className="card-light" />
        <Cost cost={card.cost} size={size} />
        {marks.length > 0 && size !== "lg" && (
          <span className="absolute right-1 top-1 z-10 max-w-[70%] truncate rounded-xs bg-bg/75 px-1 text-[0.48rem] uppercase tracking-wide text-accent">
            {marks[0]}
          </span>
        )}
        {card.type === "unit" && atk !== undefined && hp !== undefined && (
          <Stats atk={atk} hp={hp} size={size} />
        )}
        {detailed && (
          <span className="absolute right-1.5 top-1.5 rounded-xs bg-bg/80 px-1 text-[0.58rem] tracking-wide text-accent">
            {RARITY_LABEL[card.rarity]}
          </span>
        )}
        <div
          className={cn(
            "card-nameplate absolute inset-x-0 bottom-0",
            detailed ? "p-1.5 pt-6" : "p-1 pt-5",
          )}
        >
          <p
            className={cn(
              "font-display leading-tight text-fg",
              size === "xs" || size === "sm" ? "text-[0.58rem]" : "text-xs",
            )}
          >
            {card.name}
          </p>
          {detailed && (
            <p className="mt-0.5 text-[0.55rem] tracking-wide text-muted">
              {card.type === "unit" ? "Unit" : "Tactic"}
              {marks.length ? ` · ${marks.join(" · ")}` : ""}
            </p>
          )}
          {showText && card.text ? (
            <p
              className={cn(
                "mt-0.5 leading-snug text-accent/90",
                detailed ? "text-[0.68rem]" : "line-clamp-2 text-[0.62rem]",
              )}
            >
              {card.text}
            </p>
          ) : null}
        </div>
        {count !== undefined && (
          <span className="absolute bottom-1 right-1 rounded-xs bg-bg/80 px-1 font-medium tabular-nums text-[0.6rem]">
            ×{count}
          </span>
        )}
        {locked && (
          <div className="absolute inset-0 grid place-items-center bg-bg/55 text-[0.6rem] tracking-wide text-muted">
            Locked
          </div>
        )}
        {hit && <span className="card-hit-flash" />}
      </div>
    </button>
  );
}

function Cost({ cost, size }: { cost: number; size: string }) {
  const big = size === "lg" || size === "md";
  return (
    <span
      className={cn(
        "card-cost absolute left-1 top-1 grid rotate-45 place-items-center font-display font-semibold text-accent-fg",
        big ? "size-6" : "size-5",
      )}
    >
      <span className="-rotate-45 tabular-nums">{cost}</span>
    </span>
  );
}

function Stats({ atk, hp, size }: { atk: number; hp: number; size: string }) {
  const box = size === "lg" || size === "md" ? "size-6 text-xs" : "size-5 text-[0.65rem]";
  return (
    <>
      <span
        className={cn(
          "absolute bottom-1 left-1 z-10 grid place-items-center rounded-full bg-surface font-display font-semibold tabular-nums text-fg ring-1 ring-accent/70",
          box,
        )}
      >
        {atk}
      </span>
      <span
        className={cn(
          "absolute bottom-1 right-1 z-10 grid place-items-center rounded-full bg-surface font-display font-semibold tabular-nums text-danger ring-1 ring-danger/50",
          box,
        )}
      >
        {hp}
      </span>
    </>
  );
}

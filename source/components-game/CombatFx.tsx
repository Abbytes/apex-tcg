import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getCard, POWER_CINE_VIDEO } from "@/game/cards";
import type { Faction } from "@/game/types";
import { asset } from "@/lib/asset";
import { anchorKey, cineHoldMs, type CombatFx, type FxAnchor } from "@/game/fx";
import type { WeaponKind } from "@/game/weapons";
import { cn } from "@/lib/utils";

type Point = { x: number; y: number };

export function CombatFxLayer({
  fx,
  points,
}: {
  fx: CombatFx | null;
  points: Record<string, Point>;
}) {
  const [live, setLive] = useState<CombatFx | null>(null);
  const [cine, setCine] = useState<CombatFx | null>(null);

  useLayoutEffect(() => {
    if (!fx) return;
    setLive(fx);
    if (
      (fx.action.type === "attack" && fx.attackerCardId) ||
      fx.power
    ) {
      setCine(fx);
    }
    const hold = fx.action.type === "attack" ? 720 : 640;
    const t = window.setTimeout(() => setLive((cur) => (cur?.seq === fx.seq ? null : cur)), hold);
    return () => window.clearTimeout(t);
  }, [fx]);

  useLayoutEffect(() => {
    if (!cine) return;
    const t = window.setTimeout(
      () => setCine((cur) => (cur?.seq === cine.seq ? null : cur)),
      cineHoldMs(cine),
    );
    return () => window.clearTimeout(t);
  }, [cine]);

  const hitsFx = live?.action.type === "attack" ? live : cine;
  if (!live && !cine) return <CinePreload />;

  const slashes = (hitsFx?.hits ?? []).filter((h) => {
    if (h.heal || !h.from || h.amount <= 0) return false;
    return anchorKey(h.from) !== anchorKey(h.to);
  });

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 overflow-hidden",
        cine?.cineVideo ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <CinePreload />
      {cine && (cine.attackerArt || cine.attackerCardId || cine.cineVideo) && (
        <Cinematic
          art={cine.attackerArt ?? (cine.attackerCardId ? asset(`cards/${cine.attackerCardId}.jpg`) : "")}
          name={cine.cineName ?? (cine.attackerCardId ? getCard(cine.attackerCardId).name : "Power strike")}
          title={cine.cineTitle}
          deckName={cine.deckName}
          defenderArt={cine.defenderArt}
          sigilArt={cine.sigilArt}
          weapon={cine.weapon ?? "spear"}
          faction={cine.faction}
          heavy={cine.shake === 2}
          power={cine.power}
          epic={cine.epic}
          video={cine.cineVideo}
        />
      )}
      {slashes.map((h) => {
        const from = pointOf(points, h.from);
        const to = pointOf(points, h.to);
        if (!from || !to) return null;
        return (
          <Slash
            key={`s-${h.id}`}
            from={from}
            to={to}
            heavy={h.face}
            weapon={hitsFx?.weapon ?? "blade"}
          />
        );
      })}
      {(hitsFx?.hits ?? []).map((h) => {
        const to = pointOf(points, h.to);
        if (!to) return null;
        return (
          <Fragment key={h.id}>
            {!h.heal && <Impact cx={to.x} cy={to.y} heavy={h.face || h.killed} />}
            <span
              className={cn("fx-dmg", h.heal ? "text-accent" : "text-danger")}
              style={{ left: to.x, top: to.y }}
            >
              {h.heal ? `+${h.amount}` : `−${h.amount}`}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function Cinematic({
  art,
  name,
  title,
  deckName,
  defenderArt,
  sigilArt,
  weapon,
  faction,
  heavy,
  power,
  epic,
  video,
}: {
  art: string;
  name: string;
  title?: string;
  deckName?: string;
  defenderArt?: string;
  sigilArt?: string;
  weapon: WeaponKind;
  faction?: Faction;
  heavy: boolean;
  power: boolean;
  epic: boolean;
  video?: string;
}) {
  const motes = useMemo(
    () =>
      Array.from({ length: epic ? 36 : power ? 22 : 14 }, (_, i) => ({
        i,
        x: 4 + ((i * 17) % 92),
        y: 12 + ((i * 23) % 70),
        d: epic ? 1400 + (i % 6) * 220 : 900 + (i % 5) * 180,
        delay: epic ? (i % 12) * 90 : (i % 8) * 60,
        s: epic ? 5 + (i % 6) : 4 + (i % 5),
      })),
    [power, epic],
  );
  return (
    <div
      className={cn(
        "cine",
        `cine-${weapon}`,
        faction && `cine-deck cine-${faction}`,
        heavy && "cine-heavy",
        power && "cine-power",
        epic && "cine-epic",
        video && "cine-video-mode",
      )}
    >
      <span className="cine-ground" />
      {faction && <span className={`cine-deck-wash cine-deck-wash-${faction}`} />}
      {video ? (
        <CineVideo src={video} poster={art} />
      ) : (
        <>
          {defenderArt && (
            <img src={defenderArt} alt="" className="cine-foe" crossOrigin="anonymous" />
          )}
          {sigilArt && (
            <img src={sigilArt} alt="" className="cine-sigil" crossOrigin="anonymous" />
          )}
          <img src={art} alt="" className="cine-art" crossOrigin="anonymous" />
        </>
      )}
      <div className="cine-wash" />
      {epic && <span className="cine-veil" />}
      {faction === "shadowborn" && (
        <>
          <span className="cine-motif cine-spears" />
          <span className="cine-motif cine-spears cine-spears-2" />
        </>
      )}
      {faction === "crimson" && (
        <>
          <span className="cine-motif cine-claws" />
          <span className="cine-motif cine-claws cine-claws-2" />
        </>
      )}
      {faction === "abyssal" && (
        <>
          <span className="cine-motif cine-tide" />
          <span className="cine-motif cine-tide cine-tide-2" />
        </>
      )}
      {faction === "revenant" && (
        <>
          <span className="cine-motif cine-ash" />
          <span className="cine-motif cine-ash cine-ash-2" />
        </>
      )}
      <span className="cine-bloom" />
      {power && <span className="cine-shock" />}
      {epic && <span className="cine-shock cine-shock-2" />}
      {epic && <span className="cine-rune" />}
      {epic && <span className="cine-rune cine-rune-2" />}
      <span className="cine-flash" />
      <span className="cine-ring" />
      <span className="cine-streak" />
      <span className="cine-streak cine-streak-2" />
      <span className="cine-streak cine-streak-3" />
      {epic && <span className="cine-streak cine-streak-4" />}
      {epic && <span className="cine-streak cine-streak-5" />}
      <div className="cine-motes">
        {motes.map((m) => (
          <span
            key={m.i}
            className="cine-mote"
            style={
              {
                left: `${m.x}%`,
                top: `${m.y}%`,
                width: m.s,
                height: m.s,
                animationDuration: `${m.d}ms`,
                animationDelay: `${m.delay}ms`,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span className="cine-bar cine-bar-top" />
      <span className="cine-bar cine-bar-bot" />
      {power && <p className="cine-label">{deckName ?? "Power strike"}</p>}
      {epic && title && <p className="cine-subtitle">{title}</p>}
      <p className="cine-name">{name}</p>
    </div>
  );
}

function CinePreload() {
  return (
    <>
      {Object.values(POWER_CINE_VIDEO).map((src) => (
        <video
          key={src}
          src={asset(src)}
          className="hidden"
          muted
          playsInline
          preload="auto"
          aria-hidden
        />
      ))}
    </>
  );
}

function CineVideo({ src, poster }: { src: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.playsInline = true;
    el.setAttribute("webkit-playsinline", "true");
    el.currentTime = 0;
    el.muted = true;
    const tryPlay = () => {
      const play = el.play();
      if (!play) return;
      play
        .then(() => {
          el.muted = false;
        })
        .catch(() => {
          el.muted = true;
          void el.play().catch(() => {});
        });
    };
    tryPlay();
    el.addEventListener("loadeddata", tryPlay);
    return () => {
      el.removeEventListener("loadeddata", tryPlay);
      el.pause();
    };
  }, [src]);
  return (
    <video
      ref={ref}
      className="cine-video"
      src={src}
      poster={poster}
      autoPlay
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      data-cine-video
    />
  );
}

function pointOf(points: Record<string, Point>, anchor?: FxAnchor): Point | null {
  if (!anchor) return null;
  return points[anchorKey(anchor)] ?? null;
}

function Slash({
  from,
  to,
  heavy,
  weapon,
}: {
  from: Point;
  to: Point;
  heavy: boolean;
  weapon: WeaponKind;
}) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.max(24, Math.hypot(dx, dy));
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <div
      className="absolute origin-left"
      style={{
        left: from.x,
        top: from.y,
        width: len,
        height: heavy || weapon === "crush" ? 6 : weapon === "spear" ? 2 : 3,
        transform: `rotate(${angle}deg) translateY(-50%)`,
      }}
    >
      <div className={cn("fx-slash", `fx-slash-${weapon}`, heavy && "fx-slash-heavy")} />
    </div>
  );
}

function Impact({ cx, cy, heavy }: { cx: number; cy: number; heavy: boolean }) {
  const sparks = useMemo(() => {
    const n = heavy ? 10 : 7;
    return Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n + (i % 2) * 0.2;
      const d = 18 + (i % 3) * 10;
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, i };
    });
  }, [heavy]);
  return (
    <div className="absolute" style={{ left: cx, top: cy }}>
      <span className={cn("fx-ring", heavy && "fx-ring-heavy")} />
      {sparks.map((s) => (
        <span
          key={s.i}
          className="fx-spark"
          style={{ "--dx": `${s.dx}px`, "--dy": `${s.dy}px` } as CSSProperties}
        />
      ))}
    </div>
  );
}

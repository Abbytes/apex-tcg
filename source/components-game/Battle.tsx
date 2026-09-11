import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Crown, Heart, Lightbulb, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardFace } from "@/components/game/CardFace";
import { CombatFxLayer } from "@/components/game/CombatFx";
import { chooseAiAction, choosePlayAction, choosePowerAction, chooseStrikeAction, describeAction } from "@/game/ai";
import { sfx } from "@/game/audio";
import { getCard, getHunter } from "@/game/cards";
import {
  attackTargetsFor,
  canPlay,
  legalActions,
  playBlockReason,
  playTargetsFor,
  powerTargetsFor,
  unitAttack,
} from "@/game/engine";
import { hintAnchors } from "@/game/fx";
import { useGame } from "@/game/store";
import type { Action, Match, SideKey, TargetRef, UnitInst } from "@/game/types";
import { cn } from "@/lib/utils";
import { asset } from "@/lib/asset";

type Sel =
  | { kind: "hand"; iid: string }
  | { kind: "unit"; iid: string }
  | { kind: "power" }
  | null;

type Point = { x: number; y: number };

export function Battle() {
  const match = useGame((s) => s.match);
  const thinking = useGame((s) => s.thinking);
  const mode = useGame((s) => s.mode);
  const lastFx = useGame((s) => s.lastFx);
  const act = useGame((s) => s.act);
  const concede = useGame((s) => s.concede);
  const leaveBattle = useGame((s) => s.leaveBattle);
  const [sel, setSel] = useState<Sel>(null);
  const [placeSlot, setPlaceSlot] = useState<number | null>(null);
  const [hint, setHint] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [hitKeys, setHitKeys] = useState<Set<string>>(() => new Set());
  const [strikingIid, setStrikingIid] = useState<string | undefined>(undefined);
  const [points, setPoints] = useState<Record<string, Point>>({});
  const stageRef = useRef<HTMLDivElement>(null);
  const pointCache = useRef<Record<string, Point>>({});

  useLayoutEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const cr = root.getBoundingClientRect();
    const next = { ...pointCache.current };
    root.querySelectorAll<HTMLElement>("[data-anchor]").forEach((el) => {
      const key = el.dataset.anchor;
      if (!key) return;
      const r = el.getBoundingClientRect();
      next[key] = {
        x: r.left - cr.left + r.width / 2,
        y: r.top - cr.top + r.height / 2,
      };
    });
    pointCache.current = next;
    setPoints(next);
  }, [match, lastFx, sel, hint]);

  useEffect(() => {
    if (!lastFx) return;
    setShake(lastFx.shake);
    setStrikingIid(lastFx.attackerIid);
    setHitKeys(
      new Set(
        lastFx.hits
          .filter((h) => !h.heal && h.amount > 0)
          .map((h) => {
            if (h.to.kind === "hunter") return `hunter-${h.to.side}`;
            if (h.to.kind === "unit") return `unit-${h.to.side}-${h.to.iid}`;
            return "";
          })
          .filter(Boolean),
      ),
    );
    const t1 = window.setTimeout(() => setShake(0), 420);
    const t2 = window.setTimeout(() => setHitKeys(new Set()), 320);
    const t3 = window.setTimeout(() => setStrikingIid(undefined), 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [lastFx]);

  useEffect(() => {
    setHint(null);
    setSel(null);
    setPlaceSlot(null);
    setNotice(null);
  }, [match?.turn, match?.turnNumber]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("tcg-lock");
    const fit = () => {
      const vv = window.visualViewport;
      const h = Math.max(
        window.innerHeight || 0,
        root.clientHeight || 0,
        Math.round(vv?.height ?? 0),
      );
      root.style.setProperty("--table-h", `${h}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("resize", fit);
    window.visualViewport?.addEventListener("scroll", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("resize", fit);
      window.visualViewport?.removeEventListener("scroll", fit);
      root.classList.remove("tcg-lock");
      root.style.removeProperty("--table-h");
    };
  }, []);

  const targets = useMemo(() => {
    if (!match || !sel) return [];
    if (sel.kind === "hand") return playTargetsFor(match, sel.iid);
    if (sel.kind === "unit") return attackTargetsFor(match, sel.iid);
    return powerTargetsFor(match);
  }, [match, sel]);

  if (!match) return null;
  const locked = thinking || match.turn !== "player" || Boolean(match.winner);

  const hintMarks = hint && match.turn === "player" ? hintAnchors(match, hint) : {};
  const strikeAction = locked
    ? null
    : chooseStrikeAction(match, sel?.kind === "unit" ? sel.iid : undefined);
  const previewMarks =
    hintMarks.source || hintMarks.target
      ? hintMarks
      : strikeAction
        ? hintAnchors(match, strikeAction)
        : {};

  const dispatch = (action: Action) => {
    setSel(null);
    setHint(null);
    setNotice(null);
    setPlaceSlot(null);
    act(action);
  };

  const selectedHeld =
    sel?.kind === "hand" ? match.player.hand.find((c) => c.iid === sel.iid) : undefined;
  const selectedCard = selectedHeld ? getCard(selectedHeld.cardId) : undefined;
  const firstEmpty = match.player.board.findIndex((u) => u === null);
  const ghostSlot =
    selectedCard?.type === "unit" && firstEmpty >= 0 ? (placeSlot ?? firstEmpty) : null;
  const pendingPlay =
    sel?.kind === "hand" ? choosePlayAction(match, sel.iid, ghostSlot ?? undefined) : null;
  const dropReady = Boolean(!locked && sel?.kind === "hand" && selectedCard?.type === "unit");

  const commitPlay = () => {
    if (!pendingPlay) {
      if (sel?.kind === "hand") {
        setNotice(playBlockReason(match, sel.iid) ?? "Can't play that yet.");
      }
      return;
    }
    dispatch(pendingPlay);
  };

  const selectHand = (iid: string) => {
    if (locked) {
      setNotice(thinking ? (mode === "duel" ? "Rival hunts." : "Enemy hunt.") : match.winner ? "The hunt is over." : "Wait for your turn.");
      return;
    }
    if (sel?.kind === "hand" && sel.iid === iid) {
      commitPlay();
      return;
    }
    if (!canPlay(match, iid)) {
      setNotice(playBlockReason(match, iid) ?? "Can't play that yet.");
      return;
    }
    setSel({ kind: "hand", iid });
    setPlaceSlot(null);
    setHint(null);
    setNotice(null);
    sfx.ui();
  };

  const applyHintSel = (action: Action) => {
    if (action.type === "play") setSel({ kind: "hand", iid: action.iid });
    else if (action.type === "attack") setSel({ kind: "unit", iid: action.attackerIid });
    else if (action.type === "power") setSel({ kind: "power" });
    else setSel(null);
  };

  const onHint = () => {
    if (locked || !match) return;
    if (hint) {
      dispatch(hint);
      return;
    }
    const legal = legalActions(match);
    let action = chooseAiAction(match);
    if (!legal.some((a) => JSON.stringify(a) === JSON.stringify(action))) {
      action = legal.find((a) => a.type !== "endTurn") ?? { type: "endTurn" };
    }
    sfx.hint();
    setHint(action);
    applyHintSel(action);
  };

  const onStrike = () => {
    if (locked || !strikeAction) return;
    dispatch(strikeAction);
  };

  const onTarget = (target: TargetRef) => {
    if (!sel) return;
    if (sel.kind === "hand") dispatch({ type: "play", iid: sel.iid, target });
    else if (sel.kind === "unit") dispatch({ type: "attack", attackerIid: sel.iid, target });
    else dispatch({ type: "power", target });
  };

  const isTarget = (t: TargetRef) =>
    targets.some((x) => {
      if (x.kind !== t.kind || x.side !== t.side) return false;
      if (x.kind === "unit" && t.kind === "unit") return x.iid === t.iid;
      return true;
    });

  const hintedTarget = (key: string) => previewMarks.target === key;
  const hintedSource = (key: string) => previewMarks.source === key;

  const prompt =
    notice ??
    (hint && !locked
      ? describeAction(match, hint)
      : pendingPlay
        ? "Tap a glowing lane to play"
        : sel?.kind === "unit"
          ? "Tap a foe to strike"
          : match.log.at(-1) ?? "");

  const hunter = getHunter(match.player.hunterId);

  return (
    <div
      ref={stageRef}
      className={cn(
        "tcg-table relative flex flex-col bg-bg",
        shake === 1 && "arena-shake",
        shake === 2 && "arena-shake-heavy",
      )}
    >
      <div className="arena-plate" />
      <div className="stone-ring" />
      <div className="relative z-10 flex h-full min-h-0 flex-col">
        <HeroBar
          side="enemy"
          match={match}
          tag="Rival"
          hinted={hintedSource("hunter-enemy") || hintedTarget("hunter-enemy")}
          hit={hitKeys.has("hunter-enemy")}
          highlight={isTarget({ kind: "hunter", side: "enemy" })}
          onHunter={() => onTarget({ kind: "hunter", side: "enemy" })}
          leading={
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={() => (match.winner ? leaveBattle() : concede())}
              aria-label="Leave"
            >
              <ArrowLeft />
            </Button>
          }
          trailing={
            <div className="flex shrink-0 items-center gap-1.5">
              {hint && !locked && (
                <Button size="sm" className="h-11 px-3" onClick={() => dispatch(hint)}>
                  Play
                </Button>
              )}
              <Button
                size="icon"
                variant={hint ? "default" : "ghost"}
                className="size-11"
                disabled={locked}
                onClick={onHint}
                aria-label={hint ? "Make hinted move" : "Hint"}
              >
                <Lightbulb className="size-4" />
              </Button>
              <button
                type="button"
                disabled={locked}
                onClick={() => dispatch({ type: "endTurn" })}
                className={cn("end-orb", locked && "opacity-40", hint?.type === "endTurn" && "hint-mark")}
              >
                END
                <span>TURN</span>
              </button>
            </div>
          }
        />

        <div className="board-well">
          <BoardRow
            side="enemy"
            match={match}
            locked
            selectedIid={null}
            dropReady={false}
            isTarget={(iid) => isTarget({ kind: "unit", side: "enemy", iid })}
            hintedKey={(key) => hintedTarget(key) || hintedSource(key)}
            hitKeys={hitKeys}
            strikingIid={strikingIid}
            enteringIid={lastFx?.summonedIid}
            onUnit={(unit) => onTarget({ kind: "unit", side: "enemy", iid: unit.iid })}
            onSlot={() => {}}
          />

          <div className="turn-band">
            <p className="turn-pip">
              {match.winner ? "CLOSED" : thinking ? (mode === "duel" ? "RIVAL" : "ENEMY") : `TURN ${match.turnNumber}`}
            </p>
            <p className="turn-prompt">{prompt}</p>
          </div>

          <BoardRow
            side="player"
            match={match}
            locked={locked}
            selectedIid={sel?.kind === "unit" ? sel.iid : null}
            dropReady={dropReady}
            isTarget={(iid) => isTarget({ kind: "unit", side: "player", iid })}
            hintedKey={(key) => hintedTarget(key) || hintedSource(key)}
            hitKeys={hitKeys}
            strikingIid={strikingIid}
            enteringIid={lastFx?.summonedIid}
            ghost={
              ghostSlot !== null && selectedHeld
                ? { cardId: selectedHeld.cardId, slot: ghostSlot }
                : undefined
            }
            onUnit={(unit) => {
              if (isTarget({ kind: "unit", side: "player", iid: unit.iid })) {
                onTarget({ kind: "unit", side: "player", iid: unit.iid });
                return;
              }
              if (locked) return;
              if (unit.canAttack) {
                setHint(null);
                setSel({ kind: "unit", iid: unit.iid });
              }
            }}
            onSlot={(slot) => {
              if (locked || sel?.kind !== "hand" || selectedCard?.type !== "unit") return;
              if (ghostSlot === slot) {
                commitPlay();
                return;
              }
              setPlaceSlot(slot);
            }}
          />
        </div>

        <HeroBar
          side="player"
          match={match}
          tag="You"
          hinted={hintedSource("hunter-player") || hintedTarget("hunter-player")}
          hit={hitKeys.has("hunter-player")}
          highlight={false}
          onHunter={() => {}}
          trailing={
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <Button
                variant={sel?.kind === "power" ? "default" : "secondary"}
                disabled={match.player.powerUsed || locked || match.player.energy < hunter.powerCost}
                onClick={() => {
                  if (locked) return;
                  const action = choosePowerAction(match);
                  if (action) dispatch(action);
                }}
                className="h-11 flex-1 px-2 text-xs"
              >
                <Crown className="size-3.5" />
                Power {hunter.powerCost}
              </Button>
              {pendingPlay ? (
                <Button className="h-11 flex-1 px-2 text-xs" onClick={commitPlay}>
                  Play
                </Button>
              ) : (
                <Button
                  variant={strikeAction && !locked ? "default" : "secondary"}
                  disabled={!strikeAction || locked}
                  onClick={onStrike}
                  className="h-11 flex-1 px-2 text-xs"
                >
                  <Swords className="size-3.5" />
                  Strike
                </Button>
              )}
            </div>
          }
        />

        <div className="hand-rail">
          {match.player.hand.map((c, i) => {
            const playable = !locked && canPlay(match, c.iid);
            const chosen = sel?.kind === "hand" && sel.iid === c.iid;
            const key = `hand-${c.iid}`;
            return (
              <div
                key={c.iid}
                data-anchor={key}
                className={cn(
                  "relative z-[var(--z)] touch-manipulation transition-transform duration-(--motion-quick)",
                  hintedSource(key) && "hint-mark",
                  chosen && "-translate-y-7 scale-110",
                )}
                style={{ zIndex: chosen ? 30 : i + 1 }}
              >
                <CardFace
                  cardId={c.cardId}
                  size="hand"
                  selected={chosen}
                  dim={!playable}
                  onClick={() => selectHand(c.iid)}
                />
              </div>
            );
          })}
        </div>

        {match.winner && (
          <div className="absolute inset-0 z-40 grid place-items-center bg-bg/80 p-6">
            <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
              <p className="font-display text-3xl">
                {match.winner === "player" ? "The hunt is yours." : "The hunt is lost."}
              </p>
              <p className="mt-2 text-sm text-muted">
                {match.winner === "player" ? "+70 shards" : "+25 shards"}
              </p>
              <Button className="mt-6 w-full" onClick={leaveBattle}>
                Return
              </Button>
            </div>
          </div>
        )}
      </div>
      <CombatFxLayer fx={lastFx} points={points} />
    </div>
  );
}

function HeroBar({
  side,
  match,
  tag,
  highlight,
  hinted,
  hit,
  onHunter,
  leading,
  trailing,
}: {
  side: SideKey;
  match: Match;
  tag?: string;
  highlight?: boolean;
  hinted?: boolean;
  hit?: boolean;
  onHunter: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const s = match[side];
  const hunter = getHunter(s.hunterId);
  return (
    <div className="hero-bar">
      {leading}
      <button
        type="button"
        data-anchor={`hunter-${side}`}
        onClick={onHunter}
        className={cn(
          "portrait-ring relative size-11 shrink-0 overflow-hidden",
          highlight && "ring-2 ring-accent",
          hinted && "hint-mark",
        )}
      >
        <img
          src={asset(`hunters/${hunter.id}.jpg`)}
          alt=""
          className="size-full rounded-full object-cover"
          crossOrigin="anonymous"
        />
        {hit && <span className="card-hit-flash" />}
      </button>
      <div className="min-w-0 flex-1">
        {tag && (
          <p className="text-[0.58rem] uppercase tracking-[0.22em] text-accent">{tag}</p>
        )}
        <p className="truncate font-display text-xs tracking-wide">{hunter.name}</p>
        {side === "player" && (
          <p className="truncate text-[0.62rem] text-muted">{s.deckName}</p>
        )}
        <div className="mt-0.5 flex items-center gap-1.5">
          <p className="inline-flex items-center gap-1 text-xs tabular-nums text-danger">
            <Heart className="size-3 fill-danger" />
            {s.hp}
          </p>
          <div className="flex gap-0.5">
            {Array.from({ length: Math.max(s.maxEnergy, 1) }, (_, i) => (
              <span key={i} className={cn("crystal", i < s.energy && "crystal-on")} />
            ))}
          </div>
        </div>
      </div>
      {trailing ?? <div className="flex-1" />}
    </div>
  );
}

function BoardRow({
  side,
  match,
  locked,
  selectedIid,
  dropReady,
  isTarget,
  hintedKey,
  hitKeys,
  strikingIid,
  enteringIid,
  ghost,
  onUnit,
  onSlot,
}: {
  side: SideKey;
  match: Match;
  locked: boolean;
  selectedIid: string | null;
  dropReady: boolean;
  isTarget: (iid: string) => boolean;
  hintedKey: (key: string) => boolean;
  hitKeys: Set<string>;
  strikingIid?: string;
  enteringIid?: string;
  ghost?: { cardId: string; slot: number };
  onUnit: (unit: UnitInst) => void;
  onSlot: (slot: number) => void;
}) {
  const board = match[side].board;
  return (
    <div className="lane-grid">
      {board.map((unit, i) =>
        unit ? (
          <div
            key={unit.iid}
            data-anchor={`unit-${side}-${unit.iid}`}
            className={cn(
              "lane-cell relative",
              hintedKey(`unit-${side}-${unit.iid}`) && "hint-mark",
              strikingIid === unit.iid && (side === "player" ? "card-lunge-up" : "card-lunge-down"),
              enteringIid === unit.iid && "card-enter",
            )}
          >
            <CardFace
              cardId={unit.cardId}
              size="board"
              selected={selectedIid === unit.iid || isTarget(unit.iid)}
              canAttack={side === "player" && unit.canAttack && !locked}
              attack={unitAttack(unit, match[side])}
              health={unit.health}
              keywords={unit.keywords}
              hit={hitKeys.has(`unit-${side}-${unit.iid}`)}
              onClick={() => onUnit(unit)}
            />
          </div>
        ) : ghost?.slot === i ? (
          <div
            key={`ghost-${side}-${i}`}
            data-anchor={`slot-${side}-${i}`}
            className="lane-cell relative opacity-80"
          >
            <CardFace cardId={ghost.cardId} size="board" selected onClick={() => onSlot(i)} />
          </div>
        ) : (
          <button
            key={`empty-${side}-${i}`}
            type="button"
            data-anchor={`slot-${side}-${i}`}
            onClick={() => onSlot(i)}
            className={cn("lane-empty", dropReady && "drop-ready", hintedKey(`slot-${side}-${i}`) && "hint-mark")}
            aria-label="Empty lane"
          />
        ),
      )}
    </div>
  );
}

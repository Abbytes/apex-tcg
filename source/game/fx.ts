import type { Action, Faction, Match, SideKey, TargetRef, UnitInst } from "./types";
import { DECK_SIGILS, POWER_CINE_VIDEO, POWER_STRIKE_NAME, getCard, getHunter } from "./cards";
import { hunterWeapon, weaponOf, type WeaponKind } from "./weapons";
import { asset } from "@/lib/asset";

export type FxAnchor =
  | { kind: "hunter"; side: SideKey }
  | { kind: "unit"; side: SideKey; iid: string }
  | { kind: "slot"; side: SideKey; index: number }
  | { kind: "hand"; iid: string };

export interface CombatHit {
  id: string;
  from?: FxAnchor;
  to: FxAnchor;
  amount: number;
  killed: boolean;
  heal: boolean;
  face: boolean;
}

export interface CombatFx {
  seq: number;
  action: Action;
  side: SideKey;
  hits: CombatHit[];
  attackerIid?: string;
  summonedIid?: string;
  attackerCardId?: string;
  defenderArt?: string;
  weapon?: WeaponKind;
  shake: 0 | 1 | 2;
  power: boolean;
  epic: boolean;
  attackerArt?: string;
  cineName?: string;
  cineTitle?: string;
  faction?: Faction;
  deckName?: string;
  sigilArt?: string;
  cineVideo?: string;
}

let seq = 0;

function units(side: Match["player"]): UnitInst[] {
  return side.board.filter((u): u is UnitInst => u !== null);
}

export function anchorKey(anchor: FxAnchor): string {
  if (anchor.kind === "hunter") return `hunter-${anchor.side}`;
  if (anchor.kind === "unit") return `unit-${anchor.side}-${anchor.iid}`;
  if (anchor.kind === "slot") return `slot-${anchor.side}-${anchor.index}`;
  return `hand-${anchor.iid}`;
}

export function cineHoldMs(fx: CombatFx): number {
  if (fx.cineVideo) return 15200;
  if (fx.epic) return 4200;
  if (fx.power) return 2280;
  return 1680;
}

export function buildCombatFx(prev: Match, next: Match, action: Action): CombatFx {
  seq += 1;
  const side = prev.turn;
  const hits: CombatHit[] = [];
  const from = sourceAnchor(prev, action);

  for (const sk of ["player", "enemy"] as SideKey[]) {
    const delta = prev[sk].hp - next[sk].hp;
    if (delta > 0) {
      hits.push({
        id: `${seq}-h-${sk}`,
        from,
        to: { kind: "hunter", side: sk },
        amount: delta,
        killed: next[sk].hp <= 0,
        heal: false,
        face: true,
      });
    } else if (delta < 0) {
      hits.push({
        id: `${seq}-heal-${sk}`,
        from,
        to: { kind: "hunter", side: sk },
        amount: -delta,
        killed: false,
        heal: true,
        face: true,
      });
    }
    const before = new Map(units(prev[sk]).map((u) => [u.iid, u]));
    const after = new Map(units(next[sk]).map((u) => [u.iid, u]));
    for (const [iid, unit] of before) {
      const later = after.get(iid);
      const now = later?.health ?? 0;
      const change = unit.health - now;
      if (change > 0) {
        hits.push({
          id: `${seq}-u-${iid}`,
          from,
          to: { kind: "unit", side: sk, iid },
          amount: change,
          killed: !later,
          heal: false,
          face: false,
        });
      } else if (change < 0) {
        hits.push({
          id: `${seq}-ubuff-${iid}`,
          from,
          to: { kind: "unit", side: sk, iid },
          amount: -change,
          killed: false,
          heal: true,
          face: false,
        });
      }
    }
  }

  let shake: 0 | 1 | 2 = 0;
  if (hits.some((h) => h.face && !h.heal && h.amount >= 3)) shake = 2;
  else if (hits.some((h) => !h.heal && h.amount > 0)) shake = 1;
  if (action.type === "endTurn") shake = 0;

  let summonedIid: string | undefined;
  if (action.type === "play") {
    const before = new Set(units(prev[side]).map((u) => u.iid));
    summonedIid = units(next[side]).find((u) => !before.has(u.iid))?.iid;
  }

  let attackerCardId: string | undefined;
  let defenderArt: string | undefined;
  let weapon: WeaponKind | undefined;
  let power = false;
  let epic = false;
  let attackerArt: string | undefined;
  let cineName: string | undefined;
  let cineTitle: string | undefined;
  let faction: Faction | undefined;
  let deckName: string | undefined;
  let sigilArt: string | undefined;
  let cineVideo: string | undefined;

  if (action.type === "attack") {
    const attacker = prev[side].board.find((u) => u?.iid === action.attackerIid);
    if (attacker) {
      attackerCardId = attacker.cardId;
      weapon = weaponOf(attacker.cardId);
      cineName = getCard(attacker.cardId).name;
    }
    if (action.target.kind === "hunter") {
      defenderArt = asset(`hunters/${getHunter(prev[action.target.side].hunterId).id}.jpg`);
      power = Boolean(attacker?.keywords.includes("pierce"));
    } else {
      const target = action.target;
      const def = prev[target.side].board.find((u) => u?.iid === target.iid);
      if (def) defenderArt = asset(`cards/${def.cardId}.jpg`);
    }
  } else if (action.type === "power") {
    const hunter = getHunter(prev[side].hunterId);
    const theme = deckTheme(prev[side]);
    power = true;
    epic = true;
    faction = theme.faction;
    deckName = theme.name;
    attackerArt = asset(`hunters/${hunter.id}.jpg`);
    cineName = POWER_STRIKE_NAME[theme.faction];
    cineTitle = hunter.name;
    weapon = hunterWeapon(hunter.id);
    sigilArt = asset(`cards/${theme.sigil}.jpg`);
    const video = POWER_CINE_VIDEO[theme.faction];
    if (video) cineVideo = asset(video);
    if (action.target?.kind === "hunter") {
      defenderArt = asset(`hunters/${getHunter(prev[action.target.side].hunterId).id}.jpg`);
    } else if (action.target?.kind === "unit") {
      const t = action.target;
      const def = prev[t.side].board.find((u) => u?.iid === t.iid);
      if (def) defenderArt = asset(`cards/${def.cardId}.jpg`);
    } else {
      defenderArt = asset(`hunters/${getHunter(prev[otherSide(side)].hunterId).id}.jpg`);
    }
  } else if (action.type === "play") {
    const held = prev[side].hand.find((c) => c.iid === action.iid);
    const card = held ? getCard(held.cardId) : undefined;
    if (card && (card.battlecry?.kind === "damageEnemyHunter" || card.battlecry?.kind === "rendHunter")) {
      power = true;
      attackerCardId = card.id;
      cineName = card.name;
      weapon = weaponOf(card.id);
      defenderArt = asset(`hunters/${getHunter(prev[otherSide(side)].hunterId).id}.jpg`);
    }
  }

  if (power) shake = 2;

  return {
    seq,
    action,
    side,
    hits,
    attackerIid: action.type === "attack" ? action.attackerIid : undefined,
    summonedIid,
    attackerCardId,
    defenderArt,
    weapon,
    shake,
    power,
    epic,
    attackerArt,
    cineName,
    cineTitle,
    faction,
    deckName,
    sigilArt,
    cineVideo,
  };
}

function deckTheme(side: Match["player"]): { faction: Faction; name: string; sigil: string } {
  const hunter = getHunter(side.hunterId);
  const faction = hunter.faction;
  const pool = [
    ...side.deck,
    ...side.hand.map((c) => c.cardId),
    ...side.board.filter((u): u is NonNullable<typeof u> => u !== null).map((u) => u.cardId),
    ...side.grave,
  ];
  const sigil = DECK_SIGILS[faction].find((id) => pool.includes(id)) ?? DECK_SIGILS[faction][0]!;
  return { faction, name: side.deckName || hunter.title, sigil };
}

function otherSide(side: SideKey): SideKey {
  return side === "player" ? "enemy" : "player";
}

function sourceAnchor(match: Match, action: Action): FxAnchor | undefined {
  if (action.type === "attack") {
    return { kind: "unit", side: match.turn, iid: action.attackerIid };
  }
  if (action.type === "power") {
    return { kind: "hunter", side: match.turn };
  }
  if (action.type === "play") {
    return { kind: "hand", iid: action.iid };
  }
  return undefined;
}

export function hintAnchors(match: Match, action: Action): { source?: string; target?: string } {
  if (action.type === "endTurn") return {};
  if (action.type === "play") {
    const source = `hand-${action.iid}`;
    if (action.target) return { source, target: anchorKey(targetToAnchor(action.target)) };
    if (action.slot !== undefined) {
      return { source, target: `slot-${match.turn}-${action.slot}` };
    }
    return { source };
  }
  if (action.type === "attack") {
    return {
      source: `unit-${match.turn}-${action.attackerIid}`,
      target: anchorKey(targetToAnchor(action.target)),
    };
  }
  if (action.target) {
    return { source: `hunter-${match.turn}`, target: anchorKey(targetToAnchor(action.target)) };
  }
  return { source: `hunter-${match.turn}` };
}

function targetToAnchor(target: TargetRef): FxAnchor {
  if (target.kind === "hunter") return { kind: "hunter", side: target.side };
  return { kind: "unit", side: target.side, iid: target.iid };
}

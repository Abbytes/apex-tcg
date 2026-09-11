import { getCard, getHunter } from "./cards";
import { applyAction, legalActions, unitAttack } from "./engine";
import type { Action, Match, SideKey, TargetRef, UnitInst } from "./types";

function units(match: Match, side: SideKey): UnitInst[] {
  return match[side].board.filter((u): u is UnitInst => u !== null);
}

function evaluate(match: Match, side: SideKey): number {
  if (match.winner === side) return 10_000;
  if (match.winner && match.winner !== side) return -10_000;
  const opp: SideKey = side === "player" ? "enemy" : "player";
  const self = match[side];
  const foe = match[opp];
  let score = (self.hp - foe.hp) * 4;
  for (const u of units(match, side)) {
    score += unitAttack(u, self) * 2 + u.health * 2;
    if (u.keywords.includes("guard")) score += 1;
    if (u.keywords.includes("ward")) score += 2;
    if (u.keywords.includes("retaliate")) score += 1;
    if (u.keywords.includes("pierce")) score += 2;
    if (u.keywords.includes("stalk")) score += 2;
    if (u.keywords.includes("venom")) score += 3;
    if (u.keywords.includes("cleave")) score += 2;
    if (u.keywords.includes("reborn")) score += 2;
    if (u.keywords.includes("frenzy")) score += 1;
    if (u.keywords.includes("overwhelm")) score += 2;
  }
  for (const u of units(match, opp)) {
    score -= unitAttack(u, foe) * 2 + u.health * 2;
  }
  score += self.hand.length;
  score -= foe.hand.length * 0.5;
  return score;
}

function actionPriority(match: Match, action: Action): number {
  if (action.type === "endTurn") return -1;
  if (action.type === "play") {
    const held = match[match.turn].hand.find((c) => c.iid === action.iid);
    if (!held) return 0;
    return getCard(held.cardId).cost + 8;
  }
  if (action.type === "attack") {
    if (action.target.kind === "hunter") return 6;
    return 7;
  }
  return 3;
}

export function chooseStrikeAction(
  match: Match,
  attackerIid?: string,
): Extract<Action, { type: "attack" }> | null {
  const options = legalActions(match).filter(
    (a): a is Extract<Action, { type: "attack" }> =>
      a.type === "attack" && (!attackerIid || a.attackerIid === attackerIid),
  );
  if (options.length === 0) return null;
  const side = match.turn;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const action of options) {
    const next = applyAction(match, action);
    let score = evaluate(next, side);
    if (action.target.kind === "hunter") score += 2;
    const atk = match[side].board.find((u) => u?.iid === action.attackerIid);
    if (action.target.kind === "hunter" && atk?.keywords.includes("pierce")) score += 3;
    if (action.target.kind === "unit") {
      const target = action.target;
      const def = match[target.side].board.find((u) => u?.iid === target.iid);
      const atk = match[side].board.find((u) => u?.iid === action.attackerIid);
      if (atk && def && unitAttack(atk, match[side]) >= def.health) score += 4;
    }
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

export function choosePlayAction(
  match: Match,
  heldIid: string,
  preferredSlot?: number,
): Extract<Action, { type: "play" }> | null {
  const options = legalActions(match).filter(
    (a): a is Extract<Action, { type: "play" }> => a.type === "play" && a.iid === heldIid,
  );
  if (options.length === 0) return null;
  if (preferredSlot !== undefined) {
    const preferred = options.find((a) => a.slot === preferredSlot);
    if (preferred) return preferred;
  }
  if (options.every((a) => !a.target && a.slot !== undefined)) {
    return options.slice().sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))[0]!;
  }
  const side = match.turn;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const action of options) {
    const next = applyAction(match, action);
    let score = evaluate(next, side);
    if (action.slot !== undefined) score -= action.slot * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

export function choosePowerAction(match: Match): Extract<Action, { type: "power" }> | null {
  const options = legalActions(match).filter(
    (a): a is Extract<Action, { type: "power" }> => a.type === "power",
  );
  if (options.length === 0) return null;
  if (options.length === 1) return options[0]!;
  const side = match.turn;
  let best = options[0]!;
  let bestScore = -Infinity;
  for (const action of options) {
    const next = applyAction(match, action);
    const score = evaluate(next, side);
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

export function chooseAiAction(match: Match): Action {
  const options = legalActions(match);
  if (options.length === 0) return { type: "endTurn" };
  const side = match.turn;
  let best: Action = { type: "endTurn" };
  let bestScore = -Infinity;
  for (const action of options) {
    const next = applyAction(match, action);
    let score = evaluate(next, side) + actionPriority(match, action);
    if (action.type === "endTurn" && options.length > 1) score -= 4;
    if (action.type === "play") {
      const held = match[side].hand.find((c) => c.iid === action.iid);
      if (held && getCard(held.cardId).type === "tactic") score += 1.5;
    }
    if (action.type === "attack") {
      const target = action.target;
      if (target.kind === "unit") {
        const foe = match[target.side];
        const def = foe.board.find((u) => u?.iid === target.iid);
        const atk = match[side].board.find((u) => u?.iid === action.attackerIid);
        if (atk && def && unitAttack(atk, match[side]) >= def.health) score += 3;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

function describeTarget(match: Match, target?: TargetRef): string | null {
  if (!target) return null;
  if (target.kind === "hunter") return getHunter(match[target.side].hunterId).name;
  const u = match[target.side].board.find((x) => x?.iid === target.iid);
  return u ? getCard(u.cardId).name : "that unit";
}

export function describeAction(match: Match, action: Action): string {
  const side = match.turn;
  if (action.type === "endTurn") return "End the turn.";
  if (action.type === "play") {
    const held = match[side].hand.find((c) => c.iid === action.iid);
    if (!held) return "Play a card.";
    const card = getCard(held.cardId);
    const target = describeTarget(match, action.target);
    if (target) return `Play ${card.name} on ${target}.`;
    return `Play ${card.name}.`;
  }
  if (action.type === "attack") {
    const unit = match[side].board.find((u) => u?.iid === action.attackerIid);
    const name = unit ? getCard(unit.cardId).name : "your unit";
    const target = describeTarget(match, action.target) ?? "the target";
    return `Strike ${target} with ${name}.`;
  }
  const hunter = getHunter(match[side].hunterId);
  const target = describeTarget(match, action.target);
  if (target) return `Use hunter power on ${target}.`;
  return `Use ${hunter.name}'s power.`;
}

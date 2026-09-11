import type { Action, Match, SideKey, TargetRef } from "./types";

export function flipSide(side: SideKey): SideKey {
  return side === "player" ? "enemy" : "player";
}

function flipTarget(target?: TargetRef): TargetRef | undefined {
  if (!target) return target;
  if (target.kind === "hunter") return { kind: "hunter", side: flipSide(target.side) };
  return { kind: "unit", side: flipSide(target.side), iid: target.iid };
}

export function flipAction(action: Action): Action {
  if (action.type === "play") return { ...action, target: flipTarget(action.target) };
  if (action.type === "attack") return { ...action, target: flipTarget(action.target)! };
  if (action.type === "power") return { ...action, target: flipTarget(action.target) };
  return action;
}

export function viewAsPlayer(match: Match, role: "host" | "guest"): Match {
  if (role === "host") return match;
  return {
    ...match,
    player: match.enemy,
    enemy: match.player,
    turn: flipSide(match.turn),
    winner: match.winner ? flipSide(match.winner) : null,
  };
}

export function actionForHost(action: Action, role: "host" | "guest"): Action {
  return role === "guest" ? flipAction(action) : action;
}

export function actionForView(action: Action | null, role: "host" | "guest"): Action | null {
  if (!action) return null;
  return role === "guest" ? flipAction(action) : action;
}

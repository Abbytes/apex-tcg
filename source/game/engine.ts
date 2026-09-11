import { DECK_TITLES, getCard, getHunter } from "./cards";
import {
  BOARD_SIZE,
  ENERGY_CAP,
  HAND_CAP,
  type Action,
  type CardDef,
  type Effect,
  type HandCard,
  type Match,
  type SideKey,
  type SideState,
  type TargetRef,
  type TargetType,
  type UnitInst,
} from "./types";

let nextIid = 1;
function iid(): string {
  nextIid += 1;
  return `c${nextIid}`;
}

export function shuffle<T>(list: T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function other(side: SideKey): SideKey {
  return side === "player" ? "enemy" : "player";
}

function log(match: Match, line: string) {
  match.log = [...match.log.slice(-12), line];
}

function checkWin(match: Match) {
  if (match.winner) return;
  if (match.player.hp <= 0) match.winner = "enemy";
  else if (match.enemy.hp <= 0) match.winner = "player";
}

function unitsOf(side: SideState): UnitInst[] {
  return side.board.filter((u): u is UnitInst => u !== null);
}

export function unitAttack(unit: UnitInst, side: SideState): number {
  let atk = unit.attack + unit.tempAttack;
  if (unit.keywords.includes("pack")) {
    const packmates = unitsOf(side).filter((u) => {
      if (u.iid === unit.iid) return false;
      return getCard(u.cardId).faction === "crimson";
    });
    if (packmates.length > 0) atk += 1;
  }
  return atk;
}

function makeUnit(cardId: string, ready: boolean): UnitInst {
  const card = getCard(cardId);
  const keywords = [...card.keywords];
  return {
    iid: iid(),
    cardId,
    attack: card.attack ?? 0,
    health: card.health ?? 1,
    maxHealth: card.health ?? 1,
    canAttack: ready || keywords.includes("rush"),
    keywords,
    tempAttack: 0,
  };
}

function emptySlot(side: SideState): number {
  return side.board.findIndex((s) => s === null);
}

function findUnit(side: SideState, unitIid: string): UnitInst | null {
  return side.board.find((u) => u?.iid === unitIid) ?? null;
}

function hasGuard(side: SideState): boolean {
  return unitsOf(side).some((u) => u.keywords.includes("guard") && !u.keywords.includes("stalk"));
}

function isStalking(unit: UnitInst): boolean {
  return unit.keywords.includes("stalk");
}

function reveal(unit: UnitInst) {
  unit.keywords = unit.keywords.filter((k) => k !== "stalk");
}

function slotOf(side: SideState, iid: string): number {
  return side.board.findIndex((u) => u?.iid === iid);
}

function takeDamage(unit: UnitInst, n: number): number {
  if (n <= 0) return 0;
  if (unit.keywords.includes("ward")) {
    unit.keywords = unit.keywords.filter((k) => k !== "ward");
    return 0;
  }
  unit.health -= n;
  if (unit.health > 0 && unit.keywords.includes("frenzy")) {
    unit.keywords = unit.keywords.filter((k) => k !== "frenzy");
    unit.canAttack = true;
  }
  return n;
}

function drawOne(match: Match, side: SideKey) {
  const s = match[side];
  if (s.deck.length === 0) {
    s.fatigue += 1;
    s.hp -= s.fatigue;
    log(match, `${hunterName(s)} takes ${s.fatigue} fatigue.`);
    checkWin(match);
    return;
  }
  const cardId = s.deck.pop()!;
  if (s.hand.length >= HAND_CAP) {
    s.grave.push(cardId);
    log(match, `${getCard(cardId).name} burned.`);
    return;
  }
  s.hand.push({ iid: iid(), cardId });
}

function hunterName(side: SideState): string {
  return getHunter(side.hunterId).name;
}

function startTurn(match: Match, side: SideKey) {
  const s = match[side];
  s.maxEnergy = Math.min(ENERGY_CAP, s.maxEnergy + 1);
  s.energy = s.maxEnergy;
  s.powerUsed = false;
  for (const u of unitsOf(s)) {
    u.canAttack = true;
    u.tempAttack = 0;
  }
  drawOne(match, side);
}

function makeSide(hunterId: string, deck: string[], deckName?: string): SideState {
  const hunter = getHunter(hunterId);
  return {
    hunterId,
    deckName: deckName ?? DECK_TITLES[hunterId] ?? hunter.title,
    hp: hunter.hp,
    maxHp: hunter.hp,
    energy: 0,
    maxEnergy: 0,
    deck: shuffle(deck),
    hand: [],
    board: Array.from({ length: BOARD_SIZE }, () => null),
    grave: [],
    powerUsed: false,
    fatigue: 0,
  };
}

export function adoptIids(match: Match) {
  let max = nextIid;
  const take = (id: string) => {
    const n = Number(id.replace(/\D/g, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  };
  for (const side of [match.player, match.enemy]) {
    for (const card of side.hand) take(card.iid);
    for (const unit of side.board) {
      if (unit) take(unit.iid);
    }
  }
  nextIid = max;
}

export function createMatch(
  playerHunter: string,
  playerDeck: string[],
  enemyHunter: string,
  enemyDeck: string[],
  names?: { player?: string; enemy?: string },
): Match {
  const match: Match = {
    player: makeSide(playerHunter, playerDeck, names?.player),
    enemy: makeSide(enemyHunter, enemyDeck, names?.enemy),
    turn: "player",
    winner: null,
    log: ["The hunt begins."],
    turnNumber: 1,
  };
  for (let i = 0; i < 3; i++) drawOne(match, "player");
  for (let i = 0; i < 4; i++) drawOne(match, "enemy");
  startTurn(match, "player");
  return match;
}

function validTargets(
  match: Match,
  side: SideKey,
  kind: TargetType,
  extra?: { drownMax?: number },
): TargetRef[] {
  if (kind === "none") return [];
  const self = match[side];
  const foe = match[other(side)];
  const out: TargetRef[] = [];
  const pushUnits = (sk: SideKey, list: SideState) => {
    for (const u of unitsOf(list)) {
      if (sk !== side && isStalking(u)) continue;
      if (extra?.drownMax !== undefined && u.health > extra.drownMax) continue;
      out.push({ kind: "unit", side: sk, iid: u.iid });
    }
  };
  if (kind === "friendlyUnit") pushUnits(side, self);
  if (kind === "enemyUnit") pushUnits(other(side), foe);
  if (kind === "anyUnit") {
    pushUnits(side, self);
    pushUnits(other(side), foe);
  }
  if (kind === "enemyAny") {
    pushUnits(other(side), foe);
    out.push({ kind: "hunter", side: other(side) });
  }
  return out;
}

function needsTarget(kind: TargetType): boolean {
  return kind !== "none";
}

function resolveTarget(
  match: Match,
  target: TargetRef | undefined,
): { side: SideState; unit?: UnitInst; hunter: boolean } | null {
  if (!target) return null;
  const side = match[target.side];
  if (target.kind === "hunter") return { side, hunter: true };
  const unit = findUnit(side, target.iid);
  if (!unit) return null;
  return { side, unit, hunter: false };
}

function healHunter(side: SideState, n: number) {
  side.hp = Math.min(side.maxHp, side.hp + n);
}

function applyEffect(
  match: Match,
  side: SideKey,
  effect: Effect,
  target: TargetRef | undefined,
  selfUnit?: UnitInst,
) {
  const self = match[side];
  const foe = match[other(side)];
  switch (effect.kind) {
    case "draw":
      for (let i = 0; i < effect.n; i++) drawOne(match, side);
      break;
    case "buffAllFriendly":
      for (const u of unitsOf(self)) {
        u.attack += effect.atk;
        u.health += effect.hp;
        u.maxHealth += effect.hp;
      }
      break;
    case "buffTarget": {
      const t = selfUnit ?? resolveTarget(match, target)?.unit;
      if (!t) break;
      t.attack += effect.atk;
      t.health += effect.hp;
      t.maxHealth += effect.hp;
      if (effect.grant) {
        for (const k of effect.grant) {
          if (!t.keywords.includes(k)) t.keywords.push(k);
        }
      }
      break;
    }
    case "damageTarget": {
      const resolved = resolveTarget(match, target);
      if (!resolved) break;
      if (resolved.hunter) {
        resolved.side.hp -= effect.n;
        checkWin(match);
      } else if (resolved.unit) {
        takeDamage(resolved.unit, effect.n);
      }
      break;
    }
    case "damageAllEnemyUnits":
      for (const u of unitsOf(foe)) takeDamage(u, effect.n);
      break;
    case "damageEnemyHunter":
      foe.hp -= effect.n;
      checkWin(match);
      break;
    case "healSelfHunter":
      healHunter(self, effect.n);
      log(match, `${hunterName(self)} restores ${effect.n}.`);
      break;
    case "destroyTargetIfHpLte": {
      const resolved = resolveTarget(match, target);
      if (resolved?.unit && resolved.unit.health <= effect.n) {
        resolved.unit.health = 0;
      }
      break;
    }
    case "summonToken": {
      const slot = emptySlot(self);
      if (slot >= 0) {
        self.board[slot] = makeUnit(effect.tokenId, false);
        log(match, `A shade answers.`);
      }
      break;
    }
    case "tempAttackTarget": {
      const t = resolveTarget(match, target)?.unit;
      if (t) t.tempAttack += effect.n;
      break;
    }
    case "randomEnemyDamage": {
      const choices: TargetRef[] = unitsOf(foe).map((u) => ({
        kind: "unit" as const,
        side: other(side),
        iid: u.iid,
      }));
      choices.push({ kind: "hunter", side: other(side) });
      const pick = choices[Math.floor(Math.random() * choices.length)];
      if (pick) applyEffect(match, side, { kind: "damageTarget", n: effect.n }, pick);
      break;
    }
    case "rendHunter":
      foe.hp -= effect.n;
      if (effect.heal) {
        healHunter(self, effect.heal);
        log(match, `${hunterName(self)} restores ${effect.heal}.`);
      }
      checkWin(match);
      break;
  }
}

function processDeaths(match: Match, depth = 0) {
  if (depth > 16 || match.winner) return;
  const fallen: { side: SideKey; unit: UnitInst }[] = [];
  for (const sk of ["player", "enemy"] as SideKey[]) {
    for (let i = 0; i < BOARD_SIZE; i++) {
      const u = match[sk].board[i];
      if (u && u.health <= 0) {
        if (u.keywords.includes("reborn")) {
          u.keywords = u.keywords.filter((k) => k !== "reborn");
          u.health = 1;
          log(match, `${getCard(u.cardId).name} rises.`);
          continue;
        }
        fallen.push({ side: sk, unit: u });
        match[sk].board[i] = null;
        match[sk].grave.push(u.cardId);
      }
    }
  }
  if (fallen.length === 0) return;
  for (const f of fallen) {
    const card = getCard(f.unit.cardId);
    log(match, `${card.name} falls.`);
    if (card.deathrattle) applyEffect(match, f.side, card.deathrattle, undefined, f.unit);
    for (const ally of unitsOf(match[f.side])) {
      const allyCard = getCard(ally.cardId);
      if (allyCard.onFriendlyDeath) {
        applyEffect(match, f.side, allyCard.onFriendlyDeath, undefined, ally);
      }
    }
  }
  processDeaths(match, depth + 1);
}

function playCard(match: Match, action: Extract<Action, { type: "play" }>) {
  const side = match.turn;
  const self = match[side];
  const handIndex = self.hand.findIndex((c) => c.iid === action.iid);
  if (handIndex < 0) return;
  const held = self.hand[handIndex]!;
  const card = getCard(held.cardId);
  if (self.energy < card.cost) return;
  if (card.type === "unit" && emptySlot(self) < 0) return;
  if (needsTarget(card.target) && !action.target) return;
  if (card.id === "drown" && action.target?.kind === "unit") {
    const u = findUnit(match[action.target.side], action.target.iid);
    if (!u || u.health > 3) return;
  }

  self.energy -= card.cost;
  self.hand.splice(handIndex, 1);
  log(match, `${hunterName(self)} plays ${card.name}.`);

  if (card.type === "unit") {
    let slot = action.slot ?? emptySlot(self);
    if (slot < 0 || self.board[slot]) slot = emptySlot(self);
    if (slot < 0) return;
    const unit = makeUnit(card.id, false);
    self.board[slot] = unit;
    if (card.battlecry) applyEffect(match, side, card.battlecry, action.target, unit);
  } else if (card.battlecry) {
    applyEffect(match, side, card.battlecry, action.target);
    if (card.id === "tidal-surge") drawOne(match, side);
    self.grave.push(card.id);
  }
  processDeaths(match);
  checkWin(match);
}

function attack(match: Match, action: Extract<Action, { type: "attack" }>) {
  const side = match.turn;
  const self = match[side];
  const foeKey = other(side);
  const foe = match[foeKey];
  const attacker = findUnit(self, action.attackerIid);
  if (!attacker || !attacker.canAttack) return;
  const pierce = attacker.keywords.includes("pierce");
  if (action.target.kind === "hunter" && hasGuard(foe) && !pierce) return;
  if (action.target.kind === "unit") {
    const defender = findUnit(foe, action.target.iid);
    if (!defender || isStalking(defender)) return;
    if (hasGuard(foe) && !defender.keywords.includes("guard")) return;
  }

  attacker.canAttack = false;
  reveal(attacker);
  let atk = unitAttack(attacker, self);
  const card = getCard(attacker.cardId);
  const powerStrike = action.target.kind === "hunter" && pierce;
  if (powerStrike) atk += 2;
  log(match, powerStrike ? `${card.name} lands a power strike.` : `${card.name} strikes.`);

  if (card.strike) applyEffect(match, side, card.strike, action.target, attacker);
  processDeaths(match);
  if (match.winner || attacker.health <= 0) return;
  const still = findUnit(self, attacker.iid);
  if (!still) return;

  if (action.target.kind === "hunter") {
    foe.hp -= atk;
    if (still.keywords.includes("lifesteal")) healHunter(self, atk);
    checkWin(match);
    return;
  }

  const defender = findUnit(foe, action.target.iid);
  if (!defender) return;
  if (isStalking(defender)) return;
  const defAtk = unitAttack(defender, foe);
  const hpBefore = defender.health;
  const dealt = takeDamage(defender, atk);
  if (still.keywords.includes("venom") && dealt > 0) defender.health = 0;
  const back = takeDamage(still, defAtk);
  if (defender.keywords.includes("retaliate")) takeDamage(still, 1);
  if (still.keywords.includes("lifesteal")) healHunter(self, dealt);
  if (defender.keywords.includes("lifesteal")) healHunter(foe, back);
  if (still.keywords.includes("cleave")) {
    const slot = slotOf(foe, defender.iid);
    for (const n of [slot - 1, slot + 1]) {
      const neighbor = n >= 0 ? foe.board[n] : null;
      if (neighbor) takeDamage(neighbor, atk);
    }
  }
  if (still.keywords.includes("overwhelm") && dealt > 0 && defender.health <= 0) {
    const leftover = Math.max(0, atk - hpBefore);
    if (leftover > 0) {
      foe.hp -= leftover;
      if (still.keywords.includes("lifesteal")) healHunter(self, leftover);
    }
  }
  const killed = defender.health <= 0;
  processDeaths(match);
  const survivor = findUnit(self, still.iid);
  if (killed && survivor) {
    if (survivor.keywords.includes("apex")) survivor.canAttack = true;
    const killerCard = getCard(survivor.cardId);
    if (killerCard.onKill) applyEffect(match, side, killerCard.onKill, undefined, survivor);
  }
  checkWin(match);
}

function usePower(match: Match, action: Extract<Action, { type: "power" }>) {
  const side = match.turn;
  const self = match[side];
  const hunter = getHunter(self.hunterId);
  if (self.powerUsed || self.energy < hunter.powerCost) return;
  if (needsTarget(hunter.powerTarget) && !action.target) return;
  self.energy -= hunter.powerCost;
  self.powerUsed = true;
  log(match, `${hunter.name} lands a power strike.`);
  applyEffect(match, side, hunter.power, action.target);
  processDeaths(match);
  checkWin(match);
}

function endTurn(match: Match) {
  if (match.winner) return;
  const next = other(match.turn);
  match.turn = next;
  if (next === "player") match.turnNumber += 1;
  startTurn(match, next);
  checkWin(match);
}

export function applyAction(match: Match, action: Action): Match {
  if (match.winner) return match;
  const next = clone(match);
  if (action.type === "play") playCard(next, action);
  else if (action.type === "attack") attack(next, action);
  else if (action.type === "power") usePower(next, action);
  else endTurn(next);
  return next;
}

function cardPlayable(match: Match, side: SideKey, held: HandCard): boolean {
  const self = match[side];
  const card = getCard(held.cardId);
  if (self.energy < card.cost) return false;
  if (card.type === "unit" && emptySlot(self) < 0) return false;
  if (card.id === "drown") {
    return validTargets(match, side, "enemyUnit", { drownMax: 3 }).length > 0;
  }
  if (needsTarget(card.target)) {
    return validTargets(match, side, card.target).length > 0;
  }
  return true;
}

export function legalActions(match: Match): Action[] {
  if (match.winner) return [];
  const side = match.turn;
  const self = match[side];
  const foe = match[other(side)];
  const actions: Action[] = [{ type: "endTurn" }];

  for (const held of self.hand) {
    if (!cardPlayable(match, side, held)) continue;
    const card = getCard(held.cardId);
    if (card.id === "drown") {
      for (const t of validTargets(match, side, "enemyUnit", { drownMax: 3 })) {
        actions.push({ type: "play", iid: held.iid, target: t });
      }
      continue;
    }
    if (needsTarget(card.target)) {
      for (const t of validTargets(match, side, card.target)) {
        actions.push({ type: "play", iid: held.iid, target: t });
      }
    } else if (card.type === "unit") {
      for (let slot = 0; slot < BOARD_SIZE; slot++) {
        if (self.board[slot] === null) {
          actions.push({ type: "play", iid: held.iid, slot });
        }
      }
    } else {
      actions.push({ type: "play", iid: held.iid });
    }
  }

  const hunter = getHunter(self.hunterId);
  if (!self.powerUsed && self.energy >= hunter.powerCost) {
    if (needsTarget(hunter.powerTarget)) {
      const ts = validTargets(match, side, hunter.powerTarget);
      for (const t of ts) actions.push({ type: "power", target: t });
    } else {
      actions.push({ type: "power" });
    }
  }

  for (const u of unitsOf(self)) {
    if (!u.canAttack) continue;
    const pierce = u.keywords.includes("pierce");
    const visible = unitsOf(foe).filter((x) => !isStalking(x));
    const guards = visible.filter((x) => x.keywords.includes("guard"));
    const strikeUnit = (d: UnitInst) => {
      actions.push({
        type: "attack",
        attackerIid: u.iid,
        target: { kind: "unit", side: other(side), iid: d.iid },
      });
    };
    const strikeHunter = () => {
      actions.push({
        type: "attack",
        attackerIid: u.iid,
        target: { kind: "hunter", side: other(side) },
      });
    };
    if (guards.length > 0 && !pierce) {
      for (const g of guards) strikeUnit(g);
    } else if (guards.length > 0 && pierce) {
      for (const g of guards) strikeUnit(g);
      strikeHunter();
    } else {
      for (const d of visible) strikeUnit(d);
      strikeHunter();
    }
  }
  return actions;
}

export function playTargetsFor(match: Match, heldIid: string): TargetRef[] {
  const side = match.turn;
  const held = match[side].hand.find((c) => c.iid === heldIid);
  if (!held) return [];
  const card = getCard(held.cardId);
  if (card.id === "drown") return validTargets(match, side, "enemyUnit", { drownMax: 3 });
  if (!needsTarget(card.target)) return [];
  return validTargets(match, side, card.target);
}

export function powerTargetsFor(match: Match): TargetRef[] {
  const side = match.turn;
  const hunter = getHunter(match[side].hunterId);
  return validTargets(match, side, hunter.powerTarget);
}

export function attackTargetsFor(match: Match, attackerIid: string): TargetRef[] {
  return legalActions(match)
    .filter(
      (a): a is Extract<Action, { type: "attack" }> =>
        a.type === "attack" && a.attackerIid === attackerIid,
    )
    .map((a) => a.target);
}

export function canPlay(match: Match, heldIid: string): boolean {
  return legalActions(match).some((a) => a.type === "play" && a.iid === heldIid);
}

export function playBlockReason(match: Match, heldIid: string): string | null {
  if (match.winner) return "The hunt is over.";
  if (canPlay(match, heldIid)) return null;
  const side = match.turn;
  const self = match[side];
  const held = self.hand.find((c) => c.iid === heldIid);
  if (!held) return "That card is gone.";
  const card = getCard(held.cardId);
  if (self.energy < card.cost) {
    return `${card.name} costs ${card.cost}. You have ${self.energy}.`;
  }
  if (card.type === "unit" && emptySlot(self) < 0) return "No open lane.";
  if (card.id === "drown") {
    if (validTargets(match, side, "enemyUnit", { drownMax: 3 }).length === 0) {
      return "No unit with 3 Health or less.";
    }
  } else if (needsTarget(card.target) && validTargets(match, side, card.target).length === 0) {
    return `No target for ${card.name}.`;
  }
  return `Can't play ${card.name} yet.`;
}

export function describeCard(card: CardDef): string {
  const bits = [card.text, ...card.keywords.map((k) => k[0]!.toUpperCase() + k.slice(1))].filter(
    Boolean,
  );
  return Array.from(new Set(bits)).join(" · ");
}

export type Faction = "shadowborn" | "crimson" | "abyssal" | "revenant";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type CardType = "unit" | "tactic";
export type Keyword =
  | "rush"
  | "guard"
  | "lifesteal"
  | "apex"
  | "pack"
  | "pierce"
  | "ward"
  | "retaliate"
  | "stalk"
  | "venom"
  | "cleave"
  | "reborn"
  | "frenzy"
  | "overwhelm";
export type SideKey = "player" | "enemy";

export type Effect =
  | { kind: "draw"; n: number }
  | { kind: "buffAllFriendly"; atk: number; hp: number }
  | { kind: "buffTarget"; atk: number; hp: number; grant?: Keyword[] }
  | { kind: "damageTarget"; n: number }
  | { kind: "damageAllEnemyUnits"; n: number }
  | { kind: "damageEnemyHunter"; n: number }
  | { kind: "healSelfHunter"; n: number }
  | { kind: "destroyTargetIfHpLte"; n: number }
  | { kind: "summonToken"; tokenId: string }
  | { kind: "tempAttackTarget"; n: number }
  | { kind: "randomEnemyDamage"; n: number }
  | { kind: "rendHunter"; n: number; heal?: number };

export type TargetType =
  | "none"
  | "friendlyUnit"
  | "enemyUnit"
  | "anyUnit"
  | "enemyAny";

export interface CardDef {
  id: string;
  name: string;
  faction: Faction;
  type: CardType;
  rarity: Rarity;
  cost: number;
  attack?: number;
  health?: number;
  keywords: Keyword[];
  text: string;
  flavor?: string;
  target: TargetType;
  collectible: boolean;
  battlecry?: Effect;
  deathrattle?: Effect;
  strike?: Effect;
  onKill?: Effect;
  onFriendlyDeath?: Effect;
}

export interface HunterDef {
  id: string;
  name: string;
  title: string;
  faction: Faction;
  hp: number;
  powerCost: number;
  powerText: string;
  powerTarget: TargetType;
  power: Effect;
}

export interface UnitInst {
  iid: string;
  cardId: string;
  attack: number;
  health: number;
  maxHealth: number;
  canAttack: boolean;
  keywords: Keyword[];
  tempAttack: number;
}

export interface HandCard {
  iid: string;
  cardId: string;
}

export interface SideState {
  hunterId: string;
  deckName: string;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  deck: string[];
  hand: HandCard[];
  board: (UnitInst | null)[];
  grave: string[];
  powerUsed: boolean;
  fatigue: number;
}

export interface Match {
  player: SideState;
  enemy: SideState;
  turn: SideKey;
  winner: SideKey | null;
  log: string[];
  turnNumber: number;
}

export type TargetRef =
  | { kind: "hunter"; side: SideKey }
  | { kind: "unit"; side: SideKey; iid: string };

export type Action =
  | { type: "play"; iid: string; slot?: number; target?: TargetRef }
  | { type: "attack"; attackerIid: string; target: TargetRef }
  | { type: "power"; target?: TargetRef }
  | { type: "endTurn" };

export const BOARD_SIZE = 4;
export const HAND_CAP = 7;
export const ENERGY_CAP = 10;
export const DECK_SIZE = 40;
export const MAX_COPIES = 2;

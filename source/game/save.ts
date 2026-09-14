import { COLLECTIBLE, STARTER_DECKS, getCard, getHunter } from "./cards";
import { DECK_SIZE } from "./types";

export const SAVE_VERSION = 4;
const KEY = "apex-tcg-save-v1";

export type PackKind = "mixed" | "bronze" | "blood" | "trench" | "ash";

export interface Trophy {
  cardId: string;
  kind: "foil" | "relic";
  serial?: number;
  pack: PackKind;
  pulledAt: string;
}

export interface SavedDeck {
  id: string;
  name: string;
  hunterId: string;
  cards: string[];
}

export interface SaveData {
  version: number;
  shards: number;
  collection: Record<string, number>;
  decks: SavedDeck[];
  activeDeckId: string;
  wins: number;
  losses: number;
  packsOpened: number;
  foils: Record<string, number>;
  trophies: Trophy[];
  relicWeekKey: string;
  relicsThisWeek: number;
}

export const RELIC_IDS = ["first-spear", "matriarch-rex", "abyssal-leviathan", "vexed-king"];
export const RELIC_CAP = 250;
export const WEEK_RELIC_CAP = 1;

export function relicWeekKey(at = new Date()): string {
  const tmp = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function starterCollection(): Record<string, number> {
  const owned: Record<string, number> = {};
  for (const card of COLLECTIBLE) {
    if (card.rarity === "common" || card.rarity === "rare") owned[card.id] = 2;
    else owned[card.id] = 0;
  }
  return owned;
}

export function defaultSave(): SaveData {
  const decks: SavedDeck[] = [
    {
      id: "shadowborn",
      name: "Night Phalanx",
      hunterId: "adamo",
      cards: STARTER_DECKS.shadowborn!.slice(),
    },
    {
      id: "crimson",
      name: "Blood Pack",
      hunterId: "matriarch",
      cards: STARTER_DECKS.crimson!.slice(),
    },
    {
      id: "abyssal",
      name: "Trench Crown",
      hunterId: "warden",
      cards: STARTER_DECKS.abyssal!.slice(),
    },
    {
      id: "revenant",
      name: "Ash Procession",
      hunterId: "herald",
      cards: STARTER_DECKS.revenant!.slice(),
    },
  ];
  return {
    version: SAVE_VERSION,
    shards: 350,
    collection: starterCollection(),
    decks,
    activeDeckId: "shadowborn",
    wins: 0,
    losses: 0,
    packsOpened: 0,
    foils: {},
    trophies: [],
    relicWeekKey: relicWeekKey(),
    relicsThisWeek: 0,
  };
}

export function copyMax(cardId: string): number {
  return getCard(cardId).rarity === "legendary" ? 1 : 2;
}

function padDeck(cards: string[], filler: string[]): string[] {
  const out = cards.slice(0, DECK_SIZE);
  const used = (id: string) => out.filter((c) => c === id).length;
  const tryAdd = (id: string) => {
    if (out.length >= DECK_SIZE) return;
    if (used(id) < copyMax(id)) out.push(id);
  };
  for (const id of filler) tryAdd(id);
  let guard = 0;
  while (out.length < DECK_SIZE && guard < 80) {
    const before = out.length;
    for (const id of filler) tryAdd(id);
    if (out.length === before) break;
    guard += 1;
  }
  return out;
}

const STARTER_HUNTERS: Record<string, { hunterId: string; name: string }> = {
  shadowborn: { hunterId: "adamo", name: "Night Phalanx" },
  crimson: { hunterId: "matriarch", name: "Blood Pack" },
  abyssal: { hunterId: "warden", name: "Trench Crown" },
  revenant: { hunterId: "herald", name: "Ash Procession" },
};

function migrateDeck(deck: SavedDeck): SavedDeck {
  const canon = STARTER_HUNTERS[deck.id];
  const next = canon ? { ...deck, hunterId: canon.hunterId, name: canon.name } : deck;
  const faction = getHunter(next.hunterId).faction;
  const filler = STARTER_DECKS[next.id] ?? STARTER_DECKS[faction] ?? STARTER_DECKS.shadowborn!;
  if (next.cards.length === DECK_SIZE) return next;
  if (next.id in STARTER_DECKS && next.cards.length < DECK_SIZE) {
    return { ...next, cards: filler.slice() };
  }
  return { ...next, cards: padDeck(next.cards, filler) };
}

function migrate(raw: SaveData): SaveData {
  const base = defaultSave();
  const collection = { ...base.collection, ...(raw.collection ?? {}) };
  const incoming = raw.decks?.length ? raw.decks.map(migrateDeck) : base.decks;
  const seen = new Set(incoming.map((d) => d.id));
  const decks = incoming.slice();
  for (const starter of base.decks) {
    if (!seen.has(starter.id)) decks.push(starter);
  }
  const activeDeckId = decks.some((d) => d.id === raw.activeDeckId) ? raw.activeDeckId : decks[0]!.id;
  return {
    ...base,
    ...raw,
    version: SAVE_VERSION,
    collection,
    decks,
    activeDeckId,
    foils: raw.foils ?? {},
    trophies: raw.trophies ?? [],
    relicWeekKey: raw.relicWeekKey ?? relicWeekKey(),
    relicsThisWeek: raw.relicsThisWeek ?? 0,
  };
}

export function loadSave(): SaveData {
  if (typeof window === "undefined") return defaultSave();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as SaveData;
    const migrated = migrate(parsed);
    if (migrated.version !== parsed.version) persistSave(migrated);
    return migrated;
  } catch {
    return defaultSave();
  }
}

export function persistSave(save: SaveData) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* private mode / quota */
  }
}

export function ownedCount(save: SaveData, cardId: string): number {
  return save.collection[cardId] ?? 0;
}

export function deckValid(deck: SavedDeck, save: SaveData): string | null {
  if (deck.cards.length !== DECK_SIZE) return `Deck must be ${DECK_SIZE} cards.`;
  const counts: Record<string, number> = {};
  for (const id of deck.cards) {
    counts[id] = (counts[id] ?? 0) + 1;
    if (counts[id]! > ownedCount(save, id)) return "Deck uses cards you do not own.";
    if (counts[id]! > copyMax(id)) return "Copy limit exceeded.";
  }
  return null;
}

export const PACK_COST = 100;
export const WIN_SHARDS = 70;
export const LOSS_SHARDS = 25;
export const DUPLICATE_SHARDS: Record<string, number> = {
  common: 8,
  rare: 20,
  epic: 55,
  legendary: 140,
};

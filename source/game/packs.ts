import { COLLECTIBLE } from "./cards";
import {
  DUPLICATE_SHARDS,
  RELIC_CAP,
  RELIC_IDS,
  WEEK_RELIC_CAP,
  copyMax,
  ownedCount,
  relicWeekKey,
  type PackKind,
  type SaveData,
  type Trophy,
} from "./save";
import type { Faction, Rarity } from "./types";

const WEIGHT: Record<Rarity, number> = {
  common: 0,
  rare: 78,
  epic: 18,
  legendary: 4,
};

export const PACK_FACTION: Record<Exclude<PackKind, "mixed">, Faction> = {
  bronze: "shadowborn",
  blood: "crimson",
  trench: "abyssal",
  ash: "revenant",
};

export const EXPEDITIONS: {
  id: PackKind;
  name: string;
  line: string;
}[] = [
  { id: "mixed", name: "Mixed Hunt", line: "Any tribe. Same odds as the old pack." },
  { id: "bronze", name: "Bronze Expedition", line: "Shadowborn weighted. Mark+ is Spartan." },
  { id: "blood", name: "Blood Expedition", line: "Crimson weighted. Mark+ is the pack." },
  { id: "trench", name: "Trench Expedition", line: "Abyssal weighted. Mark+ is the trench." },
  { id: "ash", name: "Ash Expedition", line: "Revenant weighted. Mark+ is the dead." },
];

const FOIL_CHANCE = 0.08;
const RELIC_ON_FOIL_SOVEREIGN = 0.12;
const TRIBE_WEIGHT = 0.7;

export interface PackPull {
  id: string;
  foil: boolean;
  relic: boolean;
}

export interface PackResult {
  cards: { id: string; isNew: boolean; shards: number; foil: boolean; relic: boolean; serial?: number }[];
  shardsGained: number;
  trophiesGained: Trophy[];
}

function pool(rarity: Rarity, prefer?: Faction): string[] {
  const all = COLLECTIBLE.filter((c) => c.rarity === rarity);
  if (!prefer) return all.map((c) => c.id);
  const tribe = all.filter((c) => c.faction === prefer).map((c) => c.id);
  return tribe.length ? tribe : all.map((c) => c.id);
}

function pickWeighted(rarity: Rarity, prefer?: Faction): string {
  const focused = pool(rarity, prefer);
  const rest = COLLECTIBLE.filter((c) => c.rarity === rarity && c.faction !== prefer).map((c) => c.id);
  if (!prefer || !rest.length || Math.random() < TRIBE_WEIGHT) {
    return focused[Math.floor(Math.random() * focused.length)]!;
  }
  return rest[Math.floor(Math.random() * rest.length)]!;
}

function rarePlus(prefer?: Faction): string {
  const roll = Math.random() * 100;
  if (roll < WEIGHT.legendary) return pickWeighted("legendary", prefer);
  if (roll < WEIGHT.legendary + WEIGHT.epic) return pickWeighted("epic", prefer);
  return pickWeighted("rare", prefer);
}

function decorate(id: string, allowRelic: boolean): PackPull {
  const foil = Math.random() < FOIL_CHANCE;
  const isSovereign = COLLECTIBLE.find((c) => c.id === id)?.rarity === "legendary";
  const relic = Boolean(
    allowRelic && foil && isSovereign && RELIC_IDS.includes(id) && Math.random() < RELIC_ON_FOIL_SOVEREIGN,
  );
  return { id, foil, relic };
}

export function rollPack(kind: PackKind = "mixed"): PackPull[] {
  const prefer = kind === "mixed" ? undefined : PACK_FACTION[kind];
  const ids = [
    pickWeighted("common", prefer),
    pickWeighted("common", prefer),
    pickWeighted("common", prefer),
    pickWeighted("rare", prefer),
    rarePlus(prefer),
  ];
  return ids.map((id, i) => decorate(id, i === 4));
}

export function applyPack(
  save: SaveData,
  pulls: PackPull[] | string[],
  kind: PackKind = "mixed",
): { save: SaveData; result: PackResult } {
  const normalized: PackPull[] = pulls.map((p) => (typeof p === "string" ? { id: p, foil: false, relic: false } : p));
  const collection = { ...save.collection };
  const foils = { ...(save.foils ?? {}) };
  const trophies = [...(save.trophies ?? [])];
  const week = relicWeekKey();
  let relicsThisWeek = save.relicWeekKey === week ? save.relicsThisWeek : 0;
  const cards: PackResult["cards"] = [];
  const trophiesGained: Trophy[] = [];
  let shardsGained = 0;

  for (const pull of normalized) {
    const def = COLLECTIBLE.find((c) => c.id === pull.id)!;
    const have = ownedCount({ ...save, collection }, pull.id);
    const max = copyMax(pull.id);
    let relic = pull.relic && relicsThisWeek < WEEK_RELIC_CAP;
    if (relic) {
      const printed = trophies.filter((t) => t.cardId === pull.id && t.kind === "relic").length;
      if (printed >= RELIC_CAP) relic = false;
    }

    if (have >= max) {
      const shards = DUPLICATE_SHARDS[def.rarity] ?? 8;
      shardsGained += shards;
      cards.push({ id: pull.id, isNew: false, shards, foil: pull.foil, relic });
    } else {
      collection[pull.id] = have + 1;
      cards.push({ id: pull.id, isNew: true, shards: 0, foil: pull.foil, relic });
    }

    if (pull.foil) foils[pull.id] = (foils[pull.id] ?? 0) + 1;

    if (pull.foil || relic) {
      const trophy: Trophy = {
        cardId: pull.id,
        kind: relic ? "relic" : "foil",
        pack: kind,
        pulledAt: new Date().toISOString(),
      };
      if (relic) {
        trophy.serial = trophies.filter((t) => t.cardId === pull.id && t.kind === "relic").length + 1;
        relicsThisWeek += 1;
      }
      trophies.push(trophy);
      trophiesGained.push(trophy);
    }
  }

  return {
    save: {
      ...save,
      collection,
      foils,
      trophies,
      shards: save.shards + shardsGained,
      packsOpened: save.packsOpened + 1,
      relicWeekKey: week,
      relicsThisWeek,
    },
    result: { cards, shardsGained, trophiesGained },
  };
}

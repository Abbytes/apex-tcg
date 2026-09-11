import { COLLECTIBLE } from "./cards";
import {
  DUPLICATE_SHARDS,
  ownedCount,
  type SaveData,
} from "./save";
import type { Rarity } from "./types";

const WEIGHT: Record<Rarity, number> = {
  common: 0,
  rare: 78,
  epic: 18,
  legendary: 4,
};

function pool(rarity: Rarity): string[] {
  return COLLECTIBLE.filter((c) => c.rarity === rarity).map((c) => c.id);
}

function pick(ids: string[]): string {
  return ids[Math.floor(Math.random() * ids.length)]!;
}

function rarePlus(): string {
  const roll = Math.random() * 100;
  if (roll < WEIGHT.legendary) return pick(pool("legendary"));
  if (roll < WEIGHT.legendary + WEIGHT.epic) return pick(pool("epic"));
  return pick(pool("rare"));
}

export function rollPack(): string[] {
  return [pick(pool("common")), pick(pool("common")), pick(pool("common")), pick(pool("rare")), rarePlus()];
}

export interface PackResult {
  cards: { id: string; isNew: boolean; shards: number }[];
  shardsGained: number;
}

export function applyPack(save: SaveData, ids: string[]): { save: SaveData; result: PackResult } {
  const collection = { ...save.collection };
  const cards: PackResult["cards"] = [];
  let shardsGained = 0;
  for (const id of ids) {
    const def = COLLECTIBLE.find((c) => c.id === id)!;
    const have = ownedCount({ ...save, collection }, id);
    if (have >= 2) {
      const shards = DUPLICATE_SHARDS[def.rarity] ?? 8;
      shardsGained += shards;
      cards.push({ id, isNew: false, shards });
    } else {
      collection[id] = have + 1;
      cards.push({ id, isNew: true, shards: 0 });
    }
  }
  return {
    save: {
      ...save,
      collection,
      shards: save.shards + shardsGained,
      packsOpened: save.packsOpened + 1,
    },
    result: { cards, shardsGained },
  };
}

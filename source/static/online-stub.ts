import { loadSave } from "@/game/save";
import { clampRating, huntXp, levelFromXp, titleFromLevel } from "@/game/progress";
import type { Action, Match } from "@/game/types";

export type ProfileView = {
  userId: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  xp: number;
  level: number;
  title: string;
  hunterId: string;
  mastery: { hunterId: string; xp: number; wins: number; losses: number; level: number }[];
};

export type LadderRow = {
  userId: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  level: number;
  title: string;
  hunterId: string;
};

export type DuelView = {
  id: string;
  status: "open" | "matched" | "live" | "done";
  hostName: string;
  guestName: string | null;
  hostReady: boolean;
  guestReady: boolean;
  you: "host" | "guest";
  match: Match | null;
  lastAction: Action | null;
};

function localProfile(): ProfileView {
  const save = loadSave();
  const xp = save.wins * huntXp(true) + save.losses * huntXp(false);
  const level = levelFromXp(xp);
  const hunterId = save.decks.find((d) => d.id === save.activeDeckId)?.hunterId ?? "adamo";
  return {
    userId: "local",
    displayName: "Hunter",
    rating: clampRating(1000 + save.wins * 12 - save.losses * 8),
    wins: save.wins,
    losses: save.losses,
    xp,
    level,
    title: titleFromLevel(level),
    hunterId,
    mastery: save.decks.map((d) => ({
      hunterId: d.hunterId,
      xp,
      wins: save.wins,
      losses: save.losses,
      level,
    })),
  };
}

export const loadProfile = async () => localProfile();
export const loadLadder = async (): Promise<LadderRow[]> => {
  const p = localProfile();
  return [
    {
      userId: p.userId,
      displayName: p.displayName,
      rating: p.rating,
      wins: p.wins,
      losses: p.losses,
      level: p.level,
      title: p.title,
      hunterId: p.hunterId,
    },
  ];
};
export const reportHunt = async () => localProfile();
export const createDuel = async () => {
  throw new Error("Live rooms run on the Grok hunt. Use Hunt to face a rival on this device.");
};
export const joinDuel = createDuel;
export const readyDuel = createDuel;
export const getDuel = createDuel;
export const actDuel = createDuel;
export const concedeDuel = createDuel;

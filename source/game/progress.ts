export const XP_STEP = 120;
export const MAX_LEVEL = 12;

export function levelFromXp(xp: number) {
  return Math.min(MAX_LEVEL, 1 + Math.floor(Math.max(0, xp) / XP_STEP));
}

export function titleFromLevel(level: number) {
  if (level >= 12) return "Legend";
  if (level >= 8) return "Apex";
  if (level >= 5) return "Veteran";
  if (level >= 3) return "Spear";
  return "Initiate";
}

export function xpIntoLevel(xp: number) {
  if (levelFromXp(xp) >= MAX_LEVEL) return XP_STEP;
  return Math.max(0, xp) % XP_STEP;
}

export function huntXp(won: boolean) {
  return won ? 50 : 15;
}

export function duelXp(won: boolean) {
  return won ? 90 : 25;
}

export function huntRatingDelta(won: boolean) {
  return won ? 12 : -8;
}

export function duelRatingDelta(won: boolean) {
  return won ? 32 : -24;
}

export function clampRating(n: number) {
  return Math.max(100, n);
}

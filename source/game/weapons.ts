export type WeaponKind =
  | "spear"
  | "blade"
  | "shield"
  | "claw"
  | "fang"
  | "crush"
  | "tentacle"
  | "wraith"
  | "roar";

const WEAPONS: Record<string, WeaponKind> = {
  "spear-initiate": "spear",
  "night-hoplite": "spear",
  "phalanx-veteran": "spear",
  "first-spear": "spear",
  "grave-spearman": "spear",
  "spear-volley": "spear",
  "trench-harpoon": "spear",
  "grave-warden": "spear",
  "shadow-scout": "blade",
  "umbral-blade": "blade",
  "cloaked-strategos": "blade",
  "revenant-captain": "blade",
  "aegis-of-sparta": "shield",
  "bronze-wall": "shield",
  "iron-hide": "shield",
  "shell-plate": "shield",
  "killing-leap": "blade",
  "blood-pup": "roar",
  "pack-raptor": "roar",
  "crimson-stalker": "roar",
  "matriarch-rex": "roar",
  "bonebreaker": "roar",
  "horned-titan": "roar",
  "blood-frenzy": "roar",
  stampede: "roar",
  glowfin: "fang",
  "tide-serpent": "roar",
  "abyss-lurker": "roar",
  "kraken-arm": "tentacle",
  "leviathan-spawn": "roar",
  "abyssal-leviathan": "roar",
  drown: "tentacle",
  "tidal-surge": "tentacle",
  "ash-wisp": "wraith",
  "vengeful-shade": "wraith",
  "echo-shade": "wraith",
  "echo-of-war": "wraith",
  "vexed-king": "wraith",
  "soul-bind": "wraith",
  "hex-vengeance": "wraith",
  "death-mark": "wraith",
};

export function weaponOf(cardId: string): WeaponKind {
  return WEAPONS[cardId] ?? "blade";
}

export function hunterWeapon(hunterId: string): WeaponKind {
  if (hunterId === "matriarch") return "roar";
  if (hunterId === "warden") return "tentacle";
  if (hunterId === "herald") return "wraith";
  return "spear";
}

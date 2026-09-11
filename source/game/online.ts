import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { HUNTERS, getCard } from "./cards";
import { adoptIids, applyAction, createMatch, legalActions } from "./engine";
import {
  clampRating,
  duelRatingDelta,
  duelXp,
  huntRatingDelta,
  huntXp,
  levelFromXp,
  titleFromLevel,
} from "./progress";
import { DECK_SIZE, type Action, type Match } from "./types";

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

type ProfileRow = {
  user_id: string;
  display_name: string;
  rating: number;
  wins: number;
  losses: number;
  xp: number;
  hunter_id: string;
};

type DuelRow = {
  id: string;
  host_id: string;
  guest_id: string | null;
  host_name: string;
  guest_name: string | null;
  host_hunter: string | null;
  guest_hunter: string | null;
  host_deck: string | null;
  guest_deck: string | null;
  status: string;
  match_json: string | null;
  last_action: string | null;
  settled: number;
};

function asProfile(row: ProfileRow, mastery: ProfileView["mastery"]): ProfileView {
  const xp = Number(row.xp);
  const level = levelFromXp(xp);
  return {
    userId: row.user_id,
    displayName: row.display_name,
    rating: Number(row.rating),
    wins: Number(row.wins),
    losses: Number(row.losses),
    xp,
    level,
    title: titleFromLevel(level),
    hunterId: row.hunter_id,
    mastery,
  };
}

function parseMatch(raw: string | null): Match | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Match;
  } catch {
    return null;
  }
}

function parseAction(raw: string | null): Action | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Action;
  } catch {
    return null;
  }
}

function cleanName(name: string) {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 18);
  return n || "Hunter";
}

function validDeck(hunterId: string, cards: string[]) {
  if (!HUNTERS[hunterId]) return false;
  if (cards.length !== DECK_SIZE) return false;
  return cards.every((id) => {
    try {
      return Boolean(getCard(id));
    } catch {
      return false;
    }
  });
}

function actionAllowed(match: Match, action: Action) {
  if (action.type === "endTurn") return true;
  return legalActions(match).some((a) => JSON.stringify(a) === JSON.stringify(action));
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  return s;
}

async function nameFor(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ name: string }>`select "name" from "user" where "id" = ${userId}`;
  return cleanName(rows[0]?.name ?? "Hunter");
}

async function loadMastery(userId: string) {
  const sql = await getSql();
  const rows = await sql<{ hunter_id: string; xp: number; wins: number; losses: number }>`
    select hunter_id, xp, wins, losses from hunter_mastery where user_id = ${userId}
  `;
  return rows.map((r) => {
    const xp = Number(r.xp);
    return {
      hunterId: r.hunter_id,
      xp,
      wins: Number(r.wins),
      losses: Number(r.losses),
      level: levelFromXp(xp),
    };
  });
}

async function ensureRow(userId: string): Promise<ProfileRow> {
  const sql = await getSql();
  const existing = await sql<ProfileRow>`select user_id, display_name, rating, wins, losses, xp, hunter_id from profiles where user_id = ${userId}`;
  if (existing[0]) return existing[0];
  const displayName = await nameFor(userId);
  await sql`
    insert into profiles (user_id, display_name, hunter_id)
    values (${userId}, ${displayName}, ${"adamo"})
  `;
  const created = await sql<ProfileRow>`select user_id, display_name, rating, wins, losses, xp, hunter_id from profiles where user_id = ${userId}`;
  return created[0]!;
}

async function grant(
  userId: string,
  hunterId: string,
  won: boolean,
  xpGain: number,
  ratingDelta: number,
) {
  const sql = await getSql();
  const row = await ensureRow(userId);
  const rating = clampRating(Number(row.rating) + ratingDelta);
  const xp = Number(row.xp) + xpGain;
  await sql`
    update profiles
    set rating = ${rating},
        wins = ${Number(row.wins) + (won ? 1 : 0)},
        losses = ${Number(row.losses) + (won ? 0 : 1)},
        xp = ${xp},
        hunter_id = ${hunterId},
        updated_at = now()
    where user_id = ${userId}
  `;
  await sql`
    insert into hunter_mastery (user_id, hunter_id, xp, wins, losses)
    values (${userId}, ${hunterId}, ${xpGain}, ${won ? 1 : 0}, ${won ? 0 : 1})
    on conflict (user_id, hunter_id) do update set
      xp = hunter_mastery.xp + ${xpGain},
      wins = hunter_mastery.wins + ${won ? 1 : 0},
      losses = hunter_mastery.losses + ${won ? 0 : 1}
  `;
}

function toView(row: DuelRow, userId: string): DuelView {
  const you = row.host_id === userId ? "host" : "guest";
  const match = parseMatch(row.match_json);
  if (match) adoptIids(match);
  return {
    id: row.id,
    status: row.status as DuelView["status"],
    hostName: row.host_name,
    guestName: row.guest_name,
    hostReady: Boolean(row.host_deck),
    guestReady: Boolean(row.guest_deck),
    you,
    match,
    lastAction: parseAction(row.last_action),
  };
}

export const loadProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const row = await ensureRow(context.userId);
    return asProfile(row, await loadMastery(context.userId));
  });

export const loadLadder = createServerFn({ method: "POST" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<ProfileRow>`
    select user_id, display_name, rating, wins, losses, xp, hunter_id
    from profiles
    order by rating desc, wins desc
    limit 25
  `;
  return rows.map((row) => {
    const level = levelFromXp(Number(row.xp));
    return {
      userId: row.user_id,
      displayName: row.display_name,
      rating: Number(row.rating),
      wins: Number(row.wins),
      losses: Number(row.losses),
      level,
      title: titleFromLevel(level),
      hunterId: row.hunter_id,
    } satisfies LadderRow;
  });
});

export const reportHunt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { hunterId: string; won: boolean }) => d)
  .handler(async ({ context, data }) => {
    if (!HUNTERS[data.hunterId]) {
      const row = await ensureRow(context.userId);
      return asProfile(row, await loadMastery(context.userId));
    }
    await grant(context.userId, data.hunterId, data.won, huntXp(data.won), huntRatingDelta(data.won));
    const row = await ensureRow(context.userId);
    return asProfile(row, await loadMastery(context.userId));
  });

export const createDuel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await ensureRow(context.userId);
    const hostName = await nameFor(context.userId);
    for (let i = 0; i < 8; i++) {
      const id = roomCode();
      try {
        await sql`
          insert into duels (id, host_id, host_name, status)
          values (${id}, ${context.userId}, ${hostName}, ${"open"})
        `;
        const rows = await sql<DuelRow>`select * from duels where id = ${id}`;
        return toView(rows[0]!, context.userId);
      } catch {
        /* collision */
      }
    }
    throw new Error("Could not open a duel.");
  });

export const joinDuel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { code: string }) => ({ code: d.code.trim().toUpperCase() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await ensureRow(context.userId);
    const rows = await sql<DuelRow>`select * from duels where id = ${data.code}`;
    const duel = rows[0];
    if (!duel) throw new Error("No duel with that code.");
    if (duel.host_id === context.userId) return toView(duel, context.userId);
    if (duel.guest_id && duel.guest_id !== context.userId) throw new Error("That hunt is full.");
    if (!duel.guest_id) {
      const guestName = await nameFor(context.userId);
      await sql`
        update duels
        set guest_id = ${context.userId}, guest_name = ${guestName}, status = ${"matched"}
        where id = ${data.code} and guest_id is null
      `;
    }
    const next = await sql<DuelRow>`select * from duels where id = ${data.code}`;
    return toView(next[0]!, context.userId);
  });

export const readyDuel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { code: string; hunterId: string; cards: string[] }) => d)
  .handler(async ({ context, data }) => {
    if (!validDeck(data.hunterId, data.cards)) throw new Error("Deck is not legal.");
    const sql = await getSql();
    const rows = await sql<DuelRow>`select * from duels where id = ${data.code}`;
    const duel = rows[0];
    if (!duel) throw new Error("No duel with that code.");
    const deck = JSON.stringify(data.cards);
    if (duel.host_id === context.userId) {
      await sql`
        update duels set host_hunter = ${data.hunterId}, host_deck = ${deck}
        where id = ${data.code} and host_id = ${context.userId}
      `;
    } else if (duel.guest_id === context.userId) {
      await sql`
        update duels set guest_hunter = ${data.hunterId}, guest_deck = ${deck}
        where id = ${data.code} and guest_id = ${context.userId}
      `;
    } else {
      throw new Error("You are not in this duel.");
    }
    const after = (await sql<DuelRow>`select * from duels where id = ${data.code}`)[0]!;
    if (after.host_deck && after.guest_deck && after.status !== "live" && after.status !== "done") {
      const match = createMatch(
        after.host_hunter!,
        JSON.parse(after.host_deck) as string[],
        after.guest_hunter!,
        JSON.parse(after.guest_deck) as string[],
      );
      await sql`
        update duels
        set status = ${"live"}, match_json = ${JSON.stringify(match)}, last_action = null
        where id = ${data.code}
      `;
    }
    const latest = (await sql<DuelRow>`select * from duels where id = ${data.code}`)[0]!;
    return toView(latest, context.userId);
  });

export const getDuel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { code: string }) => ({ code: d.code.trim().toUpperCase() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const rows = await sql<DuelRow>`select * from duels where id = ${data.code}`;
    const duel = rows[0];
    if (!duel) throw new Error("No duel with that code.");
    if (duel.host_id !== context.userId && duel.guest_id !== context.userId) {
      throw new Error("You are not in this duel.");
    }
    return toView(duel, context.userId);
  });

export const actDuel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { code: string; action: Action }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const duel = (await sql<DuelRow>`select * from duels where id = ${data.code}`)[0];
    if (!duel) throw new Error("No duel with that code.");
    if (duel.status !== "live") throw new Error("This hunt has not begun.");
    const match = parseMatch(duel.match_json);
    if (!match) throw new Error("Match missing.");
    adoptIids(match);
    const hostTurn = match.turn === "player";
    const isHost = duel.host_id === context.userId;
    const isGuest = duel.guest_id === context.userId;
    if (!isHost && !isGuest) throw new Error("You are not in this duel.");
    if ((hostTurn && !isHost) || (!hostTurn && !isGuest)) throw new Error("Wait your turn.");
    if (!actionAllowed(match, data.action)) throw new Error("Illegal move.");
    const next = applyAction(match, data.action);
    let status = duel.status;
    let settled = Number(duel.settled);
    if (next.winner && !settled) {
      status = "done";
      settled = 1;
      const hostWon = next.winner === "player";
      await grant(duel.host_id, next.player.hunterId, hostWon, duelXp(hostWon), duelRatingDelta(hostWon));
      if (duel.guest_id) {
        await grant(
          duel.guest_id,
          next.enemy.hunterId,
          !hostWon,
          duelXp(!hostWon),
          duelRatingDelta(!hostWon),
        );
      }
    }
    await sql`
      update duels
      set match_json = ${JSON.stringify(next)},
          last_action = ${JSON.stringify(data.action)},
          status = ${status},
          settled = ${settled}
      where id = ${data.code}
    `;
    const latest = (await sql<DuelRow>`select * from duels where id = ${data.code}`)[0]!;
    return toView(latest, context.userId);
  });

export const concedeDuel = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((d: { code: string }) => d)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const duel = (await sql<DuelRow>`select * from duels where id = ${data.code}`)[0];
    if (!duel) throw new Error("No duel with that code.");
    const match = parseMatch(duel.match_json);
    if (!match || match.winner) {
      return toView(duel, context.userId);
    }
    adoptIids(match);
    const isHost = duel.host_id === context.userId;
    const isGuest = duel.guest_id === context.userId;
    if (!isHost && !isGuest) throw new Error("You are not in this duel.");
    match.winner = isHost ? "enemy" : "player";
    match.log = [...match.log, "A hunter concedes."];
    let settled = Number(duel.settled);
    if (!settled) {
      settled = 1;
      const hostWon = match.winner === "player";
      await grant(duel.host_id, match.player.hunterId, hostWon, duelXp(hostWon), duelRatingDelta(hostWon));
      if (duel.guest_id) {
        await grant(
          duel.guest_id,
          match.enemy.hunterId,
          !hostWon,
          duelXp(!hostWon),
          duelRatingDelta(!hostWon),
        );
      }
    }
    await sql`
      update duels
      set match_json = ${JSON.stringify(match)},
          status = ${"done"},
          settled = ${settled}
      where id = ${data.code}
    `;
    const latest = (await sql<DuelRow>`select * from duels where id = ${data.code}`)[0]!;
    return toView(latest, context.userId);
  });

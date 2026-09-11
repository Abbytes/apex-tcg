import { create } from "zustand";
import { AI_DECKS, DECK_TITLES, getHunter } from "./cards";
import { chooseAiAction } from "./ai";
import { sfx, unlockAudio } from "./audio";
import { applyAction, createMatch, legalActions } from "./engine";
import { buildCombatFx, cineHoldMs, type CombatFx } from "./fx";
import { actDuel, concedeDuel, getDuel, loadProfile, reportHunt, type DuelView, type ProfileView } from "@/game/online";
import { actionForHost, actionForView, viewAsPlayer } from "./perspective";
import { loadSave, persistSave, type SaveData, type SavedDeck } from "./save";
import type { Action, Match } from "./types";
import { hunterWeapon, weaponOf } from "./weapons";

export type Screen =
  | "title"
  | "play"
  | "battle"
  | "collection"
  | "decks"
  | "packs"
  | "how"
  | "duel"
  | "ladder"
  | "progress";

interface GameStore {
  save: SaveData;
  screen: Screen;
  match: Match | null;
  thinking: boolean;
  lastFx: CombatFx | null;
  mode: "solo" | "duel";
  duelCode: string | null;
  duelRole: "host" | "guest" | null;
  duel: DuelView | null;
  profile: ProfileView | null;
  go: (screen: Screen) => void;
  patchSave: (fn: (s: SaveData) => SaveData) => void;
  setProfile: (profile: ProfileView | null) => void;
  startMatch: (deck: SavedDeck, enemyHunter: string) => void;
  enterDuel: (view: DuelView) => void;
  act: (action: Action) => void;
  concede: () => void;
  leaveBattle: () => void;
}

let aiTimer: number | null = null;
let autoEndTimer: number | null = null;
let duelPoll: number | null = null;
let playerActed = false;

function persist(save: SaveData) {
  persistSave(save);
}

function clearTimers() {
  if (aiTimer) {
    window.clearTimeout(aiTimer);
    aiTimer = null;
  }
  if (autoEndTimer) {
    window.clearTimeout(autoEndTimer);
    autoEndTimer = null;
  }
  if (duelPoll) {
    window.clearInterval(duelPoll);
    duelPoll = null;
  }
}

function playerHasMoves(match: Match): boolean {
  if (match.winner || match.turn !== "player") return false;
  return legalActions(match).some((a) => a.type !== "endTurn");
}

function queueAutoEnd() {
  if (autoEndTimer) window.clearTimeout(autoEndTimer);
  const fx = useGame.getState().lastFx;
  autoEndTimer = window.setTimeout(() => {
    autoEndTimer = null;
    const { match, thinking } = useGame.getState();
    if (!match || thinking || match.winner || match.turn !== "player") return;
    if (playerHasMoves(match)) return;
    useGame.getState().act({ type: "endTurn" });
  }, fx?.cineVideo ? cineHoldMs(fx) : fx?.epic ? 3800 : 1900);
}

function afterAct(next: Match) {
  if (next.winner) {
    settle(next);
    return;
  }
  if (useGame.getState().mode === "duel") {
    useGame.setState({ thinking: next.turn !== "player" });
    return;
  }
  if (next.turn === "enemy") {
    playerActed = false;
    queueAi();
    return;
  }
  if (playerActed && !playerHasMoves(next)) queueAutoEnd();
}

function playFxAudio(prev: Match, next: Match, action: Action, fx: CombatFx) {
  if (fx.cineVideo) {
    if (!prev.winner && next.winner === "player") window.setTimeout(() => sfx.win(), 180);
    if (!prev.winner && next.winner === "enemy") window.setTimeout(() => sfx.lose(), 180);
    return;
  }
  if (fx.power) {
    const weapon =
      fx.weapon ??
      (action.type === "attack"
        ? weaponOf(prev[prev.turn].board.find((u) => u?.iid === action.attackerIid)?.cardId ?? "")
        : hunterWeapon(prev[prev.turn].hunterId));
    sfx.powerStrike(weapon, fx.epic);
    if (fx.hits.some((h) => h.killed)) window.setTimeout(() => sfx.death(), 110);
  } else if (action.type === "attack") {
    const atk = prev[prev.turn].board.find((u) => u?.iid === action.attackerIid);
    sfx.strike(weaponOf(atk?.cardId ?? ""), fx.hits.some((h) => h.face && !h.heal));
    if (fx.hits.some((h) => h.killed)) window.setTimeout(() => sfx.death(), 90);
  } else if (action.type === "play") {
    const held = prev[prev.turn].hand.find((c) => c.iid === action.iid);
    if (fx.hits.some((h) => !h.heal && h.amount > 0)) {
      sfx.strike(weaponOf(held?.cardId ?? ""));
    } else {
      sfx.play();
    }
  } else if (action.type === "power") {
    sfx.powerStrike(hunterWeapon(prev[prev.turn].hunterId), true);
    if (fx.hits.some((h) => !h.heal && h.amount > 0)) window.setTimeout(() => sfx.hit(), 70);
  } else if (prev.turn === "player") {
    sfx.ui();
  }
  if (!prev.winner && next.winner === "player") window.setTimeout(() => sfx.win(), 180);
  if (!prev.winner && next.winner === "enemy") window.setTimeout(() => sfx.lose(), 180);
}

function commitAction(match: Match, action: Action): { next: Match; fx: CombatFx } {
  const next = applyAction(match, action);
  const fx = buildCombatFx(match, next, action);
  playFxAudio(match, next, action, fx);
  return { next, fx };
}

export const useGame = create<GameStore>((set, get) => ({
  save: loadSave(),
  screen: "title",
  match: null,
  thinking: false,
  lastFx: null,
  mode: "solo",
  duelCode: null,
  duelRole: null,
  duel: null,
  profile: null,
  go: (screen) => set({ screen }),
  patchSave: (fn) => {
    const save = fn(get().save);
    persist(save);
    set({ save });
  },
  setProfile: (profile) => set({ profile }),
  startMatch: (deck, enemyHunter) => {
    clearTimers();
    playerActed = false;
    const match = createMatch(
      deck.hunterId,
      deck.cards.slice(),
      enemyHunter,
      (AI_DECKS[enemyHunter] ?? AI_DECKS.adamo)!.slice(),
      { player: deck.name, enemy: DECK_TITLES[enemyHunter] ?? getHunter(enemyHunter).title },
    );
    set({
      match,
      screen: "battle",
      thinking: false,
      lastFx: null,
      mode: "solo",
      duelCode: null,
      duelRole: null,
      duel: null,
    });
  },
  enterDuel: (view) => {
    clearTimers();
    playerActed = false;
    set({
      mode: "duel",
      duelCode: view.id,
      duelRole: view.you,
      duel: view,
      match: view.match ? viewAsPlayer(view.match, view.you) : null,
      thinking: Boolean(
        view.match && viewAsPlayer(view.match, view.you).turn !== "player" && !view.match.winner,
      ),
      lastFx: null,
      screen: view.match ? "battle" : "duel",
    });
    startDuelPoll();
  },
  act: (action) => {
    const { match, thinking, mode } = get();
    if (!match || match.winner || thinking) return;
    if (autoEndTimer) {
      window.clearTimeout(autoEndTimer);
      autoEndTimer = null;
    }
    unlockAudio();
    if (mode === "duel") {
      void pushDuelAction(action);
      return;
    }
    if (action.type !== "endTurn") playerActed = true;
    const { next, fx } = commitAction(match, action);
    set({ match: next, lastFx: fx });
    afterAct(next);
  },
  concede: () => {
    const { match, mode, duelCode } = get();
    if (!match) return;
    if (mode === "duel" && duelCode) {
      void concedeDuel({ data: { code: duelCode } })
        .then((view) => ingestDuel(view))
        .catch(() => {});
      return;
    }
    clearTimers();
    const lost: Match = { ...match, winner: "enemy", log: [...match.log, "You concede."] };
    sfx.lose();
    set({ match: lost, thinking: false });
    settle(lost);
  },
  leaveBattle: () => {
    clearTimers();
    playerActed = false;
    set({
      match: null,
      screen: "title",
      thinking: false,
      lastFx: null,
      mode: "solo",
      duelCode: null,
      duelRole: null,
      duel: null,
    });
  },
}));

if (typeof window !== "undefined") {
  (window as Window & { __APEX__?: typeof useGame }).__APEX__ = useGame;
}

function settle(match: Match) {
  const won = match.winner === "player";
  const hunterId = match.player.hunterId;
  const { mode } = useGame.getState();
  useGame.getState().patchSave((s) => ({
    ...s,
    wins: s.wins + (won ? 1 : 0),
    losses: s.losses + (won ? 0 : 1),
    shards: s.shards + (won ? 70 : 25),
  }));
  if (mode === "solo") {
    void reportHunt({ data: { hunterId, won } })
      .then((profile) => useGame.setState({ profile }))
      .catch(() => {});
  } else {
    void loadProfile()
      .then((profile) => useGame.setState({ profile }))
      .catch(() => {});
  }
}

async function pushDuelAction(action: Action) {
  const { match, duelCode, duelRole } = useGame.getState();
  if (!match || !duelCode || !duelRole) return;
  if (action.type !== "endTurn") playerActed = true;
  useGame.setState({ thinking: true });
  try {
    const view = await actDuel({ data: { code: duelCode, action: actionForHost(action, duelRole) } });
    ingestDuel(view, action);
    if (view.match && !view.match.winner) {
      const next = viewAsPlayer(view.match, duelRole);
      if (playerActed && next.turn === "player" && !playerHasMoves(next)) queueAutoEnd();
    }
  } catch {
    useGame.setState({ thinking: false });
  }
}

function ingestDuel(view: DuelView, played?: Action) {
  const role = view.you;
  useGame.setState({ duel: view, duelRole: role, duelCode: view.id, mode: "duel" });
  if (!view.match) return;
  const next = viewAsPlayer(view.match, role);
  const prev = useGame.getState().match;
  const action = played ?? actionForView(view.lastAction, role);
  let fx = useGame.getState().lastFx;
  if (prev && action && JSON.stringify(prev) !== JSON.stringify(next)) {
    const built = buildCombatFx(prev, next, action);
    playFxAudio(prev, next, action, built);
    fx = built;
  }
  const wasOver = Boolean(prev?.winner);
  useGame.setState({
    match: next,
    lastFx: fx,
    thinking: !next.winner && next.turn !== "player",
    screen: "battle",
  });
  if (!wasOver && next.winner) settle(next);
}

function startDuelPoll() {
  if (duelPoll) window.clearInterval(duelPoll);
  duelPoll = window.setInterval(() => {
    const { duelCode, mode } = useGame.getState();
    if (mode !== "duel" || !duelCode) return;
    void getDuel({ data: { code: duelCode } })
      .then((view) => {
        useGame.setState({ duel: view });
        if (view.match) ingestDuel(view);
        else if (view.status === "matched" || view.status === "open") {
          useGame.setState({ screen: "duel" });
        }
      })
      .catch(() => {});
  }, 900);
}

function queueAi() {
  if (aiTimer) window.clearTimeout(aiTimer);
  useGame.setState({ thinking: true });
  const step = () => {
    const { match } = useGame.getState();
    if (!match || match.winner || match.turn !== "enemy") {
      useGame.setState({ thinking: false });
      return;
    }
    const action = chooseAiAction(match);
    const { next, fx } = commitAction(match, action);
    useGame.setState({ match: next, lastFx: fx });
    if (next.winner) {
      useGame.setState({ thinking: false });
      settle(next);
      return;
    }
    if (next.turn === "enemy") {
      aiTimer = window.setTimeout(
        step,
        action.type === "endTurn"
          ? 320
          : action.type === "power"
            ? cineHoldMs(fx) + 400
            : action.type === "attack"
              ? 1900
              : 640,
      );
    } else {
      playerActed = false;
      useGame.setState({ thinking: false });
    }
  };
  aiTimer = window.setTimeout(step, 520);
}

export function activeDeck(): SavedDeck | undefined {
  const { save } = useGame.getState();
  return save.decks.find((d) => d.id === save.activeDeckId) ?? save.decks[0];
}

export function hunterForDeck(deck: SavedDeck) {
  return getHunter(deck.hunterId);
}

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Section, Shell } from "@/components/game/Screens";
import { HUNTERS, getHunter } from "@/game/cards";
import {
  createDuel,
  joinDuel,
  loadLadder,
  loadProfile,
  readyDuel,
  type LadderRow,
} from "@/game/online";
import { XP_STEP, xpIntoLevel } from "@/game/progress";
import { deckValid } from "@/game/save";
import { useGame } from "@/game/store";
import { SignInGate } from "@/lib/auth/gates";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { asset } from "@/lib/asset";
import { cn } from "@/lib/utils";

const STATIC = import.meta.env.VITE_STATIC === "1";

function SignInPrompt() {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface px-4 py-5">
      <p className="font-display text-lg">Sign in to hunt together</p>
      <p className="text-sm text-muted">Duels, the ladder, and hunter ranks sit on your account.</p>
      {GROK_PROVIDERS.map((p) => (
        <Button
          key={p.providerId}
          type="button"
          className="w-full"
          onClick={() => signIn(p.providerId, { callbackURL: "/" })}
        >
          Continue with {p.label}
        </Button>
      ))}
    </div>
  );
}

export function DuelLobby() {
  const go = useGame((s) => s.go);
  const save = useGame((s) => s.save);
  const duel = useGame((s) => s.duel);
  const enterDuel = useGame((s) => s.enterDuel);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deckId, setDeckId] = useState(save.activeDeckId);
  const deck = save.decks.find((d) => d.id === deckId) ?? save.decks[0]!;
  const illegal = deckValid(deck, save);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const view = await createDuel();
      enterDuel(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open a duel.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError(null);
    try {
      const view = await joinDuel({ data: { code } });
      enterDuel(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    if (!duel || illegal) return;
    setBusy(true);
    setError(null);
    try {
      const view = await readyDuel({
        data: { code: duel.id, hunterId: deck.hunterId, cards: deck.cards },
      });
      enterDuel(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not lock in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Duel" onBack={() => go("title")}>
      {STATIC ? (
        <>
          <p className="text-sm text-muted">
            Face a rival hunter on this device. Pick your deck, then begin the hunt.
          </p>
          <Button size="lg" className="w-full" onClick={() => go("play")}>
            Choose rival
          </Button>
        </>
      ) : (
      <SignInGate fallback={<SignInPrompt />}>
        {!duel ? (
          <>
            <p className="text-sm text-muted">
              Open a room and share the code, or join a rival. The hunt runs on the server so the
              ladder stays honest.
            </p>
            <Button size="lg" className="w-full" disabled={busy} onClick={() => void open()}>
              Open a room
            </Button>
            <Section label="Join">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="CODE"
                className="h-12 w-full rounded-md border border-border bg-surface px-4 font-display tracking-[0.4em] uppercase"
              />
              <Button className="w-full" variant="secondary" disabled={busy || code.length < 6} onClick={() => void join()}>
                Join hunt
              </Button>
            </Section>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-accent bg-surface px-4 py-4">
              <p className="text-xs tracking-[0.25em] text-muted">ROOM</p>
              <p className="mt-1 font-display text-4xl tracking-[0.28em]">{duel.id}</p>
              <p className="mt-2 text-sm text-muted">
                {duel.hostName}
                {duel.guestName ? ` vs ${duel.guestName}` : " · waiting for a rival"}
              </p>
            </div>
            <Section label="Your deck">
              <div className="grid gap-2">
                {save.decks.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDeckId(d.id)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-4 py-3 text-left",
                      d.id === deckId ? "border-accent bg-surface-2" : "border-border bg-surface",
                    )}
                  >
                    <span>
                      <span className="block font-display">{d.name}</span>
                      <span className="text-xs text-muted">{getHunter(d.hunterId).name}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {duel.you === "host"
                        ? duel.hostReady
                          ? "Locked"
                          : "Ready"
                        : duel.guestReady
                          ? "Locked"
                          : "Ready"}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
            {illegal && <p className="text-sm text-danger">{illegal}</p>}
            <Button size="lg" className="w-full" disabled={busy || Boolean(illegal)} onClick={() => void lock()}>
              Lock in
            </Button>
            <p className="text-xs text-muted">
              Host ready {duel.hostReady ? "yes" : "no"} · Guest ready {duel.guestReady ? "yes" : "no"}
            </p>
          </>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </SignInGate>
      )}
    </Shell>
  );
}

export function LadderBoard() {
  const go = useGame((s) => s.go);
  const [rows, setRows] = useState<LadderRow[] | null>(null);
  useEffect(() => {
    void loadLadder()
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  return (
    <Shell title="Ladder" onBack={() => go("title")}>
      <p className="text-sm text-muted">Rating from hunts and duels. Duels swing harder.</p>
      <div className="grid gap-2">
        {rows === null && <p className="text-sm text-muted">Reading the board…</p>}
        {rows?.length === 0 && <p className="text-sm text-muted">No hunters ranked yet.</p>}
        {rows?.map((row, i) => (
          <div
            key={row.userId}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3"
          >
            <span className="w-6 font-display text-sm text-muted">{i + 1}</span>
            <img
              src={asset(`hunters/${row.hunterId}.jpg`)}
              alt=""
              className="size-10 rounded-md object-cover"
              crossOrigin="anonymous"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display">{row.displayName}</p>
              <p className="text-xs text-muted">
                {row.title} · Lv {row.level}
              </p>
            </div>
            <div className="text-right text-xs tabular-nums">
              <p className="font-display text-sm text-accent">{row.rating}</p>
              <p className="text-muted">
                {row.wins}–{row.losses}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function ProgressScreen() {
  const go = useGame((s) => s.go);
  const profile = useGame((s) => s.profile);
  const setProfile = useGame((s) => s.setProfile);
  useEffect(() => {
    void loadProfile()
      .then(setProfile)
      .catch(() => {});
  }, [setProfile]);
  return (
    <Shell title="Progress" onBack={() => go("title")}>
      <SignInGate fallback={<SignInPrompt />}>
        {!profile ? (
          <p className="text-sm text-muted">Loading ranks…</p>
        ) : (
          <>
            <div className="rounded-lg border border-border bg-surface px-4 py-4">
              <p className="text-xs tracking-[0.25em] text-muted">{profile.title}</p>
              <p className="mt-1 font-display text-3xl">{profile.displayName}</p>
              <p className="mt-2 text-sm tabular-nums text-muted">
                Rating {profile.rating} · {profile.wins}–{profile.losses} · Level {profile.level}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${(xpIntoLevel(profile.xp) / XP_STEP) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-muted">
                {xpIntoLevel(profile.xp)} / {XP_STEP} xp
              </p>
            </div>
            <Section label="Hunter mastery">
              <div className="grid gap-2">
                {Object.values(HUNTERS).map((h) => {
                  const m = profile.mastery.find((x) => x.hunterId === h.id);
                  return (
                    <div key={h.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3">
                      <img
                        src={asset(`hunters/${h.id}.jpg`)}
                        alt=""
                        className="size-12 rounded-md object-cover"
                        crossOrigin="anonymous"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-display">{h.name}</p>
                        <p className="text-xs text-muted">
                          Lv {m?.level ?? 1} · {m?.wins ?? 0}–{m?.losses ?? 0}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
            <p className="text-sm text-muted">
              Win hunts and duels to rank up. Duels grant more XP. Combat rules stay even — progress
              is title, rating, and mastery, not extra damage.
            </p>
          </>
        )}
      </SignInGate>
    </Shell>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, ChevronLeft, Layers, Library, Package, Swords, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignedIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { loadProfile } from "@/game/online";
import { CardFace } from "@/components/game/CardFace";
import {
  COLLECTIBLE,
  FACTION_META,
  HUNTERS,
  KEYWORD_HINT,
  RARITY_LABEL,
  cardRole,
  flavorOf,
  getCard,
  getHunter,
} from "@/game/cards";
import { weaponOf } from "@/game/weapons";
import { applyPack, rollPack } from "@/game/packs";
import { PACK_COST, copyMax, deckValid, ownedCount, type SavedDeck } from "@/game/save";
import { sfx, unlockAudio } from "@/game/audio";
import { useGame, type Screen } from "@/game/store";
import { DECK_SIZE, type Faction } from "@/game/types";
import { cn } from "@/lib/utils";
import { asset } from "@/lib/asset";

const STATIC = import.meta.env.VITE_STATIC === "1";

function otherHunter(hunterId: string): string {
  const ids = Object.keys(HUNTERS);
  return ids.find((id) => id !== hunterId) ?? "matriarch";
}

export function TitleScreen() {
  const go = useGame((s) => s.go);
  const save = useGame((s) => s.save);
  const profile = useGame((s) => s.profile);
  const setProfile = useGame((s) => s.setProfile);
  useCurrentUserState();
  useEffect(() => {
    loadProfile().then(setProfile).catch(() => {});
  }, [setProfile]);
  const open = (screen: Screen) => {
    try {
      unlockAudio();
      sfx.ui();
    } catch {
      /* ignore audio */
    }
    go(screen);
  };
  return (
    <div className="relative min-h-dvh overflow-hidden bg-bg">
      <img
        src={asset("art/title.jpg")}
        alt=""
        className="absolute inset-0 size-full object-cover object-[center_28%] opacity-70"
        crossOrigin="anonymous"
      />
      <div className="title-wash" />
      <div className="stage-light" />
      <div className="relative z-20 mx-auto flex min-h-dvh max-w-lg flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-14">
        <div className="absolute right-5 top-5">
          {STATIC ? null : (
            <SignedIn>
              <UserButton />
            </SignedIn>
          )}
        </div>
        <header className="pt-6 text-center">
          <p className="text-[0.65rem] tracking-[0.42em] text-accent">COLLECT · COMMAND · CONQUER</p>
          <h1 className="mt-2 font-display text-6xl tracking-[0.22em] text-accent drop-shadow-[0_2px_24px_rgb(0_0_0_/_0.7)]">
            APEX
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-fg/80">
            Four tribes. One hunt. Build a forty-card deck and cut the enemy hunter down.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {(
              [
                ["shadowborn", "bg-shadowborn"],
                ["crimson", "bg-crimson"],
                ["abyssal", "bg-abyssal"],
                ["revenant", "bg-revenant"],
              ] as const
            ).map(([id, cls]) => (
              <span key={id} className={cn("h-1.5 w-8 rounded-full", cls)} />
            ))}
          </div>
          {profile && profile.wins + profile.losses > 0 && (
            <p className="mt-3 text-xs tracking-[0.18em] text-accent">
              {profile.title} · {profile.rating} rating · Lv {profile.level}
            </p>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6">
          <button type="button" className="hunt-core" onClick={() => open("play")}>
            <Swords className="size-7" />
            Hunt
          </button>
          <div className="grid w-full grid-cols-2 gap-3">
            <MenuTile icon={<Library />} label="Collection" onClick={() => open("collection")} />
            <MenuTile icon={<Layers />} label="Decks" onClick={() => open("decks")} />
            <MenuTile icon={<Package />} label="Packs" onClick={() => open("packs")} />
            <MenuTile icon={<BookOpen />} label="Rules" onClick={() => open("how")} />
          </div>
          <div className="grid w-full grid-cols-3 gap-2">
            <Button variant="secondary" className="h-12" onClick={() => open("duel")}>
              <Users /> Duel
            </Button>
            <Button variant="secondary" className="h-12" onClick={() => open("ladder")}>
              <Trophy /> Ladder
            </Button>
            <Button variant="secondary" className="h-12" onClick={() => open("progress")}>
              Rank
            </Button>
          </div>
        </div>
        <p className="pb-2 text-center text-xs tabular-nums text-muted">
          {save.wins} wins · {save.shards} shards
        </p>
      </div>
    </div>
  );
}

function MenuTile({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="menu-tile flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border border-border bg-surface/80 px-3 py-3 text-fg backdrop-blur-sm"
    >
      <span className="text-accent [&_svg]:size-5">{icon}</span>
      <span className="font-display text-sm tracking-wide">{label}</span>
    </button>
  );
}

export function PlaySetup() {
  const go = useGame((s) => s.go);
  const save = useGame((s) => s.save);
  const startMatch = useGame((s) => s.startMatch);
  const patchSave = useGame((s) => s.patchSave);
  const [deckId, setDeckId] = useState(save.activeDeckId);
  const deck = save.decks.find((d) => d.id === deckId) ?? save.decks[0]!;
  const [enemy, setEnemy] = useState(() => otherHunter(deck.hunterId));
  const [inspect, setInspect] = useState<string | null>(null);
  const error = deckValid(deck, save);

  const selectDeck = (chosen: SavedDeck) => {
    if (chosen.id === deckId) {
      sfx.ui();
      return;
    }
    setDeckId(chosen.id);
    setInspect(null);
    patchSave((s) => ({ ...s, activeDeckId: chosen.id }));
    setEnemy((cur) => (cur === chosen.hunterId ? otherHunter(chosen.hunterId) : cur));
    sfx.ui();
  };

  const begin = () => {
    if (error) return;
    patchSave((s) => ({ ...s, activeDeckId: deck.id }));
    try {
      unlockAudio();
      sfx.play();
    } catch {
      /* ignore audio */
    }
    startMatch(deck, enemy);
  };

  return (
    <Shell title="The Hunt" onBack={() => go("title")}>
      <Section label="Your deck — bottom of the table">
        <p className="text-sm text-muted">
          Tap a deck to open its cards. Tap a card to read it. Begin hunt when you are ready.
        </p>
        <DeckPicker decks={save.decks} activeId={deck.id} onSelect={selectDeck} />
      </Section>
      <div key={deck.id} className="deck-swap grid gap-3">
        <DeckBanner deck={deck} />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs tracking-wide text-muted">
            {new Set(deck.cards).size} unique · tap a card for the dossier
          </p>
          <Button size="sm" variant="secondary" onClick={() => go("decks")}>
            Edit
          </Button>
        </div>
        <DeckRoster deck={deck} onInspect={setInspect} />
      </div>
      <Section label="Rival hunter — top of the table">
        <div className="grid grid-cols-2 gap-2">
          {Object.values(HUNTERS).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setEnemy(h.id)}
              className={cn(
                "overflow-hidden rounded-lg border text-left",
                enemy === h.id ? "border-accent" : "border-border",
              )}
            >
              <img
                src={asset(`hunters/${h.id}.jpg`)}
                alt=""
                className="h-28 w-full object-cover"
                crossOrigin="anonymous"
              />
              <div className="px-3 py-2">
                <p className="font-display text-sm">{h.name}</p>
                <p className="text-xs text-muted">{h.title}</p>
              </div>
            </button>
          ))}
        </div>
      </Section>
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button size="lg" className="w-full" disabled={Boolean(error)} onClick={begin}>
        Begin hunt
      </Button>
      {inspect && (
        <InspectCard
          key={inspect}
          cardId={inspect}
          owned={ownedCount(save, inspect)}
          inDeck={deck.cards.filter((id) => id === inspect).length}
          onClose={() => setInspect(null)}
        />
      )}
    </Shell>
  );
}

export function Collection() {
  const go = useGame((s) => s.go);
  const save = useGame((s) => s.save);
  const [faction, setFaction] = useState<Faction | "all">("all");
  const [role, setRole] = useState<"all" | "power" | "defense" | "support">("all");
  const [inspect, setInspect] = useState<string | null>(null);
  const cards = COLLECTIBLE.filter((c) => faction === "all" || c.faction === faction).filter(
    (c) => role === "all" || cardRole(c) === role,
  );
  const inspected = inspect ? getCard(inspect) : null;
  return (
    <Shell title="Collection" onBack={() => go("title")}>
      <FactionFilter value={faction} onChange={setFaction} />
      <div className="flex gap-2 overflow-x-auto">
        {(["all", "power", "defense", "support"] as const).map((r) => (
          <Button key={r} size="sm" variant={role === r ? "default" : "secondary"} onClick={() => setRole(r)}>
            {r === "all" ? "All" : r === "power" ? "Power" : r === "defense" ? "Defense" : "Support"}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {cards.map((c) => {
          const n = ownedCount(save, c.id);
          return (
            <CardFace
              key={c.id}
              cardId={c.id}
              size="md"
              count={n}
              locked={n === 0}
              onClick={() => setInspect(c.id)}
            />
          );
        })}
      </div>
      {inspected && (
        <InspectCard cardId={inspected.id} owned={ownedCount(save, inspected.id)} onClose={() => setInspect(null)} />
      )}
    </Shell>
  );
}

function InspectCard({
  cardId,
  owned,
  inDeck,
  onClose,
}: {
  cardId: string;
  owned: number;
  inDeck?: number;
  onClose: () => void;
}) {
  const card = getCard(cardId);
  const role = cardRole(card);
  const weapon = card.type === "unit" ? weaponOf(card.id) : null;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg/92 p-4" onClick={onClose}>
      <div
        className="mx-auto flex max-w-sm flex-col items-center gap-4 pb-8 pt-6"
        onClick={(e) => e.stopPropagation()}
      >
        <CardFace cardId={card.id} size="lg" count={owned} />
        <div className="w-full space-y-3 text-sm">
          <div>
            <p className="text-[0.65rem] tracking-[0.22em] text-accent">
              {RARITY_LABEL[card.rarity]} · {card.type === "unit" ? "Unit" : "Tactic"} · {FACTION_META[card.faction].short}
            </p>
            <h2 className="mt-1 font-display text-2xl tracking-wide">{card.name}</h2>
            <p className="mt-1 text-xs tracking-wide text-muted">
              {role === "power" ? "Power strike" : role === "defense" ? "Defense" : "Support"}
              {weapon ? ` · ${weapon}` : ""}
            </p>
          </div>
          <div className="flex gap-3 text-xs tabular-nums text-muted">
            <span>Cost {card.cost}</span>
            {card.type === "unit" && (
              <>
                <span>Attack {card.attack}</span>
                <span>Health {card.health}</span>
              </>
            )}
            <span className="ml-auto">
              Owned ×{owned}
              {inDeck != null ? ` · Deck ×${inDeck}` : ""}
            </span>
          </div>
          {card.text ? <p className="leading-relaxed text-fg">{card.text}</p> : null}
          {card.keywords.length > 0 && (
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
              {card.keywords.map((k) => (
                <li key={k}>
                  <span className="text-accent">{k[0]!.toUpperCase() + k.slice(1)}.</span> {KEYWORD_HINT[k]}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs italic leading-relaxed text-muted">{flavorOf(card)}</p>
        </div>
        <Button className="w-full" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function deckRoster(deck: SavedDeck): [string, number][] {
  const map: Record<string, number> = {};
  for (const id of deck.cards) map[id] = (map[id] ?? 0) + 1;
  const faction = getHunter(deck.hunterId).faction;
  return Object.entries(map).sort((a, b) => {
    const ca = getCard(a[0]!);
    const cb = getCard(b[0]!);
    const fa = Number(ca.faction !== faction);
    const fb = Number(cb.faction !== faction);
    if (fa !== fb) return fa - fb;
    if (ca.cost !== cb.cost) return ca.cost - cb.cost;
    return ca.name.localeCompare(cb.name);
  });
}

function DeckPicker({
  decks,
  activeId,
  onSelect,
}: {
  decks: SavedDeck[];
  activeId: string;
  onSelect: (deck: SavedDeck) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {decks.map((d) => {
        const hunter = getHunter(d.hunterId);
        const on = d.id === activeId;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelect(d)}
            aria-pressed={on}
            className={cn(
              "flex min-h-14 min-w-[10.25rem] shrink-0 items-center gap-2 rounded-lg border px-2 py-2 text-left",
              on ? "border-accent bg-surface-2" : "border-border bg-surface",
            )}
          >
            <img
              src={asset(`hunters/${hunter.id}.jpg`)}
              alt=""
              className="size-11 rounded-sm object-cover"
              crossOrigin="anonymous"
            />
            <span>
              <span className="block font-display text-sm leading-tight">{d.name}</span>
              <span className="text-[0.65rem] text-muted">{hunter.name}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DeckBanner({ deck }: { deck: SavedDeck }) {
  const hunter = getHunter(deck.hunterId);
  const faction = FACTION_META[hunter.faction];
  return (
    <div className="relative overflow-hidden rounded-lg border border-accent/50" data-open-deck={deck.id}>
      <img
        src={asset(`hunters/${hunter.id}.jpg`)}
        alt=""
        className="h-32 w-full object-cover object-[center_20%]"
        crossOrigin="anonymous"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/45 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-3">
        <p className="text-[0.65rem] tracking-[0.22em] text-accent">{faction.name}</p>
        <h2 className="font-display text-2xl tracking-wide">{deck.name}</h2>
        <p className="text-xs text-muted">
          {hunter.name} · {deck.cards.length}/{DECK_SIZE} cards
        </p>
      </div>
    </div>
  );
}

function DeckRoster({
  deck,
  onInspect,
  onRemove,
}: {
  deck: SavedDeck;
  onInspect: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  const entries = deckRoster(deck);
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-deck-roster={deck.id}>
      {entries.map(([id, n]) => (
        <div key={`${deck.id}-${id}`} className="relative min-w-0">
          <CardFace cardId={id} size="tile" count={n} onClick={() => onInspect(id)} />
          {onRemove ? (
            <button
              type="button"
              className="absolute right-1 top-1 z-10 rounded-xs bg-bg/80 px-1.5 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(id);
              }}
            >
              −
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function DeckBuilder() {
  const go = useGame((s) => s.go);
  const save = useGame((s) => s.save);
  const patchSave = useGame((s) => s.patchSave);
  const [deckId, setDeckId] = useState(save.activeDeckId);
  const [inspect, setInspect] = useState<string | null>(null);
  const deck = save.decks.find((d) => d.id === deckId) ?? save.decks[0]!;
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const id of deck.cards) map[id] = (map[id] ?? 0) + 1;
    return map;
  }, [deck.cards]);
  const error = deckValid(deck, save);

  const setDeck = (next: SavedDeck) => {
    patchSave((s) => ({
      ...s,
      activeDeckId: next.id,
      decks: s.decks.map((d) => (d.id === next.id ? next : d)),
    }));
  };

  const selectDeck = (chosen: SavedDeck) => {
    setDeckId(chosen.id);
    setInspect(null);
    patchSave((s) => ({ ...s, activeDeckId: chosen.id }));
    sfx.ui();
  };

  const add = (id: string) => {
    const have = ownedCount(save, id);
    const used = counts[id] ?? 0;
    const max = copyMax(id);
    if (used >= have || used >= max || deck.cards.length >= DECK_SIZE) return;
    sfx.ui();
    setDeck({ ...deck, cards: [...deck.cards, id] });
  };
  const remove = (id: string) => {
    const idx = deck.cards.lastIndexOf(id);
    if (idx < 0) return;
    sfx.ui();
    const cards = deck.cards.slice();
    cards.splice(idx, 1);
    setDeck({ ...deck, cards });
  };

  return (
    <Shell title="Decks" onBack={() => go("title")}>
      <p className="text-sm text-muted">
        Tap a deck to open its cards. Tap a card to read it. Use − to cut a copy, or add from the collection below.
      </p>
      <DeckPicker decks={save.decks} activeId={deck.id} onSelect={selectDeck} />
      <div key={deck.id} className="deck-swap grid gap-4">
        <DeckBanner deck={deck} />
        <p className={cn("text-sm tabular-nums", error ? "text-danger" : "text-muted")}>
          {deck.cards.length}/{DECK_SIZE} · {new Set(deck.cards).size} unique {error ? `· ${error}` : "· ready"}
        </p>
        <Section label="Cards in this deck">
          <p className="text-xs tracking-wide text-muted">Tap a card for the dossier. Use − to cut a copy.</p>
          <DeckRoster deck={deck} onInspect={setInspect} onRemove={remove} />
        </Section>
        <Section label="Hunter">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.values(HUNTERS).map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setDeck({ ...deck, hunterId: h.id })}
                className={cn(
                  "flex gap-3 rounded-lg border p-2 text-left",
                  deck.hunterId === h.id ? "border-accent bg-surface-2" : "border-border bg-surface",
                )}
              >
                <img
                  src={asset(`hunters/${h.id}.jpg`)}
                  alt=""
                  className="size-14 rounded-sm object-cover"
                  crossOrigin="anonymous"
                />
                <span>
                  <span className="block font-display text-sm">{h.name}</span>
                  <span className="text-xs text-muted">{h.powerText}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>
        <Section label="Add from collection">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {COLLECTIBLE.map((c) => {
              const n = ownedCount(save, c.id);
              if (n === 0) return null;
              const used = counts[c.id] ?? 0;
              return (
                <div key={c.id} className="relative min-w-0">
                  <CardFace
                    cardId={c.id}
                    size="tile"
                    count={used}
                    dim={used === 0}
                    onClick={() => add(c.id)}
                  />
                  {used > 0 && (
                    <button
                      type="button"
                      className="absolute right-1 top-1 rounded-xs bg-bg/80 px-1.5 text-xs"
                      onClick={() => remove(c.id)}
                    >
                      −
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      </div>
      {inspect && (
        <InspectCard
          key={inspect}
          cardId={inspect}
          owned={ownedCount(save, inspect)}
          inDeck={counts[inspect] ?? 0}
          onClose={() => setInspect(null)}
        />
      )}
    </Shell>
  );
}

export function Packs() {
  const go = useGame((s) => s.go);
  const save = useGame((s) => s.save);
  const patchSave = useGame((s) => s.patchSave);
  const [opening, setOpening] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(0);
  const canOpen = save.shards >= PACK_COST && !opening;
  return (
    <Shell title="Packs" onBack={() => go("title")}>
      <p className="text-sm text-muted">
        Five cards. Commons through Sovereigns. Duplicates after two copies return as shards.
      </p>
      <p className="text-sm tabular-nums">
        {save.shards} shards · {PACK_COST} a pack
      </p>
      <div className="relative mx-auto h-64 w-44 overflow-hidden rounded-lg lit-edge">
        <img src={asset("art/pack.jpg")} alt="" className="size-full object-cover" crossOrigin="anonymous" />
        <span className="portrait-light" />
      </div>
      <Button
        size="lg"
        className="w-full"
        disabled={!canOpen}
        onClick={() => {
          if (!canOpen) return;
          const pack = rollPack();
          const next = applyPack({ ...save, shards: save.shards - PACK_COST }, pack);
          patchSave(() => next.save);
          sfx.pack();
          setOpening(pack);
          setRevealed(0);
        }}
      >
        Open pack
      </Button>
      {opening && (
        <div className="fixed inset-0 z-30 flex flex-col items-center justify-center bg-bg/90 p-4">
          <div className="flex max-w-lg flex-wrap justify-center gap-2">
            {opening.map((id, i) =>
              i <= revealed ? (
                <div key={`${id}-${i}`} className="pack-pop">
                  <CardFace cardId={id} size="md" />
                </div>
              ) : (
                <button
                  key={`${id}-${i}`}
                  type="button"
                  onClick={() => {
                    sfx.draw();
                    setRevealed(i);
                  }}
                  className="h-[11.5rem] w-[8.25rem] rounded-md bg-cover bg-center"
                  style={{ backgroundImage: `url(${asset("art/cardback.jpg")})` }}
                  aria-label="Reveal card"
                />
              ),
            )}
          </div>
          {revealed >= opening.length - 1 ? (
            <Button className="mt-6" onClick={() => setOpening(null)}>
              Done
            </Button>
          ) : (
            <p className="mt-6 text-sm text-muted">Tap the next card.</p>
          )}
        </div>
      )}
    </Shell>
  );
}

export function HowToPlay() {
  const go = useGame((s) => s.go);
  return (
    <Shell title="Rules" onBack={() => go("title")}>
      <div className="space-y-4 text-sm leading-relaxed text-muted">
        <p>Each hunter has a forty-card deck and a life total. Reduce the rival hunter to zero.</p>
        <p>
          You start with a hand of four. Each turn you draw one and gain one energy, up to ten. Spend energy to play
          units and tactics.
        </p>
        <p>
          Units cannot attack the turn they are played unless they have Rush. Guard units must be attacked before the
          hunter. Stalk units cannot be hit until they strike. Pierce ignores Guard. Ward stops the first damage.
          Retaliate deals 1 extra back. Venom destroys a unit it damages. Cleave hits neighboring lanes. Overwhelm
          sends leftover damage to the hunter. Frenzy lets a wounded unit attack. Reborn keeps a unit at 1 Health the
          first time it would fall. Pierce that hits the hunter is a power strike and deals 2 more. Power strike costs
          4 energy.
        </p>
        <p>
          Tap a card to choose it. Units show on the board as a preview and stay in your hand until you tap Play. Tap
          the card again, or the preview, to put it in. Tap Strike to attack. When you have nothing left, the turn
          ends on its own.
        </p>
        <p>Tap Hint for a suggested play. Tap Make move — or Hint again — to take it.</p>
        <p>
          Sign in to Duel another hunter, climb the ladder, and rank your hunters. Hunts versus the AI still count.
          Duels run on the server so a win is a win.
        </p>
        <ul className="space-y-2">
          {Object.entries(KEYWORD_HINT).map(([key, hint]) => (
            <li key={key}>
              <span className="text-fg">{key[0]!.toUpperCase() + key.slice(1)}.</span> {hint}
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  );
}

export function Shell({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh bg-bg">
      <div className="stage-light" />
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-bg/80 px-3 py-3 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ChevronLeft />
        </Button>
        <h1 className="font-display text-xl tracking-wide">{title}</h1>
      </header>
      <div className="relative z-20 mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 pb-16">{children}</div>
    </div>
  );
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h2 className="text-xs tracking-[0.2em] text-muted uppercase">{label}</h2>
      {children}
    </section>
  );
}

function FactionFilter({
  value,
  onChange,
}: {
  value: Faction | "all";
  onChange: (v: Faction | "all") => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {(["all", "shadowborn", "crimson", "abyssal", "revenant"] as const).map((id) => (
        <Button key={id} size="sm" variant={value === id ? "default" : "secondary"} onClick={() => onChange(id)}>
          {id === "all" ? "All" : FACTION_META[id].short}
        </Button>
      ))}
    </div>
  );
}

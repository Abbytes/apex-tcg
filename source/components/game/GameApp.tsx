import { useEffect } from "react";
import { Battle } from "@/components/game/Battle";
import { DuelLobby, LadderBoard, ProgressScreen } from "@/components/game/Online";
import {
  Collection,
  DeckBuilder,
  HowToPlay,
  Packs,
  PlaySetup,
  TitleScreen,
} from "@/components/game/Screens";
import { asset } from "@/lib/asset";
import { loadSave } from "@/game/save";
import { useGame } from "@/game/store";

export function GameApp() {
  const screen = useGame((s) => s.screen);
  const match = useGame((s) => s.match);

  useEffect(() => {
    useGame.setState({ save: loadSave() });
    document.documentElement.style.setProperty("--arena-img", `url("${asset("art/arena.jpg")}")`);
  }, []);

  if (screen === "battle" && match) return <Battle />;
  if (screen === "play") return <PlaySetup />;
  if (screen === "collection") return <Collection />;
  if (screen === "decks") return <DeckBuilder />;
  if (screen === "packs") return <Packs />;
  if (screen === "how") return <HowToPlay />;
  if (screen === "duel") return <DuelLobby />;
  if (screen === "ladder") return <LadderBoard />;
  if (screen === "progress") return <ProgressScreen />;
  return <TitleScreen />;
}

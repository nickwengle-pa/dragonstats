import { useMemo, useState } from "react";
import PregameSetupView from "./PregameSetupView";
import {
  DEFAULT_CHARTING,
  type ChartingPrefs,
  createDefaultPregameConfig,
  deriveOpeningKickoffReceiver,
  getSecondHalfKickoffReceiver,
  oppositeTeam,
  type PregameConfig,
  type TeamSide,
  type TossChoice,
} from "@/services/gameFlow";

interface Props {
  initialValue?: PregameConfig | null;
  /** What this crew is charting live. Both default on. */
  initialCharting?: ChartingPrefs | null;
  progName: string;
  oppName: string;
  /** Raw team colours. Buttons that stand for a team wear that team's colour
      so the two sides never look alike; missing colours fall back to grey. */
  progColor?: string | null;
  oppColor?: string | null;
  /** Short tags for the summary, where two full names plus an arrow will not
      fit a phone. Fall back to the names. */
  progAbbr?: string | null;
  oppAbbr?: string | null;
  onClose: () => void;
  onSave: (pregame: PregameConfig, charting: ChartingPrefs) => Promise<void> | void;
  saving?: boolean;
}

export default function PregameSetupSheet({
  initialValue,
  initialCharting,
  progName,
  oppName,
  progColor,
  oppColor,
  progAbbr,
  oppAbbr,
  onClose,
  onSave,
  saving = false,
}: Props) {
  /* Seeded once, on mount. The sheet is mounted fresh every time it opens,
     so there is nothing to re-sync from props — and re-syncing was actively
     harmful: with no stored config the parent passed a new default object
     on every render, and an effect keyed on it wiped the crew's picks each
     time the game screen repainted. */
  const [form, setForm] = useState<PregameConfig>(initialValue ?? createDefaultPregameConfig());
  const [charting, setCharting] = useState<ChartingPrefs>(initialCharting ?? DEFAULT_CHARTING);

  const team = {
    us: { name: progName, tag: progAbbr || progName, color: progColor ?? "#6b7280" },
    them: { name: oppName, tag: oppAbbr || oppName, color: oppColor ?? "#6b7280" },
  };
  const loserSide = oppositeTeam(form.tossWinner);

  const openingReceiver = useMemo(
    () => deriveOpeningKickoffReceiver(form.tossWinner, form.tossChoice, form.openingKickoffReceiver),
    [form],
  );
  const loserChoice: "receive" | "kick" = openingReceiver === loserSide ? "receive" : "kick";
  const secondHalfReceiver = getSecondHalfKickoffReceiver({
    ...form,
    openingKickoffReceiver: openingReceiver,
  });

  /* Changing the winner or the choice drops any earlier explicit receiver
     rather than carrying it. Carried, a receiver derived from "receive"
     survived into "defer" and read as the loser choosing to kick — which
     is almost never what happened. Starting from the derivation's own
     default (the loser receives) is right far more often. A saved config
     still opens exactly as stored; only an actual change resets it: a
     re-tap on the already-selected button is a no-op, because otherwise a
     second tap on a phone silently flipped the loser's receive/kick pick
     and with it who had the ball to open the game. */
  const setTossWinner = (tossWinner: TeamSide) => setForm((prev) => (
    tossWinner === prev.tossWinner ? prev : {
      ...prev,
      tossWinner,
      openingKickoffReceiver: deriveOpeningKickoffReceiver(tossWinner, prev.tossChoice, null),
    }
  ));
  const setTossChoice = (tossChoice: TossChoice) => setForm((prev) => (
    tossChoice === prev.tossChoice ? prev : {
      ...prev,
      tossChoice,
      openingKickoffReceiver: deriveOpeningKickoffReceiver(prev.tossWinner, tossChoice, null),
    }
  ));
  const setLoserChoice = (choice: "receive" | "kick") => setForm((prev) => ({
    ...prev,
    openingKickoffReceiver: choice === "receive" ? oppositeTeam(prev.tossWinner) : prev.tossWinner,
  }));

  const handleSave = () => {
    onSave({
      ...form,
      openingKickoffReceiver: openingReceiver,
    }, charting);
  };

  return <PregameSetupView
    teams={team}
    winner={form.tossWinner}
    choice={form.tossChoice}
    loserChoice={loserChoice}
    direction={form.ourDriveDirectionQ1}
    receiver={openingReceiver}
    secondHalfReceiver={secondHalfReceiver}
    charting={charting}
    setWinner={setTossWinner}
    setChoice={setTossChoice}
    setLoserChoice={setLoserChoice}
    setDirection={(value) => setForm(prev => ({ ...prev, ourDriveDirectionQ1: value }))}
    setCharting={setCharting}
    onSave={handleSave}
    onClose={onClose}
    saving={saving}
  />;
}

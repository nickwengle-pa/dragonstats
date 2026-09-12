import { useState } from "react";
import PregameSetupSheet from "@/components/game/PregameSetupSheet";
import {
  DEFAULT_CHARTING,
  type ChartingPrefs,
  createDefaultPregameConfig,
  type PregameConfig,
} from "@/services/gameFlow";

/* A development-only stage for the pregame sheet, mounted from main.tsx at
   /pregame-preview. It exists so the sheet can be seen and iterated on at
   phone and iPad widths without standing up auth and a game. Saving just
   echoes the config below the sheet so the derived kickoff flow can be
   checked against what was picked. */
export default function PregamePreview() {
  const [open, setOpen] = useState(true);
  const [saved, setSaved] = useState<{ pregame: PregameConfig; charting: ChartingPrefs } | null>(null);
  const [saving, setSaving] = useState(false);
  // Development-only colour fixtures for checking black and light teams.
  const colorCase = new URLSearchParams(window.location.search).get("colors");

  return (
    <div className="screen min-h-dvh p-5 text-white">
      <button className="btn-secondary" onClick={() => setOpen(true)}>Open pregame</button>
      {saved && (
        <pre className="mt-4 text-xs text-neutral-400 whitespace-pre-wrap">
          {JSON.stringify(saved, null, 2)}
        </pre>
      )}
      {open && (
        <PregameSetupSheet
          initialValue={saved?.pregame ?? createDefaultPregameConfig()}
          initialCharting={saved?.charting ?? DEFAULT_CHARTING}
          progName="Northern Cambria"
          oppName="Purchase Line"
          progColor={colorCase === "mono" ? "#000000" : colorCase === "light" ? "#ffdf00" : "#0b2a5b"}
          oppColor={colorCase === "mono" ? "#ffffff" : colorCase === "light" ? "#f8f8f8" : "#c8102e"}
          progAbbr="NC"
          oppAbbr="PL"
          onClose={() => setOpen(false)}
          onSave={async (pregame, charting) => {
            setSaving(true);
            await new Promise((r) => setTimeout(r, 300));
            setSaved({ pregame, charting });
            setSaving(false);
            setOpen(false);
          }}
          saving={saving}
        />
      )}
    </div>
  );
}

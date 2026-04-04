import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  createDefaultPregameConfig,
  deriveOpeningKickoffReceiver,
  getSecondHalfKickoffReceiver,
  oppositeTeam,
  type FieldDirection,
  type PregameConfig,
  type TeamSide,
  type TossChoice,
} from "@/services/gameFlow";

interface Props {
  initialValue?: PregameConfig | null;
  progName: string;
  oppName: string;
  onClose: () => void;
  onSave: (pregame: PregameConfig) => Promise<void> | void;
  saving?: boolean;
}

function teamLabel(team: TeamSide, progName: string, oppName: string): string {
  return team === "us" ? progName : oppName;
}

function ToggleRow<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
              value === option.value
                ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary"
                : "border-surface-border bg-surface-bg text-neutral-400"
            } ${disabled ? "opacity-50" : "active:bg-surface-hover"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PregameSetupSheet({
  initialValue,
  progName,
  oppName,
  onClose,
  onSave,
  saving = false,
}: Props) {
  const [form, setForm] = useState<PregameConfig>(initialValue ?? createDefaultPregameConfig());

  useEffect(() => {
    setForm(initialValue ?? createDefaultPregameConfig());
  }, [initialValue]);

  const openingReceiverLocked = form.tossChoice === "receive" || form.tossChoice === "kick";
  const openingReceiver = useMemo(
    () => deriveOpeningKickoffReceiver(form.tossWinner, form.tossChoice, form.openingKickoffReceiver),
    [form],
  );
  const secondHalfReceiver = getSecondHalfKickoffReceiver({
    ...form,
    openingKickoffReceiver: openingReceiver,
  });

  const handleSave = () => {
    onSave({
      ...form,
      openingKickoffReceiver: openingReceiver,
    });
  };

  return (
    <div className="sheet bg-black/80">
      <div className="sheet-panel max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 pb-3 shrink-0">
          <div>
            <h2 className="text-lg font-black">Pregame Setup</h2>
            <p className="text-xs text-neutral-500 mt-1">Opening kickoff, field direction, and halftime kickoff flow.</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          <ToggleRow<TeamSide>
            label="Coin Toss Winner"
            value={form.tossWinner}
            options={[
              { value: "us", label: progName },
              { value: "them", label: oppName },
            ]}
            onChange={(value) => setForm((prev) => ({
              ...prev,
              tossWinner: value,
              openingKickoffReceiver: deriveOpeningKickoffReceiver(value, prev.tossChoice, prev.openingKickoffReceiver),
            }))}
          />

          <div>
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5">Winner Choice</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "receive", label: "Receive" },
                { value: "kick", label: "Kick" },
                { value: "defer", label: "Defer" },
                { value: "defend_goal", label: "Defend Goal" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setForm((prev) => ({
                    ...prev,
                    tossChoice: option.value as TossChoice,
                    openingKickoffReceiver: deriveOpeningKickoffReceiver(
                      prev.tossWinner,
                      option.value as TossChoice,
                      prev.openingKickoffReceiver,
                    ),
                  }))}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                    form.tossChoice === option.value
                      ? "border-dragon-primary bg-dragon-primary/10 text-dragon-primary"
                      : "border-surface-border bg-surface-bg text-neutral-400 active:bg-surface-hover"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <ToggleRow<FieldDirection>
            label="We Drive In 1st Quarter"
            value={form.ourDriveDirectionQ1}
            options={[
              { value: "right", label: "To The Right" },
              { value: "left", label: "To The Left" },
            ]}
            onChange={(value) => setForm((prev) => ({ ...prev, ourDriveDirectionQ1: value }))}
          />

          <ToggleRow<TeamSide>
            label="Opening Kickoff Receiver"
            value={openingReceiver}
            options={[
              { value: "us", label: progName },
              { value: "them", label: oppName },
            ]}
            onChange={(value) => setForm((prev) => ({ ...prev, openingKickoffReceiver: value }))}
            disabled={openingReceiverLocked}
          />

          <div className="card p-3 space-y-1.5">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Summary</div>
            <div className="text-sm font-bold">
              {teamLabel(oppositeTeam(openingReceiver), progName, oppName)} kicks off to {teamLabel(openingReceiver, progName, oppName)} to start the game.
            </div>
            <div className="text-sm font-bold">
              {teamLabel(oppositeTeam(secondHalfReceiver), progName, oppName)} kicks off to {teamLabel(secondHalfReceiver, progName, oppName)} to start the 3rd quarter.
            </div>
            <div className="text-xs text-neutral-500">
              Teams switch ends every quarter. The first-quarter direction sets the field display for the whole game.
            </div>
            {openingReceiverLocked && (
              <div className="text-[11px] text-neutral-500">
                Opening receiver is locked because the toss winner chose to {form.tossChoice.replace("_", " ")}.
              </div>
            )}
          </div>
        </div>

        <div className="p-5 pt-0 shrink-0">
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? "Saving..." : "Save Pregame"}
          </button>
        </div>
      </div>
    </div>
  );
}

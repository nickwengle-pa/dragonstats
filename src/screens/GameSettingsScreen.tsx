import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Crosshair, Timer, MapPin, RotateCcw } from "lucide-react";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { getGameConfig, DEFAULT_GAME_CONFIG, type GameConfig } from "@/services/programService";

/* ── Helpers ── */

function NumberField({
  label, value, onChange, min, max, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; suffix?: string;
}) {
  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          min={min} max={max}
          className="input flex-1 font-mono text-sm"
        />
        {suffix && <span className="text-xs text-neutral-500 font-medium">{suffix}</span>}
      </div>
    </div>
  );
}

function ToggleOption({
  label, description, options, value, onChange,
}: {
  label: string; description?: string;
  options: { value: string; label: string }[];
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="label block mb-1">{label}</label>
      {description && <p className="text-xs text-neutral-500 mb-2">{description}</p>}
      <div className="flex gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${
              value === opt.value
                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                : "border-surface-border text-neutral-500 active:bg-surface-hover"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Main Screen ── */

export default function GameSettingsScreen() {
  const navigate = useNavigate();
  const { program, refresh } = useProgramContext();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [config, setConfig] = useState<GameConfig>({ ...DEFAULT_GAME_CONFIG });

  useEffect(() => {
    setConfig(getGameConfig(program));
  }, [program]);

  const set = <K extends keyof GameConfig>(key: K, val: GameConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }));

  const handleSave = async () => {
    if (!program) return;
    setSaving(true);
    await supabase.from("programs").update({ game_config: config as any }).eq("id", program.id);
    await refresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleReset = () => {
    setConfig({ ...DEFAULT_GAME_CONFIG });
  };

  const primaryColor = program?.primary_color ?? "#ef4444";
  const quarterMins = Math.floor(config.quarter_length_secs / 60);

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-2">
        <button onClick={() => navigate("/")} className="btn-ghost p-2 cursor-pointer">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] flex-1">Game Setup</h1>
        <button onClick={handleReset} className="btn-ghost p-2 text-neutral-500" title="Reset to defaults">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 px-5 space-y-6 overflow-y-auto pb-6">
        {/* ── Tackle Crediting ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5" style={{ color: primaryColor }} />
            <span className="font-bold">Tackle Crediting</span>
          </div>
          <ToggleOption
            label="When multiple players make a tackle"
            description="Controls how tackle stats are credited when 2 or more players are involved."
            options={[
              { value: "split", label: "Split (0.5 each)" },
              { value: "full", label: "Full (1.0 each)" },
            ]}
            value={config.tackle_credit}
            onChange={v => set("tackle_credit", v as "split" | "full")}
          />
        </div>

        {/* ── Field & Kickoff ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-5 h-5" style={{ color: primaryColor }} />
            <span className="font-bold">Field & Kickoff</span>
          </div>
          <div className="space-y-3">
            <NumberField
              label="Kickoff From (own yard line)"
              value={config.kickoff_yard_line}
              onChange={v => set("kickoff_yard_line", v)}
              min={20} max={50} suffix="yard line"
            />
            <NumberField
              label="Safety Free Kick From"
              value={config.safety_kick_yard_line}
              onChange={v => set("safety_kick_yard_line", v)}
              min={10} max={40} suffix="yard line"
            />
            <NumberField
              label="Touchback Spot"
              value={config.touchback_yard_line}
              onChange={v => set("touchback_yard_line", v)}
              min={15} max={30} suffix="yard line"
            />
            <NumberField
              label="First Down Distance"
              value={config.first_down_distance}
              onChange={v => set("first_down_distance", v)}
              min={5} max={15} suffix="yards"
            />
          </div>
        </div>

        {/* ── Scoring ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Crosshair className="w-5 h-5" style={{ color: primaryColor }} />
            <span className="font-bold">Scoring Setup</span>
          </div>
          <div className="space-y-3">
            <NumberField
              label="PAT/XP Snap From (yards from goal line)"
              value={config.pat_distance}
              onChange={v => set("pat_distance", v)}
              min={2} max={15} suffix="yards"
            />
            <NumberField
              label="FG Snap Added to LOS"
              value={config.fg_snap_add}
              onChange={v => set("fg_snap_add", v)}
              min={7} max={20} suffix="yards"
            />
          </div>
        </div>

        {/* ── Clock & Overtime ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Timer className="w-5 h-5" style={{ color: primaryColor }} />
            <span className="font-bold">Clock & Overtime</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label block mb-1.5">Quarter Length</label>
              <div className="flex gap-2">
                {[8, 10, 12, 15].map(m => (
                  <button
                    key={m}
                    onClick={() => set("quarter_length_secs", m * 60)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                      quarterMins === m
                        ? "border-blue-500 bg-blue-500/10 text-blue-400"
                        : "border-surface-border text-neutral-500 active:bg-surface-hover"
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <ToggleOption
              label="Overtime Rules"
              options={[
                { value: "nfhs", label: "NFHS" },
                { value: "college", label: "NCAA" },
                { value: "nfl", label: "NFL" },
              ]}
              value={config.overtime_type}
              onChange={v => set("overtime_type", v as GameConfig["overtime_type"])}
            />
          </div>
        </div>

        {/* ── Save ── */}
        <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
          {saved ? "Saved!" : saving ? "Saving..." : "Save Settings"}
        </button>

        <p className="text-xs text-neutral-600 text-center pb-2">
          These settings apply to all new games. Existing games keep their original settings.
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, School, Palette } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { programService } from "@/services/programService";

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [abbrev, setAbbrev] = useState("");
  const [mascot, setMascot] = useState("");
  const [primary, setPrimary] = useState("#dc2626");
  const [secondary, setSecondary] = useState("#f59e0b");
  const [city, setCity] = useState("");
  const [state, setState] = useState("PA");

  const handleSave = async () => {
    if (!user || !name || !abbrev) return;
    setSaving(true);
    await programService.create({
      name, abbreviation: abbrev, mascot: mascot || null,
      primary_color: primary, secondary_color: secondary,
      logo_url: null, city: city || null, state: state || null,
      owner_id: user.id,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => navigate("/"), 1000);
  };

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        <button onClick={() => navigate("/")} className="btn-ghost p-2">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black flex-1">Settings</h1>
      </div>

      <div className="flex-1 px-5 space-y-6">
        {/* Program Setup */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <School className="w-5 h-5 text-dragon-primary" />
            <span className="font-bold">Program Info</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="label block mb-1.5">School Name *</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="Lincoln High School" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Abbreviation *</label>
                <input value={abbrev} onChange={e => setAbbrev(e.target.value.toUpperCase())}
                  placeholder="LHS" maxLength={5} className="input" />
              </div>
              <div>
                <label className="label block mb-1.5">Mascot</label>
                <input value={mascot} onChange={e => setMascot(e.target.value)}
                  placeholder="Dragons" className="input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">City</label>
                <input value={city} onChange={e => setCity(e.target.value)}
                  placeholder="Plum" className="input" />
              </div>
              <div>
                <label className="label block mb-1.5">State</label>
                <input value={state} onChange={e => setState(e.target.value)}
                  placeholder="PA" maxLength={2} className="input" />
              </div>
            </div>
          </div>
        </div>

        {/* Colors */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-dragon-primary" />
            <span className="font-bold">School Colors</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">Primary</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primary} onChange={e => setPrimary(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer" />
                <input value={primary} onChange={e => setPrimary(e.target.value)}
                  className="input flex-1 font-mono text-sm" />
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">Secondary</label>
              <div className="flex items-center gap-2">
                <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer" />
                <input value={secondary} onChange={e => setSecondary(e.target.value)}
                  className="input flex-1 font-mono text-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!name || !abbrev || saving}
          className="btn-primary w-full"
        >
          {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Program"}
        </button>
      </div>

      <div className="h-6" />
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, School, Palette, Calendar } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";

interface Props {
  firstTime?: boolean;
}

export default function SettingsScreen({ firstTime = false }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { program, season, refresh } = useProgramContext();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [abbrev, setAbbrev] = useState("");
  const [mascot, setMascot] = useState("");
  const [primary, setPrimary] = useState("#dc2626");
  const [secondary, setSecondary] = useState("#f59e0b");
  const [city, setCity] = useState("");
  const [st, setSt] = useState("PA");
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [seasonLevel, setSeasonLevel] = useState("varsity");

  useEffect(() => {
    if (program) {
      setName(program.name); setAbbrev(program.abbreviation);
      setMascot(program.mascot ?? ""); setPrimary(program.primary_color);
      setSecondary(program.secondary_color); setCity(program.city ?? "");
      setSt(program.state ?? "PA");
    }
  }, [program]);

  useEffect(() => {
    if (season) { setSeasonYear(season.year); setSeasonLevel(season.level); }
  }, [season]);

  const handleSave = async () => {
    if (!user || !name || !abbrev) return;
    setSaving(true);
    let programId = program?.id;

    if (program) {
      await supabase.from("programs").update({
        name, abbreviation: abbrev, mascot: mascot || null,
        primary_color: primary, secondary_color: secondary,
        city: city || null, state: st || null,
      }).eq("id", program.id);
    } else {
      const { data: p } = await supabase.from("programs").insert({
        name, abbreviation: abbrev, mascot: mascot || null,
        primary_color: primary, secondary_color: secondary,
        logo_url: null, city: city || null, state: st || null, owner_id: user.id,
      }).select().single();
      programId = p?.id;
    }

    if (programId && !season) {
      await supabase.from("seasons").insert({
        program_id: programId, year: seasonYear,
        name: `${seasonYear} ${seasonLevel.charAt(0).toUpperCase() + seasonLevel.slice(1)}`,
        level: seasonLevel, is_active: true,
      });
    }

    await refresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate("/"); }, 800);
  };

  return (
    <div className="screen safe-top safe-bottom">
      <div className="flex items-center gap-3 px-5 pt-5 pb-4">
        {!firstTime && (
          <button onClick={() => navigate("/")} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl font-black flex-1">
          {firstTime ? "Set Up Your Program" : "Settings"}
        </h1>
      </div>

      {firstTime && (
        <div className="px-5 pb-4">
          <p className="text-sm text-neutral-400 leading-relaxed">
            Welcome to Dragon Stats! Let's set up your school so you can start tracking games.
          </p>
        </div>
      )}

      <div className="flex-1 px-5 space-y-6 overflow-y-auto pb-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <School className="w-5 h-5 text-dragon-primary" />
            <span className="font-bold">Program Info</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label block mb-1.5">School Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Lincoln High School" className="input" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Abbreviation *</label>
                <input value={abbrev} onChange={e => setAbbrev(e.target.value.toUpperCase())} placeholder="LHS" maxLength={5} className="input" />
              </div>
              <div>
                <label className="label block mb-1.5">Mascot</label>
                <input value={mascot} onChange={e => setMascot(e.target.value)} placeholder="Dragons" className="input" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">City</label>
                <input value={city} onChange={e => setCity(e.target.value)} placeholder="Plum" className="input" />
              </div>
              <div>
                <label className="label block mb-1.5">State</label>
                <input value={st} onChange={e => setSt(e.target.value.toUpperCase())} placeholder="PA" maxLength={2} className="input" />
              </div>
            </div>
          </div>
        </div>

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
                  className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer bg-transparent" />
                <input value={primary} onChange={e => setPrimary(e.target.value)} className="input flex-1 font-mono text-sm" />
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">Secondary</label>
              <div className="flex items-center gap-2">
                <input type="color" value={secondary} onChange={e => setSecondary(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer bg-transparent" />
                <input value={secondary} onChange={e => setSecondary(e.target.value)} className="input flex-1 font-mono text-sm" />
              </div>
            </div>
          </div>
        </div>

        {!season && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-dragon-primary" />
              <span className="font-bold">First Season</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Year</label>
                <input type="number" value={seasonYear} onChange={e => setSeasonYear(Number(e.target.value))} className="input" />
              </div>
              <div>
                <label className="label block mb-1.5">Level</label>
                <select value={seasonLevel} onChange={e => setSeasonLevel(e.target.value)} className="input appearance-none">
                  <option value="varsity">Varsity</option>
                  <option value="jv">JV</option>
                  <option value="freshman">Freshman</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <button onClick={handleSave} disabled={!name || !abbrev || saving} className="btn-primary w-full">
          {saved ? "✓ Saved!" : saving ? "Saving..." : firstTime ? "Create Program" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

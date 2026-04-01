import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, School, Palette, Calendar, Upload, X, UserCog,
  Plus, Trash2, Edit2, Check, Image,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { coachService, type Coach } from "@/services/seasonService";

interface Props {
  firstTime?: boolean;
}

/* ─────────────────────────────────────────────
   Color Picker — swatch + hex text input
   ───────────────────────────────────────────── */

function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer bg-transparent"
        />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          className="input flex-1 font-mono text-sm"
          maxLength={7}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Logo Upload — preview + file picker
   ───────────────────────────────────────────── */

function LogoUpload({
  label, currentUrl, onUploaded, programId,
}: {
  label: string;
  currentUrl: string | null;
  onUploaded: (url: string | null) => void;
  programId: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!programId) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2 MB");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const path = `${programId}/${label.toLowerCase().replace(/\s/g, "_")}_${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true });

    if (error) {
      console.error("Upload error:", error);
      setUploading(false);
      return;
    }

    const { data: pub } = supabase.storage.from("logos").getPublicUrl(path);
    onUploaded(pub.publicUrl);
    setUploading(false);
  };

  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          <div className="relative">
            <img src={currentUrl} alt={label} className="w-14 h-14 rounded-lg object-contain bg-surface-card border border-surface-border" />
            <button
              onClick={() => onUploaded(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="w-14 h-14 rounded-lg bg-surface-card border border-dashed border-surface-border flex items-center justify-center text-neutral-500">
            <Image className="w-6 h-6" />
          </div>
        )}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="btn-ghost text-sm px-3 py-1.5"
        >
          {uploading ? (
            "Uploading..."
          ) : (
            <span className="flex items-center gap-1.5"><Upload className="w-4 h-4" /> Choose File</span>
          )}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Coach Row — inline display / edit
   ───────────────────────────────────────────── */

function CoachRow({
  coach, onUpdate, onDelete,
}: {
  coach: Coach;
  onUpdate: (c: Coach) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(coach.name);
  const [role, setRole] = useState(coach.role);
  const [email, setEmail] = useState(coach.email ?? "");
  const [phone, setPhone] = useState(coach.phone ?? "");

  const save = async () => {
    const updated = await coachService.update(coach.id, {
      name, role, email: email || null, phone: phone || null,
    });
    if (updated) { onUpdate(updated); setEditing(false); }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-surface-border last:border-0">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{coach.name}</div>
          <div className="text-xs text-neutral-400 capitalize">{coach.role}{coach.email ? ` · ${coach.email}` : ""}</div>
        </div>
        <button onClick={() => setEditing(true)} className="btn-ghost p-1.5"><Edit2 className="w-4 h-4" /></button>
        <button onClick={() => onDelete(coach.id)} className="btn-ghost p-1.5 text-red-500"><Trash2 className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2 border-b border-surface-border last:border-0">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="input text-sm" />
        <select value={role} onChange={e => setRole(e.target.value as Coach["role"])} className="input text-sm appearance-none">
          <option value="head">Head Coach</option>
          <option value="coordinator">Coordinator</option>
          <option value="assistant">Assistant</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="input text-sm" />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" className="input text-sm" />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={!name} className="btn-primary text-xs px-3 py-1">
          <Check className="w-3.5 h-3.5 mr-1 inline" /> Save
        </button>
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-3 py-1">Cancel</button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Settings Screen
   ───────────────────────────────────────────── */

export default function SettingsScreen({ firstTime = false }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { program, season, refresh } = useProgramContext();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Program info
  const [name, setName] = useState("");
  const [abbrev, setAbbrev] = useState("");
  const [mascot, setMascot] = useState("");
  const [city, setCity] = useState("");
  const [st, setSt] = useState("PA");

  // Colors
  const [primary, setPrimary] = useState("#dc2626");
  const [secondary, setSecondary] = useState("#f59e0b");
  const [accent, setAccent] = useState("#1e40af");

  // Logos
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [wordmarkUrl, setWordmarkUrl] = useState<string | null>(null);

  // Season
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear());
  const [seasonLevel, setSeasonLevel] = useState("varsity");

  // Coaches
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [addingCoach, setAddingCoach] = useState(false);
  const [newCoachName, setNewCoachName] = useState("");
  const [newCoachRole, setNewCoachRole] = useState<Coach["role"]>("assistant");

  // Load program data
  useEffect(() => {
    if (program) {
      setName(program.name);
      setAbbrev(program.abbreviation);
      setMascot(program.mascot ?? "");
      setPrimary(program.primary_color);
      setSecondary(program.secondary_color);
      setAccent(program.accent_color ?? "#1e40af");
      setLogoUrl(program.logo_url ?? null);
      setWordmarkUrl(program.wordmark_url ?? null);
      setCity(program.city ?? "");
      setSt(program.state ?? "PA");
    }
  }, [program]);

  useEffect(() => {
    if (season) {
      setSeasonYear(season.year);
      setSeasonLevel(season.level);
    }
  }, [season]);

  // Load coaches for current season
  useEffect(() => {
    if (season) {
      coachService.getBySeason(season.id).then(setCoaches);
    }
  }, [season]);

  /* ── Save program ── */
  const handleSave = async () => {
    if (!user || !name || !abbrev) return;
    setSaving(true);
    let programId = program?.id;

    const programData = {
      name,
      abbreviation: abbrev,
      mascot: mascot || null,
      primary_color: primary,
      secondary_color: secondary,
      accent_color: accent || null,
      logo_url: logoUrl,
      wordmark_url: wordmarkUrl,
      city: city || null,
      state: st || null,
    };

    if (program) {
      await supabase.from("programs").update(programData).eq("id", program.id);
    } else {
      const { data: p } = await supabase.from("programs").insert({
        ...programData,
        owner_id: user.id,
      }).select().single();
      programId = p?.id;
    }

    if (programId && !season) {
      await supabase.from("seasons").insert({
        program_id: programId,
        year: seasonYear,
        name: `${seasonYear} ${seasonLevel.charAt(0).toUpperCase() + seasonLevel.slice(1)}`,
        level: seasonLevel,
        is_active: true,
      });
    }

    await refresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate("/"); }, 800);
  };

  /* ── Add coach ── */
  const handleAddCoach = async () => {
    if (!season || !newCoachName) return;
    const c = await coachService.create({
      season_id: season.id,
      name: newCoachName,
      role: newCoachRole,
      email: null,
      phone: null,
    });
    if (c) setCoaches(prev => [...prev, c]);
    setNewCoachName("");
    setAddingCoach(false);
  };

  /* ── Delete coach ── */
  const handleDeleteCoach = async (id: string) => {
    if (await coachService.remove(id)) {
      setCoaches(prev => prev.filter(c => c.id !== id));
    }
  };

  /* ── Color preview ── */
  const previewColors = (
    <div className="flex gap-1 mt-3">
      <div className="h-8 flex-1 rounded-l-lg" style={{ background: primary }} />
      <div className="h-8 flex-1" style={{ background: secondary }} />
      <div className="h-8 flex-1 rounded-r-lg" style={{ background: accent }} />
    </div>
  );

  return (
    <div className="screen safe-top safe-bottom">
      {/* Header */}
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
        {/* ── Program Info ── */}
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

        {/* ── Colors ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-dragon-primary" />
            <span className="font-bold">School Colors</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ColorField label="Primary" value={primary} onChange={setPrimary} />
            <ColorField label="Secondary" value={secondary} onChange={setSecondary} />
            <ColorField label="Accent" value={accent} onChange={setAccent} />
          </div>
          {previewColors}
        </div>

        {/* ── Logos ── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Image className="w-5 h-5 text-dragon-primary" />
            <span className="font-bold">Logos</span>
          </div>
          <div className="space-y-4">
            <LogoUpload
              label="Logo"
              currentUrl={logoUrl}
              onUploaded={setLogoUrl}
              programId={program?.id ?? null}
            />
            <LogoUpload
              label="Wordmark"
              currentUrl={wordmarkUrl}
              onUploaded={setWordmarkUrl}
              programId={program?.id ?? null}
            />
          </div>
        </div>

        {/* ── Season (first time only) ── */}
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

        {/* ── Coaches ── */}
        {season && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <UserCog className="w-5 h-5 text-dragon-primary" />
              <span className="font-bold">Coaching Staff</span>
              <span className="text-xs text-neutral-500 ml-auto">{seasonYear} Season</span>
            </div>

            {coaches.length === 0 && !addingCoach && (
              <p className="text-sm text-neutral-500 mb-3">No coaches added yet.</p>
            )}

            {coaches.map(c => (
              <CoachRow
                key={c.id}
                coach={c}
                onUpdate={(updated) => setCoaches(prev => prev.map(x => x.id === updated.id ? updated : x))}
                onDelete={handleDeleteCoach}
              />
            ))}

            {addingCoach ? (
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newCoachName}
                    onChange={e => setNewCoachName(e.target.value)}
                    placeholder="Coach name"
                    className="input text-sm"
                    autoFocus
                  />
                  <select
                    value={newCoachRole}
                    onChange={e => setNewCoachRole(e.target.value as Coach["role"])}
                    className="input text-sm appearance-none"
                  >
                    <option value="head">Head Coach</option>
                    <option value="coordinator">Coordinator</option>
                    <option value="assistant">Assistant</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleAddCoach} disabled={!newCoachName} className="btn-primary text-xs px-3 py-1">
                    <Check className="w-3.5 h-3.5 mr-1 inline" /> Add
                  </button>
                  <button onClick={() => { setAddingCoach(false); setNewCoachName(""); }} className="btn-ghost text-xs px-3 py-1">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingCoach(true)}
                className="btn-ghost text-sm flex items-center gap-1.5 mt-2"
              >
                <Plus className="w-4 h-4" /> Add Coach
              </button>
            )}
          </div>
        )}

        {/* ── Save Button ── */}
        <button onClick={handleSave} disabled={!name || !abbrev || saving} className="btn-primary w-full">
          {saved ? "Saved!" : saving ? "Saving..." : firstTime ? "Create Program" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

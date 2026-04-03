import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Check,
  Edit2,
  Image,
  Palette,
  Plus,
  School,
  Trash2,
  Upload,
  UserCog,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";
import { supabase } from "@/lib/supabase";
import { coachService, seasonService, type Coach, type Season } from "@/services/seasonService";

interface Props {
  firstTime?: boolean;
}

const LEVEL_OPTIONS = [
  { value: "varsity", label: "Varsity" },
  { value: "jv", label: "JV" },
  { value: "freshman", label: "Freshman" },
];

function formatLevel(level: string) {
  return LEVEL_OPTIONS.find((entry) => entry.value === level)?.label ?? level;
}

function buildSeasonName(year: number, level: string) {
  return `${year} ${formatLevel(level)}`;
}

function formatSeasonName(season: Pick<Season, "year" | "level" | "name">) {
  return season.name?.trim() || buildSeasonName(season.year, season.level);
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-10 h-10 rounded-lg border border-surface-border cursor-pointer bg-transparent"
        />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="input flex-1 font-mono text-sm"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function LogoUpload({
  label,
  currentUrl,
  onUploaded,
  programId,
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

    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) {
      console.error("Upload error:", error);
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    onUploaded(data.publicUrl);
    setUploading(false);
  };

  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          <div className="relative">
            <img
              src={currentUrl}
              alt={label}
              className="w-14 h-14 rounded-lg object-contain bg-surface-card border border-surface-border"
            />
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
          {uploading ? "Uploading..." : (
            <span className="flex items-center gap-1.5">
              <Upload className="w-4 h-4" />
              Choose File
            </span>
          )}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleFile(file);
            event.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function CoachRow({
  coach,
  onUpdate,
  onDelete,
}: {
  coach: Coach;
  onUpdate: (coach: Coach) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(coach.name);
  const [role, setRole] = useState(coach.role);
  const [email, setEmail] = useState(coach.email ?? "");
  const [phone, setPhone] = useState(coach.phone ?? "");

  const save = async () => {
    const updated = await coachService.update(coach.id, {
      name,
      role,
      email: email || null,
      phone: phone || null,
    });

    if (updated) {
      onUpdate(updated);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-3 py-2 border-b border-surface-border last:border-0">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{coach.name}</div>
          <div className="text-xs text-neutral-400 capitalize">
            {coach.role}
            {coach.email ? ` · ${coach.email}` : ""}
          </div>
        </div>
        <button onClick={() => setEditing(true)} className="btn-ghost p-1.5">
          <Edit2 className="w-4 h-4" />
        </button>
        <button onClick={() => onDelete(coach.id)} className="btn-ghost p-1.5 text-red-500">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2 border-b border-surface-border last:border-0">
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" className="input text-sm" />
        <select value={role} onChange={(event) => setRole(event.target.value as Coach["role"])} className="input text-sm appearance-none">
          <option value="head">Head Coach</option>
          <option value="coordinator">Coordinator</option>
          <option value="assistant">Assistant</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" className="input text-sm" />
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone" className="input text-sm" />
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={!name} className="btn-primary text-xs px-3 py-1">
          <Check className="w-3.5 h-3.5 mr-1 inline" />
          Save
        </button>
        <button onClick={() => setEditing(false)} className="btn-ghost text-xs px-3 py-1">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function SettingsScreen({ firstTime = false }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { program, season, seasons, refresh, setSeason } = useProgramContext();
  const currentYear = new Date().getFullYear();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState("");
  const [abbrev, setAbbrev] = useState("");
  const [mascot, setMascot] = useState("");
  const [city, setCity] = useState("");
  const [st, setSt] = useState("PA");

  const [primary, setPrimary] = useState("#dc2626");
  const [secondary, setSecondary] = useState("#f59e0b");
  const [accent, setAccent] = useState("#1e40af");

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [wordmarkUrl, setWordmarkUrl] = useState<string | null>(null);

  const [initialSeasonYear, setInitialSeasonYear] = useState(currentYear);
  const [initialSeasonLevel, setInitialSeasonLevel] = useState("varsity");
  const [showAddSeason, setShowAddSeason] = useState(false);
  const [newSeasonYear, setNewSeasonYear] = useState(currentYear);
  const [newSeasonLevel, setNewSeasonLevel] = useState("varsity");
  const [newSeasonActive, setNewSeasonActive] = useState(true);
  const [creatingSeason, setCreatingSeason] = useState(false);
  const [activatingSeasonId, setActivatingSeasonId] = useState<string | null>(null);
  const [seasonNotice, setSeasonNotice] = useState("");
  const [seasonError, setSeasonError] = useState("");

  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [addingCoach, setAddingCoach] = useState(false);
  const [newCoachName, setNewCoachName] = useState("");
  const [newCoachRole, setNewCoachRole] = useState<Coach["role"]>("assistant");

  useEffect(() => {
    if (!program) return;

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
  }, [program]);

  useEffect(() => {
    if (!season) return;

    setInitialSeasonYear(season.year);
    setInitialSeasonLevel(season.level);
  }, [season]);

  useEffect(() => {
    if (!seasons.length) {
      setNewSeasonYear(currentYear);
      setNewSeasonLevel("varsity");
      return;
    }

    const maxYear = Math.max(...seasons.map((entry) => entry.year));
    setNewSeasonYear(maxYear + 1);
    setNewSeasonLevel(season?.level ?? seasons[0].level);
  }, [currentYear, season?.level, seasons]);

  useEffect(() => {
    if (!season) {
      setCoaches([]);
      return;
    }

    coachService.getBySeason(season.id).then(setCoaches);
  }, [season]);

  const handleSave = async () => {
    if (!user || !name || !abbrev) return;

    setSaving(true);
    setSeasonError("");

    let programId = program?.id ?? null;

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
      const { error } = await supabase.from("programs").update(programData).eq("id", program.id);
      if (error) {
        console.error("Error updating program:", error);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("programs")
        .insert({
          ...programData,
          owner_id: user.id,
        })
        .select()
        .single();

      if (error || !data?.id) {
        console.error("Error creating program:", error);
        setSaving(false);
        return;
      }

      programId = data.id;
    }

    if (programId && seasons.length === 0) {
      const createdSeason = await seasonService.create({
        program_id: programId,
        year: initialSeasonYear,
        name: buildSeasonName(initialSeasonYear, initialSeasonLevel),
        level: initialSeasonLevel,
        is_active: false,
      });

      if (!createdSeason) {
        setSeasonError("Program saved, but the first season could not be created.");
        await refresh();
        setSaving(false);
        return;
      }

      const activated = await seasonService.activate(programId, createdSeason.id);
      if (!activated) {
        setSeasonError("Program saved, but the first season could not be activated.");
        await refresh();
        setSaving(false);
        return;
      }
    }

    await refresh();
    setSaving(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      navigate("/");
    }, 800);
  };

  const handleCreateSeason = async () => {
    if (!program) return;

    setCreatingSeason(true);
    setSeasonNotice("");
    setSeasonError("");

    const createdSeason = await seasonService.create({
      program_id: program.id,
      year: newSeasonYear,
      name: buildSeasonName(newSeasonYear, newSeasonLevel),
      level: newSeasonLevel,
      is_active: false,
    });

    if (!createdSeason) {
      setSeasonError("Could not create season. That year and level may already exist.");
      setCreatingSeason(false);
      return;
    }

    let activated = true;
    if (newSeasonActive) {
      activated = await setSeason(createdSeason);
    }

    await refresh();

    if (!activated) {
      setSeasonError("Season created, but the active season could not be updated.");
      setCreatingSeason(false);
      return;
    }

    setSeasonNotice(newSeasonActive
      ? `${formatSeasonName(createdSeason)} is now active.`
      : `${formatSeasonName(createdSeason)} added.`);
    setShowAddSeason(false);
    setNewSeasonActive(true);
    setCreatingSeason(false);
  };

  const handleActivateSeason = async (targetSeason: Season) => {
    setActivatingSeasonId(targetSeason.id);
    setSeasonNotice("");
    setSeasonError("");

    const updated = await setSeason(targetSeason);
    await refresh();

    if (updated) {
      setSeasonNotice(`${formatSeasonName(targetSeason)} is now active.`);
    } else {
      setSeasonError(`Could not activate ${formatSeasonName(targetSeason)}.`);
    }

    setActivatingSeasonId(null);
  };

  const handleAddCoach = async () => {
    if (!season || !newCoachName) return;

    const createdCoach = await coachService.create({
      season_id: season.id,
      name: newCoachName,
      role: newCoachRole,
      email: null,
      phone: null,
    });

    if (createdCoach) {
      setCoaches((prev) => [...prev, createdCoach]);
    }

    setNewCoachName("");
    setAddingCoach(false);
  };

  const handleDeleteCoach = async (coachId: string) => {
    if (await coachService.remove(coachId)) {
      setCoaches((prev) => prev.filter((entry) => entry.id !== coachId));
    }
  };

  const previewColors = (
    <div className="flex gap-1 mt-3">
      <div className="h-8 flex-1 rounded-l-lg" style={{ background: primary }} />
      <div className="h-8 flex-1" style={{ background: secondary }} />
      <div className="h-8 flex-1 rounded-r-lg" style={{ background: accent }} />
    </div>
  );

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
            Welcome to Dragon Stats. Set up your school and first season so the app has an active year to work from.
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
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Lincoln High School" className="input" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Abbreviation *</label>
                <input
                  value={abbrev}
                  onChange={(event) => setAbbrev(event.target.value.toUpperCase())}
                  placeholder="LHS"
                  maxLength={5}
                  className="input"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Mascot</label>
                <input value={mascot} onChange={(event) => setMascot(event.target.value)} placeholder="Dragons" className="input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">City</label>
                <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Plum" className="input" />
              </div>
              <div>
                <label className="label block mb-1.5">State</label>
                <input value={st} onChange={(event) => setSt(event.target.value.toUpperCase())} placeholder="PA" maxLength={2} className="input" />
              </div>
            </div>
          </div>
        </div>

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

        {seasons.length === 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-dragon-primary" />
              <span className="font-bold">First Season</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label block mb-1.5">Year</label>
                <input
                  type="number"
                  value={initialSeasonYear}
                  onChange={(event) => setInitialSeasonYear(Number(event.target.value))}
                  className="input"
                />
              </div>
              <div>
                <label className="label block mb-1.5">Level</label>
                <select
                  value={initialSeasonLevel}
                  onChange={(event) => setInitialSeasonLevel(event.target.value)}
                  className="input appearance-none"
                >
                  {LEVEL_OPTIONS.map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {program && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-dragon-primary" />
              <span className="font-bold">Seasons</span>
              {season && (
                <span className="text-xs text-neutral-500 ml-auto">{formatSeasonName(season)}</span>
              )}
            </div>

            <div className="space-y-3">
              {seasons.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  Save the program first to create its first active season.
                </p>
              ) : (
                seasons.map((entry) => (
                  <div
                    key={entry.id}
                    className="card p-3 flex items-center gap-3 border"
                    style={{
                      borderColor: entry.is_active ? `${program.primary_color}55` : "var(--surface-border)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{formatSeasonName(entry)}</div>
                      <div className="text-xs text-neutral-500">{formatLevel(entry.level)} season</div>
                    </div>

                    {entry.is_active ? (
                      <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300">
                        Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleActivateSeason(entry)}
                        disabled={activatingSeasonId !== null}
                        className="btn-ghost text-xs px-3 py-1.5"
                      >
                        {activatingSeasonId === entry.id ? "Switching..." : "Set Active"}
                      </button>
                    )}
                  </div>
                ))
              )}

              {seasonNotice && <p className="text-sm text-emerald-400">{seasonNotice}</p>}
              {seasonError && <p className="text-sm text-red-400">{seasonError}</p>}

              {showAddSeason ? (
                <div className="card p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label block mb-1.5">Year</label>
                      <input
                        type="number"
                        value={newSeasonYear}
                        onChange={(event) => setNewSeasonYear(Number(event.target.value))}
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label block mb-1.5">Level</label>
                      <select
                        value={newSeasonLevel}
                        onChange={(event) => setNewSeasonLevel(event.target.value)}
                        className="input appearance-none"
                      >
                        {LEVEL_OPTIONS.map((entry) => (
                          <option key={entry.value} value={entry.value}>{entry.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={newSeasonActive}
                      onChange={(event) => setNewSeasonActive(event.target.checked)}
                    />
                    Make this the active season
                  </label>

                  <div className="flex gap-2">
                    <button onClick={handleCreateSeason} disabled={creatingSeason} className="btn-primary text-sm px-3 py-1.5">
                      {creatingSeason ? "Creating..." : "Create Season"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddSeason(false);
                        setSeasonNotice("");
                        setSeasonError("");
                        setNewSeasonActive(true);
                      }}
                      className="btn-ghost text-sm px-3 py-1.5"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : seasons.length > 0 && (
                <button
                  onClick={() => {
                    setShowAddSeason(true);
                    setSeasonNotice("");
                    setSeasonError("");
                  }}
                  className="btn-ghost text-sm flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Add Season
                </button>
              )}
            </div>
          </div>
        )}

        {season && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <UserCog className="w-5 h-5 text-dragon-primary" />
              <span className="font-bold">Coaching Staff</span>
              <span className="text-xs text-neutral-500 ml-auto">{formatSeasonName(season)}</span>
            </div>

            {coaches.length === 0 && !addingCoach && (
              <p className="text-sm text-neutral-500 mb-3">No coaches added yet.</p>
            )}

            {coaches.map((coach) => (
              <CoachRow
                key={coach.id}
                coach={coach}
                onUpdate={(updated) => setCoaches((prev) => prev.map((entry) => entry.id === updated.id ? updated : entry))}
                onDelete={handleDeleteCoach}
              />
            ))}

            {addingCoach ? (
              <div className="space-y-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={newCoachName}
                    onChange={(event) => setNewCoachName(event.target.value)}
                    placeholder="Coach name"
                    className="input text-sm"
                    autoFocus
                  />
                  <select
                    value={newCoachRole}
                    onChange={(event) => setNewCoachRole(event.target.value as Coach["role"])}
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
                    <Check className="w-3.5 h-3.5 mr-1 inline" />
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setAddingCoach(false);
                      setNewCoachName("");
                    }}
                    className="btn-ghost text-xs px-3 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingCoach(true)} className="btn-ghost text-sm flex items-center gap-1.5 mt-2">
                <Plus className="w-4 h-4" />
                Add Coach
              </button>
            )}
          </div>
        )}

        <button onClick={handleSave} disabled={!name || !abbrev || saving} className="btn-primary w-full">
          {saved ? "Saved!" : saving ? "Saving..." : firstTime ? "Create Program" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

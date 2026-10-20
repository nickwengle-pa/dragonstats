import { useCallback, useEffect, useState } from "react";
import { Ban, Check, ChevronDown, Copy, Plus, ShieldCheck, UserMinus, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePermissions } from "@/hooks/useProgramContext";
import { ROLE_BLURB, ROLE_LABEL, normalizeRole, type ProgramRole } from "@/services/access";
import RoleChart from "./RoleChart";
import TeamAccess from "./TeamAccess";

/**
 * Who is in the program, and the codes that let people in.
 *
 * Admins and head coaches see everyone. Each can change or remove the people
 * whose role they could hand out themselves (an admin: anyone; a head coach:
 * assistants and staff), and nobody can change their own row. The database
 * enforces all of that (set_member_role, remove_member, create_invite_code);
 * this screen only avoids offering what it would refuse.
 *
 * Codes default to one person and seven days, and carry a role and a name, so
 * a code that gets forwarded lets in at most the one person it was meant for,
 * at the level it was meant for.
 */

interface Member {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  joined_at: string;
  last_sign_in_at: string | null;
  /** Newest session renewal; missing until the database has the column. */
  last_used_at?: string | null;
  is_me: boolean;
}

interface InviteCode {
  code: string;
  role: string;
  label: string | null;
  expires_at: string | null;
  max_uses: number | null;
  uses: number;
  revoked: boolean;
}

interface Props {
  programId: string;
}

function isLive(code: InviteCode): boolean {
  if (code.revoked) return false;
  if (code.expires_at && new Date(code.expires_at) <= new Date()) return false;
  return code.max_uses == null || code.uses < code.max_uses;
}

function expiryLabel(code: InviteCode): string {
  if (!code.expires_at) return "No expiry";
  const days = Math.ceil((new Date(code.expires_at).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? "Expires today" : `${days} days left`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * "today", "yesterday" or a date. The server only stamps a session when the
 * app renews its token, about hourly, so a clock time would claim more than
 * it knows.
 */
function usedLabel(iso: string): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const used = new Date(iso);
  const daysAgo = Math.round((day(new Date()) - day(used)) / 86_400_000);
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  return used.toLocaleDateString(undefined, {
    month: "short", day: "numeric",
    year: used.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

/** A missing function means the roles migration is not on this database yet. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message ?? "");
}

/** The server's words, except a dropped connection, which reads as a crash. */
function friendlyError(message: string): string {
  return /failed to fetch|network|load failed/i.test(message)
    ? "Can't reach the server. People and invite codes need a connection."
    : message;
}

export default function People({ programId }: Props) {
  const perms = usePermissions();
  const assignable = perms.assignableRoles;

  const [members, setMembers] = useState<Member[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);

  const [inviting, setInviting] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<ProgramRole>("assistant");
  const [newCode, setNewCode] = useState<InviteCode | null>(null);

  const load = useCallback(async () => {
    const [membersRes, codesRes] = await Promise.all([
      supabase.rpc("list_program_members", { target_program_id: programId }),
      supabase
        .from("program_invite_codes")
        .select("code, role, label, expires_at, max_uses, uses, revoked")
        .eq("program_id", programId)
        .order("created_at", { ascending: false }),
    ]);
    setLoaded(true);
    if (isMissingFunction(membersRes.error)) {
      setNeedsMigration(true);
      return;
    }
    if (membersRes.error) {
      setError(friendlyError(membersRes.error.message));
      return;
    }
    setError("");
    setMembers((membersRes.data as Member[] | null) ?? []);
    setCodes((codesRes.data as InviteCode[] | null) ?? []);
  }, [programId]);

  useEffect(() => {
    if (perms.managePeople) void load();
  }, [load, perms.managePeople]);

  // A head coach's default is assistant; keep the picker on a role they can give.
  useEffect(() => {
    if (assignable.length && !assignable.includes(inviteRole)) {
      setInviteRole(assignable.includes("assistant") ? "assistant" : assignable[0]);
    }
  }, [assignable, inviteRole]);

  if (!perms.managePeople) return null;

  // The database has not had the roles update yet: keep the old invite card
  // working rather than show a screen whose every button would fail.
  if (needsMigration) return <TeamAccess programId={programId} />;

  const run = async (work: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError("");
    const { error: err } = await work();
    setBusy(false);
    if (err) {
      setError(friendlyError(err.message));
      return false;
    }
    await load();
    return true;
  };

  const changeRole = (member: Member, role: ProgramRole) =>
    run(async () => await supabase.rpc("set_member_role", {
      target_program_id: programId,
      target_user_id: member.user_id,
      new_role: role,
    }));

  const remove = async (member: Member) => {
    const ok = await run(async () => await supabase.rpc("remove_member", {
      target_program_id: programId,
      target_user_id: member.user_id,
    }));
    if (ok) setConfirmRemove(null);
  };

  const createInvite = async () => {
    setBusy(true);
    setError("");
    const label = inviteName.trim();
    const { data, error: rpcErr } = await supabase.rpc("create_invite_code", {
      target_program_id: programId,
      target_role: inviteRole,
      valid_days: 7,
      code_max_uses: 1,
      code_label: label || null,
    });
    setBusy(false);
    if (rpcErr) {
      setError(friendlyError(rpcErr.message));
      return;
    }
    setNewCode({
      code: String(data), role: inviteRole, label: label || null,
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      max_uses: 1, uses: 0, revoked: false,
    });
    setInviteName("");
    setInviting(false);
    await load();
  };

  const revoke = (code: string) =>
    run(async () => await supabase
      .from("program_invite_codes")
      .update({ revoked: true })
      .eq("code", code));

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    } catch {
      // Clipboard is blocked in plenty of contexts; the code is on screen to
      // read aloud regardless.
    }
  };

  const liveCodes = codes.filter(isLive);
  const canManage = (m: Member) => {
    const r = normalizeRole(m.role);
    return !m.is_me && r != null && assignable.includes(r);
  };

  return (
    <div className="card p-4 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-dragon-primary" />
          <h2 className="text-sm font-display font-extrabold uppercase tracking-[0.14em]">People</h2>
          <span className="text-[11px] text-surface-muted/70 font-body ml-auto">
            {loaded ? `${members.length} in program` : "Loading…"}
          </span>
        </div>
        <p className="text-[11px] text-surface-muted/70 mt-1 font-body">
          Everyone who can sign in to this program, and what they can do.
          {perms.role === "head_coach" && " You can manage assistants and staff."}
        </p>
      </div>

      {/* Admin only. Everyone else sees their own role under Your access. */}
      {perms.role === "admin" && (
        <div>
          <button
            onClick={() => setShowChart((open) => !open)}
            aria-expanded={showChart}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            What each role can do
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showChart ? "rotate-180" : ""}`} />
          </button>
          {showChart && (
            <div className="mt-2 rounded-[4px] border border-surface-border bg-black/20 px-2.5 py-2">
              <RoleChart />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400 font-body">{error}</p>}

      <div className="space-y-1.5">
        {members.map((m) => {
          const role = normalizeRole(m.role) ?? "staff";
          const manageable = canManage(m);
          const name = m.display_name || m.email || "Unknown";
          return (
            <div key={m.user_id} className="rounded-[4px] border border-surface-border bg-black/20 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {name}
                    {m.is_me && <span className="text-[10px] text-surface-muted/70 ml-1.5">(you)</span>}
                  </div>
                  {/* Wraps rather than truncates, so a phone still shows the last-used end. */}
                  <div className="text-[10px] text-surface-muted/70 font-body break-words">
                    {m.display_name && m.email ? `${m.email} · ` : ""}
                    joined {shortDate(m.joined_at)} · last in {shortDate(m.last_sign_in_at)}
                    {m.last_used_at && ` · last used ${usedLabel(m.last_used_at)}`}
                  </div>
                </div>
                {manageable ? (
                  <select
                    value={role}
                    disabled={busy}
                    onChange={(e) => void changeRole(m, e.target.value as ProgramRole)}
                    className="input text-xs py-1 px-2 w-auto appearance-none"
                    aria-label={`Role for ${name}`}
                  >
                    {assignable.map((r) => (
                      <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-white/5 text-surface-muted">
                    {ROLE_LABEL[role]}
                  </span>
                )}
                {manageable && (
                  <button
                    onClick={() => setConfirmRemove(confirmRemove === m.user_id ? null : m.user_id)}
                    disabled={busy}
                    className="btn-ghost p-1 text-red-400 cursor-pointer"
                    title={`Remove ${name}`}
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </div>
              {confirmRemove === m.user_id && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-surface-border">
                  <span className="text-xs text-red-300 font-body flex-1">
                    Remove {name}? They lose access right away. An old code won't let them back in.
                  </span>
                  <button onClick={() => void remove(m)} disabled={busy} className="btn-ghost text-xs px-2 py-1 text-red-400">
                    Remove
                  </button>
                  <button onClick={() => setConfirmRemove(null)} className="btn-ghost text-xs px-2 py-1">
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pt-1 space-y-2">
        <div className="text-[11px] font-display font-bold text-surface-muted uppercase tracking-widest">
          Invite codes
        </div>

        {newCode && (
          <div className="rounded-[4px] border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
            <div className="text-[11px] text-surface-muted font-body">
              Give this code to {newCode.label || "them"}. They enter it when they sign up and join as {ROLE_LABEL[normalizeRole(newCode.role) ?? "staff"]}. It works once, for 7 days.
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="font-display font-black tracking-[0.2em] text-lg text-amber-400">{newCode.code}</span>
              <button onClick={() => void copy(newCode.code)} className="btn-ghost p-1 ml-auto text-surface-muted/60 cursor-pointer" title="Copy code">
                {copied === newCode.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        )}

        {liveCodes.filter((c) => c.code !== newCode?.code).map((c) => (
          <div
            key={c.code}
            className="flex items-center gap-2 rounded-[4px] border border-surface-border bg-black/20 px-2.5 py-2"
          >
            <span className="font-display font-black tracking-[0.2em] text-sm text-amber-400">{c.code}</span>
            <span className="text-[10px] text-surface-muted/70 font-body min-w-0 truncate">
              {ROLE_LABEL[normalizeRole(c.role) ?? "staff"]}
              {c.label ? ` · ${c.label}` : ""}
              {` · ${expiryLabel(c)}`}
              {c.max_uses == null ? " · any number of people" : c.max_uses > 1 ? ` · ${c.max_uses - c.uses} uses left` : ""}
            </span>
            <button onClick={() => void copy(c.code)} className="btn-ghost p-1 ml-auto text-surface-muted/60 cursor-pointer" title="Copy code">
              {copied === c.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => void revoke(c.code)} disabled={busy} className="btn-ghost p-1 text-surface-muted/60 cursor-pointer" title="Revoke this code">
              <Ban className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {inviting ? (
          <div className="space-y-2 rounded-[4px] border border-surface-border bg-black/20 p-3">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Who is it for?"
                className="input text-sm"
                autoFocus
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as ProgramRole)}
                className="input text-sm appearance-none"
                aria-label="Role for the new code"
              >
                {assignable.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <p className="text-[11px] text-surface-muted/70 font-body">{ROLE_BLURB[inviteRole]}</p>
            <div className="flex gap-2">
              <button onClick={() => void createInvite()} disabled={busy} className="btn-primary text-xs px-3 py-1">
                {busy ? "Working…" : "Make Code"}
              </button>
              <button onClick={() => setInviting(false)} className="btn-ghost text-xs px-3 py-1">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setInviting(true); setNewCode(null); }}
            disabled={busy}
            className="btn-ghost text-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Invite Someone
          </button>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Plus, Copy, Check, Ban } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Who can sign in to this program.
 *
 * Access is membership, and membership is granted by an invite code: the owner
 * generates one here, reads it to a coach, and the coach types it while signing
 * up. That is deliberately the only self-service route in — an account with no
 * code is a member of nothing and sees nothing.
 *
 * Owner-only, and enforced in the database rather than here: the policy on
 * program_invite_codes is owner-scoped for SELECT too, so a member who reached
 * this component anyway would simply see an empty list, and create/revoke would
 * be refused. Hiding it is courtesy, not the control.
 */

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

function expiryLabel(code: InviteCode): string {
  if (code.revoked) return "Revoked";
  if (code.expires_at && new Date(code.expires_at) <= new Date()) return "Expired";
  if (code.max_uses != null && code.uses >= code.max_uses) return "Used up";
  if (!code.expires_at) return "No expiry";
  const days = Math.ceil((new Date(code.expires_at).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? "Expires today" : `${days} days left`;
}

export default function TeamAccess({ programId }: Props) {
  const [isOwner, setIsOwner] = useState(false);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: owner } = await supabase.rpc("is_program_owner", {
      target_program_id: programId,
    });
    setIsOwner(owner === true);
    if (owner !== true) return;

    const { data, error: readErr } = await supabase
      .from("program_invite_codes")
      .select("code, role, label, expires_at, max_uses, uses, revoked")
      .eq("program_id", programId)
      .order("created_at", { ascending: false });
    if (readErr) {
      setError(readErr.message);
      return;
    }
    setCodes((data as InviteCode[] | null) ?? []);
  }, [programId]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setBusy(true);
    setError("");
    const { error: rpcErr } = await supabase.rpc("create_invite_code", {
      target_program_id: programId,
      target_role: "member",
      valid_days: 30,
      code_max_uses: null,
      code_label: null,
    });
    setBusy(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    await load();
  };

  const revoke = async (code: string) => {
    setBusy(true);
    setError("");
    const { error: updErr } = await supabase
      .from("program_invite_codes")
      .update({ revoked: true })
      .eq("code", code);
    setBusy(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    await load();
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    } catch {
      // Clipboard is blocked in plenty of contexts; the code is on screen to
      // read aloud regardless, so this is not worth an error message.
    }
  };

  if (!isOwner) return null;

  const live = codes.filter((c) => expiryLabel(c) !== "Revoked");

  return (
    <div className="card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-display font-extrabold uppercase tracking-[0.14em]">
          Team Access
        </h2>
        <p className="text-[11px] text-surface-muted/70 mt-1 font-body">
          Give a coach a code. They enter it when they sign up, and it puts them
          in this program. Codes last 30 days.
        </p>
      </div>

      {error && <p className="text-xs text-red-400 font-body">{error}</p>}

      {live.length > 0 && (
        <div className="space-y-1.5">
          {live.map((c) => (
            <div
              key={c.code}
              className="flex items-center gap-2 rounded-[4px] border border-surface-border bg-black/20 px-2.5 py-2"
            >
              <span className="font-display font-black tracking-[0.2em] text-base text-amber-400">
                {c.code}
              </span>
              <span className="text-[10px] text-surface-muted/70 font-body">
                {expiryLabel(c)}
                {c.uses > 0 && ` · used ${c.uses}×`}
              </span>
              <button
                onClick={() => copy(c.code)}
                className="btn-ghost p-1 ml-auto text-surface-muted/60 cursor-pointer"
                title="Copy code"
              >
                {copied === c.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => revoke(c.code)}
                disabled={busy}
                className="btn-ghost p-1 text-surface-muted/60 cursor-pointer"
                title="Revoke this code"
              >
                <Ban className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={generate}
        disabled={busy}
        className="btn-ghost text-sm flex items-center gap-1.5"
      >
        <Plus className="w-4 h-4" />
        {busy ? "Working…" : "New Invite Code"}
      </button>
    </div>
  );
}

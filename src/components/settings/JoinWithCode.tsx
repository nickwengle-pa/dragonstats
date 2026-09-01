import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * The way back from a mistyped invite code.
 *
 * Redeeming happens after the account exists, so a wrong code leaves a real
 * account that belongs to no program — and the app answers that state with
 * "set up your program", which is the wrong advice for a coach who is trying
 * to join one that already exists. Worse, they cannot simply sign up again:
 * the email is taken. So the first-time screen has to offer the code box too.
 *
 * On success the app is restarted rather than re-rendered, for the same reason
 * the join flow reloads: the program context cached "no program" before this
 * membership existed.
 */
export default function JoinWithCode() {
  const { redeemInviteCode } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const err = await redeemInviteCode(code);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.assign("/");
  };

  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-display font-extrabold uppercase tracking-[0.14em]">
          Joining a program?
        </h2>
        <p className="text-[11px] text-surface-muted/70 mt-1 font-body">
          If your head coach gave you a code, enter it here instead of setting
          up a new school.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="8-character code"
          className="input flex-1 tracking-[0.3em] font-display uppercase"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={8}
        />
        <button type="submit" disabled={busy || !code.trim()} className="btn-ghost px-4 shrink-0">
          {busy ? "…" : "Join"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 font-body">{error}</p>}
    </form>
  );
}

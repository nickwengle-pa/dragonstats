import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useProgramContext } from "@/hooks/useProgramContext";

/** Accounts without membership can join an existing team, never create one. */
export default function JoinTeamScreen() {
  const { redeemInviteCode, signOut } = useAuth();
  const { refresh } = useProgramContext();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="screen items-center justify-center p-6">
      <form className="w-full max-w-sm space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          const result = await redeemInviteCode(code);
          if (result) setError(result.message);
          else await refresh();
        } catch (thrown) {
          setError(thrown instanceof Error ? thrown.message : "Could not join your team. Try again.");
        } finally {
          setBusy(false);
        }
      }}>
        <h1 className="text-2xl font-bold text-center">Join your team</h1>
        <p className="text-sm text-surface-muted text-center">
          DragonStats is for invited staff. Ask your program administrator for access to your team.
        </p>
        <label className="block" htmlFor="join-team-code">Invite code</label>
        <input id="join-team-code" className="input" value={code} required maxLength={8}
          autoCapitalize="characters" autoComplete="off" spellCheck={false}
          onChange={(event) => setCode(event.target.value.toUpperCase())} />
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={busy || !code.trim()}>
          {busy ? "Joining…" : "Join team"}
        </button>
        <button type="button" className="btn-ghost w-full" disabled={busy}
          onClick={() => { void signOut(); }}>Sign out</button>
      </form>
    </div>
  );
}

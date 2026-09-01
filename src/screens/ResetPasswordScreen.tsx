import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

/**
 * Where the emailed reset link lands.
 *
 * Supabase exchanges the link for a temporary recovery session before this
 * screen renders, so there is no token to handle here — the user is already
 * signed in, in a limited sense, and `updateUser` is all that is left to do.
 *
 * Two things that are easy to get wrong:
 *
 *  - This route must sit OUTSIDE ProtectedRoute and outside the "signed in but
 *    no program" redirect, because a recovery session IS a signed-in user with
 *    no program resolved yet. Routed carelessly it gets swallowed by first-time
 *    setup, which is what happened to the invite-code join flow.
 *
 *  - Landing here without a recovery session is the normal failure — an expired
 *    or already-used link — and has to say so, rather than presenting a form
 *    that will fail on submit.
 */
export default function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();

  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    /* The recovery session may not be established at first paint — Supabase
       parses the URL and fires PASSWORD_RECOVERY asynchronously. So check the
       session once, and also listen, rather than deciding on the first look. */
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) setReady(session ? "ok" : "no-session");
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) setReady("ok");
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
  };

  return (
    <div className="screen safe-top flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-display font-extrabold uppercase tracking-[0.1em] text-center">
          {done ? "Password Changed" : "Set A New Password"}
        </h1>
        <div className="mx-auto mt-3 mb-6 accent-line" />

        {ready === "checking" && (
          <p className="text-sm text-surface-muted font-body text-center">Checking your link…</p>
        )}

        {ready === "no-session" && (
          <div className="space-y-4">
            <p className="text-sm text-surface-muted font-body leading-relaxed text-center">
              This reset link has expired or has already been used. Request a new
              one from the sign-in screen.
            </p>
            <button onClick={() => navigate("/login")} className="btn-primary w-full">
              Back to Sign In
            </button>
          </div>
        )}

        {ready === "ok" && !done && (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="new-password" className="label block mb-1.5 ml-1">New Password</label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="input w-full"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="label block mb-1.5 ml-1">Confirm Password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
                className="input w-full"
                autoComplete="new-password"
                required
              />
            </div>

            {error && <p className="text-sm text-red-400 text-center font-medium py-1">{error}</p>}

            <button type="submit" disabled={busy} className="btn-primary w-full">
              {busy ? "…" : "Change Password"}
            </button>
          </form>
        )}

        {done && (
          <div className="space-y-4">
            <p className="text-sm text-surface-muted font-body leading-relaxed text-center">
              Your password has been changed and you are signed in.
            </p>
            <button onClick={() => navigate("/")} className="btn-primary w-full">
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

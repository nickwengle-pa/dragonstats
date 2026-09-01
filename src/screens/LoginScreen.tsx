import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import plDragon from "@/assets/pl-dragon.png";

/* Sign-up is open, but an account on its own reaches nothing: every table is
   scoped to program membership, and a new account belongs to no program. The
   invite code is the thing that grants access, so it is required here rather
   than offered as a later step - a coach who signs up without one would land
   on an empty app and assume it was broken. */
export default function LoginScreen() {
  const { signIn, signUp, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  /* A third mode rather than a separate route: the only thing it needs is the
     email box that is already on screen. */
  const [isReset, setIsReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (isReset) {
      const resetErr = await requestPasswordReset(email);
      setLoading(false);
      if (resetErr) {
        setError(resetErr.message);
        return;
      }
      // Deliberately the same message whether or not that address has an
      // account — see requestPasswordReset.
      setResetSent(true);
      return;
    }

    const err = isSignUp
      ? await signUp(email, password, inviteCode)
      : await signIn(email, password);

    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    /* Joining is the one case that needs a real reload rather than a client-side
       navigate. Signing up flips auth state, which makes the program context
       read "no program" before the invite code has been redeemed — and its
       refresh closes over a user that is still null at that moment, so calling
       it again from here clears the program instead of finding it. Rather than
       sequence three async things that each own part of the answer, start the
       app over: the membership exists by now, and useAuth dropped the cached
       "no program" entry, so a fresh boot reads the truth. Costs one reload,
       once, on the only screen where nobody is mid-game. */
    if (isSignUp) {
      window.location.assign("/");
      return;
    }
    navigate("/");
  };

  return (
    <div className="screen items-center justify-center p-6 safe-top safe-bottom relative overflow-hidden">
      {/* Background texture */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 39px, #fff 39px, #fff 40px)`,
          backgroundSize: "100% 40px",
        }}
      />

      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-1 accent-line" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-12">
          <img
            src={plDragon}
            alt="PL Dragons"
            className="w-28 h-28 mx-auto mb-4 object-contain select-none pointer-events-none"
            style={{ filter: "drop-shadow(0 0 32px rgba(220, 38, 38, 0.35))" }}
            draggable={false}
          />
          <h1 className="text-4xl font-display font-extrabold tracking-[0.15em] uppercase">
            Dragon Stats
          </h1>
          <p className="text-xs font-display font-semibold text-surface-muted uppercase tracking-[0.3em] mt-2">
            Football Intelligence
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="label block mb-1.5 ml-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="coach@school.edu"
              className="input"
              autoComplete="email"
              required
            />
          </div>
          {/* Asking for a reset link needs the email box and nothing else. */}
          {!isReset && (
            <div>
              <label className="label block mb-1.5 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                className="input"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
              />
            </div>
          )}

          {isReset && resetSent && (
            <p className="text-sm text-emerald-400/90 text-center font-body py-1 leading-relaxed">
              If that address has an account, a reset link is on its way. Check
              your email — including the junk folder.
            </p>
          )}

          {isSignUp && (
            <div>
              <label htmlFor="invite-code" className="label block mb-1.5 ml-1">Invite Code</label>
              <input
                id="invite-code"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="8-character code"
                className="input tracking-[0.3em] font-display uppercase"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={8}
                required
              />
              <p className="text-[11px] text-surface-muted/70 mt-1 font-body">
                From your head coach or program administrator.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 text-center font-medium py-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-3 text-base tracking-[0.15em]"
          >
            {loading ? "..." : isReset ? "Send Reset Link" : isSignUp ? "Join Program" : "Sign In"}
          </button>
        </form>

        {isReset ? (
          <button
            onClick={() => { setIsReset(false); setResetSent(false); setError(""); }}
            className="btn-ghost w-full mt-4 text-sm normal-case tracking-normal font-body"
          >
            Back to sign in
          </button>
        ) : (
          <>
            <button
              onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
              className="btn-ghost w-full mt-4 text-sm normal-case tracking-normal font-body"
            >
              {isSignUp ? "Already have an account? Sign in" : "Have an invite code? Join your program"}
            </button>
            {!isSignUp && (
              <button
                onClick={() => { setIsReset(true); setError(""); }}
                className="btn-ghost w-full mt-1 text-xs normal-case tracking-normal font-body text-surface-muted/70"
              >
                Forgot your password?
              </button>
            )}
          </>
        )}
      </div>

      {/* Bottom branding */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-[10px] font-display font-semibold text-surface-muted/40 uppercase tracking-[0.25em]">
          Powered by Dragon Stats
        </p>
      </div>
    </div>
  );
}

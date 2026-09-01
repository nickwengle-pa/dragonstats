import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import plDragon from "@/assets/pl-dragon.png";

/* Sign-in only, on purpose.
   This screen used to offer "Need an account? Sign up", which combined with
   the old catch-all RLS policies meant anyone on the internet could mint an
   account and read or delete every program's season. Accounts are now created
   deliberately (Supabase dashboard, or an invite flow when one exists) rather
   than by anyone who finds the URL. Sign-up must stay disabled in the Supabase
   Auth settings too - removing the button only closes the front door. */
export default function LoginScreen() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const err = await signIn(email, password);

    setLoading(false);

    if (err) {
      setError(err.message);
    } else {
      navigate("/");
    }
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
          <div>
            <label className="label block mb-1.5 ml-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="input"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 text-center font-medium py-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary mt-3 text-base tracking-[0.15em]"
          >
            {loading ? "..." : "Sign In"}
          </button>
        </form>

        <p className="w-full mt-4 text-xs text-center text-surface-muted/60 font-body">
          Accounts are issued by your program administrator.
        </p>
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

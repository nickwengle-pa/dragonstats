import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const err = isSignUp
      ? await signUp(email, password)
      : await signIn(email, password);

    setLoading(false);

    if (err) {
      setError(err.message);
    } else if (!isSignUp) {
      navigate("/");
    } else {
      setError("Check your email for a confirmation link.");
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
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6"
            style={{
              background: "linear-gradient(135deg, #dc2626, #991b1b)",
              boxShadow: "0 0 40px rgba(220, 38, 38, 0.25)",
            }}>
            <span className="text-3xl font-display font-black text-white italic tracking-wider">DS</span>
          </div>
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
              autoComplete={isSignUp ? "new-password" : "current-password"}
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
            {loading ? "..." : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <button
          onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
          className="btn-ghost w-full mt-4 text-sm normal-case tracking-normal font-body"
        >
          {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
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

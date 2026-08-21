import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProgramProvider, useProgramContext } from "@/hooks/useProgramContext";

// Eagerly loaded (small, always needed)
import LoginScreen from "@/screens/LoginScreen";

/** React.lazy with a one-shot recovery reload.
 *  After a deploy, an already-open tab references old hashed chunk files that
 *  no longer exist on the server — the dynamic import rejects and the screen
 *  renders nothing ("black screen on first navigation"). One reload fetches
 *  the fresh index.html + chunks; the sessionStorage flag prevents a loop. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyWithReload(load: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    load()
      .then((mod) => {
        sessionStorage.removeItem("chunk-reload");
        return mod;
      })
      .catch((err) => {
        if (!sessionStorage.getItem("chunk-reload")) {
          sessionStorage.setItem("chunk-reload", "1");
          window.location.reload();
        }
        throw err;
      }),
  );
}

// Lazy-loaded screens
const DashboardScreen = lazyWithReload(() => import("@/screens/DashboardScreen"));
const ScheduleScreen = lazyWithReload(() => import("@/screens/ScheduleScreen"));
const RosterScreen = lazyWithReload(() => import("@/screens/RosterScreen"));
const GameScreen = lazyWithReload(() => import("@/screens/GameScreen"));
const GameSummaryScreen = lazyWithReload(() => import("@/screens/GameSummaryScreen"));
const PostGameReview = lazyWithReload(() => import("@/screens/PostGameReview"));
const PlayerScreen = lazyWithReload(() => import("@/screens/PlayerScreen"));
const SettingsScreen = lazyWithReload(() => import("@/screens/SettingsScreen"));
const SeasonStatsScreen = lazyWithReload(() => import("@/screens/SeasonStatsScreen"));
const GameSettingsScreen = lazyWithReload(() => import("@/screens/GameSettingsScreen"));
const BoxScoreScreen = lazyWithReload(() => import("@/screens/BoxScoreScreen"));

function LoadingFallback() {
  return (
    <div className="screen items-center justify-center">
      <div className="text-slate-500 animate-pulse">Loading...</div>
    </div>
  );
}

/** Shown when the server is unreachable and this device has nothing cached to
 *  fall back on. The alternative — and what the app used to do — was to read
 *  "no program" as "new coach" and open first-time setup, which is a terrifying
 *  thing to meet in a press box ten minutes before kickoff. */
function OfflineNoData({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="screen items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <div className="text-lg font-display font-bold uppercase tracking-wider text-red-400">
          No connection
        </div>
        <p className="text-sm text-slate-400">
          Can't reach the server, and this device hasn't saved a copy of your
          program yet. Your saved plays are safe — this only affects loading
          the app.
        </p>
        <p className="text-sm text-slate-400">
          Step outside or find a signal, then try again.
        </p>
        <button
          onClick={onRetry}
          className="mt-2 px-4 py-2 rounded-md border border-slate-600 text-sm font-display font-bold uppercase tracking-wider text-slate-200"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { program, season, loading, offline, refresh } = useProgramContext();

  /* Offline with nothing cached: `program`/`season` being null here means
     "could not look", not "does not exist". Falling through to the setup
     screens below would tell a coach mid-season that he has no program. */
  if (!loading && offline && (!program || !season)) {
    return <OfflineNoData onRetry={() => { void refresh(); }} />;
  }

  // If logged in but no program yet, force Settings
  if (!loading && !program) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="*" element={<ProtectedRoute><SettingsScreen firstTime /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    );
  }

  if (!loading && program && !season) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />
          <Route path="*" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginScreen />} />

        {/* Protected */}
        <Route path="/" element={<ProtectedRoute><DashboardScreen /></ProtectedRoute>} />
        <Route path="/schedule" element={<ProtectedRoute><ScheduleScreen /></ProtectedRoute>} />
        <Route path="/roster" element={<ProtectedRoute><RosterScreen /></ProtectedRoute>} />
        <Route path="/game/:gameId" element={<ProtectedRoute><GameScreen /></ProtectedRoute>} />
        <Route path="/game/:gameId/summary" element={<ProtectedRoute><GameSummaryScreen /></ProtectedRoute>} />
        <Route path="/game/:gameId/boxscore" element={<ProtectedRoute><BoxScoreScreen /></ProtectedRoute>} />
        <Route path="/game/:gameId/review" element={<ProtectedRoute><PostGameReview /></ProtectedRoute>} />
        <Route path="/player/:playerId" element={<ProtectedRoute><PlayerScreen /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />
        <Route path="/season-stats" element={<ProtectedRoute><SeasonStatsScreen /></ProtectedRoute>} />
        <Route path="/game-settings" element={<ProtectedRoute><GameSettingsScreen /></ProtectedRoute>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ProgramProvider>
      <AppRoutes />
    </ProgramProvider>
  );
}

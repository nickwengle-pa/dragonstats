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

function LoadingFallback() {
  return (
    <div className="screen items-center justify-center">
      <div className="text-slate-500 animate-pulse">Loading...</div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { program, season, loading } = useProgramContext();

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

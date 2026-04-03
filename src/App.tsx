import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProgramProvider, useProgramContext } from "@/hooks/useProgramContext";

// Eagerly loaded (small, always needed)
import LoginScreen from "@/screens/LoginScreen";

// Lazy-loaded screens
const DashboardScreen = lazy(() => import("@/screens/DashboardScreen"));
const ScheduleScreen = lazy(() => import("@/screens/ScheduleScreen"));
const RosterScreen = lazy(() => import("@/screens/RosterScreen"));
const GameScreen = lazy(() => import("@/screens/GameScreen"));
const GameSummaryScreen = lazy(() => import("@/screens/GameSummaryScreen"));
const PlayerScreen = lazy(() => import("@/screens/PlayerScreen"));
const SettingsScreen = lazy(() => import("@/screens/SettingsScreen"));
const SeasonStatsScreen = lazy(() => import("@/screens/SeasonStatsScreen"));

function LoadingFallback() {
  return (
    <div className="screen items-center justify-center">
      <div className="text-neutral-500 animate-pulse">Loading...</div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { program, loading } = useProgramContext();

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
        <Route path="/player/:playerId" element={<ProtectedRoute><PlayerScreen /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />
        <Route path="/season-stats" element={<ProtectedRoute><SeasonStatsScreen /></ProtectedRoute>} />

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

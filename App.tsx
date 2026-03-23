import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ProgramProvider, useProgramContext } from "@/hooks/useProgramContext";

// Screens
import LoginScreen from "@/screens/LoginScreen";
import DashboardScreen from "@/screens/DashboardScreen";
import ScheduleScreen from "@/screens/ScheduleScreen";
import RosterScreen from "@/screens/RosterScreen";
import GameScreen from "@/screens/GameScreen";
import GameSummaryScreen from "@/screens/GameSummaryScreen";
import PlayerScreen from "@/screens/PlayerScreen";
import SettingsScreen from "@/screens/SettingsScreen";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="screen items-center justify-center">
        <div className="text-neutral-500 animate-pulse">Loading...</div>
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { program, loading } = useProgramContext();

  // If logged in but no program yet, force Settings
  if (!loading && !program) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<ProtectedRoute><SettingsScreen firstTime /></ProtectedRoute>} />
      </Routes>
    );
  }

  return (
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

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ProgramProvider>
      <AppRoutes />
    </ProgramProvider>
  );
}

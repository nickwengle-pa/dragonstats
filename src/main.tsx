import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./index.css";

const UiPreview = import.meta.env.DEV ? lazy(() => import("./screens/UiPreview")) : null;

const FlowPreview = import.meta.env.DEV
  ? lazy(() => import("./screens/FlowPreview")) : null;

const PregamePreview = import.meta.env.DEV
  ? lazy(() => import("./screens/PregamePreview")) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* Served from the root of dragonstats.app — no basename. It was
          "/dragonstats" while the app lived on github.io under the repo path. */}
      <BrowserRouter>
        {UiPreview && window.location.pathname === "/ui-preview"
          ? <Suspense fallback={<p>Loading UI preview?</p>}><UiPreview /></Suspense>
          : FlowPreview && window.location.pathname === "/flow-preview"
          ? <Suspense fallback={<p>Loading practice game…</p>}><FlowPreview /></Suspense>
          : PregamePreview && window.location.pathname === "/pregame-preview"
          ? <Suspense fallback={<p>Loading pregame…</p>}><PregamePreview /></Suspense>
          : <App />}
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

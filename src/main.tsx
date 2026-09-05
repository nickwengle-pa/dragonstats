import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./index.css";

const FlowPreview = import.meta.env.DEV
  ? lazy(() => import("./screens/FlowPreview")) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {/* Served from the root of dragonstats.app — no basename. It was
          "/dragonstats" while the app lived on github.io under the repo path. */}
      <BrowserRouter>
        {FlowPreview && window.location.pathname === "/flow-preview"
          ? <Suspense fallback={<p>Loading practice game…</p>}><FlowPreview /></Suspense>
          : <App />}
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);

import { createRoot } from "react-dom/client";
import EntryConcepts from "../src/concepts/EntryConcepts";

/* Standalone entry for the play-entry concept prototypes, so they can be
 * shared as one page (no Supabase, no service worker). See build.mjs. */
createRoot(document.getElementById("root")!).render(<EntryConcepts />);

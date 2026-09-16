import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { cacheKeys, invalidateCache, type CachedRead } from "./offlineCache";
import type { Program } from "./programService";

const pendingJoins = new Map<string, Promise<void>>();

/** Metadata remembers the submitted code across devices; only the RPC grants access. */
export async function completeProgramJoin(
  user: Pick<User, "id" | "user_metadata">,
  readProgram: () => Promise<CachedRead<Program>>,
): Promise<CachedRead<Program>> {
  const current = await readProgram();
  const submitted = user.user_metadata?.pending_invite_code;
  // Existing members must not be blocked by an old, expired or exhausted code.
  if (current.value || current.offline || typeof submitted !== "string" || !submitted.trim()) return current;

  let joining = pendingJoins.get(user.id);
  if (!joining) {
    joining = (async () => {
      const { error } = await supabase.rpc("redeem_invite_code", {
        submitted_code: submitted.trim().toUpperCase(),
      });
      if (error) throw new Error(error.message);
      await invalidateCache(cacheKeys.program(user.id));
    })();
    pendingJoins.set(user.id, joining);
  }
  try {
    await joining;
    const joined = await readProgram();
    if (!joined.value && !joined.offline) throw new Error("Your team membership is still loading. Please try again.");
    return joined;
  } finally {
    if (pendingJoins.get(user.id) === joining) pendingJoins.delete(user.id);
  }
}

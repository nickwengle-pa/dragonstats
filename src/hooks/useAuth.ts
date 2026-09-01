import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User, Session } from "@supabase/supabase-js";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({ user: session?.user ?? null, session, loading: false });
    });

    // Listen for auth changes.
    // Supabase re-emits events on tab focus and token refresh with a NEW user
    // object each time. Downstream effects key on the user's identity, so a
    // fresh object for the same signed-in user causes context refreshes that
    // unmount live screens (wiping in-progress play entry). Keep the previous
    // user reference whenever the underlying user hasn't actually changed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState(prev => {
          const nextUser = session?.user ?? null;
          const sameUser = prev.user?.id === nextUser?.id;
          const sameToken = prev.session?.access_token === session?.access_token;
          if (!prev.loading && sameUser && sameToken) return prev;
          return {
            user: sameUser && prev.user ? prev.user : nextUser,
            session,
            loading: false,
          };
        });
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  /* No signUp here by design. Self-service account creation was how an
     anonymous visitor got an authenticated session, and an authenticated
     session used to mean full access to every program. Accounts are created
     out of band; see LoginScreen. */
  return { ...state, signIn, signOut };
}

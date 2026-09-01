import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { cacheKeys, invalidateCache } from "@/services/offlineCache";
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

  /* Declared before signUp, which calls it. Also usable on its own, for an
     account that already exists and is joining a program (or a second one). */
  const redeemInviteCode = useCallback(async (inviteCode: string) => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return new Error("Enter the invite code from your program administrator.");

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return new Error("Sign in before redeeming an invite code.");

    const { error } = await supabase.rpc("redeem_invite_code", { submitted_code: code });
    if (error) return new Error(error.message);

    /* The program context read "no program" moments ago — before this
       membership existed — and cached that answer under this user's key. Left
       alone, a coach who just joined is shown the first-time setup screen and
       invited to create a second program. Drop the entry so the next read goes
       to the server. */
    await invalidateCache(cacheKeys.program(user.id));
    return null;
  }, []);

  /* Sign-up exists, but an account is worth nothing on its own: RLS scopes
     every table to program membership, and a fresh account is a member of
     nothing. The invite code is what grants access, so it is redeemed as part
     of signing up rather than left as a later step someone forgets.
  
     The code is checked AFTER the account exists because redeeming needs an
     authenticated session - redeem_invite_code writes the membership row on
     the caller's behalf, which is exactly what the caller cannot do for
     themselves. A bad code therefore leaves a real but program-less account;
     the caller reports that so the user can try again from the join screen
     instead of being stranded on a working login with nothing in it. */
  const signUp = useCallback(async (email: string, password: string, inviteCode: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error;

    // Email confirmation is on: there is no session yet, so redemption has to
    // wait until the first real sign-in.
    if (!data.session) {
      return new Error(
        "Account created. Confirm your email, then sign in and enter your code.",
      );
    }

    return await redeemInviteCode(inviteCode);
  }, [redeemInviteCode]);

  return { ...state, signIn, signUp, signOut, redeemInviteCode };
}

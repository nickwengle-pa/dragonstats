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

  /* Ask for a reset link.

     Always reports success, even for an address with no account. Saying "no
     such user" would turn this box into a way to test which of a school's
     coaches have accounts, and the caller has nothing useful to do with the
     distinction anyway.

     `redirectTo` must be listed under Supabase Auth -> URL Configuration ->
     Redirect URLs, for production AND for localhost. It is not optional: an
     unlisted URL makes the emailed link fail in a way that looks like a broken
     link rather than a misconfiguration. */
  const requestPasswordReset = useCallback(async (email: string) => {
    const address = email.trim();
    if (!address) return new Error("Enter the email address on your account.");

    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    // A genuine transport failure is worth surfacing; "user not found" is not,
    // and Supabase does not distinguish them here by design.
    if (error && error.status !== 400) return new Error(error.message);
    return null;
  }, []);

  /* Set the new password. Called from the reset screen, where the emailed link
     has already put the browser in a temporary recovery session — which is why
     this needs no old password and no token of its own. */
  const updatePassword = useCallback(async (password: string) => {
    if (password.length < 6) return new Error("Use at least 6 characters.");
    const { error } = await supabase.auth.updateUser({ password });
    return error ? new Error(error.message) : null;
  }, []);

  /* Send the confirmation email again.

     Needed because the first one goes missing for ordinary reasons - spam
     folder, a typo'd address, or the project's email provider throttling. The
     error is passed through verbatim rather than tidied into something
     friendlier, because the useful ones are specific: Supabase's rate limit
     says how many seconds are left, and "already confirmed" means the account
     is fine and the person should just sign in. A generic "could not send"
     would hide both.

     Same emailRedirectTo as signUp, for the same reason - without it the link
     is built from Site URL. */
  const resendConfirmation = useCallback(async (email: string) => {
    const address = email.trim();
    if (!address) return new Error("Enter your email address first.");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: address,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    return error ? new Error(error.message) : null;
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
    /* `emailRedirectTo` is not optional, for the same reason it is not
       optional on the reset link above: with nothing passed, Supabase builds
       the confirmation link out of the project's Site URL. A project whose
       Site URL still points at a dev server mails every new coach a link to
       localhost, and clicking it opens a blank page on a machine that is not
       theirs - which is what happened.

       Note that setting this is only half of it. An origin that is not listed
       under Auth -> URL Configuration -> Redirect URLs does not error; it
       silently falls back to Site URL, so the symptom is identical whether the
       parameter is missing or merely unlisted. */
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) return error;

    /* Supabase will not say "that email is taken" - saying so would turn this
       form into a way to test which of a school's coaches have accounts - so
       an address that already exists comes back looking EXACTLY like a fresh
       sign-up: no error, no session, and a user object. The only tell is that
       its `identities` array is empty.

       Without this check the app cheerfully told a returning coach to go and
       confirm an email that was never sent, because Supabase does not resend
       confirmations to an address it already knows. That is how "they rejoined
       and now they're not getting a confirm email" becomes a mystery instead
       of a message.

       Worth knowing when this fires unexpectedly: deleting a user from a
       public table does not delete them from auth.users. If the auth row
       survived, the address is still taken. */
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      return new Error(
        "That email already has an account. Sign in instead, or use Forgot Password to get back in.",
      );
    }

    // Email confirmation is on: there is no session yet, so redemption has to
    // wait until the first real sign-in.
    if (!data.session) {
      return new Error(
        "Account created. Confirm your email, then sign in and enter your code.",
      );
    }

    return await redeemInviteCode(inviteCode);
  }, [redeemInviteCode]);

  return {
    ...state,
    signIn, signUp, signOut, redeemInviteCode,
    requestPasswordReset, updatePassword, resendConfirmation,
  };
}

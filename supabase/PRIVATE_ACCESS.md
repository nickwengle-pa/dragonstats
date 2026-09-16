# Invited staff only

Apply `20260916000000_invited_staff_only.sql`, then enable Authentication ->
Auth Hooks -> Before User Created with the Postgres function
`public.require_signup_invite`. Local config enables the same hook.

The hook rejects registration without a valid owner-issued code, including
direct signup API calls. Redemption after confirmation still validates the
code and grants membership through `redeem_invite_code`. Existing account
sign-in, password recovery, memberships and team editing are unchanged.

Program INSERT is revoked from public app roles and a restrictive INSERT
policy blocks creation even if a permissive policy is added later. Only a
trusted database administrator can create a new program during this rollout.
The app routes accounts without membership to Join Team, not program setup.

Run `tests/invited_staff_only.sql` for rollback-only database checks. All
returned checks must be true. Test the configured hook with a missing-code
signup request and confirm it is rejected before creating an account.

## Expanding later

Keep invite-only staff registration unless a new onboarding policy is ready.
To reopen program creation, deliberately replace the restrictive policy,
restore INSERT only to the intended roles, and restore an authorized creation
screen. Do not disable membership RLS. Hook changes in the hosted dashboard
must be kept in sync with local config; a frontend deployment does not apply
SQL migrations or hosted Auth Hook settings.

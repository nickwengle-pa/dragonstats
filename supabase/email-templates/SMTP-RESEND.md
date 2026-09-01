# Sending auth email through Resend

Why bother: Supabase's built-in mailer sends from a `supabase.io` address and
is rate limited to a couple of messages an hour. Hand codes to four coaches in
one meeting and some of them silently never get a confirmation. Resend fixes
both the address and the ceiling.

## 1. Verify the domain in Resend

Resend -> Domains -> Add Domain -> `dragonstats.app`.

It then shows three or four records to add at whatever DNS provider hosts the
domain. The values are generated per-domain, so copy them from that screen —
do not reuse examples:

| Type | Typical host | What it is |
|---|---|---|
| MX | `send` | bounce/complaint return path |
| TXT | `send` | SPF (`v=spf1 include:amazonses.com ~all`) |
| TXT | `resend._domainkey` | DKIM public key (long) |
| TXT | `_dmarc` | optional policy record |

Two things to be careful about:

- **The MX goes on the `send` subdomain, not the root.** That is deliberate on
  Resend's part and it is what keeps this from disturbing mail on
  `dragonstats.app` itself. If a screen ever offers you a root MX, decline it
  unless the domain genuinely receives no mail.
- **Do not touch the existing A / CNAME records.** Those point the domain at
  GitHub Pages and are what serve the app. Adding TXT and a subdomain MX does
  not conflict with them.

Propagation is usually minutes. Resend shows the domain as Verified when it is
satisfied; do not continue until it does, or the first test email bounces and
the cause is not obvious.

## 2. Create an API key

Resend -> API Keys -> Create. Sending access is enough; it does not need full
access. Copy it once — `re_...` — it is not shown again. This value IS the SMTP
password.

## 3. Point Supabase at it

Supabase -> Authentication -> Emails -> SMTP Settings -> enable custom SMTP:

| Field | Value |
|---|---|
| Sender email | `noreply@dragonstats.app` |
| Sender name | `Dragon Stats` |
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` (the literal word) |
| Password | the `re_...` API key |

The sender address must be on the verified domain. `noreply@` does not need a
mailbox — nothing has to receive at it.

## 4. Raise the rate limit

Supabase -> Authentication -> Rate Limits -> emails per hour. It is set low for
the built-in mailer and does NOT rise on its own when you attach SMTP. Raising
it is the entire point of doing this, so raise it deliberately — 30/hour is far
past a coaching staff, and Resend's free tier allows 100/day.

## 5. Test before you need it

Use password reset on your own account rather than creating a throwaway one:
sign out, "forgot password", enter your own address. That exercises the real
path — Resend, the branded template, the link — without leaving a stray account
behind.

Check: it arrives from Dragon Stats, the dragon renders, the button works, and
it is not in spam. If it lands in spam, the usual cause is a missing or failing
DKIM record; Resend -> Domains will say so.

Then do one real coach signup end to end before game week, because confirmation
signup is the one path that behaves differently when email confirmations are
on: the account is created without a session, so the invite code cannot redeem
during signup. The app tells them to confirm, sign in, and enter the code on the
first-time screen. That flow works but has not been exercised against a real
confirmation email.

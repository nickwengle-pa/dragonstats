# Auth email templates

Branded replacements for Supabase's default auth emails, so what a coach
receives looks like the app rather than a system notice.

## Where they go

Supabase Dashboard -> Authentication -> Emails -> Templates. Paste the file
contents into the matching template and set the subject:

| File | Supabase template | Suggested subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email for Dragon Stats |
| `reset-password.html` | Reset password | Reset your Dragon Stats password |
| `magic-link.html` | Magic link | Your Dragon Stats sign-in link |
| `invite.html` | Invite user | You have been invited to Dragon Stats |
| `change-email.html` | Change email address | Confirm your new Dragon Stats email |

## Notes

- In the hosted project's Authentication -> URL Configuration, set **Site URL**
  to `https://dragonstats.app` and allow `https://dragonstats.app/` and
  `https://dragonstats.app/reset-password`. The signup and resend requests use
  the trailing slash. Supabase falls back to Site URL when the requested
  redirect is not allowed, so a localhost Site URL breaks emailed links.
  Editing `supabase/config.toml` or deploying the frontend does not update the
  hosted dashboard settings. After updating them, request a fresh confirmation
  email from the production app; previously sent links can retain the old URL.

- The logo is referenced from `https://dragonstats.app/icon-192.png`, which is
  `public/icon-192.png` served at the site root. Email clients cannot use
  bundled assets, so it must stay a public absolute URL. If that file is ever
  renamed, these templates break silently — the mail still sends, with a
  missing image.
- Layout is table-based with inline styles on purpose. Outlook ignores most
  CSS, so the button is a table cell rather than a styled anchor, and the
  accent bar is three coloured cells rather than a gradient.
- `{{ .ConfirmationURL }}`, `{{ .Email }}` and `{{ .NewEmail }}` are Supabase
  template variables and must be left exactly as written.
- Regenerate rather than hand-editing five files: the generator lives in the
  session scratchpad, but the shell is duplicated in each file, so a change to
  the frame means changing all five.

## The from address is a separate problem

Templates change what the email says, not who it is from. Supabase's built-in
mailer sends from a `supabase.io` address and cannot be rebranded, and it is
rate limited (a handful of messages per hour). Sending as
`Dragon Stats <noreply@dragonstats.app>` requires custom SMTP — Resend,
Postmark, SendGrid or SES — configured under Authentication -> Emails -> SMTP
Settings, with the sending domain verified via DNS.

The rate limit matters more than the branding: several coaches signing up at
once on the built-in mailer will silently not receive their confirmations.

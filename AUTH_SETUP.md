# Copter Studios authentication

The Account page supports email/password, email links, chosen username/password,
Google, GitHub, and LinkedIn OIDC. Social buttons check provider availability;
adding the buttons does not activate external provider credentials.

## Provider activation

Create apps in Google Cloud, GitHub Developer Settings, and LinkedIn Developers.
LinkedIn requires the Sign In with LinkedIn using OpenID Connect product.
Enter each app's client ID and secret only in Supabase Authentication providers.
Never put provider secrets in Vite environment variables or repository files.

Use this provider callback:
`https://othnlwcfflvtjgttotcf.supabase.co/auth/v1/callback`

Supabase Site URL: `https://copterstudios.com`
Allow return URLs `https://copterstudios.com/` and `https://www.copterstudios.com/`.
The browser client uses PKCE and restores its session before the app renders.

Email confirmation and email links require a production SMTP service. Merely
enabling custom SMTP without sender credentials is insufficient. Keep email
confirmation enabled. Provider configuration cannot be changed through the
connected database MCP tools.

## Usernames

After signing in, choose a unique lowercase username in Account. Allowed format:
3–30 ASCII letters, numbers, underscores; start with a letter. Username sign-in
uses the same existing account password. Social-only users continue using their
provider unless they separately establish a password.

The username table is private by row-level security. Its lookup RPC is callable
only by service_role. The username-login Edge Function resolves a user ID, checks
email confirmation, then asks Supabase Auth to validate the password. It returns
only session tokens after successful authentication, never a public email lookup.
Gateway JWT verification is disabled for this function because password login
precedes session creation; the handler implements password authentication.

Rate limits are shared across instances: 10 attempts per account per 10 minutes,
300 total per minute. Saturation may temporarily block username login; email
login remains available. This conservative policy needs monitoring as traffic grows.
The limits table intentionally has RLS enabled without client policies.

## Deployment and verification

Apply `supabase/migrations/20260923122503_username_auth.sql` once to a fresh target,
then deploy `supabase/functions/username-login` with gateway JWT verification off.
Built-in Edge secrets SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY
are used only in the server runtime. The production SQL was applied directly and
verified on 2026-09-23; reconcile migration history before future automated db push.

Run `npm test -- src/__tests__/auth.test.tsx src/__tests__/username-login.test.ts`,
`npm run lint`, and `npm run build`.
Unit tests cover provider mapping, disabled providers, network failures, password
and username login, callback cleanup, confirmation, rate limits, rejection paths,
and session establishment. SQL probes verify lookup permissions and 10/11 rate
limiting. Real OAuth consent/callback and email delivery must still be tested once
provider credentials and SMTP are configured. Do not report those as validated.

Security advisor: leaked-password protection is currently disabled in project Auth
settings. Enable it where supported by the project plan:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

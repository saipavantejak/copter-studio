# Private cloud history

The application includes a Supabase PostgreSQL integration for authenticated benchmark history and aircraft configurations. Database provisioning is separate from deploying the application. Without its environment variables, the UI explicitly reports that cloud storage is not connected.

## Deployment

1. Create or select the owner's Supabase project. Apply `supabase/migrations/20260916124922_cloud_history.sql` once through the project's migration workflow.
2. In Supabase Auth, enable email link sign-in. Set the Site URL to `https://copterstudios.com` and allow that exact production callback URL. Add preview URLs explicitly only if needed. Configure an email provider suitable for production delivery.
3. In the Vercel project, configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for production, then redeploy. These are public browser configuration values. Never put a service-role key, secret API key, database password or connection string in a `VITE_` variable.
4. Open Benchmark → Private cloud history. Sign in by email, opening the link in the same browser (PKCE). Save a benchmark and a configuration; reload, load records and download the saved benchmark. Verify its seed, inputs and outputs match the original export.
5. Repeat with a second account. It must not read or modify the first account's records. An unauthenticated client must not read either table. Verify rejected operations through the actual database before declaring cloud storage operational.

## Data and access

Both tables use owner UUIDs linked to Supabase Auth, row-level security with `auth.uid() = user_id`, and no anonymous privileges. Clients can access their own records only. Account deletion cascades to records. Benchmark payloads are limited to 2 MB; configurations to 100 KB. Policy weights are excluded from uploads. Saves are explicit user actions; only the latest 20 records of each type are listed. Benchmark downloads retain the full stored execution evidence.

The migration and frontend have local regression coverage for payload preparation; authenticated database behavior still requires the deployment checks above. Configure backups, retention and service monitoring for the selected project before relying on this as the sole archive.

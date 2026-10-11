# Aggregate analytics and feedback

Collection is disabled by default. This local change is not deployed and the
SQL has not been applied to the hosted database. No usage totals, unique-user
estimate or adoption claim is available. Tests use synthetic events only.

When explicitly enabled, the browser sends just one allowlisted event name:
`workspace_open`,`simulation_start`,`feedback_open`. The database stores UTC calendar day, event name and incremented
count only. It stores no event timestamps, cookies, persistent identifiers,
IP addresses, email, account IDs, prompts, page URLs, device details or referrers.
The browser request omits credentials and referrer; no local/session storage is
used by analytics. Existing account authentication is separate from analytics.

The server assigns no visitor identity. A bounded per-instance global request
counter protects the endpoint without tracking addresses. Counts include
reloads, bots and repeated actions; they are event totals, not unique people.
Denied, failed, disabled or blocked requests are not estimated as successful
collection. Infrastructure/CDN and database-provider logs may see network
metadata outside this application's aggregate storage; review host logging
before describing the entire deployment as collecting no personal data.

Rows older than 90 days are removed during a successful increment.
This is opportunistic pruning, not a guaranteed scheduled deletion deadline
when there are no requests. Owner access is required to inspect totals.

## Deployment, not performed here

Review and apply `supabase/analytics-schema.sql` through the database SQL editor.
It enables RLS, denies anonymous/authenticated table and function access, and
allows only server service-role invocation. The function is SECURITY INVOKER.
Set server-only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and set
AGGREGATE_ANALYTICS_ENABLED=true. Enable the client flag
VITE_AGGREGATE_ANALYTICS_ENABLED=true only after hosted verification. Never
put the service-role key in a VITE-prefixed variable or client code.

The SQL integration test checks increment behavior and anonymous denial in an
isolated PostgreSQL-compatible engine; hosted API/schema configuration remains
unverified. No live schema, environment setting or analytics record was changed.

Feedback opens a GitHub issue form only after the user clicks. It sends no
message automatically. Any submitted feedback is public on GitHub and may
include the user's GitHub identity; that voluntary feedback is separate from
anonymous aggregate counters.

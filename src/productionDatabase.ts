// Public browser configuration, not privileged credentials. RLS enforces access.
// Environment variables remain the preferred override for other deployments.
export function productionDatabase(hostname: string) {
  if (!['copterstudios.com', 'www.copterstudios.com'].includes(hostname)) return {};
  return {
    url: 'https://othnlwcfflvtjgttotcf.supabase.co',
    key: 'sb_publishable_2XXbzePN7gOiyq3DbK4Qxg_CWYANJWu',
  };
}

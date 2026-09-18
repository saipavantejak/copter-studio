import type {SupabaseClient} from '@supabase/supabase-js';

const callbackKeys = ['code','access_token','refresh_token','error','error_code','error_description','token_hash'];
export function isAuthReturn(href: string): boolean {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return callbackKeys.some(key => url.searchParams.has(key) || hash.has(key));
}
export function cleanAuthUrl(href: string): string {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  for (const key of [...callbackKeys,'expires_in','expires_at','token_type','type']) {
    url.searchParams.delete(key); hash.delete(key);
  }
  url.hash = hash.toString();
  return url.pathname + url.search + url.hash;
}
export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'email_address_not_authorized') return 'Email delivery is not configured for public accounts. The site owner must configure a production email provider.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Too many requests. Please wait before requesting another email.';
  if (code === 'email_not_confirmed') return 'Confirm your email before logging in. You can request another confirmation below.';
  if (code === 'invalid_credentials') return 'Email or password is incorrect. You can also use an email sign-in link.';
  if (['otp_expired','flow_state_not_found','flow_state_expired','bad_code_verifier'].includes(code)) return 'This link expired or belongs to another browser. Request a new link here and open it in this browser.';
  return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
}
export async function finishAuthReturn(client: SupabaseClient, href: string): Promise<string> {
  const {error} = await client.auth.initialize();
  if (error) throw error;
  const url = new URL(href);
  const tokenHash = url.searchParams.get('token_hash');
  if (tokenHash) {
    const type = url.searchParams.get('type');
    if (type !== 'email' && type !== 'signup' && type !== 'magiclink') throw new Error('Unsupported confirmation link. Request a new sign-in link.');
    const {error: verificationError} = await client.auth.verifyOtp({token_hash:tokenHash,type});
    if (verificationError) throw verificationError;
  }
  const {data,error: sessionError} = await client.auth.getSession();
  if (sessionError) throw sessionError;
  if (!data.session) throw new Error('Sign-in could not be completed. Request a new link in this browser and open it here.');
  return 'Signed in successfully.';
}

import {useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {authErrorMessage} from './authFlow';

export function AuthForm({client,connection}: {client: SupabaseClient;connection?:{url:string;key:string}}) {
  const [mode,setMode] = useState<'login'|'signup'|'link'>('login');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [failed,setFailed] = useState(false);
  const [cooldown,setCooldown] = useState(0);
  const redirectTo = window.location.origin + window.location.pathname;
  async function socialSignIn(provider: 'google'|'github'|'linkedin_oidc') {
    if (busy) return;
    setBusy(true); setMessage(''); setFailed(false); setPassword('');
    try {
      // Check the public Auth settings before navigating to a disabled provider.
      if (!connection) throw new Error('Sign-in configuration is unavailable.');
      const response = await fetch(`${connection.url}/auth/v1/settings`, {
        signal: AbortSignal.timeout(10000),
        headers: {apikey: connection.key},
      });
      if (!response.ok) throw new Error('Unable to check sign-in availability. Please try again.');
      const settings = await response.json();
      if (settings.external?.[provider] !== true) {
        throw new Error('This sign-in provider is not configured yet. Please use email sign-in.');
      }
      const {error} = await client.auth.signInWithOAuth({provider, options:{redirectTo}});
      if (error) throw error;
      setMessage('Redirecting to your sign-in provider…');
    } catch (error) {setFailed(true); setMessage(authErrorMessage(error));}
    finally {setBusy(false);}
  }
  async function submit(resend = false) {
    if (busy) return;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const address = email.trim();
      if (!address) throw new Error('Enter your email address or username.');
      if (resend && !address.includes('@')) throw new Error('Enter your email address to resend confirmation.');
      if ((mode !== 'login' || resend) && Date.now() < cooldown) throw new Error('Please wait 60 seconds before requesting another email.');
      if (resend) {
        const {error} = await client.auth.resend({type:'signup',email:address,options:{emailRedirectTo:redirectTo}});
        if (error) throw error;
        setCooldown(Date.now()+60_000); setMessage('If confirmation is needed, an email has been requested. Check your inbox and spam folder.');
      } else if (mode === 'login') {
        if (address.includes('@')) {
          const {error} = await client.auth.signInWithPassword({email:address,password});
          if (error) throw error;
        } else {
          const {data,error} = await client.functions.invoke('username-login',{body:{username:address.toLowerCase(),password}});
          if (error || !data?.access_token || !data?.refresh_token) throw new Error('Username or password is incorrect, or sign-in is temporarily unavailable. Use your email address to retry.');
          const {error:sessionError} = await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
          if (sessionError) throw sessionError;
        }
        setPassword(''); setMessage('Signed in successfully.');
      } else if (mode === 'signup') {
        const {data,error} = await client.auth.signUp({email:address,password,options:{emailRedirectTo:redirectTo}});
        if (error) throw error;
        setPassword(''); setCooldown(Date.now()+60_000);
        setMessage(data.session ? 'Account created and signed in.' : 'Check your email to confirm your account, then log in. If you already have an account, use Log in.');
      } else {
        const {error} = await client.auth.signInWithOtp({email:address,options:{emailRedirectTo:redirectTo,shouldCreateUser:false}});
        if (error) throw error;
        setCooldown(Date.now()+60_000); setMessage('If an account exists, a sign-in link has been requested. Open the latest email in this same browser.');
      }
    } catch (error) {setFailed(true);setMessage(authErrorMessage(error));}
    finally {setBusy(false);}
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-3" aria-label="Social sign-in">
      {([['google','Google'],['github','GitHub'],['linkedin_oidc','LinkedIn']] as const).map(([provider,label]) =>
        <button key={provider} type="button" disabled={busy} className="border border-zinc-600 rounded p-3" onClick={()=>void socialSignIn(provider)}>Continue with {label}</button>)}
    </div>
    <p>Or use your email address and password.</p>
    <div className="flex flex-wrap gap-3" aria-label="Authentication method">
      {(['login','signup','link'] as const).map(value=><button key={value} type="button" disabled={busy} aria-pressed={mode===value} className="underline p-2" onClick={()=>{setMode(value);setPassword('');setMessage('');setFailed(false);}}>{value==='login'?'Log in':value==='signup'?'Sign up':'Email sign-in link'}</button>)}
    </div>
    <form className="flex flex-col gap-3 max-w-md" onSubmit={event=>{event.preventDefault();void submit();}}>
      <label>{mode==='login'?'Email or username':'Email'} <input className="block bg-zinc-950 border border-zinc-700 rounded p-2 w-full" type={mode==='login'?'text':'email'} autoComplete={mode==='login'?'username':'email'} required value={email} disabled={busy} onChange={event=>setEmail(event.target.value)} /></label>
      {mode!=='link' && <label>Password <input className="block bg-zinc-950 border border-zinc-700 rounded p-2 w-full" type="password" required minLength={mode==='signup'?8:undefined} autoComplete={mode==='signup'?'new-password':'current-password'} value={password} disabled={busy} onChange={event=>setPassword(event.target.value)} /></label>}
      {mode==='signup' && <p>Use at least 8 characters. Confirm your email before your first login.</p>}
      <button disabled={busy} className="rounded bg-emerald-800 p-2">{busy?'Please wait…':mode==='login'?'Log in to your account':mode==='signup'?'Create account':'Send sign-in link'}</button>
    </form>
    {mode==='login' && <><p>Forgot your password? Use Email sign-in link to access your account.</p><button disabled={busy||!email.trim()} className="underline" onClick={()=>void submit(true)}>Resend confirmation email</button></>}
    <p role={failed?'alert':'status'}>{message}</p>
  </div>;
}

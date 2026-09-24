import {useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

export function UsernameSettings({client,userId}:{client:SupabaseClient;userId:string}) {
  const [username,setUsername]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let alive=true;
    void client.from('login_usernames').select('username').eq('user_id',userId).maybeSingle().then(({data,error})=>{
      if(alive){if(data)setUsername(data.username);if(error)setMessage('Username settings are unavailable.');}
    });
    return ()=>{alive=false;};
  },[client,userId]);
  async function save(){
    setBusy(true);setMessage('');
    try{
      const value=username.trim().toLowerCase();
      if(!/^[a-z][a-z0-9_]{2,29}$/.test(value))throw new Error('Use 3–30 letters, numbers or underscores, starting with a letter.');
      const {error}=await client.from('login_usernames').upsert({user_id:userId,username:value},{onConflict:'user_id'});
      if(error)throw new Error(error.code==='23505'?'That username is already taken.':'Could not save your username. Confirm your email first.');
      setUsername(value);setMessage('Username saved. Use it with your account password to log in.');
    }catch(error){setMessage(error instanceof Error?error.message:'Could not save username.');}
    finally{setBusy(false);}
  }
  return <form className="space-y-2 border border-line-strong rounded p-3" onSubmit={e=>{e.preventDefault();void save();}}>
    <label>Username <input required minLength={3} maxLength={30} autoComplete="username" value={username} disabled={busy} onChange={e=>setUsername(e.target.value)} className="bg-surface border border-line-strong rounded p-2" /></label>
    <button disabled={busy} className="underline p-2">Save username</button>
    <p>Choose a username after verifying your account. Username login requires an existing account password; social-only accounts can continue using their provider.</p>
    <p role="status">{message}</p>
  </form>;
}

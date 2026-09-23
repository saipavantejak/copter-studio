import {createClient} from '@supabase/supabase-js';
import type {BatchStats} from './EpisodeRunner';
import type {PhysicsConfig} from './PhysicsEngine';
import {assertValidConfig} from './configValidation';
import {isAuthReturn,finishAuthReturn,cleanAuthUrl,authErrorMessage} from './authFlow';
import {productionDatabase} from './productionDatabase';

const env=(import.meta as any).env??{};
const deployed=productionDatabase(typeof window==='undefined'?'':window.location.hostname);
const hasOverride=env.VITE_SUPABASE_URL||env.VITE_SUPABASE_PUBLISHABLE_KEY;
const url=hasOverride?env.VITE_SUPABASE_URL:deployed.url;
const key=hasOverride?env.VITE_SUPABASE_PUBLISHABLE_KEY:deployed.key;
export const authConnection = {url, key};
export const authLanding = typeof window !== 'undefined' && isAuthReturn(window.location.href);
const authHref = typeof window !== 'undefined' ? window.location.href : '';
export const authStartup = {message:'',failed:false};
export const cloudDatabase = (()=>{
  if(typeof url!=='string'||!/^https:\/\//.test(url)||typeof key!=='string'||!key.trim())return null;
  try{return createClient(url,key,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});}catch{return null;}
})();

// Finish auth before React's configuration-hash effect can replace the callback URL.
export const authReady = authLanding ? (async()=>{
  try {
    if (!cloudDatabase) throw new Error('Authentication is not configured for this site.');
    authStartup.message = await finishAuthReturn(cloudDatabase,authHref);
  } catch(error) {authStartup.failed=true;authStartup.message=authErrorMessage(error);}
  finally {window.history.replaceState(null,'',cleanAuthUrl(window.location.href));}
})() : Promise.resolve();

export function benchmarkRecord(stats:BatchStats) {
  // Policy weights are not uploaded. The execution record includes the configuration.
  const copy=JSON.parse(JSON.stringify(stats));
  if(copy.requestedConfig)delete copy.requestedConfig.serializedModel;
  if(!Number.isInteger(copy.numEpisodes)||copy.numEpisodes<1||!Array.isArray(copy.episodes)||copy.episodes.length!==copy.numEpisodes)throw new Error('Cannot save an incomplete benchmark');
  if(new TextEncoder().encode(JSON.stringify(copy)).length>2_000_000)throw new Error('Benchmark exceeds the 2 MB cloud record limit; export JSON instead');
  return copy;
}
export function configurationRecord(config:PhysicsConfig) {
  assertValidConfig(config);
  return JSON.parse(JSON.stringify(config));
}

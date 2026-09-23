// Password authentication is performed by Supabase Auth; no credentials are logged.
// JWT gateway verification is disabled because users do not yet have a session.
export function createUsernameHandler(env: (key:string)=>string|undefined, requestFetch:typeof fetch=fetch) {
 return async (req:Request):Promise<Response> => {
  const origin=req.headers.get('origin')??'';
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(['https://copterstudios.com','https://www.copterstudios.com'].includes(origin)) {
   headers['Access-Control-Allow-Origin']=origin;
   headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';
   headers['Access-Control-Allow-Methods']='POST, OPTIONS';
  } else if(origin) return new Response('{}',{status:403,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
  if(req.method!=='POST')return reply(405,{error:'Method not allowed'});
  const failure=()=>reply(401,{error:'Invalid credentials or temporarily unavailable'});
  try {
   const raw=await req.text();
   if(raw.length>4096)return reply(413,{error:'Request too large'});
   const {username,password}=JSON.parse(raw);
   if(typeof username!=='string'||!/^[a-z][a-z0-9_]{2,29}$/.test(username)||typeof password!=='string'||password.length<1||password.length>1024)return failure();
   const url=env('SUPABASE_URL'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY'),anonKey=env('SUPABASE_ANON_KEY');
   if(!url||!serviceKey||!anonKey)return reply(503,{error:'Sign-in unavailable'});
   const privileged={apikey:serviceKey,Authorization:'Bearer '+serviceKey,'Content-Type':'application/json'};
   const resolve=await requestFetch(url+'/rest/v1/rpc/resolve_login_username',{method:'POST',headers:privileged,body:JSON.stringify({candidate:username}),signal:AbortSignal.timeout(10000)});
   if(!resolve.ok)return failure();
   const id=await resolve.json();
   if(typeof id!=='string')return failure();
   const account=await requestFetch(url+'/auth/v1/admin/users/'+encodeURIComponent(id),{headers:privileged,signal:AbortSignal.timeout(10000)});
   if(!account.ok)return failure();
   const user=await account.json();
   if(!user.email||!user.email_confirmed_at)return failure();
   const login=await requestFetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anonKey,'Content-Type':'application/json'},body:JSON.stringify({email:user.email,password}),signal:AbortSignal.timeout(10000)});
   if(!login.ok)return failure();
   const session=await login.json();
   if(!session.access_token||!session.refresh_token)return failure();
   return reply(200,{access_token:session.access_token,refresh_token:session.refresh_token});
  }catch{return failure();}
 };
}

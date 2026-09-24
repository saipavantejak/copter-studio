import {cloudDatabase} from '../cloudDatabase';
import type {TaskRecord} from './AgentCore';
export async function saveTask(task:TaskRecord):Promise<void>{
  if(!cloudDatabase)throw new Error('Cloud connection unavailable. Export the task JSON instead.');
  const {data,error}=await cloudDatabase.auth.getUser();
  if(error||!data.user)throw new Error('Sign in to save private agent history. You can export JSON without signing in.');
  if(new TextEncoder().encode(JSON.stringify(task)).length>2_000_000)throw new Error('Task exceeds 2 MB. Export JSON instead.');
  const {error:writeError}=await cloudDatabase.from('aether_tasks').upsert({id:task.id,user_id:data.user.id,payload:task,updated_at:new Date().toISOString()},{onConflict:'id'});
  if(writeError)throw new Error(writeError.message);
}
export async function loadTasks():Promise<TaskRecord[]>{
  if(!cloudDatabase)throw new Error('Cloud connection unavailable.');
  const {data,error}=await cloudDatabase.auth.getUser();
  if(error||!data.user)throw new Error('Sign in to load private agent history.');
  const {data:rows,error:readError}=await cloudDatabase.from('aether_tasks').select('payload').eq('user_id',data.user.id).order('updated_at',{ascending:false}).limit(10);
  if(readError)throw new Error(readError.message);
  // Historical records are display-only; never execute plans loaded from storage.
  return (rows??[]).map(r=>r.payload as TaskRecord);
}

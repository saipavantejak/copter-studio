export type AggregateEvent='workspace_open'|'simulation_start'|'feedback_open';
/** Opt-in aggregate events only; no storage, URL, identity or session payload. */
export function recordAggregate(event:AggregateEvent):void {
 if(import.meta.env.VITE_AGGREGATE_ANALYTICS_ENABLED!=='true')return;
 if(!['workspace_open','simulation_start','feedback_open'].includes(event))return;
 void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event}),credentials:'omit',referrerPolicy:'no-referrer',keepalive:true}).catch(()=>{});
}

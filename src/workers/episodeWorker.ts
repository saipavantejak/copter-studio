import { EpisodeRunner, type EpisodeBenchmarkConfig } from '../EpisodeRunner';
import { RLAgent } from '../RLAgent';

let controller: AbortController | null = null;
self.onmessage = async (event: MessageEvent) => {
  const {type,cfg} = event.data as {type:string;cfg:EpisodeBenchmarkConfig};
  if (type === 'abort') {controller?.abort();return;}
  if (type !== 'run') return;
  if (controller) {self.postMessage({type:'error',message:'A benchmark is already running'});return;}
  controller = new AbortController();
  const signal = controller.signal;
  const agent = new RLAgent();
  try {
    if (cfg.serializedModel) await agent.loadFromWorkerData(cfg.serializedModel);
    // Never substitute a heuristic after an explicitly requested policy fails to load.
    self.postMessage({type:'controller',label:agent.isUsingUserModel?'RL Policy':'Heuristic PD'});
    const runner = new EpisodeRunner();
    runner.setProgressCallback((done,total,result)=>self.postMessage({type:'progress',done,total,result}));
    const stats = await runner.run(agent,cfg,signal);
    self.postMessage(signal.aborted ? {type:'aborted'} : {type:'done',stats});
  } catch (error) {
    self.postMessage({type:'error',message:error instanceof Error?error.message:String(error)});
  } finally {
    agent.dispose();
    controller=null;
  }
};

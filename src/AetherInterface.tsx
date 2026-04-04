// AetherInterface.tsx — v12
// Aether is now an active simulation operator, not just a chat bot.
//
// NEW CAPABILITIES:
//   • Detects simulation commands in chat and routes them through SimulationParser
//   • Uses Gemini to semantically extract PhysicsConfig + TestModules from prose
//   • Falls back to local heuristic parser when no API key is present
//   • Shows SimulationApprovalDialog — user sees every assumption, approves or edits
//   • Fires onRunSimulation callback into App on approval; App applies config + starts sim
//   • After benchmark completes, auto-posts result summary to chat
//   • All existing chat capabilities preserved

import { useState, useRef, useEffect, useCallback } from 'react';
import { geminiClient, type ChatMessage } from './geminiClient';
import { Send, Bot, AlertTriangle, Activity, Code, Download, Cpu, Play, HelpCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { MissionMetrics } from './MissionLogic';
import { DroneState, PhysicsConfig, TestModules } from './PhysicsEngine';
import { exportSB3Script } from './TelemetryExport';
import { parseSimulationIntent, isSimulationCommand, SimulationIntent } from './SimulationParser';
import { SimulationApprovalDialog } from './SimulationApprovalDialog';

interface AetherInterfaceProps {
  telemetry:          DroneState | null;
  crashData:          any;
  modelLoadTrigger:   number;
  modelErrorTrigger:  { count: number; error: string } | null;
  activeTests:        TestModules;
  config:             PhysicsConfig;
  metrics?:           MissionMetrics | null;
  episodeStats?:      any;
  onShowForensics?:   () => void;
  onRunSimulation:    (intent: SimulationIntent) => void;
}

interface Message {
  role:     'user' | 'assistant';
  content:  string;
  isError?: boolean;
  isSim?:   boolean;
}

const SYSTEM_INSTRUCTION = `You are Aether, Senior Drone Systems Architect and RL Research Consultant for the SWASH-BICOP-V11 Digital Twin.

Specialisations:
1. PERFORMANCE AUDIT: Analyse SEC, SPT, hover stability with actual telemetry values.
2. REWARD ARCHITECT: Generate complete SB3-compatible reward functions with mathematical justification.
3. CRASH ANALYST: Diagnose using aerospace failure modes. Always classify: Battery Exhaustion | Roll Divergence | Pitch Divergence | Motor-Out Cascade | Collective Stall | Total Attitude Failure.
4. CODE-ON-DEMAND: Generate TypeScript for PhysicsEngine.ts or Python SB3 training loops.
5. SIMULATION OPERATOR: When user asks to run/simulate/fly/test, confirm you are parsing the request and opening the approval dialog. Never fabricate simulation results.

Rules: cite actual telemetry values. Reward functions show full def compute_reward(). Keep responses concise and technical. Use markdown code blocks.
When a benchmark shows high crash rates (>50%), proactively suggest generating a Colab training notebook to train a better RL policy.`;


function buildContext(
  telemetry: DroneState | null, crashData: any, activeTests: TestModules,
  config: PhysicsConfig, metrics: MissionMetrics | null | undefined, episodeStats: any
): string {
  const parts: string[] = [];
  if (config)    parts.push(`Config: ${config.droneType} | mass=${config.mass}kg | prop=${config.propDiameter}in | ${config.batteryVoltage}V | arm=${config.armLength}m`);
  if (telemetry) parts.push(`Telemetry: alt=${telemetry.z.toFixed(3)}m | roll=${(telemetry.phi*180/Math.PI).toFixed(1)}° | pitch=${(telemetry.theta*180/Math.PI).toFixed(1)}° | bat=${(telemetry.battery*100).toFixed(1)}% | t=${telemetry.time.toFixed(2)}s`);
  if (metrics)   parts.push(`Metrics: SEC=${metrics.sec.toFixed(5)} | SPT=${metrics.spt.toFixed(5)} | energy=${metrics.energyConsumed.toFixed(1)}J | dist=${metrics.distanceTraveled.toFixed(4)}km`);
  if (crashData) parts.push(`CRASH: ${crashData.reason ?? 'unknown'}`);
  if (episodeStats) parts.push(`Batch: ${episodeStats.numEpisodes}eps | crashRate=${(episodeStats.crashRate*100).toFixed(1)}% | meanSEC=${episodeStats.meanSEC?.toFixed(4)} | meanSPT=${episodeStats.meanSPT?.toFixed(4)}`);
  const mods = Object.entries(activeTests).filter(([k,v])=>k!=='missionPreset'&&v===true).map(([k])=>k).join(', ');
  if (mods) parts.push(`Active: ${mods}`);
  if (activeTests.missionPreset !== 'none') parts.push(`Mission: ${activeTests.missionPreset}`);
  return parts.join('\n');
}

function downloadColabNotebook(config: PhysicsConfig) {
  const notebook = {
    "cells": [
      {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
          "# 🚁 SWASH-BICOP Auto-RL Trainer\n\n",
          "This notebook trains a custom Reinforcement Learning policy for your drone configuration using Google Colab's fast CPUs/GPUs.\n\n",
          "### Step 1: Upload the Project\n",
          "Using the file browser on the left (🗂️ icon), upload the `swash-bicop-initial-version.zip` file containing your local project.\n",
          "*(Note: You can skip this if you clone directly from a given GitHub URL).* \n\n",
          "Then, run the cells below in order."
        ]
      },
      {
        "cell_type": "code",
        "execution_count": null,
        "metadata": {},
        "outputs": [],
        "source": [
          "!unzip -q swash-bicop-initial-version.zip\n",
          "!curl -fsSL https://deb.nodesource.com/setup_20.x | bash -\n",
          "!apt-get install -y nodejs"
        ]
      },
      {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
          "### Step 2: Install Python RL Dependencies & Install App Dependencies"
        ]
      },
      {
        "cell_type": "code",
        "execution_count": null,
        "metadata": {},
        "outputs": [],
        "source": [
          "%%bash\n",
          "cd app-source-v12-pro && npm install\n",
          "pip install stable-baselines3 gymnasium websocket-client"
        ]
      },
      {
        "cell_type": "markdown",
        "metadata": {},
        "source": [
          "### Step 3: Run the Gym Bridge and Train the Policy\n",
          "This runs the WebSocket server in the background, connects to it, and trains `stable-baselines3` PPO for 50,000 steps using your custom drone physics.\n"
        ]
      },
      {
        "cell_type": "code",
        "execution_count": null,
        "metadata": {},
        "outputs": [],
        "source": [
          "%%bash \n",
          "cd app-source-v12-pro\n",
          "nohup npx tsx server/gymBridge.ts > gymbridge.log 2>&1 &\n",
          "sleep 5\n"
        ]
      },
      {
        "cell_type": "code",
        "execution_count": null,
        "metadata": {},
        "outputs": [],
        "source": [
          "import os\n",
          "import sys\n",
          "sys.path.append(os.path.abspath('app-source-v12-pro/server'))\n\n",
          "from gym_client import DroneSimEnv\n",
          "from stable_baselines3 import PPO\n",
          "from google.colab import files\n\n",
          "# ==========================================\n",
          "# 🔧 CUSTOM PHYSICS AUTOGENERATED BY AETHER\n",
          `TARGET_MASS = ${config.mass}\n`,
          `TARGET_PROP = ${config.propDiameter}\n`,
          `TARGET_VOLT = ${config.batteryVoltage}\n`,
          "TRAINING_STEPS = 50000\n",
          "# ==========================================\n\n",
          "print(f\"Initialising Gymnasium for mass={TARGET_MASS}kg...\")\n",
          "env = DroneSimEnv(\n",
          "    host=\"localhost\", \n",
          "    port=8765, \n",
          "    mass=TARGET_MASS, \n",
          "    prop_diameter=TARGET_PROP, \n",
          "    battery_voltage=TARGET_VOLT\n",
          ")\n\n",
          "model = PPO(\"MlpPolicy\", env, verbose=1, learning_rate=3e-4, n_steps=2048, batch_size=64, ent_coef=0.01)\n",
          "print(\"Starting PPO Training... this may take a few minutes.\")\n",
          "model.learn(total_timesteps=TRAINING_STEPS)\n\n",
          "model.save('cargo_policy')\n",
          "env.close()\n\n",
          "print(\"\\n✅ Training complete! Downloading cargo_policy.zip...\")\n",
          "files.download('cargo_policy.zip')\n"
        ]
      }
    ],
    "metadata": {
      "colab": {
        "provenance": []
      },
      "kernelspec": {
        "display_name": "Python 3",
        "name": "python3"
      },
      "language_info": {
        "name": "python"
      }
    },
    "nbformat": 4,
    "nbformat_minor": 0
  };
  const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `swash-bicop-colab-trainer.ipynb`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const AetherInterface = ({
  telemetry, crashData, modelLoadTrigger, modelErrorTrigger,
  activeTests, config, metrics, episodeStats, onShowForensics, onRunSimulation,
}: AetherInterfaceProps) => {
  const [messages,       setMessages]       = useState<Message[]>([{ role:'assistant', content:
    '**Aether online.** Monitoring telemetry, physics, and RL policy.\n\n' +
    '**I can run simulations or generate training plans:**\n' +
    '- *"Run a 7kg bicopter in heavy wind with motor-out"*\n' +
    '- *"Tweak physics and train a new RL policy for 9kg cargo"*\n' +
    '- *"Benchmark 100 episodes with domain randomisation"*\n\n' +
    'I\'ll parse, flag any ambiguities, and ask for your approval before touching the sim.'
  }]);
  const [input,          setInput]          = useState('');
  const [isLoading,      setIsLoading]      = useState(false);
  const [isParsing,      setIsParsing]      = useState(false);
  const [pendingIntent,  setPendingIntent]  = useState<SimulationIntent | null>(null);
  const [pendingPrompt,  setPendingPrompt]  = useState('');
  const [lastEpStats,    setLastEpStats]    = useState<any>(null);
  const [geminiOnline,   setGeminiOnline]   = useState(false);
  const [trainingOffered, setTrainingOffered] = useState(false);

  const messagesEndRef   = useRef<HTMLDivElement>(null);
  const hasAnalyzedCrash = useRef(false);
  const chatHistory      = useRef<ChatMessage[]>([]);

  // Check proxy availability once on mount
  useEffect(() => { geminiClient.isAvailable().then(setGeminiOnline); }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  const callAI = useCallback(async (userMsg: string, ctx?: string): Promise<string> => {
    const context = ctx ?? buildContext(telemetry, crashData, activeTests, config, metrics, episodeStats);
    const full = context ? `[Live Context]\n${context}\n\n[User]\n${userMsg}` : userMsg;
    chatHistory.current.push({ role: 'user', parts: [{ text: full }] });
    try {
      const text = await geminiClient.chat({
        model:             'gemini-2.5-flash',
        systemInstruction: SYSTEM_INSTRUCTION,
        history:           chatHistory.current.slice(-12, -1), // exclude last (just pushed)
      }).send(full);
      chatHistory.current.push({ role: 'model', parts: [{ text }] });
      return text;
    } catch (e: any) {
      if (e?.message?.includes('GEMINI_API_KEY not configured')) {
        return '⚠️ Gemini key not set. Add `GEMINI_API_KEY=your_key` to `.env.local` and restart `npm run dev`. The simulation parser still works locally.';
      }
      throw e;
    }
  }, [telemetry, crashData, activeTests, config, metrics, episodeStats]);

  // Auto crash analysis
  useEffect(() => {
    if (!crashData) { hasAnalyzedCrash.current = false; return; }
    if (hasAnalyzedCrash.current) return;
    hasAnalyzedCrash.current = true;
    const ctx = `CRASH\n${buildContext(crashData.telemetry, crashData, activeTests, config, metrics, episodeStats)}`;
    setIsLoading(true);
    callAI('Crash detected. Classify the failure mode and give a 3-step remediation plan.', ctx)
      .then(text => setMessages(p => [...p, { role:'assistant', content:text }]))
      .catch(()=>{}).finally(()=>setIsLoading(false));
  }, [crashData, callAI]);

  useEffect(() => {
    if (modelLoadTrigger>0) setMessages(p=>[...p,{role:'assistant',content:'✅ RL model loaded and validated. Neural network now in control. Run the Benchmark tab to compare against heuristic PD.'}]);
  }, [modelLoadTrigger]);

  useEffect(() => {
    if (!modelErrorTrigger?.count) return;
    callAI(`Model load failed: ${modelErrorTrigger.error}. Diagnose and suggest fix.`)
      .then(text=>setMessages(p=>[...p,{role:'assistant',content:text,isError:true}])).catch(()=>{});
  }, [modelErrorTrigger]);

  // Auto benchmark summary when stats arrive
  useEffect(() => {
    if (!episodeStats || episodeStats===lastEpStats || episodeStats.numEpisodes<5) return;
    setLastEpStats(episodeStats);
    callAI(
      `Batch benchmark done: ${episodeStats.numEpisodes}eps, crashRate=${(episodeStats.crashRate*100).toFixed(1)}%, ` +
      `meanSEC=${episodeStats.meanSEC?.toFixed(5)}, meanSPT=${episodeStats.meanSPT?.toFixed(5)}, stdSEC=${episodeStats.stdSEC?.toFixed(5)}. ` +
      `3-bullet performance audit + one concrete improvement.`
    ).then(text=>setMessages(p=>[...p,{role:'assistant',content:text}])).catch(()=>{});

    // If crash rate is high, offer to generate a Colab training notebook
    if (episodeStats.crashRate > 0.5 && !trainingOffered) {
      setTrainingOffered(true);
      setTimeout(() => {
        setMessages(p => [...p, {
          role: 'assistant', isSim: true,
          content: `⚠️ **High crash rate detected (${(episodeStats.crashRate*100).toFixed(0)}%).** The heuristic PD controller is struggling with this configuration.\n\n` +
            `**Recommendation:** Train a custom RL policy using Google Colab. I can generate a pre-configured notebook with your exact physics parameters.\n\n` +
            `Click **"Export Colab Notebook"** below, or say *"generate training notebook"* to get started.\n\n` +
            `After training (~15 min on Colab free GPU), download the model and upload it via **Load RL Model** to benchmark against the heuristic.`
        }]);
      }, 2000);
    }
  }, [episodeStats]);

  // Simulation command pipeline
  const handleSimCmd = useCallback(async (userMsg: string) => {
    setIsParsing(true);
    setMessages(p=>[...p,
      { role:'user', content:userMsg },
      { role:'assistant', content:'🔍 Parsing simulation request…', isSim:true },
    ]);
    try {
      const intent = await parseSimulationIntent(userMsg);
      setPendingIntent(intent);
      setPendingPrompt(userMsg);
      const hasErr  = intent.ambiguities.some(a=>a.level==='error');
      const hasWarn = intent.ambiguities.some(a=>a.level==='warning');
      let summary = hasErr
        ? `⚠️ **${intent.ambiguities.filter(a=>a.level==='error').length} error(s)** must be fixed before running.\n\n`
        : hasWarn
          ? `⚠️ **Significant assumptions made.** Please review in the dialog.\n\n`
          : `✅ **High confidence parse.** Review parameters and approve.\n\n`;
      summary += `**Interpreted:** ${intent.type==='autotrain' ? 'Auto-RL Colab Plan' : (intent.type==='benchmark'?`${intent.numEpisodes}-episode benchmark`:'Live simulation')} — ${intent.config.droneType}, ${intent.config.mass}kg, ${intent.config.propDiameter}" props.\n\n`;
      const notable = intent.ambiguities.filter(a=>a.level!=='info');
      if (notable.length) summary += notable.map(a=>`- **${a.level.toUpperCase()}** \`${a.field}\`: ${a.issue} → *${a.assumed}*`).join('\n') + '\n\n';
      summary += '*Approval dialog is open — confirm to run.*';
      setMessages(p=>{ const u=[...p]; u[u.length-1]={role:'assistant',content:summary,isSim:true}; return u; });
    } catch(err:any) {
      setMessages(p=>{ const u=[...p]; u[u.length-1]={role:'assistant',content:`❌ Parse failed: ${err?.message??'unknown'}. Try rephrasing.`,isError:true}; return u; });
    } finally { setIsParsing(false); }
  }, []);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || isLoading || isParsing) return;
    setInput('');
    if (isSimulationCommand(msg)) { await handleSimCmd(msg); return; }
    setMessages(p=>[...p,{role:'user',content:msg}]);
    setIsLoading(true);
    try {
      const text = await callAI(msg);
      setMessages(p=>[...p,{role:'assistant',content:text}]);
    } catch(e:any) {
      setMessages(p=>[...p,{role:'assistant',content:`Error: ${e?.message??'unknown'}`,isError:true}]);
    } finally { setIsLoading(false); }
  }, [input, isLoading, isParsing, callAI, handleSimCmd]);

  const handleApprove = useCallback((intent: SimulationIntent) => {
    setPendingIntent(null);
    if (intent.type === 'autotrain') {
      downloadColabNotebook(intent.config);
      setMessages(p=>[...p,{
        role:'assistant', isSim:true,
        content:`✅ **Colab Notebook Generated.**\n\n` + 
        `1. Go to [colab.research.google.com](https://colab.research.google.com/)\n` + 
        `2. Click **File -> Upload Notebook** and select the \`swash-bicop-colab-trainer.ipynb\` file that just downloaded.\n` + 
        `3. Follow the instructions in the notebook to harness cloud GPUs for training!\n` + 
        `4. Once trained, drag \`cargo_policy.zip\` into the **Load RL Model** dropzone.`
      }]);
      return;
    }
    onRunSimulation(intent);
    setMessages(p=>[...p,{
      role:'assistant', isSim:true,
      content:`✅ **Approved.** Launching ${intent.type==='benchmark'?`${intent.numEpisodes}-episode benchmark`:'live simulation'} — ${intent.config.droneType} ${intent.config.mass}kg.\n\n` +
        (intent.type==='benchmark'
          ? 'Switch to **Benchmark** tab. I\'ll post a full audit when it completes.'
          : 'Switch to **Simulation** tab to watch the flight.'),
    }]);

    // After launching a live sim, suggest training if the heuristic is likely to fail (heavy drone)
    if (intent.type === 'live' && intent.config.mass > 7) {
      setTimeout(() => {
        setMessages(p => [...p, {
          role: 'assistant', isSim: true,
          content: `💡 **Tip:** At ${intent.config.mass}kg, the default PD heuristic may struggle. ` +
            `If the flight is unstable, I can generate a **Colab training notebook** to train a custom RL policy for this configuration. ` +
            `Just say *"generate training notebook"* or click **Export Colab Notebook** below.`
        }]);
      }, 3000);
    }
  }, [onRunSimulation]);

  const handleEdit = useCallback(async (prompt: string) => {
    setPendingIntent(null);
    await handleSimCmd(prompt);
  }, [handleSimCmd]);

  const handleCancel = useCallback(() => {
    setPendingIntent(null);
    setMessages(p=>[...p,{role:'assistant',content:'Simulation request cancelled.'}]);
  }, []);

  const SUGGESTIONS = [
    'Run a 7kg bicopter in heavy wind with motor-out',
    'Benchmark 100 episodes: wind + domain rand',
    'Simulate long-range delivery with battery sag',
    'Stress test: 9kg bicopter, all fault modules',
  ];

  return (
    <>
      {pendingIntent && (
        <SimulationApprovalDialog
          intent={pendingIntent} originalPrompt={pendingPrompt}
          onApprove={handleApprove} onEdit={handleEdit} onCancel={handleCancel}
        />
      )}

      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="px-3.5 py-2.5 border-b border-zinc-800 flex items-center gap-2 shrink-0">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-zinc-100">Aether</div>
            <div className="text-[9px] text-zinc-600 font-mono truncate">
            {geminiOnline ? 'Gemini-2.5-Flash · Sim-Operator · Online' : 'Gemini offline · Local parser only'}
            </div>
          </div>
          <Activity className={`w-3 h-3 ${isLoading||isParsing?'text-emerald-400 animate-pulse':'text-zinc-700'}`} />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
              <div className={`max-w-[93%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                m.role==='user'
                  ? 'bg-emerald-600/20 border border-emerald-600/30 text-emerald-100'
                  : m.isError
                    ? 'bg-red-500/10 border border-red-500/20 text-red-200'
                    : m.isSim
                      ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-100'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-200'}`}>
                {m.role==='assistant' && (
                  <div className="flex items-center gap-1 mb-1.5">
                    {m.isSim
                      ? <Cpu className="w-3 h-3 text-indigo-400" />
                      : <Bot className="w-3 h-3 text-emerald-500" />}
                    <span className={`text-[9px] font-bold uppercase ${m.isSim?'text-indigo-500':'text-emerald-600'}`}>
                      {m.isSim?'Sim Operator':'Aether'}
                    </span>
                  </div>
                )}
                <ReactMarkdown components={{
                  code: ({children,className}) => <code className={`${className??''} bg-zinc-800 px-1 py-0.5 rounded text-[10px] font-mono text-emerald-300`}>{children}</code>,
                  pre: ({children}) => <pre className="bg-zinc-900 border border-zinc-700 rounded-lg p-2 overflow-x-auto text-[10px] font-mono mt-1.5 mb-1.5">{children}</pre>,
                  p: ({children}) => <p className="mb-1 last:mb-0">{children}</p>,
                  ul: ({children}) => <ul className="list-disc list-inside space-y-0.5 mb-1">{children}</ul>,
                  strong: ({children}) => <strong className="font-bold text-zinc-100">{children}</strong>,
                }}>
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {(isLoading||isParsing) && (
            <div className="flex justify-start">
              <div className={`rounded-xl px-3 py-2 border text-xs flex items-center gap-2 ${isParsing?'bg-indigo-500/10 border-indigo-500/20 text-indigo-300':'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
                <div className="flex gap-0.5">
                  {[0,1,2].map(i=><div key={i} className={`w-1 h-1 rounded-full animate-bounce ${isParsing?'bg-indigo-400':'bg-zinc-500'}`} style={{animationDelay:`${i*0.15}s`}} />)}
                </div>
                {isParsing?'Parsing request…':'Thinking…'}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggestion chips */}
        {messages.length<=2 && !isLoading && (
          <div className="px-3 pb-2 flex flex-col gap-1 shrink-0">
            <div className="text-[9px] text-zinc-600 uppercase flex items-center gap-1 mb-0.5">
              <Play className="w-2.5 h-2.5" /> Example simulation commands
            </div>
            {SUGGESTIONS.slice(0,2).map(s=>(
              <button key={s} onClick={()=>setInput(s)}
                className="text-left text-[10px] px-2 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 hover:bg-indigo-500/5 rounded-lg text-zinc-400 hover:text-indigo-300 transition-colors truncate">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="p-3 border-t border-zinc-800 shrink-0">
          <div className="flex gap-2">
            <input
              value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&handleSend()}
              placeholder={isParsing?'Parsing…':'Ask or say "run a 7kg bicopter in wind"…'}
              disabled={isLoading||isParsing}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors disabled:opacity-50"
            />
            <button onClick={handleSend} disabled={!input.trim()||isLoading||isParsing}
              className="w-8 h-8 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-lg flex items-center justify-center transition-colors shrink-0">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[
              { label:'Export SB3', icon:Download, fn:()=>exportSB3Script(config) },
              { label:'Colab Notebook', icon:Cpu, fn:()=>downloadColabNotebook(config) },
              { label:'Forensics',  icon:AlertTriangle, fn:()=>onShowForensics?.() },
              { label:'Audit',      icon:Activity, fn:()=>setInput('Audit current SEC and SPT and suggest improvements') },
              { label:'Reward Fn',  icon:Code, fn:()=>setInput('Generate a reward function for stable hover optimised for SEC') },
            ].map(({label,icon:Icon,fn})=>(
              <button key={label} onClick={fn}
                className="flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 text-zinc-500 hover:text-zinc-300 rounded-lg text-[10px] transition-colors">
                <Icon className="w-3 h-3" />{label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-[9px] text-zinc-700">
            <HelpCircle className="w-2.5 h-2.5 shrink-0" />
            Say "run" + describe your drone to trigger the sim operator. Aether parses and asks for approval.
          </div>
        </div>
      </div>
    </>
  );
};

// CrashReplay.tsx
// Tier 3 upgrade: Full 3D crash replay with time scrubber,
// slow-motion playback, and annotation overlays.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Rewind } from 'lucide-react';
import { TelemetryHistory } from './MissionLogic';

declare const THREE: any;

interface CrashReplayProps {
  history: TelemetryHistory[];
  onClose: () => void;
}

const SPEED_OPTIONS = [0.1, 0.25, 0.5, 1.0];

export const CrashReplay: React.FC<CrashReplayProps> = ({ history, onClose }) => {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const threeRef    = useRef<any>({});
  const frameRef    = useRef<number>(0);
  const playRef     = useRef(false);
  const speedRef    = useRef(0.25);
  const frameIdxRef = useRef(history.length > 0 ? Math.max(0, history.length - 80) : 0);
  const lastTimeRef = useRef(0);

  const [frameIdx, setFrameIdx] = useState(frameIdxRef.current);
  const [playing,  setPlaying]  = useState(false);
  const [speed,    setSpeed]    = useState(0.25);

  const totalFrames = history.length;
  const currentFrame = history[Math.min(frameIdx, totalFrames - 1)];

  // ── Annotations ─────────────────────────────────────────────────────────
  const annotations: { frame: number; label: string; color: string }[] = [];
  for (let i=1;i<history.length;i++) {
    const h=history[i], p=history[i-1];
    if (Math.abs(h.phi-p.phi)/0.016 > 3.0 && !annotations.find(a=>a.label==='Roll spike'))
      annotations.push({frame:i,label:'Roll spike',color:'#f87171'});
    if (h.z<0.15 && !annotations.find(a=>a.label==='Ground contact'))
      annotations.push({frame:i,label:'Ground contact',color:'#fbbf24'});
    if (h.battery<0.2 && !annotations.find(a=>a.label==='Battery critical'))
      annotations.push({frame:i,label:'Battery critical',color:'#fb923c'});
  }

  // ── Three.js setup ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof THREE === 'undefined') return;

    const scene    = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0f11);
    const cam = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    cam.position.set(1.5, 1.5, 2);
    cam.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.shadowMap.enabled = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dl = new THREE.DirectionalLight(0xffffff, 1); dl.position.set(3,6,3); dl.castShadow=true; scene.add(dl);
    scene.add(new THREE.GridHelper(10,20,0x333333,0x222222));

    // Drone mesh
    const drone = new THREE.Group();
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.22,0.1,0.22), new THREE.MeshStandardMaterial({color:0x888888,metalness:0.7}));
    drone.add(hub);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,1.1,8), new THREE.MeshStandardMaterial({color:0x1a1a1a}));
    arm.rotation.z=Math.PI/2; drone.add(arm);
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.15,0.15,0.15), new THREE.MeshStandardMaterial({color:0xffaa00}));
    cargo.position.y=-0.16; drone.add(cargo);
    [-1,1].forEach(side=>{
      const g=new THREE.Group(); g.position.set(side*0.5,0.05,0);
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,0.1,8), new THREE.MeshStandardMaterial({color:0x222222})));
      const blade=new THREE.Mesh(new THREE.BoxGeometry(0.65,0.012,0.05), new THREE.MeshStandardMaterial({color:0x080808}));
      blade.position.y=0.09; g.add(blade); drone.add(g);
    });
    scene.add(drone);

    // Trail line
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(300*3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({color:0x10b981,opacity:0.5,transparent:true}));
    scene.add(trail);

    // Target ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35,0.012,8,40), new THREE.MeshStandardMaterial({color:0x10b981,emissive:0x10b981,emissiveIntensity:0.6}));
    ring.position.y=1.0; ring.rotation.x=Math.PI/2; scene.add(ring);

    const resize = () => {
      const w=canvas.clientWidth||500, h=canvas.clientHeight||400;
      renderer.setSize(w,h,false);
      cam.aspect=w/h; cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    threeRef.current = { renderer, scene, cam, drone, trail, trailPos };

    const renderLoop = () => {
      frameRef.current = requestAnimationFrame(renderLoop);
      renderer.render(scene, cam);
    };
    renderLoop();

    return () => { cancelAnimationFrame(frameRef.current); ro.disconnect(); renderer.dispose(); };
  }, []);

  // ── Update drone pose from current frame ─────────────────────────────────
  const applyFrame = useCallback((idx: number) => {
    const h = history[Math.min(idx, totalFrames-1)];
    if (!h || !threeRef.current.drone) return;
    const { drone, trail, trailPos } = threeRef.current;
    drone.position.set(h.x, Math.max(0, h.z), -h.y);
    drone.rotation.set(h.phi, h.psi, h.theta);

    // Update trail (last 100 frames)
    const start = Math.max(0, idx-99);
    for (let i=0;i<100;i++) {
      const hi = history[Math.min(start+i, totalFrames-1)];
      if (!hi) break;
      trailPos[i*3]=hi.x; trailPos[i*3+1]=Math.max(0,hi.z); trailPos[i*3+2]=-hi.y;
    }
    trail.geometry.attributes.position.needsUpdate = true;
    trail.geometry.setDrawRange(0, Math.min(100, idx-start+1));
  }, [history, totalFrames]);

  // ── Playback loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    let raf: number;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (!playRef.current) return;
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      const frameDelta = (dt / 1000) * 60 * speedRef.current;
      const newIdx = Math.min(frameIdxRef.current + frameDelta, totalFrames - 1);
      frameIdxRef.current = newIdx;
      setFrameIdx(Math.floor(newIdx));
      applyFrame(Math.floor(newIdx));
      if (newIdx >= totalFrames - 1) { playRef.current = false; setPlaying(false); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyFrame, totalFrames]);

  // Sync on frame change from scrubber
  useEffect(() => { applyFrame(frameIdx); }, [frameIdx, applyFrame]);

  const togglePlay = () => {
    const next = !playing;
    if (next) {
      lastTimeRef.current = performance.now();
      if (frameIdxRef.current >= totalFrames-1) { frameIdxRef.current = 0; setFrameIdx(0); }
    }
    playRef.current = next;
    setPlaying(next);
  };

  const seek = (idx: number) => {
    frameIdxRef.current = idx;
    setFrameIdx(idx);
    applyFrame(idx);
  };

  const changeSpeed = (s: number) => { speedRef.current = s; setSpeed(s); };

  const r2d = (r: number) => (r*180/Math.PI).toFixed(1);

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl overflow-hidden" style={{maxHeight:'92vh'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-zinc-950 border-b border-zinc-800">
          <div>
            <h2 className="font-bold text-zinc-100">Crash Replay</h2>
            <p className="text-xs text-zinc-500">{totalFrames} frames · {(totalFrames*0.016).toFixed(1)}s flight</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-xl font-bold px-2 leading-none">✕</button>
        </div>

        {/* 3D View */}
        <div className="relative bg-zinc-950" style={{height:320}}>
          <canvas ref={canvasRef} style={{width:'100%',height:'100%',display:'block'}} />
          {/* Annotations overlay */}
          <div className="absolute top-3 right-3 flex flex-col gap-1">
            {annotations.map(a=>(
              <div key={a.label}
                className={`text-[10px] px-2 py-1 rounded-full font-mono cursor-pointer transition-colors border ${
                  Math.abs(frameIdx-a.frame)<5 ? 'opacity-100 border-opacity-60' : 'opacity-40 border-opacity-20'
                }`}
                style={{color:a.color, borderColor:a.color, background:`${a.color}18`}}
                onClick={()=>seek(a.frame)}>
                t={( a.frame*0.016).toFixed(2)}s — {a.label}
              </div>
            ))}
          </div>
          {/* Live telemetry */}
          {currentFrame && (
            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 font-mono text-xs grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span className="text-zinc-500">ALT:</span><span className="text-right">{currentFrame.z.toFixed(3)}m</span>
              <span className="text-zinc-500">ROLL:</span><span className="text-right">{r2d(currentFrame.phi)}°</span>
              <span className="text-zinc-500">PITCH:</span><span className="text-right">{r2d(currentFrame.theta)}°</span>
              <span className="text-zinc-500">Z-VEL:</span><span className="text-right">{currentFrame.z_dot.toFixed(2)}m/s</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-5 py-4 bg-zinc-950 border-t border-zinc-800 space-y-3">
          {/* Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-zinc-500 w-12 shrink-0 text-right">
              {(frameIdx*0.016).toFixed(2)}s
            </span>
            <input type="range" min={0} max={totalFrames-1} value={frameIdx}
              onChange={e=>{ playRef.current=false; setPlaying(false); seek(parseInt(e.target.value)); }}
              className="flex-1 accent-emerald-500" />
            <span className="text-xs font-mono text-zinc-500 w-12 shrink-0">
              {(totalFrames*0.016).toFixed(2)}s
            </span>
          </div>

          {/* Annotation markers */}
          <div className="relative h-2 bg-zinc-800 rounded-full mx-14">
            {annotations.map(a=>(
              <div key={a.label}
                className="absolute top-0 bottom-0 w-1 rounded-full cursor-pointer hover:scale-150 transition-transform"
                style={{left:`${(a.frame/(totalFrames-1))*100}%`, background:a.color}}
                onClick={()=>seek(a.frame)}
                title={`${a.label} @ t=${(a.frame*0.016).toFixed(2)}s`}
              />
            ))}
          </div>

          {/* Playback buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={()=>seek(0)} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={()=>seek(Math.max(0,frameIdx-10))} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors">
                <Rewind className="w-4 h-4" />
              </button>
              <button onClick={togglePlay} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button onClick={()=>seek(Math.min(totalFrames-1,frameIdx+10))} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors">
                <SkipForward className="w-4 h-4" />
              </button>
              <button onClick={()=>seek(totalFrames-1)} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Speed:</span>
              {SPEED_OPTIONS.map(s=>(
                <button key={s} onClick={()=>changeSpeed(s)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${speed===s?'bg-emerald-600 text-white':'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

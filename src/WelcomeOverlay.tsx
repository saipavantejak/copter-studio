import { motion } from 'motion/react';
import { Play } from 'lucide-react';

interface WelcomeOverlayProps {
  onStart: () => void;
  isExiting: boolean;
}

/* ── Cinematic easing presets ─────────────────────────────────────── */
const smoothOut  = [0.16, 1, 0.3, 1]   as const; // deceleration curve
const dramatic   = [0.23, 1, 0.32, 1]  as const; // strong overshoot decel

export const WelcomeOverlay = ({ onStart, isExiting }: WelcomeOverlayProps) => {
  return (
    <motion.div
      /* ── Entrance: fade from black ──────────────────────────── */
      initial={{ opacity: 0 }}
      animate={
        isExiting
          ? { opacity: 0, scale: 1.08, filter: 'blur(20px)' }
          : { opacity: 1, scale: 1,    filter: 'blur(0px)' }
      }
      transition={
        isExiting
          ? { duration: 1.1, ease: [0.4, 0, 0.2, 1] }
          : { duration: 0.8, ease: 'easeOut' }
      }
      className="fixed inset-0 z-[100] bg-canvas flex items-center justify-center p-6 overflow-y-auto"
    >
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none welcome-wash" />

      {/* Radial glow */}
      <div className="absolute inset-0 bg-radial-gradient from-emerald-500/5 to-transparent pointer-events-none" />

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-2xl gap-10">

        {/* Logo + Title Block */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1.0, delay: 0.15, ease: dramatic }}
          className="flex flex-col items-center gap-6"
        >
          {/* Logo badge */}
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            className="w-28 h-28 rounded-[2.5rem] bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center shadow-2xl shadow-emerald-500/10"
          >
            <img src="/logo-dark.png" className="w-18 h-18 object-contain" alt="Logo" />
          </motion.div>

          {/* Heading */}
          <div className="flex flex-col items-center gap-3">
            <motion.h1
              initial={{ letterSpacing: '0.2em', opacity: 0 }}
              animate={{ letterSpacing: '-0.02em', opacity: 1 }}
              transition={{ duration: 1.6, delay: 0.35, ease: smoothOut }}
              className="text-4xl sm:text-6xl font-extrabold tracking-tight text-ink text-center"
            >
              COPTER <span className="text-emerald-700">STUDIOS</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.8, ease: 'easeOut' }}
              className="text-muted font-medium text-xl tracking-tight leading-relaxed text-center max-w-lg"
            >
              The Premier Digital Twin Environment for <br />
              <span className="text-ink">Autonomous Flight &amp; RL Research.</span>
            </motion.p>
          </div>
        </motion.div>

        {/* ── Feature Cards ────────────────────────────────────── */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 1.1, ease: 'easeOut' }}
          className="grid grid-cols-3 gap-4 w-full"
        >
          {[
            { label: 'RK4 Physics', desc: 'Blade Element Theory engine' },
            { label: 'Aether AI',   desc: 'Semantic sim-operator control' },
            { label: 'RL Training', desc: 'Auto-RL Colab workflow' },
          ].map((f) => (
            <motion.div
              key={f.label}
              whileHover={{ y: -6, backgroundColor: 'rgba(247,246,240,0.95)', borderColor: 'rgba(85,107,47,0.28)' }}
              className="p-5 rounded-2xl bg-surface/40 border border-line/50 backdrop-blur-md text-center transition-all duration-300"
            >
              <div className="text-emerald-700 font-bold text-[11px] mb-1.5 uppercase tracking-widest">{f.label}</div>
              <div className="text-muted text-[11px] leading-snug font-mono">{f.desc}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* ── CTA Button ──────────────────────────────────────── */}
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.5, ease: dramatic }}
          className="flex flex-col items-center gap-6"
        >
          <a href="?view=account" className="text-emerald-700 underline">Log in / Sign up</a>
          <button
            onClick={onStart}
            className="group relative px-14 py-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all duration-300 shadow-2xl shadow-emerald-500/20 hover:shadow-emerald-500/40 active:scale-95 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <div className="flex items-center gap-4 relative z-10">
              <span className="tracking-[0.2em] text-sm">INITIALISE MISSION</span>
              <Play className="w-5 h-5 fill-current group-hover:translate-x-1 transition-transform duration-200" />
            </div>
          </button>
        </motion.div>

        {/* Version tag */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.0, duration: 0.6 }}
          className="text-[10px] text-muted font-mono uppercase tracking-[0.4em]"
        >
          Precision Aerospace Simulation Node v12.1 PRO
        </motion.p>
      </div>
    </motion.div>
  );
};


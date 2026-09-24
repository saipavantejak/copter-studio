// OnboardingTour.tsx — Guided interactive walkthrough using driver.js
// Shows on first visit, stored in localStorage. 5 steps highlighting key panels.

import { useEffect, useRef } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const STORAGE_KEY = 'copter-studios-onboarding-v1';

// Custom light theme CSS is injected once
const CUSTOM_CSS = `
.driver-popover {
  background: #FFFFFF !important;
  border: 1px solid #A5AD99 !important;
  color: #1C1D1A !important;
  box-shadow: 0 25px 50px -12px rgba(28,29,26,0.14) !important;
  border-radius: 1rem !important;
}
.driver-popover .driver-popover-title {
  color: #556B2F !important;
  font-size: 14px !important;
  font-weight: 700 !important;
}
.driver-popover .driver-popover-description {
  color: #606657 !important;
  font-size: 12px !important;
  line-height: 1.6 !important;
}
.driver-popover .driver-popover-progress-text {
  color: #606657 !important;
}
.driver-popover-prev-btn {
  background: #D8DDCF !important;
  color: #606657 !important;
  border: 1px solid #A5AD99 !important;
  border-radius: 0.5rem !important;
  font-size: 12px !important;
}
.driver-popover-next-btn, .driver-popover-close-btn {
  background: #4A5D23 !important;
  color: white !important;
  border: none !important;
  border-radius: 0.5rem !important;
  font-size: 12px !important;
  text-shadow: none !important;
}
.driver-popover-next-btn:hover, .driver-popover-close-btn:hover {
  background: #556B2F !important;
}
.driver-overlay {
  background: rgba(0,0,0,0.7) !important;
}
`;

export function OnboardingTour() {
  const injected = useRef(false);

  useEffect(() => {
    // Only run once per session, and only on first visit
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Inject custom CSS once
    if (!injected.current) {
      const style = document.createElement('style');
      style.textContent = CUSTOM_CSS;
      document.head.appendChild(style);
      injected.current = true;
    }

    // Wait for DOM to settle after welcome overlay exit animation
    const timer = setTimeout(() => {
      const driverObj = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayColor: 'rgba(0,0,0,0.7)',
        stagePadding: 16,
        stageRadius: 12,
        popoverOffset: 20,
        steps: [
          {
            popover: {
              title: '🚀 Welcome to Copter Studios!',
              description: 'Quick start in 3 steps: (1) Configure your drone below, (2) Click "Start Simulation" to fly, (3) Use Aether AI to run advanced scenarios. Let\'s walk through each panel.',
            },
          },
          {
            element: '#config-panel',
            popover: {
              title: '⚙ Drone Configurator',
              description: 'Choose your drone type (hover over each for details), set mass, prop size, battery voltage, and toggle fault modules like wind and motor-out. Each slider shows typical ranges to guide you.',
              side: 'right',
              align: 'start',
            },
          },
          {
            element: '#start-sim-area',
            popover: {
              title: '▶ Start Simulation',
              description: 'Click the green button to launch the 3D physics simulation. The drone will hover using the built-in PD controller. Watch the telemetry overlay (ALT, ROLL, PITCH) update in real-time.',
              side: 'left',
              align: 'center',
            },
          },
          {
            element: '#aether-panel',
            popover: {
              title: '🤖 Aether AI — Your Co-Pilot',
              description: 'Type plain English like "Run a 7kg bicopter in heavy wind with motor-out" and Aether will configure everything for you. It shows every assumption before running — you approve or edit first. Try clicking an example command!',
              side: 'left',
              align: 'start',
            },
          },
          {
            element: '#model-loader',
            popover: {
              title: '🧠 Load RL Model',
              description: 'Upload a TensorFlow.js model (model.json + weights.bin) to replace the default controller. Expected input: 12-DOF state vector. Output: 2 dims (bicopter), 4 dims (quadcopter), or 6 dims (hexacopter). Try the "Demo Model" button to load a pre-trained policy.',
              side: 'right',
              align: 'end',
            },
          },
          {
            element: '#tab-bar',
            popover: {
              title: '📊 Explore All Features',
              description: 'Benchmark: batch-test across 50+ episodes. Policy X-Ray: see which sensors drive decisions. Digital Twin: calibrate from real flight data. Gym Bridge: train from Python. Leaderboard: track your best flights.',
              side: 'bottom',
              align: 'center',
            },
          },
        ],
        onDestroyed: () => {
          localStorage.setItem(STORAGE_KEY, 'true');
        },
      });

      // Only start if the config panel exists (app has loaded)
      if (document.getElementById('config-panel')) {
        driverObj.drive();
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  return null; // This component only runs side effects
}


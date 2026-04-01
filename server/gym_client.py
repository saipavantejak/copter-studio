"""
gym_client.py — DroneSimEnv
OpenAI Gymnasium-compatible environment wrapping the Copter Studio browser simulator.

Usage:
    # 1. Start the bridge server:
    #    npm run gym-bridge
    #
    # 2. Use in Python:
    from gym_client import DroneSimEnv
    import numpy as np
    from stable_baselines3 import PPO

    env = DroneSimEnv(host="localhost", port=8765)
    obs, _ = env.reset(seed=42)

    model = PPO("MlpPolicy", env, verbose=1)
    model.learn(total_timesteps=500_000)

Requirements:
    pip install gymnasium websocket-client numpy
"""

import json
import time
import numpy as np
import gymnasium as gym
from gymnasium import spaces

try:
    import websocket
except ImportError:
    raise ImportError("pip install websocket-client")


class DroneSimEnv(gym.Env):
    """
    Gymnasium wrapper for the Copter Studio WebSocket Gym Bridge.

    Observation space: Box(12,) — [x, y, z, xd, yd, zd, phi, theta, psi, p, q, r]
    Action space:      Box(6,)  — [col_L, lat_L, lon_L, col_R, lat_R, lon_R] in [-1, 1]
    """
    metadata = {"render_modes": []}

    OBS_LOW  = np.array([-5,-5, 0,-5,-5,-5,-np.pi,-np.pi,-np.pi,-5,-5,-5], dtype=np.float32)
    OBS_HIGH = np.array([ 5, 5, 5, 5, 5, 5, np.pi, np.pi, np.pi, 5, 5, 5], dtype=np.float32)

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8765,
        mass: float = 5.0,
        prop_diameter: float = 15.0,
        battery_voltage: float = 22.2,
        timeout: float = 10.0,
    ):
        super().__init__()
        self.uri     = f"ws://{host}:{port}"
        self.mass    = mass
        self.prop_d  = prop_diameter
        self.voltage = battery_voltage
        self.timeout = timeout
        self.ws: websocket.WebSocket | None = None

        self.observation_space = spaces.Box(self.OBS_LOW, self.OBS_HIGH, dtype=np.float32)
        self.action_space      = spaces.Box(-1.0, 1.0, shape=(6,), dtype=np.float32)

        self._connect()

    def _connect(self):
        """Connect to the Gym Bridge WebSocket server."""
        for attempt in range(5):
            try:
                self.ws = websocket.create_connection(self.uri, timeout=self.timeout)
                msg = json.loads(self.ws.recv())
                if msg.get("type") == "connected":
                    print(f"[DroneSimEnv] Connected to {self.uri}")
                    return
            except Exception as e:
                if attempt == 4:
                    raise ConnectionError(
                        f"Could not connect to Gym Bridge at {self.uri}.\n"
                        f"Start it with: npm run gym-bridge\n"
                        f"Error: {e}"
                    )
                time.sleep(1.0)

    def _send(self, obj: dict) -> dict:
        assert self.ws is not None, "WebSocket not connected"
        self.ws.send(json.dumps(obj))
        return json.loads(self.ws.recv())

    def reset(self, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        resp = self._send({
            "type": "reset",
            "seed": int(seed) if seed is not None else None,
            "mass": self.mass,
            "propD": self.prop_d,
            "voltage": self.voltage,
        })
        obs = np.array(resp["obs"], dtype=np.float32)
        return obs, resp.get("info", {})

    def step(self, action: np.ndarray):
        action = np.clip(action, -1.0, 1.0)
        resp = self._send({
            "type": "step",
            "action": action.tolist(),
        })
        obs    = np.array(resp["obs"],    dtype=np.float32)
        reward = float(resp["reward"])
        done   = bool(resp["done"])
        info   = resp.get("info", {})
        return obs, reward, done, False, info  # (obs, reward, terminated, truncated, info)

    def close(self):
        if self.ws:
            self.ws.close()
            self.ws = None

    def __del__(self):
        self.close()


# ── Quick test ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Testing DroneSimEnv connection...")
    env = DroneSimEnv()

    obs, _ = env.reset(seed=42)
    print(f"Initial obs: z={obs[2]:.3f}m phi={obs[6]:.3f}rad")

    total_reward = 0.0
    for step in range(200):
        action = env.action_space.sample()
        obs, reward, done, _, info = env.step(action)
        total_reward += reward
        if done:
            print(f"Episode ended at step {step}. Total reward: {total_reward:.2f}")
            break
    else:
        print(f"200 steps completed. Total reward: {total_reward:.2f}")
        print(f"Final state: z={obs[2]:.3f}m alt_err={abs(obs[2]-1.0):.3f}m")

    env.close()
    print("Test passed!")

    def render(self):
        """Rendering happens in the browser — no-op here."""
        pass

    @staticmethod
    def compute_reward(obs, done: bool) -> float:
        """
        Reference reward function matching the SB3 training script.
        Gaussian altitude + attitude upright + velocity damping + directional penalty.
        """
        import numpy as np
        z, zd     = float(obs[2]), float(obs[5])
        phi, theta = float(obs[6]), float(obs[7])
        xd, yd    = float(obs[3]), float(obs[4])
        r_alt  = 2.0 * np.exp(-4.0 * (z - 1.0) ** 2)
        r_att  = 0.5 * np.exp(-2.0 * (abs(phi) + abs(theta)))
        r_vel  = -0.1 * (xd**2 + yd**2 + zd**2)
        r_crash= -50.0 if done else 0.0
        r_dir  = -0.5 * abs(zd) if (z < 1.0 and zd < 0) else 0.0
        return float(r_alt + r_att + r_vel + r_crash + r_dir)

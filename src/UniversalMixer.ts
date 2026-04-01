export type DroneType = 'bicopter' | 'quadcopter' | 'hexacopter';

export interface MixerOutput {
  thrusts: number[];
  moments: { L: number; M: number; N: number };
}

export class UniversalMixer {
  /**
   * @param armLength  Distance from CG to rotor hub (m). Default 0.5.
   *                   Was previously hardcoded; now threaded through from PhysicsConfig.
   */
  static mix(
    type: DroneType,
    action: number[],
    maxThrust: number,
    motorOut: boolean,
    armLength: number = 0.5
  ): MixerOutput {
    let thrusts: number[] = [];
    let L = 0, M = 0, N = 0;
    const d = armLength; // Fix 3: was const d = 0.5

    if (type === 'bicopter') {
      const [col_L, cyc_lat_L, cyc_lon_L, col_R, cyc_lat_R, cyc_lon_R] = action;
      let T_L = Math.max(0, (col_L + 1) / 2 * maxThrust);
      let T_R = Math.max(0, (col_R + 1) / 2 * maxThrust);

      if (motorOut) T_R = 0;

      thrusts = [T_L, T_R];

      const max_cyclic_moment = 5; // Nm
      const M_roll_L  = cyc_lat_L * max_cyclic_moment;
      const M_pitch_L = cyc_lon_L * max_cyclic_moment;
      const M_roll_R  = cyc_lat_R * max_cyclic_moment;
      const M_pitch_R = cyc_lon_R * max_cyclic_moment;

      L = (T_L - T_R) * d + M_roll_L + M_roll_R;
      M = M_pitch_L + M_pitch_R;
      N = (col_L - col_R) * 2 + (cyc_lon_L - cyc_lon_R) * d;

    } else if (type === 'quadcopter') {
      let t0 = Math.max(0, (action[0] + 1) / 2 * maxThrust);
      let t1 = Math.max(0, (action[1] + 1) / 2 * maxThrust);
      let t2 = Math.max(0, (action[2] + 1) / 2 * maxThrust);
      let t3 = Math.max(0, (action[3] + 1) / 2 * maxThrust);

      if (motorOut) t0 = 0;

      thrusts = [t0, t1, t2, t3];

      // X-configuration quadcopter
      L = (t0 + t3 - t1 - t2) * d * 0.707;
      M = (t1 + t3 - t0 - t2) * d * 0.707;
      N = (t0 + t1 - t2 - t3) * 0.05;

    } else if (type === 'hexacopter') {
      thrusts = action.map(a => Math.max(0, (a + 1) / 2 * maxThrust));
      if (motorOut) thrusts[0] = 0;

      const angles = [Math.PI/6, Math.PI/2, 5*Math.PI/6, 7*Math.PI/6, 3*Math.PI/2, 11*Math.PI/6];
      const dirs   = [1, -1, 1, -1, 1, -1];

      for (let i = 0; i < 6; i++) {
        L += thrusts[i] * d * Math.sin(angles[i]);
        M += thrusts[i] * d * Math.cos(angles[i]);
        N += thrusts[i] * dirs[i] * 0.05;
      }
    }

    return { thrusts, moments: { L, M, N } };
  }
}

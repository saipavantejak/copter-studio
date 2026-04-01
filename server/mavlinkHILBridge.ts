/**
 * server/mavlinkHILBridge.ts — Hardware-in-the-Loop MAVLink v2 bridge
 *
 * Exposes Copter Studio's physics engine as a MAVLink HIL sensor provider.
 * A real PX4 or ArduPilot flight controller (or SITL) drives this simulator
 * the same way it drives physical hardware.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │                  HIL Data Flow                           │
 * │                                                          │
 * │  Copter Studio physics ──HIL_SENSOR──▶ PX4 / ArduPilot    │
 * │  Copter Studio physics ──HIL_GPS─────▶ (real firmware)    │
 * │  PX4 actuator mixer ──HIL_ACT_CTRL─▶ Physics Engine     │
 * └──────────────────────────────────────────────────────────┘
 *
 * NO external npm packages — uses only Node built-ins (dgram, http, net).
 * Full MAVLink v2 packet encode/decode implemented from scratch.
 *
 * Setup:
 *   1. npm run gym-bridge  (starts gymBridge.ts + this server)
 *   2. PX4 SITL: make px4_sitl_default none_iris  → set HIL_MODE=1
 *      PX4 SITL HIL UDP: 14560 (send) → 14550 (receive)
 *   3. Real Pixhawk: connect USB/telemetry radio, set HIL_MODE=1 in QGC
 *
 * Run standalone:
 *   npx tsx server/mavlinkHILBridge.ts
 */

import * as dgram from 'dgram';
import { PhysicsEngine, PhysicsConfig } from '../src/PhysicsEngine';

const HIL_PORT_LISTEN  = 14550;  // we receive actuator controls on this port
const HIL_PORT_SEND    = 14560;  // we send sensor data to PX4 SITL on this port
const HIL_HOST         = '127.0.0.1';

const SYS_ID   = 255; // GCS system ID
const COMP_ID  = 190; // MAVLink component — flight sim

// ── MAVLink v2 CRC-16/MCRF4XX ────────────────────────────────────────────────

function mavCRC(data: Buffer, start: number, length: number): number {
  let crc = 0xFFFF;
  for (let i = start; i < start + length; i++) {
    let tmp = data[i] ^ (crc & 0xFF);
    tmp ^= (tmp << 4) & 0xFF;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
  }
  return crc;
}

// CRC extra seeds — from MAVLink common.xml (authoritative)
const CRC_EXTRA: Record<number, number> = {
  0:   50,   // HEARTBEAT
  93:  47,   // HIL_ACTUATOR_CONTROLS
  107: 108,  // HIL_SENSOR
  113: 124,  // HIL_GPS
};

// ── MAVLink v2 Packet Builder ─────────────────────────────────────────────────

let _seq = 0;

/**
 * Encode a MAVLink v2 packet.
 * @param msgId    MAVLink message ID
 * @param payload  Raw payload bytes (little-endian packed fields)
 */
function buildPacket(msgId: number, payload: Buffer): Buffer {
  const len = payload.length;
  const packet = Buffer.allocUnsafe(10 + len + 2);

  packet[0] = 0xFD;           // STX
  packet[1] = len;            // payload length
  packet[2] = 0;              // incompat_flags
  packet[3] = 0;              // compat_flags
  packet[4] = _seq++ & 0xFF;  // sequence
  packet[5] = SYS_ID;
  packet[6] = COMP_ID;
  packet[7] = msgId & 0xFF;          // message ID low
  packet[8] = (msgId >> 8) & 0xFF;   // message ID mid
  packet[9] = (msgId >> 16) & 0xFF;  // message ID high
  payload.copy(packet, 10);

  // CRC over bytes [1 .. 9+len], then XOR with crc_extra
  let crc = mavCRC(packet, 1, 9 + len);
  const extra = CRC_EXTRA[msgId];
  if (extra !== undefined) {
    let tmp = extra ^ (crc & 0xFF);
    tmp ^= (tmp << 4) & 0xFF;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
  }

  packet[10 + len]     = crc & 0xFF;
  packet[10 + len + 1] = (crc >> 8) & 0xFF;

  return packet;
}

// ── MAVLink v2 Packet Parser ─────────────────────────────────────────────────

interface ParsedPacket {
  msgId:   number;
  payload: Buffer;
  sysId:   number;
  compId:  number;
  seq:     number;
}

function parsePacket(buf: Buffer): ParsedPacket | null {
  if (buf.length < 12) return null;
  if (buf[0] !== 0xFD) return null;          // not MAVLink v2

  const payloadLen = buf[1];
  const totalLen   = 10 + payloadLen + 2;
  if (buf.length < totalLen) return null;   // incomplete

  const msgId = buf[7] | (buf[8] << 8) | (buf[9] << 16);

  // Validate CRC
  let crc = mavCRC(buf, 1, 9 + payloadLen);
  const extra = CRC_EXTRA[msgId];
  if (extra !== undefined) {
    let tmp = extra ^ (crc & 0xFF);
    tmp ^= (tmp << 4) & 0xFF;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xFFFF;
  }

  const recvCRC = buf[10 + payloadLen] | (buf[10 + payloadLen + 1] << 8);
  if (crc !== recvCRC) {
    console.warn(`[HIL] CRC mismatch on msg ${msgId}: got ${recvCRC}, expected ${crc}`);
    return null;
  }

  return {
    msgId,
    sysId:   buf[5],
    compId:  buf[6],
    seq:     buf[4],
    payload: buf.slice(10, 10 + payloadLen),
  };
}

// ── Message Encoders ──────────────────────────────────────────────────────────

function encodeHeartbeat(): Buffer {
  // MAV_TYPE_GCS=6, MAV_AUTOPILOT_INVALID=8, base_mode=0, sys_status=4(ACTIVE)
  const p = Buffer.allocUnsafe(9);
  p.writeUInt32LE(0, 0);         // custom_mode
  p.writeUInt8(6, 4);            // type: MAV_TYPE_GCS
  p.writeUInt8(8, 5);            // autopilot: MAV_AUTOPILOT_INVALID
  p.writeUInt8(0, 6);            // base_mode
  p.writeUInt8(4, 7);            // system_status: MAV_STATE_ACTIVE
  p.writeUInt8(3, 8);            // mavlink_version: 3 (v2)
  return buildPacket(0, p);
}

/**
 * HIL_SENSOR (msg 107) — simulated IMU + baro + mag data.
 * All forces in NED body frame; gyro in rad/s; accel in m/s².
 *
 * fields_updated bitmask:
 *   bit 0: xacc,yacc,zacc  bit 1: xgyro etc  bit 2: xmag etc
 *   bit 3: abs_pressure     bit 4: diff_pressure  bit 5: pressure_alt
 *   bit 6: temperature      bit 31: reset
 */
function encodeHILSensor(params: {
  timeUs:       bigint;
  xacc: number; yacc: number; zacc: number;   // m/s² (includes gravity)
  xgyro: number; ygyro: number; zgyro: number; // rad/s
  xmag: number; ymag: number; zmag: number;   // gauss
  absPressure: number;                         // hPa
  diffPressure: number;                        // hPa
  pressureAlt: number;                         // m
  temperature: number;                         // °C
}): Buffer {
  const p = Buffer.allocUnsafe(65);
  p.writeBigUInt64LE(params.timeUs, 0);
  p.writeFloatLE(params.xacc,        8);
  p.writeFloatLE(params.yacc,        12);
  p.writeFloatLE(params.zacc,        16);
  p.writeFloatLE(params.xgyro,       20);
  p.writeFloatLE(params.ygyro,       24);
  p.writeFloatLE(params.zgyro,       28);
  p.writeFloatLE(params.xmag,        32);
  p.writeFloatLE(params.ymag,        36);
  p.writeFloatLE(params.zmag,        40);
  p.writeFloatLE(params.absPressure, 44);
  p.writeFloatLE(params.diffPressure,48);
  p.writeFloatLE(params.pressureAlt, 52);
  p.writeFloatLE(params.temperature, 56);
  p.writeUInt32LE(0b1111111, 60);    // fields_updated: all sensors
  p.writeUInt8(0, 64);               // id (extension field, index 0)
  return buildPacket(107, p);
}

/**
 * HIL_GPS (msg 113) — simulated GPS.
 * Coordinates in integer degE7; velocities in cm/s.
 */
function encodeHILGPS(params: {
  timeUs:           bigint;
  lat:              number;  // degrees
  lon:              number;  // degrees
  altM:             number;  // metres MSL
  eph:              number;  // horizontal dilution (m)
  epv:              number;  // vertical dilution (m)
  velMs:            number;  // ground speed m/s
  vnMs: number; veMs: number; vdMs: number; // NED velocities m/s
  cogDeg:           number;  // course over ground degrees
  fixType:          number;  // 0=no fix, 3=3D
  satsVisible:      number;
}): Buffer {
  const p = Buffer.allocUnsafe(39);
  p.writeBigUInt64LE(params.timeUs, 0);
  p.writeInt32LE(Math.round(params.lat * 1e7), 8);
  p.writeInt32LE(Math.round(params.lon * 1e7), 12);
  p.writeInt32LE(Math.round(params.altM * 1000), 16);  // mm
  p.writeUInt16LE(Math.round(params.eph * 100), 20);   // cm
  p.writeUInt16LE(Math.round(params.epv * 100), 22);   // cm
  p.writeUInt16LE(Math.round(params.velMs * 100), 24); // cm/s
  p.writeInt16LE(Math.round(params.vnMs * 100), 26);   // cm/s
  p.writeInt16LE(Math.round(params.veMs * 100), 28);   // cm/s
  p.writeInt16LE(Math.round(params.vdMs * 100), 30);   // cm/s
  p.writeUInt16LE(Math.round((params.cogDeg * 100 + 36000) % 36000), 32); // cdeg
  p.writeUInt8(params.fixType, 34);
  p.writeUInt8(params.satsVisible, 35);
  p.writeUInt8(0, 36);                  // id (extension)
  p.writeUInt16LE(0, 37);              // yaw (extension, 0 = unknown)
  return buildPacket(113, p);
}

// ── Message Decoders ──────────────────────────────────────────────────────────

interface HILActuatorControls {
  timeUs:   bigint;
  controls: number[];  // [0..15] normalized [-1, 1]
  mode:     number;
}

function decodeHILActuatorControls(payload: Buffer): HILActuatorControls {
  const timeUs   = payload.readBigUInt64LE(0);
  // flags uint64 at offset 8 — skip
  const controls: number[] = [];
  for (let i = 0; i < 16; i++) {
    controls.push(payload.readFloatLE(16 + i * 4));
  }
  const mode = payload.readUInt8(80);
  return { timeUs, controls, mode };
}

// ── Origin for NED → lat/lon conversion ──────────────────────────────────────
// The HIL GPS message requires lat/lon. We fix an origin and compute offset.

const ORIGIN_LAT = 37.7749;  // San Francisco (default — override via config)
const ORIGIN_LON = -122.4194;
const EARTH_R    = 6371000;  // m

function nedToLatLon(north: number, east: number, lat0: number, lon0: number) {
  const lat = lat0 + (north / EARTH_R) * (180 / Math.PI);
  const lon = lon0 + (east  / (EARTH_R * Math.cos(lat0 * Math.PI / 180))) * (180 / Math.PI);
  return { lat, lon };
}

// ── Pressure-altitude conversion (ISA) ───────────────────────────────────────

function altitudeToPressure(altM: number): number {
  // Returns pressure in hPa (mb)
  const P0 = 1013.25;
  return P0 * Math.pow(1 - 0.0065 * altM / 288.15, 5.2561);
}

// ── HIL Bridge ────────────────────────────────────────────────────────────────

export class MAVLinkHILBridge {
  private socket:    dgram.Socket;
  private physics:   PhysicsEngine;
  private running  = false;
  private loopTimer: ReturnType<typeof setInterval> | null = null;

  // Track whether we've received at least one actuator packet
  private gotActuatorControls = false;
  private lastControls: number[] = new Array(16).fill(0);

  private statsPacketsSent = 0;
  private statsPacketsRcvd = 0;

  constructor(config?: Partial<PhysicsConfig>) {
    this.socket  = dgram.createSocket('udp4');
    this.physics = new PhysicsEngine();
    if (config) {
      Object.assign(this.physics.config, config);
    }
  }

  /** Start the HIL bridge. Binds UDP socket and begins simulation loop. */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.socket.bind(HIL_PORT_LISTEN, () => {
      console.log(`[HIL] Listening on UDP ${HIL_PORT_LISTEN} (actuator controls from FC)`);
      console.log(`[HIL] Sending sensor data to ${HIL_HOST}:${HIL_PORT_SEND}`);
    });

    this.socket.on('message', (msg) => {
      this.statsPacketsRcvd++;
      this.handleIncoming(msg);
    });

    this.socket.on('error', (err) => {
      console.error('[HIL] Socket error:', err.message);
    });

    this.physics.reset();

    // Heartbeat at 1 Hz
    setInterval(() => {
      this.send(encodeHeartbeat());
    }, 1000);

    // Sensor data at ~200 Hz (5 ms), physics at 16 ms (62.5 Hz)
    // We decouple: run physics at 62.5 Hz, send sensor data at 200 Hz
    // by interpolating sensor output (simpler: just run both at 62.5 Hz)
    this.loopTimer = setInterval(() => {
      this.step();
    }, 16); // 16 ms ≈ 62.5 Hz

    console.log('[HIL] Bridge started. Waiting for FC connection...');
    console.log('[HIL] PX4 SITL: make px4_sitl_default none_iris  (set SIM_MAVLINK_UDP_PX4=1)');
    console.log('[HIL] Real HW:   Set HIL_MODE=1 in QGroundControl, reboot autopilot');
  }

  /** Stop the bridge and close the socket. */
  stop(): void {
    this.running = false;
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.socket.close();
    console.log(`[HIL] Stopped. Sent: ${this.statsPacketsSent}, Rcvd: ${this.statsPacketsRcvd}`);
  }

  private step(): void {
    // Step physics with latest actuator commands from FC (or zero if none yet)
    const action = this.lastControls.slice(0, 6);
    const state  = this.physics.step(action);

    const timeUs = BigInt(Math.round(state.time * 1_000_000));

    // ── HIL_SENSOR ────────────────────────────────────────────────────────
    // Convert world-frame accelerations to body-frame specific force (accel - gravity)
    // The flight controller expects specific force: a_body - g_body
    const cp = Math.cos(state.phi);   const sp = Math.sin(state.phi);
    const ct = Math.cos(state.theta); const st = Math.sin(state.theta);

    // Gravity in body frame (NED: gravity is +z in world = [st, -sp*ct, -cp*ct] in body)
    const gx_body = -9.81 * st;
    const gy_body =  9.81 * sp * ct;
    const gz_body =  9.81 * cp * ct;

    // Body-frame accel = R^T · (world_accel) - g_body
    // For hover we approximate: specific force ≈ -g_body (accelerometer reads reaction)
    const sfx = gx_body;   // specific force X
    const sfy = gy_body;   // specific force Y
    const sfz = gz_body;   // specific force Z

    const altM = Math.max(0, state.z);
    const pres = altitudeToPressure(altM);

    this.send(encodeHILSensor({
      timeUs,
      xacc: sfx, yacc: sfy, zacc: sfz,
      xgyro: state.p, ygyro: state.q, zgyro: state.r,
      xmag: 0.2, ymag: 0.0, zmag: -0.45,  // nominal Earth field (gauss)
      absPressure:  pres,
      diffPressure: 0,
      pressureAlt:  altM,
      temperature:  15.0,
    }));

    // ── HIL_GPS (at 5 Hz — every ~3 physics steps) ────────────────────────
    if (Math.round(state.time * 62.5) % 12 === 0) {
      const { lat, lon } = nedToLatLon(state.x, state.y, ORIGIN_LAT, ORIGIN_LON);
      const groundSpeed  = Math.sqrt(state.x_dot ** 2 + state.y_dot ** 2);

      this.send(encodeHILGPS({
        timeUs,
        lat, lon, altM,
        eph: 1.5, epv: 2.5,
        velMs:  groundSpeed,
        vnMs:   state.x_dot,
        veMs:   state.y_dot,
        vdMs:  -state.z_dot,    // NED: down = positive
        cogDeg: Math.atan2(state.y_dot, state.x_dot) * 180 / Math.PI,
        fixType: 3,
        satsVisible: 14,
      }));
    }

    // Log status every 5 seconds
    if (Math.abs(state.time % 5) < 0.02) {
      const ctrl = this.gotActuatorControls ? '✓ FC connected' : '⏳ waiting for FC';
      console.log(
        `[HIL] t=${state.time.toFixed(1)}s | ` +
        `z=${state.z.toFixed(2)}m | ` +
        `roll=${(state.phi   * 180 / Math.PI).toFixed(1)}° | ` +
        `pitch=${(state.theta * 180 / Math.PI).toFixed(1)}° | ` +
        `${ctrl} | sent=${this.statsPacketsSent}`
      );
    }
  }

  private handleIncoming(buf: Buffer): void {
    const packet = parsePacket(buf);
    if (!packet) return;

    if (packet.msgId === 93) {
      // HIL_ACTUATOR_CONTROLS — the FC is driving our motors
      const msg = decodeHILActuatorControls(packet.payload);
      this.lastControls     = msg.controls;
      this.gotActuatorControls = true;
    }
    // HEARTBEAT from FC — could add connection monitoring here
  }

  private send(buf: Buffer): void {
    this.socket.send(buf, HIL_PORT_SEND, HIL_HOST, (err) => {
      if (err) console.error('[HIL] Send error:', err.message);
    });
    this.statsPacketsSent++;
  }

  /** Expose current physics state for external monitoring */
  getState() {
    return this.physics;
  }
}

// ── Standalone entry point ────────────────────────────────────────────────────

const isEntry = process.argv[1] && (
  process.argv[1].endsWith('mavlinkHILBridge.ts') || 
  process.argv[1].endsWith('mavlinkHILBridge.js')
);

if (isEntry) {
  console.log('[HIL] Starting MAVLink HIL Bridge...');
  const bridge = new MAVLinkHILBridge({
    droneType:      'bicopter',
    mass:           5.0,
    propDiameter:   15,
    batteryVoltage: 22.2,
    armLength:      0.5,
  });

  bridge.start();

  process.on('SIGINT', () => {
    console.log('\n[HIL] Shutting down…');
    bridge.stop();
    process.exit(0);
  });
}

export interface BaseTelemetry {
  worker_id: string;
  domain: 'diver' | 'miner';
  ts: number;
  hr: number;
  spo2: number;
  motion_g: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  triage_tier: 'green' | 'yellow' | 'red';
  battery_pct: number;
  comms_status: 'ok' | 'degraded' | 'lost';
}

export interface DiverTelemetry extends BaseTelemetry {
  domain: 'diver';
  depth_m: number;
  ascent_rate: number;
  dive_time_elapsed: number;
  n2_saturation_est: number;
  air_supply_pct: number;
}

export interface MinerTelemetry extends BaseTelemetry {
  domain: 'miner';
  co_ppm: number;
  ch4_pct: number;
  o2_pct: number;
  ambient_temp_c: number;
  seismic_reading: number;
  self_rescuer_status: 'stowed' | 'deployed';
}

export type TelemetryPacket = DiverTelemetry | MinerTelemetry;
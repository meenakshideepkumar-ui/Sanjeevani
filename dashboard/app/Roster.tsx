'use client';

import React from 'react';
import { Heart, Activity, Battery, AlertCircle } from 'lucide-react';
import { TelemetryPacket } from './types';

// Mock data to simulate active telemetry packets from server
const mockTelemetry: TelemetryPacket[] = [
  {
    worker_id: 'DIV-01 (Arjun)',
    domain: 'diver',
    ts: Date.now(),
    hr: 78,
    spo2: 98,
    motion_g: 1.02,
    pos_x: 11.8745,
    pos_y: 75.3704,
    pos_z: -14.2,
    triage_tier: 'green',
    battery_pct: 88,
    comms_status: 'ok',
    depth_m: 14.2,
    ascent_rate: 0.1,
    dive_time_elapsed: 1240,
    n2_saturation_est: 32,
    air_supply_pct: 74,
  },
  {
    worker_id: 'DIV-02 (Kavya)',
    domain: 'diver',
    ts: Date.now(),
    hr: 112,
    spo2: 94,
    motion_g: 2.4,
    pos_x: 11.8760,
    pos_y: 75.3720,
    pos_z: -28.5,
    triage_tier: 'yellow',
    battery_pct: 45,
    comms_status: 'degraded',
    depth_m: 28.5,
    ascent_rate: 0.8,
    dive_time_elapsed: 2100,
    n2_saturation_est: 68,
    air_supply_pct: 29,
  },
];

export default function Roster({ domain }: { domain: 'dive' | 'mine' }) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-1">
      {mockTelemetry.map((worker) => (
        <div
          key={worker.worker_id}
          className={`p-3 rounded-lg border text-xs flex flex-col gap-2 transition-all ${
            worker.triage_tier === 'green'
              ? 'bg-slate-900/80 border-emerald-500/30 hover:border-emerald-500/60'
              : 'bg-slate-900/80 border-amber-500/40 hover:border-amber-500/80'
          }`}
        >
          {/* Top Info Bar */}
          <div className="flex items-center justify-between font-semibold border-b border-slate-800 pb-2">
            <span className="text-slate-200">{worker.worker_id}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono ${
                worker.triage_tier === 'green'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {worker.triage_tier}
            </span>
          </div>

          {/* Vitals Grid */}
          <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono py-1">
            <div className="flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5 text-rose-400" />
              <span>{worker.hr} BPM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              <span>{worker.spo2}% SpO2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Battery className="h-3.5 w-3.5 text-emerald-400" />
              <span>{worker.battery_pct}% BAT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-sky-400" />
              <span>DEPTH: {(worker as any).depth_m}m</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
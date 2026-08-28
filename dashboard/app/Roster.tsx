'use client';

import React, { useEffect, useState } from 'react';
import { Heart, Activity, Battery, AlertCircle } from 'lucide-react';
import { TelemetryPacket } from './types';
import { getSocket } from './socket-client';

// Fallback initial data
const initialData: TelemetryPacket[] = [
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
];

export default function Roster({ domain }: { domain: 'dive' | 'mine' }) {
  const [telemetryList, setTelemetryList] = useState<TelemetryPacket[]>(initialData);

  useEffect(() => {
    const socket = getSocket();

    socket.on('telemetry_update', (data: TelemetryPacket) => {
      setTelemetryList((prev) => {
        const index = prev.findIndex((item) => item.worker_id === data.worker_id);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = data;
          return updated;
        }
        return [...prev, data];
      });
    });

    return () => {
      socket.off('telemetry_update');
    };
  }, []);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-1">
      {telemetryList.map((worker) => (
        <div
          key={worker.worker_id}
          className={`p-3 rounded-lg border text-xs flex flex-col gap-2 transition-all ${
            worker.triage_tier === 'green'
              ? 'bg-slate-900/80 border-emerald-500/30'
              : 'bg-slate-900/80 border-amber-500/40'
          }`}
        >
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
              <span>DEPTH: {(worker as any).depth_m ?? 0}m</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
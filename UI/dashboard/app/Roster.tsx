'use client';

import React from 'react';
import { Heart, Activity, Battery, AlertCircle } from 'lucide-react';
import { TelemetryPacket } from './types';

interface RosterProps {
  domain: 'dive' | 'mine';
  telemetryList?: TelemetryPacket[];
}

export default function Roster({ domain, telemetryList = [] }: RosterProps) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-1">
      {telemetryList.map((worker) => (
        <div
          key={worker.worker_id}
          className={`p-3 rounded-lg border text-xs flex flex-col gap-2 transition-all ${
            worker.triage_tier === 'red'
              ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-900/20'
              : worker.triage_tier === 'yellow'
              ? 'bg-amber-950/40 border-amber-500/50'
              : 'bg-slate-900/80 border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between font-semibold border-b border-slate-800 pb-2">
            <span className="text-slate-200">{worker.worker_id}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-mono ${
                worker.triage_tier === 'red'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse'
                  : worker.triage_tier === 'yellow'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {worker.triage_tier}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-slate-400 font-mono py-1">
            <div className="flex items-center gap-1.5">
              <Heart className={`h-3.5 w-3.5 ${worker.hr > 100 ? 'text-rose-500 animate-ping' : 'text-rose-400'}`} />
              <span className={worker.hr > 100 ? 'text-rose-400 font-bold' : ''}>{worker.hr} BPM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className={`h-3.5 w-3.5 ${worker.spo2 < 95 ? 'text-rose-500' : 'text-cyan-400'}`} />
              <span className={worker.spo2 < 95 ? 'text-rose-400 font-bold' : ''}>{worker.spo2}% SpO2</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Battery className="h-3.5 w-3.5 text-emerald-400" />
              <span>{worker.battery_pct}% BAT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-sky-400" />
              <span>{domain === 'dive' ? 'DEPTH' : 'SHAFT'}: {(worker as any).depth_m ?? 0}m</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { TelemetryPacket } from './types';

interface AlertBannerProps {
  telemetry: TelemetryPacket[];
}

export default function AlertBanner({ telemetry }: AlertBannerProps) {
  // Filter for high-risk workers
  const activeAlerts = telemetry.filter(
    (worker) =>
      worker.triage_tier === 'red' ||
      worker.triage_tier === 'yellow' ||
      worker.hr > 100 ||
      worker.spo2 < 95
  );

  if (activeAlerts.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {activeAlerts.map((alert) => (
        <div
          key={alert.worker_id}
          className={`flex items-center justify-between p-3 rounded-lg border text-xs font-semibold ${
            alert.triage_tier === 'red' || alert.hr > 110
              ? 'bg-rose-950/60 border-rose-500/50 text-rose-200 animate-pulse'
              : 'bg-amber-950/60 border-amber-500/50 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <span>
              <strong>ALERT [{alert.worker_id}]:</strong> Vitals deviation detected (HR: {alert.hr} BPM | SpO2: {alert.spo2}%)
            </span>
          </div>
          <button
            onClick={() => alert(`Dispatching assistance protocol to ${alert.worker_id}`)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-700 hover:bg-slate-800 rounded text-[10px] text-white transition-colors"
          >
            Acknowledge
          </button>
        </div>
      ))}
    </div>
  );
}
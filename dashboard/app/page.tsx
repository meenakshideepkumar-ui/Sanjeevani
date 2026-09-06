'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Roster from './Roster';
import VitalsChart from './VitalsChart';
import AlertBanner from './AlertBanner';
import { TelemetryPacket } from './types';
import { getSocket } from './socket-client';
import { Waves, Pickaxe, Shield, Radio } from 'lucide-react';

const AcousticMap = dynamic(() => import('./AcousticMap'), {
  ssr: false,
});

const initialDiveData: TelemetryPacket[] = [
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

const initialMineData: TelemetryPacket[] = [
  {
    worker_id: 'MINE-01 (Rahul)',
    domain: 'miner',
    ts: Date.now(),
    hr: 85,
    spo2: 97,
    motion_g: 0.88,
    pos_x: 11.8820,
    pos_y: 75.3850,
    pos_z: -120.0,
    triage_tier: 'green',
    battery_pct: 92,
    comms_status: 'ok',
    depth_m: 120.0,
    ascent_rate: 0.0,
    dive_time_elapsed: 3600,
    n2_saturation_est: 0,
    air_supply_pct: 100,
  },
];

export default function Dashboard() {
  const [domain, setDomain] = useState<'dive' | 'mine'>('dive');
  const [telemetryList, setTelemetryList] = useState<TelemetryPacket[]>(initialDiveData);

  useEffect(() => {
    setTelemetryList(domain === 'dive' ? initialDiveData : initialMineData);
  }, [domain]);

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

  const triggerTestAlert = () => {
    setTelemetryList((prev) =>
      prev.map((item) => ({
        ...item,
        hr: 128,
        spo2: 91,
        triage_tier: 'red',
      }))
    );
  };

  const resetAlerts = () => {
    setTelemetryList(domain === 'dive' ? initialDiveData : initialMineData);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-6 flex flex-col gap-6">
      {/* Top Bar */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <Shield className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-slate-100 flex items-center gap-2">
              SANJEEVANI
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-normal">
                v1.0
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Unified Diver & Miner Safety Monitoring Platform
            </p>
          </div>
        </div>

        {/* Controls: Domain Switcher & Test Alert Trigger */}
        <div className="flex items-center gap-3">
          <button
            onClick={triggerTestAlert}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-all"
          >
            <Radio className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
            Simulate Alert
          </button>
          
          <button
            onClick={resetAlerts}
            className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition-all"
          >
            Reset
          </button>

          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1">
            <button
              onClick={() => setDomain('dive')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                domain === 'dive'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Waves className="h-3.5 w-3.5" />
              Dive Ops
            </button>
            <button
              onClick={() => setDomain('mine')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                domain === 'mine'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Pickaxe className="h-3.5 w-3.5" />
              Mine Ops
            </button>
          </div>
        </div>
      </header>

      {/* Dynamic Emergency Alert Banner */}
      <AlertBanner telemetry={telemetryList} />

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1">
        {/* Left Column: Personnel Roster */}
        <div className="lg:col-span-1 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Active {domain === 'dive' ? 'Divers' : 'Miners'} Roster
            </h2>
          </div>
          <Roster domain={domain} telemetryList={telemetryList} />
          <VitalsChart />
        </div>

        {/* Right Column: Live Map View */}
        <div className="lg:col-span-3 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 min-h-[450px]">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {domain === 'dive' ? 'Acoustic / Underwater Positioning View' : 'Underground Mine Level View'}
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">
              LAT/LON TRACKING: ACTIVE
            </span>
          </div>
          <div className="flex-1 rounded-lg overflow-hidden border border-slate-800/60 min-h-[400px]">
            <AcousticMap domain={domain} />
          </div>
        </div>
      </div>
    </div>
  );
}
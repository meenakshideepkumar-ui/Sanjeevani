'use client';

import React, { useState } from 'react';
import { Shield, Activity, Waves, Pickaxe, Radio, AlertTriangle } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'dive' | 'mine'>('dive');

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation & Status Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4 flex items-center justify-between backdrop-blur">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-emerald-400" />
          <div>
            <h1 className="text-xl font-bold tracking-wide text-white">
              SANJEEVANI <span className="text-xs text-slate-400 font-normal">v1.0</span>
            </h1>
            <p className="text-xs text-slate-400">Unified Diver & Miner Safety Platform</p>
          </div>
        </div>

        {/* Domain View Switcher */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setActiveTab('dive')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'dive'
                ? 'bg-cyan-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Waves className="h-4 w-4" />
            Dive Ops
          </button>
          <button
            onClick={() => setActiveTab('mine')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'mine'
                ? 'bg-amber-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Pickaxe className="h-4 w-4" />
            Mine Ops
          </button>
        </div>

        {/* Global Connection Badges */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-slate-800/60 px-3 py-1.5 rounded-full border border-slate-700">
            <Radio className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
            <span className="text-slate-300">SERVER: CONNECTED</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <div className="flex-1 p-6 grid grid-cols-12 gap-6">
        {/* Left Control & Roster Panel */}
        <aside className="col-span-3 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            Active {activeTab === 'dive' ? 'Divers' : 'Miners'} Roster
          </h2>
          <div className="flex-1 border border-dashed border-slate-800 rounded-lg flex items-center justify-center p-4 text-center">
            <p className="text-xs text-slate-500">
              Waiting for telemetry packets from server...
            </p>
          </div>
        </aside>

        {/* Main Map / Operations Display */}
        <section className="col-span-9 bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              {activeTab === 'dive' ? 'Underwater Acoustic Map View' : 'Underground Mine Level View'}
            </h2>
            <span className="text-xs text-slate-500 font-mono">GRID: 2D-SIM</span>
          </div>

          <div className="flex-1 my-4 border border-dashed border-slate-800 rounded-lg bg-slate-950/40 flex items-center justify-center min-h-[350px]">
            <p className="text-slate-500 text-sm">
              Map Component Placeholder ({activeTab === 'dive' ? 'Depth & Positioning' : 'Tunnel & Level Grid'})
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
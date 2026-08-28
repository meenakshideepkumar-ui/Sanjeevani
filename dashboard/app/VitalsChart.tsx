'use client';

import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const mockChartData = [
  { time: '10:00', hr: 72, spo2: 99 },
  { time: '10:05', hr: 75, spo2: 98 },
  { time: '10:10', hr: 78, spo2: 98 },
  { time: '10:15', hr: 84, spo2: 96 },
  { time: '10:20', hr: 110, spo2: 93 },
  { time: '10:25', hr: 128, spo2: 91 },
];

export default function VitalsChart() {
  return (
    <div className="w-full h-48 bg-slate-900/60 border border-slate-800 rounded-lg p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        Vitals Trend (HR / SpO2)
      </h3>
      <ResponsiveContainer width="100%" height="80%">
        <LineChart data={mockChartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" stroke="#94a3b8" fontSize={10} />
          <YAxis stroke="#94a3b8" fontSize={10} domain={[60, 140]} />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
          />
          <Line type="monotone" dataKey="hr" stroke="#f43f5e" strokeWidth={2} name="HR (BPM)" dot={false} />
          <Line type="monotone" dataKey="spo2" stroke="#06b6d4" strokeWidth={2} name="SpO2 (%)" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
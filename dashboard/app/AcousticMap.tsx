'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function AcousticMap({ domain }: { domain: 'dive' | 'mine' }) {
  const [isMounted, setIsMounted] = useState(false);

  // Position switches based on Dive or Mine mode
  const position: [number, number] = domain === 'dive' 
    ? [11.8745, 75.3704] // Kannur Coast (Dive Ops)
    : [11.8820, 75.3850]; // Inland Mine Sector (Mine Ops)

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div className="w-full h-full min-h-[400px] rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 text-xs">
        Loading Operational Map...
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[400px] rounded-lg overflow-hidden border border-slate-800">
      <MapContainer
        key={domain} // Re-renders cleanly when switching tabs
        center={position}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position} icon={customIcon}>
          <Popup>
            <div className="text-slate-900 font-sans">
              <strong>{domain === 'dive' ? 'Diver Node #1 (Coastal)' : 'Miner Node #1 (Shaft A)'}</strong>
              <br />
              Status: Operational
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
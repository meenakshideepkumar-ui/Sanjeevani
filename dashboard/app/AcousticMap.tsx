'use client';

import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix missing default icon issue in Leaflet
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

export default function AcousticMap({ domain }: { domain: 'dive' | 'mine' }) {
  // Default coordinate center (offshore / operational site)
  const position: [number, number] = [11.8745, 75.3704];

  return (
    <div className="w-full h-full min-h-[400px] rounded-lg overflow-hidden border border-slate-800">
      <MapContainer
        center={position}
        zoom={13}
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
              <strong>{domain === 'dive' ? 'Diver Node #1' : 'Miner Node #1'}</strong>
              <br />
              Status: Operational
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
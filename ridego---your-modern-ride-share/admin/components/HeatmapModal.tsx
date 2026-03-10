import React, { useEffect, useState, useRef, useCallback } from 'react';

interface HeatPoint { lat: number; lng: number; intensity: number; }
interface RegionInfo { name: string; lat: number; lng: number; rides: number; drivers: number; deficit: number; heatLevel: string; }
interface HeatmapData { riders: HeatPoint[]; drivers: HeatPoint[]; regions: RegionInfo[]; updatedAt: string; }
interface HeatmapModalProps { isOpen: boolean; onClose: () => void; }

const MAPBOX_TOKEN = (window as any).MAPBOX_TOKEN as string;
const MAP_CENTER: [number, number] = [78.9629, 20.5937];

const HeatmapModal: React.FC<HeatmapModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<'riders' | 'drivers' | 'both'>('both');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const regionMarkersRef = useRef<any[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/heatmap/points');
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Heatmap fetch error:', err); }
    finally { setLoading(false); }
  }, []);

  // Build GeoJSON from heat points
  const toGeoJSON = (points: HeatPoint[]) => ({
    type: 'FeatureCollection' as const,
    features: points.map(p => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { intensity: p.intensity },
    })),
  });

  // Update/add heatmap sources and layers
  const updateLayers = useCallback((map: any) => {
    if (!data || !map) return;

    // Riders source
    const ridersGeo = toGeoJSON(layer !== 'drivers' ? data.riders : []);
    if (map.getSource('riders-src')) {
      map.getSource('riders-src').setData(ridersGeo);
    } else {
      map.addSource('riders-src', { type: 'geojson', data: ridersGeo });
      map.addLayer({
        id: 'riders-heat',
        type: 'heatmap',
        source: 'riders-src',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.15, 'rgba(255,150,170,0.5)',
            0.35, 'rgba(255,100,120,0.7)', 0.55, 'rgba(255,60,80,0.85)',
            0.75, 'rgba(240,30,50,0.95)', 1, '#FF1744'],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 25, 8, 60],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 8, 3],
          'heatmap-opacity': 0.95,
        },
      });
    }

    // Drivers source
    const driversGeo = toGeoJSON(layer !== 'riders' ? data.drivers : []);
    if (map.getSource('drivers-src')) {
      map.getSource('drivers-src').setData(driversGeo);
    } else {
      map.addSource('drivers-src', { type: 'geojson', data: driversGeo });
      map.addLayer({
        id: 'drivers-heat',
        type: 'heatmap',
        source: 'drivers-src',
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)', 0.15, 'rgba(80,230,255,0.5)',
            0.35, 'rgba(40,210,240,0.7)', 0.55, 'rgba(10,190,220,0.85)',
            0.75, 'rgba(0,170,200,0.95)', 1, '#00BCD4'],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 3, 22, 8, 55],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 1.0, 8, 2.5],
          'heatmap-opacity': 0.95,
        },
      });
    }

    // Region labels — clear old and re-add
    const mapboxgl = (window as any).mapboxgl;
    regionMarkersRef.current.forEach(m => m.remove());
    regionMarkersRef.current = [];
    const levelColors: Record<string, string> = { critical: '#FB7185', high: '#F97316', medium: '#FDE047', low: '#4ADE80' };
    data.regions.forEach(r => {
      const bgColor = levelColors[r.heatLevel] || levelColors.low;
      const el = document.createElement('div');
      el.innerHTML = `<div style="background:${bgColor};color:#000;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:800;white-space:nowrap;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);">${r.name || 'Zone'}</div>`;
      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false, className: 'mapbox-dark-popup' }).setHTML(
        `<div style="font-family:Inter,sans-serif;background:#121214;border:1px solid #333;border-radius:12px;padding:10px;min-width:140px;">
          <p style="font-weight:800;font-size:13px;color:#fff;margin:0 0 6px;">${r.name || 'Zone'}</p>
          <p style="font-size:11px;color:#a1a1aa;margin:2px 0;">Rides: <b style="color:#fff">${r.rides ?? 0}</b></p>
          <p style="font-size:11px;color:#a1a1aa;margin:2px 0;">Drivers: <b style="color:#fff">${r.drivers ?? 0}</b></p>
          <p style="font-size:11px;color:#a1a1aa;margin:2px 0;">Deficit: <b style="color:${r.deficit > 0 ? '#FB7185' : '#4ADE80'}">${r.deficit > 0 ? '+' : ''}${r.deficit ?? 0}</b></p>
          <p style="font-size:9px;text-transform:uppercase;font-weight:800;color:${bgColor};margin:6px 0 0;">${r.heatLevel || 'low'}</p>
        </div>`
      );
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(map);
      regionMarkersRef.current.push(marker);
    });
  }, [data, layer]);

  // Init Mapbox map
  useEffect(() => {
    if (!isOpen || !mapRef.current) return;
    const initMap = () => {
      const mapboxgl = (window as any).mapboxgl;
      if (!mapboxgl) { setTimeout(initMap, 300); return; }
      if (!mapRef.current) return;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: MAP_CENTER,
        zoom: 4.5,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapInstance.current = map;
      map.on('load', () => { if (data) updateLayers(map); });
    };
    setTimeout(initMap, 100);
    return () => {
      regionMarkersRef.current.forEach(m => m.remove());
      regionMarkersRef.current = [];
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [isOpen]);

  // Re-render layers when data or layer filter changes
  useEffect(() => {
    if (mapInstance.current && data) updateLayers(mapInstance.current);
  }, [data, layer, updateLayers]);

  useEffect(() => {
    if (isOpen) { fetchData(); intervalRef.current = setInterval(fetchData, 60000); }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  const totalRiders = data?.riders.length || 0;
  const totalDrivers = data?.drivers.length || 0;
  const criticalZones = data?.regions.filter(r => r.heatLevel === 'critical' || r.heatLevel === 'high').length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-black w-full h-full shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#121214] border-b border-[#222224] p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-icons text-lg text-accent-purple">satellite_alt</span>Live Demand Heatmap
              </h2>
              <p className="text-[10px] text-zinc-500 mt-0.5">Mapbox GL — GPU-accelerated · Updates every 60s</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 flex items-center justify-center transition-colors">
              <span className="material-icons text-white text-sm">close</span>
            </button>
          </div>
        </div>

        {/* Layer Toggle */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-[#121214] border-b border-[#222224] flex-shrink-0">
          <div className="flex bg-zinc-900 rounded-full p-1 border border-zinc-800">
            {[{ key: 'both', label: 'All' }, { key: 'riders', label: 'Riders' }, { key: 'drivers', label: 'Drivers' }].map(opt => (
              <button key={opt.key} onClick={() => setLayer(opt.key as any)}
                className={`px-3 py-1 rounded-full text-[10px] font-semibold transition-all ${layer === opt.key ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-rose"></span><span className="text-zinc-400">{totalRiders} riders</span></span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent-cyan"></span><span className="text-zinc-400">{totalDrivers} drivers</span></span>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80">
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-zinc-500">Loading heatmap data...</span>
              </div>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {/* Bottom Stats */}
        <div className="p-3 bg-[#121214] border-t border-[#222224] flex-shrink-0">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Zones', value: data?.regions.length || 0, color: 'text-white' },
              { label: 'Critical', value: criticalZones, color: criticalZones > 0 ? 'text-accent-rose' : 'text-accent-green' },
              { label: 'Riders', value: totalRiders, color: 'text-accent-rose' },
              { label: 'Drivers', value: totalDrivers, color: 'text-accent-cyan' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-zinc-500 font-semibold uppercase">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-zinc-800">
            {[{ level: 'Low', color: 'bg-accent-green' }, { level: 'Medium', color: 'bg-accent-yellow' }, { level: 'High', color: 'bg-orange-500' }, { level: 'Critical', color: 'bg-accent-rose' }].map(item => (
              <div key={item.level} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-full ${item.color}`}></div>
                <span className="text-[9px] font-semibold text-zinc-500">{item.level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatmapModal;


import React, { useEffect, useState, useRef, useCallback } from 'react';

interface HeatPoint {
  lat: number;
  lng: number;
  intensity: number;
}

interface RegionInfo {
  name: string;
  lat: number;
  lng: number;
  rides: number;
  drivers: number;
  deficit: number;
  heatLevel: string;
}

interface HeatmapData {
  riders: HeatPoint[];
  drivers: HeatPoint[];
  regions: RegionInfo[];
  updatedAt: string;
}

interface HeatmapModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const OLA_API_KEY = 'rFyGaGJyBi01CoHCBwHolFwt9XzPRG6DpoqsytwU';
const COIMBATORE = { lat: 11.0168, lng: 76.9558 };

const HeatmapModal: React.FC<HeatmapModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [layer, setLayer] = useState<'riders' | 'drivers' | 'both'>('both');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/heatmap/points');
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (err) {
      console.error('Heatmap fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear all existing markers from map
  const clearMarkers = useCallback(() => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
  }, []);

  // Render heatmap circles on map
  const renderHeatPoints = useCallback((map: any) => {
    if (!data || !map) return;
    clearMarkers();

    const maplibregl = (window as any).maplibregl;
    if (!maplibregl) return;

    // Rider heatmap points (red/orange circles)
    if (layer === 'riders' || layer === 'both') {
      data.riders.forEach(p => {
        const el = document.createElement('div');
        const size = 8 + p.intensity * 14;
        const opacity = 0.25 + p.intensity * 0.45;
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:rgba(239,68,68,${opacity});border:1px solid rgba(239,68,68,${opacity + 0.15});box-shadow:0 0 ${size * 0.8}px rgba(239,68,68,${opacity * 0.7});pointer-events:none;`;
        const marker = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
        markersRef.current.push(marker);
      });
    }

    // Driver points (blue circles)
    if (layer === 'drivers' || layer === 'both') {
      data.drivers.forEach(p => {
        const el = document.createElement('div');
        const size = 7 + p.intensity * 10;
        const opacity = 0.3 + p.intensity * 0.4;
        el.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:rgba(59,130,246,${opacity});border:1px solid rgba(59,130,246,${opacity + 0.15});box-shadow:0 0 ${size * 0.6}px rgba(59,130,246,${opacity * 0.5});pointer-events:none;`;
        const marker = new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
        markersRef.current.push(marker);
      });
    }

    // Region labels
    data.regions.forEach(r => {
      const colors: Record<string, string> = { critical: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#22C55E' };
      const bgColor = colors[r.heatLevel] || colors.low;

      const el = document.createElement('div');
      el.innerHTML = `
        <div style="background:${bgColor};color:#fff;padding:3px 8px;border-radius:8px;font-size:10px;font-weight:800;white-space:nowrap;box-shadow:0 2px 8px ${bgColor}60;font-family:Inter,sans-serif;text-align:center;line-height:1.3;">
          ${r.name}<br/>
          <span style="font-size:9px;opacity:0.9;">${r.rides} rides · ${r.drivers} 🚗</span>
        </div>
      `;
      el.style.cssText = 'pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,.3));';
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lng, r.lat]).addTo(map);
      markersRef.current.push(marker);
    });
  }, [data, layer, clearMarkers]);

  // Initialize map when modal opens
  useEffect(() => {
    if (!isOpen || !mapRef.current) return;

    const initMap = () => {
      const maplibregl = (window as any).maplibregl;
      if (!maplibregl || !mapRef.current) return;

      // Clean up existing map
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }

      const map = new maplibregl.Map({
        container: mapRef.current!,
        style: `https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json`,
        center: [COIMBATORE.lng, COIMBATORE.lat],
        zoom: 12.5,
        transformRequest: (url: string) => {
          if (url.includes('olamaps.io')) {
            const separator = url.includes('?') ? '&' : '?';
            return { url: `${url}${separator}api_key=${OLA_API_KEY}` };
          }
          return { url };
        },
      });

      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      mapInstance.current = map;

      map.on('load', () => {
        renderHeatPoints(map);
      });
    };

    // Load maplibre-gl if not already loaded
    if (!(window as any).maplibregl) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.5.0/dist/maplibre-gl.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@4.5.0/dist/maplibre-gl.js';
      script.onload = () => setTimeout(initMap, 100);
      document.head.appendChild(script);
    } else {
      setTimeout(initMap, 50);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [isOpen]);

  // Update markers when data or layer changes
  useEffect(() => {
    if (mapInstance.current && data) {
      renderHeatPoints(mapInstance.current);
    }
  }, [data, layer, renderHeatPoints]);

  // Fetch data & set up auto-refresh
  useEffect(() => {
    if (isOpen) {
      fetchData();
      intervalRef.current = setInterval(fetchData, 60000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  const totalRiders = data?.riders.length || 0;
  const totalDrivers = data?.drivers.length || 0;
  const criticalZones = data?.regions.filter(r => r.heatLevel === 'critical' || r.heatLevel === 'high').length || 0;

  return (
    <div className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in ${expanded ? '' : ''}`} onClick={onClose}>
      <div
        className={`bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden animate-slide-up transition-all duration-500 ease-out ${
          expanded
            ? 'w-full h-full rounded-none'
            : 'w-[95%] max-w-[420px] rounded-t-3xl'
        }`}
        style={{ maxHeight: expanded ? '100vh' : '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-leaf-500 to-emerald-600 p-4 relative overflow-hidden flex-shrink-0">
          <div className="absolute -right-10 -top-10 size-32 rounded-full bg-white/10"></div>
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span className="material-icons text-xl">satellite_alt</span>
                Live Demand Heatmap
              </h2>
              <p className="text-[10px] font-semibold text-white/70 mt-0.5">OLA Maps · Coimbatore · Updates every 60s</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                className="size-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
                title={expanded ? 'Collapse' : 'Expand'}
              >
                <span className="material-icons text-white text-sm">{expanded ? 'fullscreen_exit' : 'fullscreen'}</span>
              </button>
              <button onClick={onClose} className="size-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
                <span className="material-icons text-white text-sm">close</span>
              </button>
            </div>
          </div>
        </div>

        {/* Layer Toggle Bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-100 dark:border-zinc-800 flex-shrink-0">
          <div className="flex bg-white dark:bg-zinc-800 rounded-lg p-0.5 border border-gray-200 dark:border-zinc-700">
            {[
              { key: 'both', label: 'All', icon: 'layers' },
              { key: 'riders', label: 'Riders', icon: 'person_pin_circle' },
              { key: 'drivers', label: 'Drivers', icon: 'local_taxi' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setLayer(opt.key as any)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                  layer === opt.key
                    ? 'bg-leaf-500 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                }`}
              >
                <span className="material-icons" style={{ fontSize: '12px' }}>{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-3 text-[10px] font-bold">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-red-500"></span>
              <span className="text-gray-500 dark:text-gray-400">{totalRiders} riders</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-blue-500"></span>
              <span className="text-gray-500 dark:text-gray-400">{totalDrivers} drivers</span>
            </span>
          </div>
        </div>

        {/* Map Container */}
        <div className="relative" style={{ height: expanded ? 'calc(100vh - 180px)' : '340px' }}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-zinc-900/80">
              <div className="flex flex-col items-center gap-2">
                <div className="size-10 border-4 border-leaf-500/20 border-t-leaf-500 rounded-full animate-spin"></div>
                <span className="text-xs font-bold text-gray-500">Loading map data...</span>
              </div>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {/* Bottom Stats Bar */}
        <div className="p-3 bg-gray-50 dark:bg-zinc-800/50 border-t border-gray-100 dark:border-zinc-800 flex-shrink-0">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Zones', value: data?.regions.length || 8, color: 'text-gray-900 dark:text-white' },
              { label: 'Critical', value: criticalZones, color: criticalZones > 0 ? 'text-red-600' : 'text-leaf-600' },
              { label: 'Riders', value: totalRiders, color: 'text-red-500' },
              { label: 'Drivers', value: totalDrivers, color: 'text-blue-500' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className={`text-sm font-black ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-gray-400 font-bold uppercase">{s.label}</p>
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-gray-200 dark:border-zinc-700">
            {[
              { level: 'Low', color: 'bg-emerald-500' },
              { level: 'Medium', color: 'bg-yellow-500' },
              { level: 'High', color: 'bg-orange-500' },
              { level: 'Critical', color: 'bg-red-500' },
            ].map(item => (
              <div key={item.level} className="flex items-center gap-1">
                <div className={`size-2.5 rounded-full ${item.color}`}></div>
                <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400">{item.level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatmapModal;

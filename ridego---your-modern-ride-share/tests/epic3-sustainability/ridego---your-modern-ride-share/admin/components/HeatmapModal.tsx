import React, { useEffect, useState, useRef, useCallback } from 'react';

interface HeatPoint { lat: number; lng: number; intensity: number; }
interface RegionInfo { name: string; lat: number; lng: number; rides: number; drivers: number; deficit: number; heatLevel: string; }
interface HeatmapData { riders: HeatPoint[]; drivers: HeatPoint[]; regions: RegionInfo[]; updatedAt: string; }
interface HeatmapModalProps { isOpen: boolean; onClose: () => void; }

const OLA_API_KEY = (import.meta.env.VITE_OLA_MAPS_API_KEY as string) || '';
const MAP_CENTER = { lat: 20.5937, lng: 78.9629 };

const HeatmapModal: React.FC<HeatmapModalProps> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [layer, setLayer] = useState<'riders' | 'drivers' | 'both'>('both');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/heatmap/points');
      if (res.ok) setData(await res.json());
    } catch (err) { console.error('Heatmap fetch error:', err); }
    finally { setLoading(false); }
  }, []);

  const clearMarkers = useCallback(() => { markersRef.current.forEach(m => m.remove()); markersRef.current = []; }, []);

  const renderHeatPoints = useCallback((map: any) => {
    if (!data || !map) return;
    clearMarkers();
    const maplibregl = (window as any).maplibregl;
    if (!maplibregl) return;

    // Rider blobs — red radial gradient circles (sized for India-wide zoom)
    if (layer === 'riders' || layer === 'both') {
      data.riders.forEach(p => {
        const blobSize = 15 + p.intensity * 25;
        const el = document.createElement('div');
        el.style.cssText = 'width:' + blobSize + 'px;height:' + blobSize + 'px;border-radius:50%;background:radial-gradient(circle,rgba(220,38,38,' + (0.3 + p.intensity * 0.45) + ') 0%,rgba(220,38,38,' + (0.1 + p.intensity * 0.15) + ') 50%,rgba(220,38,38,0) 100%);pointer-events:none;filter:blur(1px);';
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
        markersRef.current.push(marker);
      });
    }

    // Driver blobs — blue radial gradient circles (sized for India-wide zoom)
    if (layer === 'drivers' || layer === 'both') {
      data.drivers.forEach(p => {
        const blobSize = 12 + p.intensity * 23;
        const el = document.createElement('div');
        el.style.cssText = 'width:' + blobSize + 'px;height:' + blobSize + 'px;border-radius:50%;background:radial-gradient(circle,rgba(37,99,235,' + (0.3 + p.intensity * 0.4) + ') 0%,rgba(37,99,235,' + (0.1 + p.intensity * 0.12) + ') 50%,rgba(37,99,235,0) 100%);pointer-events:none;filter:blur(1px);';
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
        markersRef.current.push(marker);
      });
    }

    // Region labels — clickable with popup
    data.regions.forEach(r => {
      const colors: Record<string, string> = { critical: '#DC2626', high: '#EA580C', medium: '#D97706', low: '#059669' };
      const bgColor = colors[r.heatLevel] || colors.low;
      const el = document.createElement('div');
      el.innerHTML = '<div style="background:' + bgColor + ';color:#fff;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.15);font-family:Inter,system-ui,sans-serif;text-align:center;line-height:1.3;cursor:pointer;">' + (r.name || 'Unknown') + '</div>';
      el.style.cssText = 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.2));';
      const popup = new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(
        '<div style="font-family:Inter,system-ui,sans-serif;padding:6px;">' +
        '<p style="font-weight:700;font-size:13px;margin:0 0 6px;">' + (r.name || 'Unknown') + '</p>' +
        '<p style="font-size:11px;margin:2px 0;">Rides: <b>' + (r.rides ?? 0) + '</b></p>' +
        '<p style="font-size:11px;margin:2px 0;">Drivers: <b>' + (r.drivers ?? 0) + '</b></p>' +
        '<p style="font-size:11px;margin:2px 0;">Deficit: <b style="color:' + (r.deficit > 0 ? '#DC2626' : '#059669') + '">' + (r.deficit ?? 0) + '</b></p>' +
        '<p style="font-size:10px;margin:5px 0 0;text-transform:uppercase;font-weight:700;color:' + bgColor + '">' + (r.heatLevel || 'low') + '</p></div>'
      );
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);
    });
  }, [data, layer, clearMarkers]);

  useEffect(() => {
    if (!isOpen || !mapRef.current) return;
    const initMap = () => {
      const maplibregl = (window as any).maplibregl;
      if (!maplibregl) { setTimeout(initMap, 300); return; }
      if (!mapRef.current) return;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
      const isDark = document.documentElement.classList.contains('dark');
      const mapStyle = isDark
        ? 'https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json'
        : 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json';
      const map = new maplibregl.Map({
        container: mapRef.current!,
        style: mapStyle,
        center: [MAP_CENTER.lng, MAP_CENTER.lat],
        zoom: 4.5,
        transformRequest: (url: string) => {
          if (url.includes('olamaps.io')) { const sep = url.includes('?') ? '&' : '?'; return { url: `${url}${sep}api_key=${OLA_API_KEY}` }; }
          return { url };
        },
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      mapInstance.current = map;
      map.on('load', () => renderHeatPoints(map));
      map.on('error', (e: any) => {
        if (e.error?.message?.includes('Source layer') || e.error?.message?.includes('does not exist')) return;
      });
    };
    setTimeout(initMap, 100);
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [isOpen]);

  useEffect(() => { if (mapInstance.current && data) renderHeatPoints(mapInstance.current); }, [data, layer, renderHeatPoints]);

  useEffect(() => {
    if (isOpen) { fetchData(); intervalRef.current = setInterval(fetchData, 60000); }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isOpen, fetchData]);

  if (!isOpen) return null;

  const totalRiders = data?.riders.length || 0;
  const totalDrivers = data?.drivers.length || 0;
  const criticalZones = data?.regions.filter(r => r.heatLevel === 'critical' || r.heatLevel === 'high').length || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-black w-full h-full shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gray-900 dark:bg-zinc-950 p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-icons text-lg">satellite_alt</span>Live Demand Heatmap
              </h2>
              <p className="text-[10px] text-gray-400 mt-0.5">OLA Maps - Updates every 60s</p>
            </div>
            <button onClick={onClose} className="size-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
              <span className="material-icons text-white text-sm">close</span>
            </button>
          </div>
        </div>

        {/* Layer Toggle */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 dark:bg-zinc-950/50 border-b border-gray-200 dark:border-zinc-900 flex-shrink-0">
          <div className="flex bg-white dark:bg-black rounded-lg p-0.5 border border-gray-200 dark:border-zinc-900">
            {[{ key: 'both', label: 'All', icon: 'layers' }, { key: 'riders', label: 'Riders', icon: 'person_pin_circle' }, { key: 'drivers', label: 'Drivers', icon: 'local_taxi' }].map(opt => (
              <button key={opt.key} onClick={() => setLayer(opt.key as any)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${layer === opt.key ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                <span className="material-icons" style={{ fontSize: '12px' }}>{opt.icon}</span>{opt.label}
              </button>
            ))}
          </div>
          <div className="flex-1"></div>
          <div className="flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-500"></span><span className="text-gray-500 dark:text-gray-400">{totalRiders} riders</span></span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-blue-500"></span><span className="text-gray-500 dark:text-gray-400">{totalDrivers} drivers</span></span>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-black/80">
              <div className="flex flex-col items-center gap-2">
                <div className="size-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-xs font-medium text-gray-500">Loading map data...</span>
              </div>
            </div>
          )}
          <div ref={mapRef} className="w-full h-full" />
        </div>

        {/* Bottom Stats */}
        <div className="p-3 bg-gray-50 dark:bg-zinc-950/50 border-t border-gray-200 dark:border-zinc-900 flex-shrink-0">
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Zones', value: data?.regions.length || 0, color: 'text-gray-900 dark:text-white' },
              { label: 'Critical', value: criticalZones, color: criticalZones > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400' },
              { label: 'Riders', value: totalRiders, color: 'text-red-500 dark:text-red-400' },
              { label: 'Drivers', value: totalDrivers, color: 'text-blue-500 dark:text-blue-400' },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-gray-400 font-semibold uppercase">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-gray-200 dark:border-zinc-900">
            {[{ level: 'Low', color: 'bg-emerald-500' }, { level: 'Medium', color: 'bg-amber-500' }, { level: 'High', color: 'bg-orange-500' }, { level: 'Critical', color: 'bg-red-500' }].map(item => (
              <div key={item.level} className="flex items-center gap-1">
                <div className={`size-2.5 rounded-full ${item.color}`}></div>
                <span className="text-[9px] font-semibold text-gray-500 dark:text-gray-400">{item.level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatmapModal;

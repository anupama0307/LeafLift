/// <reference types="vite/client" />
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

interface RegionDemand { name: string; rides: number; drivers: number; deficit: number; heatLevel: string; lat: number; lng: number; }
interface PeakHour { hour: number; count: number; isPeak: boolean; }
interface DriverAlert { id: string; type: string; message: string; severity: string; region: string; timestamp: string; acknowledged: boolean; }
interface DemandForecast { region: string; predicted: number; confidence: number; trend: string; }

const OLA_API_KEY = (import.meta.env.VITE_OLA_MAPS_API_KEY as string) || '';
const REGION_CENTER = { lat: 20.5937, lng: 78.9629 };

const DemandScreen: React.FC = () => {
  const [tab, setTab] = useState<'forecast' | 'peak' | 'allocation'>('forecast');
  const [regions, setRegions] = useState<RegionDemand[]>([]);
  const [peaks, setPeaks] = useState<PeakHour[]>([]);
  const [alerts, setAlerts] = useState<DriverAlert[]>([]);
  const [forecasts, setForecasts] = useState<DemandForecast[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const [regRes, peakRes, alertRes] = await Promise.all([
        fetch('/api/admin/demand/regions'), fetch('/api/admin/peak-hours'), fetch('/api/admin/driver-alerts'),
      ]);
      if (regRes.ok) setRegions(await regRes.json());
      if (peakRes.ok) setPeaks(await peakRes.json());
      if (alertRes.ok) setAlerts(await alertRes.json());
      try { const mlRes = await fetch('/api/admin/ml/predict-demand'); if (mlRes.ok) { const d = await mlRes.json(); setForecasts(d.predictions || []); } } catch { }
    } catch (e) { console.error('Demand fetch error:', e); }
    finally {
      // Fallback data when server is unavailable
      setRegions(prev => prev.length ? prev : [
        { name: 'Mumbai - Andheri', rides: 48, drivers: 22, deficit: 26, heatLevel: 'critical', lat: 19.1197, lng: 72.8464 },
        { name: 'Delhi - Connaught Place', rides: 42, drivers: 18, deficit: 24, heatLevel: 'critical', lat: 28.6315, lng: 77.2167 },
        { name: 'Bangalore - Koramangala', rides: 35, drivers: 20, deficit: 15, heatLevel: 'high', lat: 12.9352, lng: 77.6245 },
        { name: 'Hyderabad - HITEC City', rides: 28, drivers: 20, deficit: 8, heatLevel: 'medium', lat: 17.4435, lng: 78.3772 },
        { name: 'Chennai - T. Nagar', rides: 31, drivers: 14, deficit: 17, heatLevel: 'high', lat: 13.0418, lng: 80.2341 },
        { name: 'Kolkata - Salt Lake', rides: 22, drivers: 25, deficit: -3, heatLevel: 'low', lat: 22.5726, lng: 88.4159 },
        { name: 'Pune - Hinjewadi', rides: 19, drivers: 16, deficit: 3, heatLevel: 'medium', lat: 18.5912, lng: 73.7389 },
        { name: 'Jaipur - MI Road', rides: 15, drivers: 18, deficit: -3, heatLevel: 'low', lat: 26.9124, lng: 75.7873 },
      ]);
      setPeaks(prev => prev.length ? prev : Array.from({ length: 24 }, (_, i) => {
        const base = [8, 5, 3, 2, 3, 7, 18, 42, 65, 48, 32, 28, 25, 22, 27, 35, 48, 68, 58, 40, 30, 22, 15, 10];
        return { hour: i, count: base[i] + Math.floor(Math.random() * 6), isPeak: [7, 8, 9, 17, 18].includes(i) };
      }));
      setAlerts(prev => prev.length ? prev : [
        { id: 'a1', type: 'shortage', message: 'Critical driver shortage in Mumbai Andheri - 26 rides unmatched', severity: 'critical', region: 'Mumbai - Andheri', timestamp: new Date().toISOString(), acknowledged: false },
        { id: 'a2', type: 'surge', message: 'High demand surge detected in Delhi Connaught Place area', severity: 'high', region: 'Delhi - Connaught Place', timestamp: new Date(Date.now() - 600000).toISOString(), acknowledged: false },
        { id: 'a3', type: 'weather', message: 'Rain forecast may increase demand by 30% in Bangalore', severity: 'medium', region: 'Bangalore - Koramangala', timestamp: new Date(Date.now() - 1800000).toISOString(), acknowledged: true },
      ]);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const socket = io({ path: '/socket.io' });
    socket.on('demand-update', (d: any) => { if (d?.regions) setRegions(d.regions); });
    const iv = setInterval(fetchAll, 30000);
    return () => { socket.disconnect(); clearInterval(iv); };
  }, [fetchAll]);

  const clearMarkers = () => { markersRef.current.forEach(m => m.remove()); markersRef.current = []; };

  const renderMapMarkers = useCallback((map: any) => {
    if (!map || !regions.length) return;
    clearMarkers();
    const maplibregl = (window as any).maplibregl;
    if (!maplibregl) return;

    regions.forEach(r => {
      const colors: Record<string, { center: string; mid: string; edge: string }> = {
        critical: { center: 'rgba(220,38,38,0.7)', mid: 'rgba(220,38,38,0.3)', edge: 'rgba(220,38,38,0)' },
        high: { center: 'rgba(234,88,12,0.6)', mid: 'rgba(234,88,12,0.25)', edge: 'rgba(234,88,12,0)' },
        medium: { center: 'rgba(217,119,6,0.5)', mid: 'rgba(217,119,6,0.2)', edge: 'rgba(217,119,6,0)' },
        low: { center: 'rgba(5,150,105,0.4)', mid: 'rgba(5,150,105,0.15)', edge: 'rgba(5,150,105,0)' },
      };
      const c = colors[r.heatLevel] || colors.low;
      const labelColor = r.heatLevel === 'critical' ? '#DC2626' : r.heatLevel === 'high' ? '#EA580C' : r.heatLevel === 'medium' ? '#D97706' : '#059669';

      // Main blob - sized for India-wide zoom
      const blobSize = r.heatLevel === 'critical' ? 40 : r.heatLevel === 'high' ? 34 : r.heatLevel === 'medium' ? 28 : 22;
      const el = document.createElement('div');
      el.style.cssText = 'width:' + blobSize + 'px;height:' + blobSize + 'px;border-radius:50%;background:radial-gradient(circle,' + c.center + ' 0%,' + c.mid + ' 50%,' + c.edge + ' 100%);pointer-events:auto;cursor:pointer;filter:blur(2px);';
      const popup = new maplibregl.Popup({ offset: 10, closeButton: false }).setHTML(
        '<div style="font-family:Inter,system-ui,sans-serif;padding:6px;">' +
        '<p style="font-weight:700;font-size:13px;margin:0 0 6px;">' + (r.name || 'Unknown') + '</p>' +
        '<p style="font-size:11px;margin:2px 0;">Rides: <b>' + (r.rides ?? 0) + '</b></p>' +
        '<p style="font-size:11px;margin:2px 0;">Drivers: <b>' + (r.drivers ?? 0) + '</b></p>' +
        '<p style="font-size:11px;margin:2px 0;">Deficit: <b style="color:' + (r.deficit > 0 ? '#DC2626' : '#059669') + '">' + (r.deficit ?? 0) + '</b></p>' +
        '<p style="font-size:10px;margin:5px 0 0;text-transform:uppercase;font-weight:700;color:' + labelColor + '">' + (r.heatLevel || 'low') + '</p>' +
        '</div>'
      );
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);

      // Scatter smaller blobs around the city
      const scatterCount = r.heatLevel === 'critical' ? 6 : r.heatLevel === 'high' ? 4 : r.heatLevel === 'medium' ? 3 : 2;
      for (let i = 0; i < scatterCount; i++) {
        const offsetLat = (Math.random() - 0.5) * 0.4;
        const offsetLng = (Math.random() - 0.5) * 0.4;
        const subSize = 10 + Math.random() * 18;
        const subEl = document.createElement('div');
        subEl.style.cssText = 'width:' + subSize + 'px;height:' + subSize + 'px;border-radius:50%;background:radial-gradient(circle,' + c.center + ' 0%,' + c.mid + ' 40%,' + c.edge + ' 100%);pointer-events:none;filter:blur(1px);opacity:' + (0.5 + Math.random() * 0.4) + ';';
        const subMarker = new maplibregl.Marker({ element: subEl, anchor: 'center' }).setLngLat([r.lng + offsetLng, r.lat + offsetLat]).addTo(map);
        markersRef.current.push(subMarker);
      }
    });
  }, [regions]);

  useEffect(() => {
    if (tab !== 'forecast' || !mapRef.current) return;
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
        container: mapRef.current!, style: mapStyle,
        center: [REGION_CENTER.lng, REGION_CENTER.lat], zoom: 4.5,
        transformRequest: (url: string) => {
          if (url.includes('olamaps.io')) { const sep = url.includes('?') ? '&' : '?'; return { url: `${url}${sep}api_key=${OLA_API_KEY}` }; }
          return { url };
        },
        attributionControl: false,
      });
      map.addControl(new maplibregl.NavigationControl(), 'top-right');
      mapInstance.current = map;
      map.on('load', () => renderMapMarkers(map));
      map.on('error', (e: any) => {
        if (e.error?.message?.includes('Source layer') || e.error?.message?.includes('does not exist')) return;
      });
    };
    setTimeout(initMap, 100);
    return () => { if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; } };
  }, [tab]);

  useEffect(() => { if (mapInstance.current && regions.length) renderMapMarkers(mapInstance.current); }, [regions, renderMapMarkers]);

  const maxPeak = Math.max(...peaks.map(p => p.count), 1) * 1.1;
  const unackAlerts = alerts.filter(a => !a.acknowledged);

  const handleAck = async (id: string) => {
    try { const res = await fetch(`/api/admin/driver-alerts/${id}/acknowledge`, { method: 'PATCH' }); if (res.ok) setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a)); } catch { }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="size-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Demand Analytics</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Real-time demand monitoring and forecasting</p>
        </div>
        {unackAlerts.length > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold">
            <span className="material-icons text-sm">warning</span>{unackAlerts.length} unresolved alert{unackAlerts.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-black p-1 rounded-lg w-fit">
        {[{ key: 'forecast', label: 'Forecast', icon: 'analytics' }, { key: 'peak', label: 'Peak Hours', icon: 'schedule' }, { key: 'allocation', label: 'Allocation', icon: 'group' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === t.key ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
            <span className="material-icons" style={{ fontSize: '14px' }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Forecast Tab */}
      {tab === 'forecast' && (
        <div className="space-y-4">
          {/* Map */}
          <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 overflow-hidden">
            <div className="p-3 border-b border-gray-200 dark:border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons text-sm text-blue-500">map</span>
                <span className="text-xs font-bold text-gray-900 dark:text-white">Demand Heatmap</span>
              </div>
              <div className="flex items-center gap-3">
                {[{ level: 'Low', color: 'bg-emerald-500' }, { level: 'Medium', color: 'bg-amber-500' }, { level: 'High', color: 'bg-orange-500' }, { level: 'Critical', color: 'bg-red-500' }].map(i => (
                  <span key={i.level} className="flex items-center gap-1"><span className={`size-2 rounded-full ${i.color}`}></span><span className="text-[9px] font-semibold text-gray-400">{i.level}</span></span>
                ))}
              </div>
            </div>
            <div ref={mapRef} className="h-72 w-full" />
          </div>

          {/* Region Grid + Forecasts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Region Grid */}
            <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 p-4">
              <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="material-icons text-sm text-indigo-500">grid_view</span>Region Overview
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {regions.map((r) => {
                  const colors: Record<string, string> = { critical: 'border-red-400 bg-red-50 dark:bg-red-500/10', high: 'border-orange-400 bg-orange-50 dark:bg-orange-500/10', medium: 'border-amber-400 bg-amber-50 dark:bg-amber-500/10', low: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' };
                  return (
                    <div key={r.name} className={`p-2.5 rounded-lg border-l-3 ${colors[r.heatLevel] || 'border-gray-400 bg-gray-50 dark:bg-black'}`}>
                      <p className="text-[10px] font-bold text-gray-900 dark:text-white truncate">{r.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-gray-500">{r.rides} rides</span>
                        <span className="text-[10px] text-gray-400">{r.drivers} drv</span>
                      </div>
                      {r.deficit > 0 && <p className="text-[9px] text-red-500 font-semibold mt-0.5">-{r.deficit} deficit</p>}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* ML Forecasts */}
            <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 p-4">
              <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <span className="material-icons text-sm text-violet-500">auto_graph</span>ML Demand Forecast
              </h3>
              {forecasts.length > 0 ? (
                <div className="space-y-2">
                  {forecasts.map((f) => (
                    <div key={f.region} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-black/50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-900 dark:text-white truncate">{f.region}</p>
                        <p className="text-[9px] text-gray-400">{(f.confidence * 100).toFixed(0)}% confidence</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-gray-900 dark:text-white">{f.predicted}</p>
                        <span className={`text-[9px] font-semibold ${f.trend === 'up' ? 'text-green-500' : f.trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
                          {f.trend === 'up' ? 'Rising' : f.trend === 'down' ? 'Falling' : 'Stable'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-6">No ML predictions available. Run the ML service to generate forecasts.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Peak Hours Tab */}
      {tab === 'peak' && (
        <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 p-4">
          <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <span className="material-icons text-sm text-amber-500">schedule</span>24-Hour Demand Distribution
          </h3>
          <div className="flex items-end gap-[3px] h-64">
            {peaks.map((p) => (
              <div key={p.hour} className="group flex-1 flex flex-col items-center relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                  {p.count} rides
                </div>
                <div className={`w-full rounded-t transition-all ${p.isPeak ? 'bg-red-500 hover:bg-red-400' : 'bg-blue-400 dark:bg-blue-600 hover:bg-blue-300 dark:hover:bg-blue-500'}`}
                  style={{ height: `${Math.max(Math.round((p.count / maxPeak) * 230), 3)}px` }}></div>
                {p.hour % 3 === 0 && <span className="text-[8px] text-gray-400 mt-1">{String(p.hour).padStart(2, '0')}</span>}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-zinc-900">
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="size-2 rounded-full bg-blue-400"></span>Normal</span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500"><span className="size-2 rounded-full bg-red-500"></span>Peak</span>
            <span className="text-[10px] text-gray-400 ml-auto">{peaks.filter(p => p.isPeak).length} peak hours identified</span>
          </div>
        </div>
      )}

      {/* Allocation Tab */}
      {tab === 'allocation' && (
        <div className="space-y-4">
          {/* Driver Alerts */}
          <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span className="material-icons text-sm text-red-500">notifications_active</span>Driver Alerts
                {unackAlerts.length > 0 && <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 text-[9px] font-bold rounded-full">{unackAlerts.length}</span>}
              </h3>
            </div>
            {alerts.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {alerts.map(a => {
                  const sevColors: Record<string, string> = { critical: 'border-red-400 bg-red-50 dark:bg-red-500/10', high: 'border-orange-400 bg-orange-50 dark:bg-orange-500/10', medium: 'border-amber-400 bg-amber-50 dark:bg-amber-500/10', low: 'border-blue-400 bg-blue-50 dark:bg-blue-500/10' };
                  return (
                    <div key={a.id} className={`p-2.5 rounded-lg border-l-3 ${sevColors[a.severity] || 'border-gray-400 bg-gray-50 dark:bg-black'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${sevColors[a.severity] || ''}`}>{a.severity}</span>
                            <span className="text-[9px] text-gray-400">{a.region}</span>
                          </div>
                          <p className="text-[10px] font-medium text-gray-900 dark:text-white mt-1">{a.message}</p>
                          <p className="text-[9px] text-gray-400 mt-0.5">{new Date(a.timestamp).toLocaleString()}</p>
                        </div>
                        {!a.acknowledged && (
                          <button onClick={() => handleAck(a.id)} className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap">
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-6">No active alerts</p>
            )}
          </div>

          {/* Allocation Summary */}
          <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 p-4">
            <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-teal-500">groups</span>Regional Allocation Summary
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-zinc-900">
                    <th className="text-[9px] font-bold text-gray-400 uppercase pb-2 pr-4">Region</th>
                    <th className="text-[9px] font-bold text-gray-400 uppercase pb-2 pr-4">Rides</th>
                    <th className="text-[9px] font-bold text-gray-400 uppercase pb-2 pr-4">Drivers</th>
                    <th className="text-[9px] font-bold text-gray-400 uppercase pb-2 pr-4">Deficit</th>
                    <th className="text-[9px] font-bold text-gray-400 uppercase pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r) => (
                    <tr key={r.name} className="border-b border-gray-50 dark:border-zinc-900/50">
                      <td className="text-[10px] font-semibold text-gray-900 dark:text-white py-2 pr-4">{r.name}</td>
                      <td className="text-[10px] text-gray-600 dark:text-white py-2 pr-4">{r.rides}</td>
                      <td className="text-[10px] text-gray-600 dark:text-white py-2 pr-4">{r.drivers}</td>
                      <td className={`text-[10px] font-semibold py-2 pr-4 ${r.deficit > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{r.deficit > 0 ? `+${r.deficit}` : r.deficit}</td>
                      <td className="py-2"><span className={`text-[9px] font-bold uppercase ${r.heatLevel === 'critical' ? 'text-red-600' : r.heatLevel === 'high' ? 'text-orange-600' : r.heatLevel === 'medium' ? 'text-amber-600' : 'text-green-600'}`}>{r.heatLevel}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DemandScreen;

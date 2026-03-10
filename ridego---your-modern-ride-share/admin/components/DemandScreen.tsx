/// <reference types="vite/client" />
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

interface RegionDemand { name: string; rides: number; drivers: number; deficit: number; heatLevel: string; lat: number; lng: number; }
interface PeakHour { hour: number; count: number; isPeak: boolean; }
interface DriverAlert { id: string; type: string; message: string; severity: string; region: string; timestamp: string; acknowledged: boolean; }
interface DemandForecast { region: string; predicted: number; confidence: number; trend: string; }
type RegionFilter = 'all' | string;
interface MLLog { timestamp: string; level: string; message: string; }
interface MLStatus {
  trained_at: string | null;
  last_seen_count: number;
  last_train_count: number;
  new_entries_since_train: number;
  config: { min_new_entries: number; retrain_interval_minutes: number; default_horizon_hours: number; workers: number; };
}

const MAPBOX_TOKEN = (window as any).MAPBOX_TOKEN || 'MAPBOX_TOKEN_PLACEHOLDER';
const REGION_CENTER = { lat: 20.5937, lng: 78.9629 };

const fetchWithTimeout = async (url: string, timeoutMs = 6000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const DemandScreen: React.FC = () => {
  const [tab, setTab] = useState<'forecast' | 'peak' | 'allocation'>('forecast');
  const [regions, setRegions] = useState<RegionDemand[]>([]);
  const [peaks, setPeaks] = useState<PeakHour[]>([]);
  const [alerts, setAlerts] = useState<DriverAlert[]>([]);
  const [forecasts, setForecasts] = useState<DemandForecast[]>([]);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [mlLogs, setMlLogs] = useState<MLLog[]>([]);
  const [mlStatus, setMlStatus] = useState<MLStatus | null>(null);
  const [mlConfig, setMlConfig] = useState({ minNewEntries: 100, retrainIntervalMinutes: 5 });
  const [savingConfig, setSavingConfig] = useState(false);
  const [retrainingNow, setRetrainingNow] = useState(false);
  const [broadcastZone, setBroadcastZone] = useState('');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      const demandUrl = regionFilter === 'all'
        ? '/api/admin/demand/regions'
        : `/api/admin/demand/regions?region=${encodeURIComponent(regionFilter)}`;
      const forecastUrl = regionFilter === 'all'
        ? '/api/admin/ml/predict-demand?scope=regions'
        : `/api/admin/ml/predict-demand?scope=regions&region=${encodeURIComponent(regionFilter)}`;
      const [regRes, peakRes, alertRes] = await Promise.all([
        fetchWithTimeout(demandUrl), fetchWithTimeout('/api/admin/peak-hours'), fetchWithTimeout('/api/admin/driver-alerts'),
      ]);
      if (regRes.ok) setRegions(await regRes.json());
      if (peakRes.ok) setPeaks(await peakRes.json());
      if (alertRes.ok) setAlerts(await alertRes.json());
      try {
        const mlRes = await fetchWithTimeout(forecastUrl, 5000);
        if (mlRes.ok) {
          const d = await mlRes.json();
          setForecasts(Array.isArray(d?.predictions) ? d.predictions : []);
        }
      } catch { }
      try {
        const liveZonesUrl = regionFilter === 'all'
          ? '/api/ml/demand/live-zones?top_n=8'
          : `/api/ml/demand/live-zones?region=${encodeURIComponent(regionFilter)}&top_n=8`;
        const [zoneRes, statusRes, logsRes] = await Promise.all([
          fetchWithTimeout(liveZonesUrl, 5000),
          fetchWithTimeout('/api/ml/demand/status', 5000),
          fetchWithTimeout('/api/ml/demand/logs?limit=25', 5000),
        ]);
        if (zoneRes.ok) {
          const zoneData = await zoneRes.json();
          if (Array.isArray(zoneData?.zones) && zoneData.zones.length) {
            setRegions(zoneData.zones);
            setForecasts(zoneData.zones.map((z: any) => ({ region: z.region, predicted: z.predicted, confidence: z.confidence, trend: z.trend })));
          }
        }
        if (statusRes.ok) {
          const status = await statusRes.json();
          setMlStatus(status);
          if (status?.config) {
            setMlConfig({
              minNewEntries: status.config.min_new_entries ?? 100,
              retrainIntervalMinutes: status.config.retrain_interval_minutes ?? 5,
            });
          }
        }
        if (logsRes.ok) {
          const logs = await logsRes.json();
          setMlLogs(Array.isArray(logs?.logs) ? logs.logs : []);
        }
      } catch { }
    } catch (e) { console.error('Demand fetch error:', e); }
    finally {
      setLoading(false);
    }
  }, [regionFilter]);

  useEffect(() => {
    fetchAll();
    const socket = io({ path: '/socket.io' });
    socket.on('demand-update', (d: any) => { if (d?.regions) setRegions(d.regions); });
    socket.on('peak-update', (d: any) => { if (Array.isArray(d)) setPeaks(d); });
    socket.on('driver-alert', (d: any) => {
      if (!d) return;
      setAlerts(prev => [{
        id: String(Date.now()),
        type: 'SYSTEM',
        message: d.message || 'Demand alert',
        severity: d.deficit >= 10 ? 'critical' : d.deficit >= 5 ? 'high' : 'medium',
        region: d.zone || 'Unknown Zone',
        timestamp: d.at || new Date().toISOString(),
        acknowledged: false,
      }, ...prev].slice(0, 50));
    });
    const iv = setInterval(fetchAll, 30000);
    return () => {
      socket.off('demand-update');
      socket.off('peak-update');
      socket.off('driver-alert');
      socket.disconnect();
      clearInterval(iv);
    };
  }, [fetchAll]);

  const clearMarkers = () => { markersRef.current.forEach(m => m.remove()); markersRef.current = []; };

  const renderMapMarkers = useCallback((map: any) => {
    if (!map || !regions.length) return;
    clearMarkers();
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    regions.forEach(r => {
      const colors: Record<string, { center: string; mid: string; edge: string }> = {
        critical: { center: 'rgba(220,38,38,0.7)', mid: 'rgba(220,38,38,0.3)', edge: 'rgba(220,38,38,0)' },
        high: { center: 'rgba(234,88,12,0.6)', mid: 'rgba(234,88,12,0.25)', edge: 'rgba(234,88,12,0)' },
        medium: { center: 'rgba(217,119,6,0.5)', mid: 'rgba(217,119,6,0.2)', edge: 'rgba(217,119,6,0)' },
        low: { center: 'rgba(5,150,105,0.4)', mid: 'rgba(5,150,105,0.15)', edge: 'rgba(5,150,105,0)' },
      };
      const c = colors[r.heatLevel] || colors.low;
      const labelColor = r.heatLevel === 'critical' ? '#DC2626' : r.heatLevel === 'high' ? '#EA580C' : r.heatLevel === 'medium' ? '#D97706' : '#059669';

      // Main blob
      const blobSize = r.heatLevel === 'critical' ? 40 : r.heatLevel === 'high' ? 34 : r.heatLevel === 'medium' ? 28 : 22;
      const el = document.createElement('div');
      el.style.cssText = 'width:' + blobSize + 'px;height:' + blobSize + 'px;border-radius:50%;background:radial-gradient(circle,' + c.center + ' 0%,' + c.mid + ' 50%,' + c.edge + ' 100%);pointer-events:auto;cursor:pointer;filter:blur(2px);';
      const popup = new mapboxgl.Popup({ offset: 10, closeButton: false }).setHTML(
        '<div style="font-family:Inter,system-ui,sans-serif;padding:6px;background:#121214;color:#fff;border-radius:8px;">' +
        '<p style="font-weight:700;font-size:13px;margin:0 0 6px;">' + (r.name || 'Unknown') + '</p>' +
        '<p style="font-size:11px;margin:2px 0;">Rides: <b>' + (r.rides ?? 0) + '</b></p>' +
        '<p style="font-size:11px;margin:2px 0;">Drivers: <b>' + (r.drivers ?? 0) + '</b></p>' +
        '<p style="font-size:11px;margin:2px 0;">Deficit: <b style="color:' + (r.deficit > 0 ? '#DC2626' : '#059669') + '">' + (r.deficit ?? 0) + '</b></p>' +
        '<p style="font-size:10px;margin:5px 0 0;text-transform:uppercase;font-weight:700;color:' + labelColor + '">' + (r.heatLevel || 'low') + '</p>' +
        '</div>'
      );
      const marker = new mapboxgl.Marker({ element: el }).setLngLat([r.lng, r.lat]).setPopup(popup).addTo(map);
      markersRef.current.push(marker);

      // Scatter smaller blobs around the region
      const scatterCount = r.heatLevel === 'critical' ? 6 : r.heatLevel === 'high' ? 4 : r.heatLevel === 'medium' ? 3 : 2;
      for (let i = 0; i < scatterCount; i++) {
        const offsetLat = (Math.random() - 0.5) * 0.4;
        const offsetLng = (Math.random() - 0.5) * 0.4;
        const subSize = 10 + Math.random() * 18;
        const subEl = document.createElement('div');
        subEl.style.cssText = 'width:' + subSize + 'px;height:' + subSize + 'px;border-radius:50%;background:radial-gradient(circle,' + c.center + ' 0%,' + c.mid + ' 40%,' + c.edge + ' 100%);pointer-events:none;filter:blur(1px);opacity:' + (0.5 + Math.random() * 0.4) + ';';
        const subMarker = new mapboxgl.Marker({ element: subEl }).setLngLat([r.lng + offsetLng, r.lat + offsetLat]).addTo(map);
        markersRef.current.push(subMarker);
      }
    });
  }, [regions]);

  useEffect(() => {
    if (tab !== 'forecast' || !mapRef.current) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    // Delay slightly to ensure the DOM container has actual dimensions
    const timer = setTimeout(() => {
      if (!mapRef.current) return;
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: mapRef.current!,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [REGION_CENTER.lng, REGION_CENTER.lat],
        zoom: 4.5,
        attributionControl: false,
      });
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      mapInstance.current = map;
      map.on('load', () => renderMapMarkers(map));
      // Also force a resize after the map is ready to fix 0-size container bug
      map.once('idle', () => map.resize());
    }, 200);
    return () => {
      clearTimeout(timer);
      if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }
    };
  }, [tab]);

  useEffect(() => { if (mapInstance.current && regions.length) renderMapMarkers(mapInstance.current); }, [regions, renderMapMarkers]);

  const maxPeak = Math.max(...peaks.map(p => p.count), 1) * 1.1;
  const unackAlerts = alerts.filter(a => !a.acknowledged);
  const availableRegions = Array.from(new Set(regions.map(r => r.name))).sort((a, b) => a.localeCompare(b));
  const predictedHotspots = [...forecasts]
    .filter(f => f.predicted > 0)
    .sort((a, b) => b.predicted - a.predicted)
    .slice(0, 3);

  const handleAck = async (id: string) => {
    try { const res = await fetch(`/api/admin/driver-alerts/${id}/acknowledge`, { method: 'PATCH' }); if (res.ok) setAlerts(prev => prev.map(a => a.id === id ? { ...a, acknowledged: true } : a)); } catch { }
  };

  const saveMlConfig = async () => {
    setSavingConfig(true);
    try {
      const qs = new URLSearchParams({
        min_new_entries: String(Math.max(1, mlConfig.minNewEntries)),
        retrain_interval_minutes: String(Math.max(1, mlConfig.retrainIntervalMinutes)),
        default_horizon_hours: '24',
        workers: '0',
      });
      await fetch(`/api/ml/demand/config?${qs.toString()}`, { method: 'POST' });
      await fetchAll();
    } finally {
      setSavingConfig(false);
    }
  };

  const retrainNow = async () => {
    setRetrainingNow(true);
    try {
      await fetch('/api/ml/demand/retrain', { method: 'POST' });
      await fetchAll();
    } finally {
      setRetrainingNow(false);
    }
  };

  const broadcastAlert = async () => {
    if (!broadcastZone || broadcasting) return;
    setBroadcasting(true);
    try {
      const res = await fetch('/api/admin/driver-alerts/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: broadcastZone, message: broadcastMsg || `High demand in ${broadcastZone}! Go online to earn more.` }),
      });
      if (res.ok) {
        const d = await res.json();
        setBroadcastMsg('');
        setBroadcastZone('');
        setAlerts(prev => [{
          id: String(Date.now()),
          type: 'SYSTEM',
          message: broadcastMsg || `High demand in ${broadcastZone}! Go online to earn more.`,
          severity: 'high',
          region: broadcastZone,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        }, ...prev]);
      }
    } catch (e) { console.error('Broadcast error:', e); }
    finally { setBroadcasting(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin"></div></div>;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Demand Analytics</h1>
          <p className="text-xs text-zinc-500">Real-time demand monitoring and forecasting</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
            className="text-xs px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 focus:outline-none focus:border-accent-purple">
            <option value="all">All Regions</option>
            {availableRegions.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
          {unackAlerts.length > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-xl text-xs font-semibold border border-red-500/20">
              <span className="material-icons text-sm">warning</span>{unackAlerts.length} alert{unackAlerts.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-full w-fit border border-zinc-800">
        {[{ key: 'forecast', label: 'Forecast' }, { key: 'peak', label: 'Peak Hours' }, { key: 'allocation', label: 'Allocation' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === t.key ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Forecast Tab */}
      {tab === 'forecast' && (
        <div className="space-y-6">
          {/* Map */}
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">Demand Heatmap</span>
              <div className="flex items-center gap-3">
                {[{ level: 'Low', color: 'bg-emerald-500' }, { level: 'Medium', color: 'bg-amber-500' }, { level: 'High', color: 'bg-orange-500' }, { level: 'Critical', color: 'bg-red-500' }].map(i => (
                  <span key={i.level} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${i.color}`}></span><span className="text-[9px] text-zinc-500">{i.level}</span></span>
                ))}
              </div>
            </div>
            <div className="relative">
              <div ref={mapRef} className="h-72 w-full" />
              {regions.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                  <p className="text-xs text-zinc-500">No live demand zones yet. Seed rider requests from main backend.</p>
                </div>
              )}
            </div>
          </div>

          {/* Region Grid + Forecasts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-sm font-bold text-white mb-4">Region Overview</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {regions.length === 0 && <p className="text-xs text-zinc-500 col-span-full">No live region demand data available.</p>}
                {regions.map((r) => {
                  const colors: Record<string, string> = { critical: 'border-l-red-500 bg-red-500/5', high: 'border-l-orange-500 bg-orange-500/5', medium: 'border-l-amber-500 bg-amber-500/5', low: 'border-l-emerald-500 bg-emerald-500/5' };
                  return (
                    <div key={r.name} className={`p-3 rounded-xl border border-zinc-800 border-l-[3px] ${colors[r.heatLevel] || 'border-l-zinc-600'}`}>
                      <p className="text-[10px] font-bold text-white truncate">{r.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-zinc-400">{r.rides} rides</span>
                        <span className="text-[10px] text-zinc-500">{r.drivers} drv</span>
                      </div>
                      {r.deficit > 0 && <p className="text-[9px] text-red-400 font-semibold mt-0.5">-{r.deficit} deficit</p>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card">
              <h3 className="text-sm font-bold text-white mb-4">ML Demand Forecast</h3>
              {predictedHotspots.length > 0 && (
                <div className="mb-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                  <p className="text-[10px] font-bold text-red-400 uppercase">Predicted High-Demand Zones</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {predictedHotspots.map((h) => (
                      <span key={h.region} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-red-500/30 text-red-400 font-semibold">
                        {h.region} ({h.predicted})
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {forecasts.length > 0 ? (
                <div className="space-y-2">
                  {forecasts.map((f) => (
                    <div key={f.region} className="flex items-center gap-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{f.region}</p>
                        <p className="text-[9px] text-zinc-500">{(f.confidence * 100).toFixed(0)}% confidence</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-white">{f.predicted}</p>
                        <span className={`text-[9px] font-semibold ${f.trend === 'up' ? 'text-accent-green' : f.trend === 'down' ? 'text-red-400' : 'text-zinc-500'}`}>
                          {f.trend === 'up' ? 'Rising' : f.trend === 'down' ? 'Falling' : 'Stable'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-zinc-500 text-center py-6">No ML predictions available yet.</p>
              )}
            </div>
          </div>

          {/* ML Config + Logs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-sm font-bold text-white mb-4">ML Retraining Controls</h3>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] text-zinc-400">Min new entries
                  <input type="number" min={1} value={mlConfig.minNewEntries} onChange={e => setMlConfig(v => ({ ...v, minNewEntries: Number(e.target.value) || 1 }))}
                    className="mt-1 w-full text-xs px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-white focus:outline-none focus:border-accent-purple" />
                </label>
                <label className="text-[10px] text-zinc-400">Retrain interval (min)
                  <input type="number" min={1} value={mlConfig.retrainIntervalMinutes} onChange={e => setMlConfig(v => ({ ...v, retrainIntervalMinutes: Number(e.target.value) || 1 }))}
                    className="mt-1 w-full text-xs px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-white focus:outline-none focus:border-accent-purple" />
                </label>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button onClick={saveMlConfig} disabled={savingConfig}
                  className="text-xs px-4 py-2 rounded-xl bg-accent-purple text-white font-semibold disabled:opacity-60 hover:bg-accent-purple/80 transition-colors">
                  {savingConfig ? 'Saving...' : 'Save Config'}
                </button>
                <button onClick={retrainNow} disabled={retrainingNow}
                  className="text-xs px-4 py-2 rounded-xl bg-accent-green text-black font-semibold disabled:opacity-60 hover:bg-accent-green/80 transition-colors">
                  {retrainingNow ? 'Retraining...' : 'Retrain Now'}
                </button>
              </div>
              <div className="mt-3 text-[10px] text-zinc-500 space-y-1">
                <p>Last trained: {mlStatus?.trained_at ? new Date(mlStatus.trained_at).toLocaleString() : 'Not trained yet'}</p>
                <p>New entries since train: {mlStatus?.new_entries_since_train ?? 0}</p>
              </div>
            </div>
            <div className="card">
              <h3 className="text-sm font-bold text-white mb-4">ML Training Logs</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {mlLogs.length ? mlLogs.slice().reverse().map((log, idx) => (
                  <div key={idx} className="text-[10px] p-3 rounded-xl border border-zinc-800 bg-zinc-900/50">
                    <p className="font-semibold text-zinc-300">{new Date(log.timestamp).toLocaleString()} [{log.level}]</p>
                    <p className="text-zinc-500">{log.message}</p>
                  </div>
                )) : <p className="text-xs text-zinc-500">No logs yet</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Peak Hours Tab */}
      {tab === 'peak' && (
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">24-Hour Demand Distribution</h3>
          <div className="flex items-end gap-[3px] h-64">
            {peaks.map((p) => (
              <div key={p.hour} className="group flex-1 flex flex-col items-center relative">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[9px] px-1.5 py-0.5 rounded border border-zinc-700 whitespace-nowrap z-10">
                  {p.count} rides
                </div>
                <div className={`w-full rounded-t transition-all ${p.isPeak ? 'bg-accent-rose hover:bg-accent-rose/80' : 'bg-accent-purple/60 hover:bg-accent-purple/80'}`}
                  style={{ height: `${Math.max(Math.round((p.count / maxPeak) * 230), 3)}px` }}></div>
                {p.hour % 3 === 0 && <span className="text-[8px] text-zinc-500 mt-1">{String(p.hour).padStart(2, '0')}</span>}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800">
            <span className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="w-2 h-2 rounded-full bg-accent-purple/60"></span>Normal</span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="w-2 h-2 rounded-full bg-accent-rose"></span>Peak</span>
            <span className="text-[10px] text-zinc-500 ml-auto">{peaks.filter(p => p.isPeak).length} peak hours identified</span>
          </div>
        </div>
      )}

      {/* Allocation Tab */}
      {tab === 'allocation' && (
        <div className="space-y-6">
          {/* Driver Alerts */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Driver Alerts
                {unackAlerts.length > 0 && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-bold rounded-full">{unackAlerts.length}</span>}
              </h3>
            </div>
            {alerts.length > 0 ? (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {alerts.map(a => {
                  const sevColors: Record<string, string> = { critical: 'border-l-red-500 bg-red-500/5', high: 'border-l-orange-500 bg-orange-500/5', medium: 'border-l-amber-500 bg-amber-500/5', low: 'border-l-accent-cyan bg-accent-cyan/5' };
                  return (
                    <div key={a.id} className={`p-3 rounded-xl border border-zinc-800 border-l-[3px] ${sevColors[a.severity] || ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${a.severity === 'critical' ? 'bg-red-500/20 text-red-400' : a.severity === 'high' ? 'bg-orange-500/20 text-orange-400' : 'bg-amber-500/20 text-amber-400'}`}>{a.severity}</span>
                            <span className="text-[9px] text-zinc-500">{a.region}</span>
                          </div>
                          <p className="text-[10px] font-medium text-white mt-1">{a.message}</p>
                          <p className="text-[9px] text-zinc-500 mt-0.5">{new Date(a.timestamp).toLocaleString()}</p>
                        </div>
                        {!a.acknowledged && (
                          <button onClick={() => handleAck(a.id)} className="text-[9px] font-semibold text-accent-cyan hover:underline whitespace-nowrap">
                            Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 text-center py-6">No active alerts</p>
            )}
          </div>

          {/* Manual Broadcast Alert */}
          <div className="card">
            <h3 className="text-sm font-bold text-white mb-3">Broadcast Surge Alert to Drivers</h3>
            <p className="text-[10px] text-zinc-500 mb-4">Manually notify all drivers about high demand in a specific zone</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select value={broadcastZone} onChange={e => setBroadcastZone(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-200 focus:outline-none focus:border-accent-purple">
                <option value="">Select zone...</option>
                {availableRegions.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
              <input type="text" value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)}
                placeholder="Custom message (optional)"
                className="text-xs px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-white placeholder-zinc-600 focus:outline-none focus:border-accent-purple" />
              <button onClick={broadcastAlert} disabled={!broadcastZone || broadcasting}
                className="flex items-center justify-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-accent-rose text-white font-semibold disabled:opacity-40 hover:bg-accent-rose/80 transition-colors">
                <span className="material-icons text-sm">{broadcasting ? 'hourglass_empty' : 'campaign'}</span>
                {broadcasting ? 'Sending...' : 'Broadcast Alert'}
              </button>
            </div>
            {regions.filter(r => r.deficit > 0).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-[9px] text-zinc-500">Quick pick (deficit zones):</span>
                {regions.filter(r => r.deficit > 0).sort((a, b) => b.deficit - a.deficit).map(r => (
                  <button key={r.name} onClick={() => setBroadcastZone(r.name)}
                    className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold transition-colors ${
                      broadcastZone === r.name ? 'bg-accent-rose/20 border-accent-rose/40 text-accent-rose' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
                    }`}>
                    {r.name} (-{r.deficit})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Allocation Summary Table */}
          <div className="card">
            <h3 className="text-sm font-bold text-white mb-4">Regional Allocation Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Region</th>
                    <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Rides</th>
                    <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Drivers</th>
                    <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Deficit</th>
                    <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Status</th>
                    <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r) => (
                    <tr key={r.name} className="border-b border-zinc-800/50">
                      <td className="text-[10px] font-semibold text-white py-3 pr-4">{r.name}</td>
                      <td className="text-[10px] text-zinc-300 py-3 pr-4">{r.rides}</td>
                      <td className="text-[10px] text-zinc-300 py-3 pr-4">{r.drivers}</td>
                      <td className={`text-[10px] font-semibold py-3 pr-4 ${r.deficit > 0 ? 'text-red-400' : 'text-accent-green'}`}>{r.deficit > 0 ? `+${r.deficit}` : r.deficit}</td>
                      <td className="py-3 pr-4"><span className={`text-[9px] font-bold uppercase ${r.heatLevel === 'critical' ? 'text-red-400' : r.heatLevel === 'high' ? 'text-orange-400' : r.heatLevel === 'medium' ? 'text-amber-400' : 'text-accent-green'}`}>{r.heatLevel}</span></td>
                      <td className="py-3">
                        {r.deficit > 0 && (
                          <button onClick={() => { setBroadcastZone(r.name); broadcastAlert(); }}
                            className="text-[9px] font-semibold text-accent-rose hover:text-accent-rose/80 transition-colors flex items-center gap-0.5">
                            <span className="material-icons text-[12px]">notifications_active</span>Alert
                          </button>
                        )}
                      </td>
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

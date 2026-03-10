import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import HeatmapModal from './HeatmapModal';
import MLInsightsPanel from './MLInsightsPanel';

const API = '/api/admin';

type AdminScreen = 'DASHBOARD' | 'DEMAND' | 'FLEET' | 'POOLING' | 'ECO' | 'NOTIFICATIONS';

interface DashboardHomeProps {
  onNavigate?: (screen: AdminScreen) => void;
}

interface Stats {
  totalRides: number;
  activeDrivers: number;
  totalRiders: number;
  poolSuccessRate: number;
  co2Saved: number;
  revenue: number;
  avgWaitTime: number;
  peakHour: string;
}

interface RealtimeUpdate {
  activeDrivers: number;
  recentRides: number;
  timestamp: string;
  liveRiders: number;
  ongoingRides: number;
  totalRides?: number;
  revenue?: number;
}

interface HourlyBucket {
  hour: number;
  label: string;
  rides: number;
  isPeak?: boolean;
}

type DrillView = 'full24' | 'first12' | 'last12' | 'detail';

const DashboardHome: React.FC<DashboardHomeProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [hourlyRides, setHourlyRides] = useState<HourlyBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [realtimeData, setRealtimeData] = useState<RealtimeUpdate | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [drillView, setDrillView] = useState<DrillView>('full24');
  const [detailRange, setDetailRange] = useState<{ start: number; end: number } | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [demandZones, setDemandZones] = useState<any[]>([]);
  const [revenuePeriod, setRevenuePeriod] = useState<'today' | 'week' | 'month'>('month');
  const [ridePatterns, setRidePatterns] = useState<{ byDayOfWeek: any[]; byHour: any[]; byVehicle: any[] } | null>(null);
  const [poolStats, setPoolStats] = useState<any>(null);
  const [ecoStats, setEcoStats] = useState<any>(null);

  const [revHoveredIdx, setRevHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const socketInstance = io('http://localhost:5002', { transports: ['websocket', 'polling'] });
    socketInstance.on('stats-update', (data: RealtimeUpdate) => { setRealtimeData(data); setLastUpdate(new Date()); });
    setSocket(socketInstance);
    return () => { socketInstance.disconnect(); };
  }, []);

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const res = await fetch(`${API}/demand/regions`);
        if (res.ok) {
          const zones = await res.json();
          if (Array.isArray(zones)) setDemandZones(zones.sort((a: any, b: any) => (b.deficit ?? 0) - (a.deficit ?? 0)).slice(0, 6));
        }
      } catch { }
    };
    fetchZones();
    const iv = setInterval(fetchZones, 60000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, hourlyRes, patternsRes, poolRes, ecoRes] = await Promise.all([
          fetch(`${API}/overview`), fetch(`${API}/peak-hours`),
          fetch(`${API}/rides/patterns`), fetch(`${API}/pooling/stats`), fetch(`${API}/eco/stats`),
        ]);
        if (statsRes.ok) setStats(await statsRes.json());
        if (hourlyRes.ok) { const h = await hourlyRes.json(); setHourlyRides(h.map((x: any) => ({ hour: x.hour, label: x.label, rides: x.rides ?? x.count ?? 0, isPeak: x.isPeak || false }))); }
        if (patternsRes.ok) setRidePatterns(await patternsRes.json());
        if (poolRes.ok) setPoolStats(await poolRes.json());
        if (ecoRes.ok) setEcoStats(await ecoRes.json());
      } catch (e) { console.error('Dashboard fetch error:', e); } finally {
        setLoading(false);
      }
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const s = stats || { totalRides: 0, activeDrivers: 0, totalRiders: 0, poolSuccessRate: 0, co2Saved: 0, revenue: 0, avgWaitTime: 0, peakHour: 'N/A' };
  const displayActiveDrivers = realtimeData?.activeDrivers ?? s.activeDrivers;
  const displayTotalRides = realtimeData?.totalRides ?? s.totalRides;
  const displayRevenue = realtimeData?.revenue ?? s.revenue;
  const ongoingRides = realtimeData?.ongoingRides ?? 0;
  const liveRiders = realtimeData?.liveRiders ?? 0;

  // Computed revenue data for chart
  const avgFarePerRide = s.totalRides > 0 ? s.revenue / s.totalRides : 175;
  const revenueByHour = hourlyRides.map(h => ({ ...h, revenue: Math.round(h.rides * avgFarePerRide) }));
  const revenueChartPoints = (() => {
    if (revenueByHour.length === 0) return '';
    const max = Math.max(...revenueByHour.map(r => r.revenue), 1);
    return revenueByHour.map((r, i) => {
      const x = (i / 23) * 400;
      const y = 110 - (r.revenue / max) * 100;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  })();
  const revenueAreaPoints = (() => {
    if (revenueByHour.length === 0) return '';
    const max = Math.max(...revenueByHour.map(r => r.revenue), 1);
    const points = revenueByHour.map((r, i) => {
      const x = (i / 23) * 400;
      const y = 110 - (r.revenue / max) * 100;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M${points[0]} L${points.join(' L')} L400,115 L0,115 Z`;
  })();

  const peakHourCount = hourlyRides.filter(h => h.isPeak).length;
  const realPoolRate = poolStats?.current?.successRate ?? s.poolSuccessRate;
  const realCo2Saved = ecoStats?.current?.totalCO2Saved ?? s.co2Saved;

  const getVisibleBars = useCallback((): HourlyBucket[] => {
    if (hourlyRides.length === 0) return [];
    if (drillView === 'first12') return hourlyRides.slice(0, 12);
    if (drillView === 'last12') return hourlyRides.slice(12, 24);
    if (drillView === 'detail' && detailRange) {
      const { start, end } = detailRange;
      const buckets: HourlyBucket[] = [];
      for (let m = 0; m < (end - start) * 6; m++) {
        const minuteOffset = m * 10;
        const h = start + Math.floor(minuteOffset / 60);
        const minLabel = String(minuteOffset % 60).padStart(2, '0');
        const baseRides = hourlyRides[h]?.rides ?? 0;
        const portion = Math.max(0, Math.round(baseRides / 6 + (Math.sin(m * 1.5) * baseRides * 0.05)));
        buckets.push({ hour: h, label: `${h}:${minLabel}`, rides: portion });
      }
      return buckets;
    }
    return hourlyRides;
  }, [hourlyRides, drillView, detailRange]);

  const visibleBars = getVisibleBars();
  const maxRides = Math.max(...visibleBars.map(b => b.rides), 1) * 1.1;
  const totalTodayRides = hourlyRides.reduce((a, b) => a + b.rides, 0);

  const handleBarClick = (index: number) => {
    if (drillView === 'full24') { if (index < 12) setDrillView('first12'); else setDrillView('last12'); }
    else if (drillView === 'first12' || drillView === 'last12') {
      const offset = drillView === 'first12' ? 0 : 12;
      const actualHour = offset + index;
      setDetailRange({ start: actualHour, end: Math.min(actualHour + 1, 23) + 1 });
      setDrillView('detail');
    }
  };

  const handleBackToFull = () => { setDrillView('full24'); setDetailRange(null); };

  const handleHeatmapView = () => setShowHeatmap(true);
  const handleDriverAlert = async () => {
    if (confirm('Send surge notification to all offline drivers?')) {
      try { const res = await fetch(`${API}/driver-alerts/broadcast`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone: 'All Zones', message: 'High demand alert - go online now for surge bonuses.' }) }); if (res.ok) { const data = await res.json(); alert(`Alert sent to ${data.count} drivers.`); } } catch { alert('Failed to send alerts.'); }
    }
  };
  const handleExportReport = async () => {
    try { const period = prompt('Export period? (week / month / year)', 'month'); if (!period) return; const res = await fetch(`${API}/export/rides?format=csv&period=${period}`); if (res.ok) { const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `leaflift-rides-${period}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); } else { alert('Export failed.'); } } catch { alert('Export failed.'); }
  };
  const handlePeakConfig = async () => {
    try { const cfgRes = await fetch(`${API}/config/peak`); const cfg = cfgRes.ok ? await cfgRes.json() : { multiplier: 1.5 }; const val = prompt(`Current peak multiplier: ${cfg.multiplier}x\nEnter new multiplier (0.5 - 4.0):`, String(cfg.multiplier)); if (!val) return; const multiplier = parseFloat(val); if (isNaN(multiplier) || multiplier <= 0 || multiplier >= 5) { alert('Invalid value (0.5 - 4.0).'); return; } const res = await fetch(`${API}/config/peak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ multiplier }) }); if (res.ok) alert(`Peak multiplier updated to ${multiplier}x.`); } catch { alert('Failed to update peak config.'); }
  };
  const runSeed = async (count: number, simulation: boolean) => {
    try {
      const res = await fetch(`${API}/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, simulation })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data?.error || 'Seed failed.');
        return;
      }
      if (data.success) {
        const breakdown = data.statusBreakdown
          ? Object.entries(data.statusBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')
          : 'n/a';
        alert(
          `Seeded ${data.rides} rides (${data.mode}).\n` +
          `Drivers: ${data.drivers}, Riders: ${data.riders}\n` +
          `Status mix: ${breakdown}\n` +
          `Latest end time: ${data?.timeWindow?.latestRideEndAt || 'n/a'}`
        );
        window.location.reload();
      } else {
        alert(`${data.message || 'Seed skipped'} (${data.rides || 0} rides).`);
      }
    } catch {
      alert('Seed failed.');
    }
  };

  const handleSeedData = async () => {
    if (confirm('Seed historical demo data (analytics baseline)?')) await runSeed(200, false);
  };

  const handleSeedLive100 = async () => {
    if (confirm('Seed 100 realtime simulation rides with start/end timestamps?')) await runSeed(100, true);
  };

  const quickActions = [
    { icon: 'map', label: 'Heatmap', action: handleHeatmapView },
    { icon: 'notification_important', label: 'Driver Alert', action: handleDriverAlert },
    { icon: 'download', label: 'Export', action: handleExportReport },
    { icon: 'tune', label: 'Peak Config', action: handlePeakConfig },
    { icon: 'dataset', label: 'Seed Data', action: handleSeedData },
    { icon: 'bolt', label: 'Seed Live', action: handleSeedLive100 },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <HeatmapModal isOpen={showHeatmap} onClose={() => setShowHeatmap(false)} />

      {/* Live status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-accent-green animate-pulse"></div>
          <span className="text-[11px] font-medium text-zinc-400">Live · Updated {lastUpdate.toLocaleTimeString()}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs"><span className="text-zinc-500">{ongoingRides}</span><span className="text-zinc-600">ongoing</span></div>
          <div className="flex items-center gap-1.5 text-xs"><span className="text-zinc-500">{liveRiders}</span><span className="text-zinc-600">riders</span></div>
        </div>
      </div>

      {/* Top Row: Revenue + Calendar/Peak + Rides */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Revenue Card */}
        <section className="lg:col-span-5 card relative overflow-hidden flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-zinc-400 font-medium text-sm">Revenue</h3>
              <div className="flex items-baseline gap-3 mt-2">
                <span className="text-4xl font-bold text-white">₹{(displayRevenue / 1000).toFixed(1)}K</span>
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-full flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"/></svg>
                  2.4%
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 mt-1 uppercase tracking-wider">Total earnings</p>
            </div>
            <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
              {(['today', 'week', 'month'] as const).map(p => (
                <button key={p} onClick={() => setRevenuePeriod(p)}
                  className={`text-[10px] px-2 py-1 capitalize ${revenuePeriod === p ? 'bg-white text-black rounded-md font-medium' : 'text-zinc-500 hover:text-zinc-300'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {/* Revenue chart - interactive with tooltips */}
          <div className="relative h-40 w-full mt-2 dot-grid rounded-xl">
            <svg className="w-full h-full" viewBox="0 0 400 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#A78BFA" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {revenueAreaPoints && <path d={revenueAreaPoints} fill="url(#revGrad)"/>}
              {revenueChartPoints && <path d={revenueChartPoints} fill="none" stroke="#A78BFA" strokeWidth="2" strokeLinecap="round"/>}
              {/* Interactive hover circles for each hour */}
              {revenueByHour.map((r, i) => {
                const max = Math.max(...revenueByHour.map(h => h.revenue), 1);
                const cx = (i / 23) * 400;
                const cy = 110 - (r.revenue / max) * 100;
                const isHov = revHoveredIdx === i;
                const isCurrent = i === currentTime.getHours();
                return (
                  <g key={i}>
                    {/* Invisible wider hit area */}
                    <rect x={cx - 8} y={0} width={16} height={120} fill="transparent"
                      onMouseEnter={() => setRevHoveredIdx(i)} onMouseLeave={() => setRevHoveredIdx(null)} style={{ cursor: 'pointer' }}/>
                    {(isHov || isCurrent) && <line x1={cx} x2={cx} y1={0} y2={115} stroke={isHov ? '#A78BFA' : '#333'} strokeDasharray="4" strokeOpacity={isHov ? 0.6 : 1}/>}
                    <circle cx={cx} cy={cy} r={isHov ? 5 : isCurrent ? 4 : 0} fill={isHov ? '#fff' : '#A78BFA'} stroke={isHov ? '#A78BFA' : '#000'} strokeWidth={1.5}/>
                    {isHov && (
                      <g transform={`translate(${Math.min(Math.max(cx - 40, 0), 320)},${Math.max(cy - 30, 2)})`}>
                        <rect fill="rgba(0,0,0,0.92)" height="24" rx="6" stroke="#A78BFA" width="80" strokeWidth="0.5"/>
                        <text fill="#A78BFA" fontSize="9" fontWeight="700" x="40" y="10" textAnchor="middle">{r.label}</text>
                        <text fill="white" fontSize="9" fontWeight="600" x="40" y="20" textAnchor="middle">₹{(r.revenue / 1000).toFixed(1)}K · {r.rides} rides</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
              <span className="text-[8px] text-zinc-600">12AM</span>
              <span className="text-[8px] text-zinc-600">6AM</span>
              <span className="text-[8px] text-zinc-600">12PM</span>
              <span className="text-[8px] text-zinc-600">6PM</span>
              <span className="text-[8px] text-zinc-600">11PM</span>
            </div>
          </div>
          <div className="mt-4 flex gap-12">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{displayActiveDrivers}</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full">active</span>
              </div>
              <p className="text-xs text-zinc-500">Online drivers</p>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white">{realPoolRate}%</span>
              </div>
              <p className="text-xs text-zinc-500">Pool match rate</p>
            </div>
          </div>
        </section>

        {/* Peak Hour + CO2 Card */}
        <section className="lg:col-span-3 card flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-1 bg-zinc-800/50 px-3 py-1.5 rounded-lg text-sm border border-zinc-700 text-zinc-300">
              {currentTime.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
              <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
            </div>
            <button onClick={handleHeatmapView} className="p-1.5 bg-zinc-800/50 rounded-lg border border-zinc-700 hover:bg-zinc-700/50 transition-colors">
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </button>
          </div>
          <div className="flex-1 flex flex-col justify-center gap-4 mb-4">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Peak Hour</p>
              <p className="text-sm font-bold text-accent-yellow mt-1">{s.peakHour}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">CO₂ Saved</p>
              <p className="text-sm font-bold text-accent-green mt-1">{(realCo2Saved / 1000).toFixed(1)} tonnes</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Avg Wait</p>
              <p className="text-sm font-bold text-accent-cyan mt-1">{s.avgWaitTime} min</p>
            </div>
          </div>
          <div className="mt-auto bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
            <span className="text-2xl font-bold text-white">{displayTotalRides.toLocaleString()}</span>
            <div className="p-2 bg-zinc-800 rounded-lg">
              <svg className="w-4 h-4 text-accent-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
            </div>
          </div>
        </section>

        {/* Ride Volume Card */}
        <section className="lg:col-span-4 card">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-zinc-400 font-medium text-sm">Rides Today</h3>
              <div className="text-4xl font-bold text-white mt-2">{totalTodayRides.toLocaleString()}</div>
              <p className="text-[10px] text-zinc-500 mt-1 uppercase">{currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
            <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-zinc-800">
              {drillView !== 'full24' && (
                <button onClick={handleBackToFull} className="text-[10px] px-2 py-1 text-zinc-500 hover:text-white">← 24H</button>
              )}
              {drillView === 'full24' && (
                <>
                  <button onClick={() => setDrillView('first12')} className="text-[10px] px-2 py-1 text-zinc-500 hover:text-white">0-11H</button>
                  <button onClick={() => setDrillView('last12')} className="text-[10px] px-2 py-1 text-zinc-500 hover:text-white">12-23H</button>
                </>
              )}
            </div>
          </div>
          {/* Bar Chart */}
          <div className="flex items-end justify-between h-36 gap-[2px] mt-4">
            {visibleBars.map((b, i) => {
              const barH = Math.max(Math.round((b.rides / maxRides) * 130), 3);
              const isHovered = hoveredBar === i;
              return (
                <div key={`${b.label}-${i}`} className="flex-1 flex flex-col items-center gap-1 relative group cursor-pointer"
                  onClick={() => handleBarClick(i)} onMouseEnter={() => setHoveredBar(i)} onMouseLeave={() => setHoveredBar(null)}>
                  {isHovered && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-[9px] font-semibold px-2 py-1 rounded-md whitespace-nowrap z-10 border border-zinc-700">
                      {b.label}: {b.rides}
                    </div>
                  )}
                  <div className={`w-full rounded-t transition-all duration-200 ${isHovered ? (b.isPeak ? 'bg-accent-rose' : 'bg-accent-purple') : b.isPeak ? 'bg-accent-rose/50' : 'bg-zinc-700/60'}`} style={{ height: `${barH}px` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            {drillView === 'full24' && <>
              <span className="text-[9px] text-zinc-500">12AM</span>
              <span className="text-[9px] text-zinc-500">6AM</span>
              <span className="text-[9px] text-zinc-500">12PM</span>
              <span className="text-[9px] text-zinc-500">6PM</span>
              <span className="text-[9px] text-zinc-500">11PM</span>
            </>}
            {(drillView === 'first12' || drillView === 'last12') && visibleBars.filter((_, i) => i % 3 === 0).map(b => (
              <span key={b.label} className="text-[9px] text-zinc-500">{b.label}</span>
            ))}
            {drillView === 'detail' && visibleBars.filter((_, i) => i % 2 === 0).map(b => (
              <span key={b.label} className="text-[9px] text-zinc-500">{b.label}</span>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2 text-center">
            {drillView === 'full24' ? 'Click bar to drill down' : drillView === 'detail' ? '10-min intervals' : 'Click for 10-min breakdown'}
          </p>
        </section>
      </div>

      {/* Bottom Row: Quick Actions + Key Metrics + Regions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Quick Actions Card */}
        <section className="lg:col-span-4 card">
          <h3 className="font-bold text-white mb-4">Quick actions</h3>
          <div className="space-y-2">
            {quickActions.map((a, i) => (
              <button key={i} onClick={a.action}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700 transition-all text-left group">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center group-hover:bg-accent-purple/20 transition-colors">
                  <span className="material-icons text-zinc-400 group-hover:text-accent-purple transition-colors" style={{ fontSize: '18px' }}>{a.icon}</span>
                </div>
                <span className="text-xs font-semibold text-zinc-300">{a.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Key Metrics Bubbles Card */}
        <section className="lg:col-span-4 card flex flex-col items-center justify-center">
          <h3 className="font-bold text-white mb-6 self-start">Key metrics</h3>
          <div className="relative w-full h-52 flex items-center justify-center">
            <div onClick={() => onNavigate?.('FLEET' as AdminScreen)} title="View Fleet"
              className="absolute top-2 right-8 w-24 h-24 rounded-full bg-accent-cyan/70 flex flex-col items-center justify-center border-4 border-card-bg z-20 cursor-pointer hover:scale-110 hover:bg-accent-cyan/90 transition-all">
              <span className="text-lg font-bold text-white">{displayActiveDrivers}</span>
              <span className="text-[8px] text-white/80">drivers</span>
            </div>
            <div onClick={() => onNavigate?.('POOLING' as AdminScreen)} title="View Pooling"
              className="absolute bottom-2 left-4 w-32 h-32 rounded-full bg-accent-purple/70 flex flex-col items-center justify-center border-4 border-card-bg z-10 cursor-pointer hover:scale-110 hover:bg-accent-purple/90 transition-all">
              <span className="text-2xl font-bold text-white">{realPoolRate.toFixed ? realPoolRate.toFixed(0) : realPoolRate}%</span>
              <span className="text-[10px] text-white/80">pool rate</span>
            </div>
            <div onClick={() => onNavigate?.('DEMAND' as AdminScreen)} title="View Demand"
              className="absolute bottom-4 right-4 w-28 h-28 rounded-full bg-accent-yellow/70 flex flex-col items-center justify-center border-4 border-card-bg z-30 cursor-pointer hover:scale-110 hover:bg-accent-yellow/90 transition-all">
              <span className="text-xl font-bold text-black">{s.avgWaitTime}m</span>
              <span className="text-[9px] text-black/70">avg wait</span>
            </div>
            <div onClick={() => onNavigate?.('ECO' as AdminScreen)} title="View Sustainability"
              className="absolute top-1/2 -right-2 w-12 h-12 rounded-full bg-accent-green/80 flex flex-col items-center justify-center border-2 border-card-bg z-40 cursor-pointer hover:scale-125 hover:bg-accent-green transition-all">
              <span className="text-[9px] font-bold text-white">{(realCo2Saved / 1000).toFixed(0)}t</span>
              <span className="text-[6px] text-white/70">CO₂</span>
            </div>
            {peakHourCount > 0 && (
              <div onClick={() => onNavigate?.('DEMAND' as AdminScreen)} title="View Peak Hours"
                className="absolute top-0 left-2 w-14 h-14 rounded-full bg-accent-rose/70 flex flex-col items-center justify-center border-3 border-card-bg z-30 cursor-pointer hover:scale-110 hover:bg-accent-rose/90 transition-all">
                <span className="text-sm font-bold text-white">{peakHourCount}</span>
                <span className="text-[7px] text-white/80">peak hrs</span>
              </div>
            )}
          </div>
        </section>

        {/* Top Regions Card */}
        <section className="lg:col-span-4 card flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-3xl font-bold text-white">{displayTotalRides.toLocaleString()}</p>
              <p className="text-xs text-zinc-500">Total rides platform-wide</p>
            </div>
            <button onClick={handleHeatmapView} className="p-1.5 bg-zinc-800/50 rounded-lg border border-zinc-700 hover:bg-zinc-700/50 transition-colors">
              <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
            </button>
          </div>
          <div className="space-y-3 flex-1 overflow-y-auto">
            {demandZones.length > 0
              ? demandZones.slice(0, 5).map((z: any, i: number) => {
                  const colors = ['bg-accent-purple', 'bg-accent-cyan', 'bg-accent-yellow', 'bg-accent-green', 'bg-accent-rose'];
                  const region = z.region || z.name;
                  const value = z.rides ?? 0;
                  return (
                    <div key={i} className="flex items-center justify-between text-xs py-2 border-b border-zinc-800 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-3 ${colors[i % colors.length]} rounded-sm`}></span>
                        <span className="text-zinc-300">{region}</span>
                      </div>
                      <span className="font-semibold text-white">{value.toLocaleString()}</span>
                    </div>
                  );
                })
              : (
                <div className="flex items-center justify-center h-24">
                  <p className="text-xs text-zinc-600">No region data yet</p>
                </div>
              )
            }
          </div>
        </section>
      </div>

      {/* Zone Demand Alerts */}
      {demandZones.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white flex items-center gap-2">
              <span className="material-icons text-base text-accent-rose">crisis_alert</span>
              Zone Demand Alerts
              {demandZones.filter((z: any) => z.heatLevel === 'critical' || z.heatLevel === 'high').length > 0 && (
                <span className="px-2 py-0.5 text-[9px] font-bold bg-accent-rose/20 text-accent-rose rounded-full">
                  {demandZones.filter((z: any) => z.heatLevel === 'critical' || z.heatLevel === 'high').length} urgent
                </span>
              )}
            </h3>
            <p className="text-[10px] text-zinc-500">Live · updates every 60s</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {demandZones.map((z: any, i: number) => {
              const borderColors: Record<string, string> = { critical: 'border-l-accent-rose bg-accent-rose/5', high: 'border-l-orange-500 bg-orange-500/5', medium: 'border-l-accent-yellow bg-accent-yellow/5', low: 'border-l-accent-green bg-accent-green/5' };
              const textColors: Record<string, string> = { critical: 'text-accent-rose', high: 'text-orange-400', medium: 'text-accent-yellow', low: 'text-accent-green' };
              return (
                <div key={i} className={`p-3 rounded-xl border border-zinc-800 border-l-[3px] ${borderColors[z.heatLevel] || borderColors.low} flex flex-col gap-2`}>
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="text-[11px] font-bold text-white">{z.region || z.name}</p>
                      <span className={`text-[9px] font-bold uppercase ${textColors[z.heatLevel] || 'text-zinc-500'}`}>{z.heatLevel}</span>
                    </div>
                    {z.deficit > 0 && (
                      <span className="text-[10px] font-bold text-accent-rose whitespace-nowrap">-{z.deficit} drivers</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                    <span>{z.rides ?? 0} rides</span>
                    <span>{z.drivers ?? 0} drivers</span>
                    {z.predicted && <span className="text-zinc-500">~{z.predicted} predicted</span>}
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`${API}/driver-alerts/broadcast`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ zone: z.region || z.name, message: `High demand in ${z.region || z.name} — go online now for surge bonuses!` }),
                        });
                        if (res.ok) { const d = await res.json(); alert(`Alert sent to ${d.count} drivers in ${z.region || z.name}.`); }
                      } catch { alert('Failed to send alert.'); }
                    }}
                    className="mt-1 text-[9px] font-bold px-3 py-1 rounded-lg bg-zinc-800 hover:bg-accent-purple/20 hover:text-accent-purple border border-zinc-700 hover:border-accent-purple/40 text-zinc-300 transition-all self-start">
                    Alert Drivers
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ML Insights Section */}
      <MLInsightsPanel />
    </div>
  );
};

export default DashboardHome;

import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import HeatmapModal from './HeatmapModal';

const API = '/api/admin';

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
}

const StatCard: React.FC<{ icon: string; label: string; value: string | number; sub?: string; color: string; delay: string; pulse?: boolean }> = ({ icon, label, value, sub, color, delay, pulse }) => (
  <div className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 ${delay} ${pulse ? 'animate-pulse-scale' : ''} hover:scale-105 hover:shadow-lg transition-all duration-300 cursor-pointer`}>
    <div className="flex items-center gap-3 mb-3">
      <div className={`size-10 rounded-xl flex items-center justify-center ${color} shadow-lg animate-float`}>
        <span className="material-icons text-white text-lg">{icon}</span>
      </div>
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
    <div className="text-2xl font-black text-gray-900 dark:text-white count-up animate-count-up">{value}</div>
    {sub && <div className="text-[11px] text-gray-400 dark:text-gray-500 font-semibold mt-0.5">{sub}</div>}
  </div>
);

const MiniChart: React.FC<{ data: number[]; color: string }> = ({ data, color }) => {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[3px] h-10">
      {data.map((v, i) => (
        <div
          key={i}
          className={`w-[6px] rounded-full ${color} transition-all duration-500`}
          style={{ height: `${Math.max((v / max) * 100, 8)}%`, animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
};

const DashboardHome: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [hourlyRides, setHourlyRides] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [realtimeData, setRealtimeData] = useState<RealtimeUpdate | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  useEffect(() => {
    // Initialize Socket.IO connection
    const socketInstance = io('http://localhost:5002', {
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      console.log('✅ Connected to admin real-time updates');
    });

    socketInstance.on('stats-update', (data: RealtimeUpdate) => {
      setRealtimeData(data);
      setLastUpdate(new Date());
    });

    socketInstance.on('disconnect', () => {
      console.log('❌ Disconnected from admin server');
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, hourlyRes] = await Promise.all([
          fetch(`${API}/overview`),
          fetch(`${API}/peak-hours`)
        ]);
        if (statsRes.ok) {
          const s = await statsRes.json();
          setStats(s);
        }
        if (hourlyRes.ok) {
          const h = await hourlyRes.json();
          setHourlyRides(h.map((x: any) => x.rides));
        }
      } catch (e) {
        console.error('Dashboard fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fallback data for display
  const s = stats || {
    totalRides: 14520,
    activeDrivers: 342,
    totalRiders: 5130,
    poolSuccessRate: 72.4,
    co2Saved: 4280,
    revenue: 892400,
    avgWaitTime: 4.2,
    peakHour: '8 AM - 10 AM',
  };

  // Merge real-time data
  const displayActiveDrivers = realtimeData?.activeDrivers || s.activeDrivers;
  const ongoingRides = realtimeData?.ongoingRides || 0;
  const liveRiders = realtimeData?.liveRiders || 0;

  const hr = hourlyRides.length > 0 ? hourlyRides : [12, 18, 42, 86, 120, 145, 110, 95, 78, 65, 82, 108, 134, 125, 98, 85, 72, 90, 115, 132, 98, 64, 38, 20];

  // Quick Action Handlers
  const handleHeatmapView = () => {
    setShowHeatmap(true);
  };

  const handleDriverAlert = async () => {
    if (confirm('Send surge notification to all offline drivers?')) {
      try {
        const res = await fetch(`${API}/driver-alerts/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            zone: 'All Zones',
            message: '🚨 High demand alert! Go online now to earn surge bonuses!'
          })
        });
        if (res.ok) {
          const data = await res.json();
          alert(`✅ Alert sent to ${data.driversNotified} drivers!`);
        }
      } catch (err) {
        alert('❌ Failed to send alerts');
      }
    }
  };

  const handleExportReport = async () => {
    try {
      const period = prompt('Export period? (week / month / year)', 'month');
      if (!period) return;
      const url = `${API}/export/rides?format=csv&period=${encodeURIComponent(period)}`;
      const res = await fetch(url);
      if (res.ok) {
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `leaflift-rides-${period}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      } else {
        alert('❌ Export failed — no data');
      }
    } catch (err) {
      alert('❌ Export failed');
    }
  };

  const handlePeakConfig = async () => {
    try {
      const cfgRes = await fetch(`${API}/config/peak`);
      const cfg = cfgRes.ok ? await cfgRes.json() : { multiplier: 1.5 };
      const val = prompt(`Current peak multiplier: ${cfg.multiplier}×\nEnter new multiplier (0.5 - 4.0):`, String(cfg.multiplier));
      if (!val) return;
      const multiplier = parseFloat(val);
      if (isNaN(multiplier) || multiplier <= 0 || multiplier >= 5) {
        alert('❌ Invalid value — must be between 0.5 and 4.0');
        return;
      }
      const res = await fetch(`${API}/config/peak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ multiplier })
      });
      if (res.ok) {
        alert(`✅ Peak multiplier updated to ${multiplier}×`);
      }
    } catch (err) {
      alert('❌ Failed to update peak config');
    }
  };

  const handleSeedData = async () => {
    if (confirm('Seed demo data? (riders, drivers, rides, notifications)')) {
      try {
        const res = await fetch(`${API}/seed`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert(`✅ Seeded: ${data.riders} riders, ${data.drivers} drivers, ${data.rides} rides`);
          window.location.reload();
        } else {
          alert(`ℹ️ ${data.message || 'Data already exists'} (${data.rides} rides)`);
        }
      } catch (err) {
        alert('❌ Seed failed');
      }
    }
  };

  const quickActions = [
    { icon: 'map', label: 'Heatmap View', sub: 'Demand zones', action: handleHeatmapView },
    { icon: 'notification_important', label: 'Driver Alert', sub: 'Surge notify', action: handleDriverAlert },
    { icon: 'download', label: 'Export Report', sub: 'CSV download', action: handleExportReport },
    { icon: 'tune', label: 'Peak Config', sub: 'Set thresholds', action: handlePeakConfig },
    { icon: 'dataset', label: 'Seed Data', sub: 'Demo records', action: handleSeedData },
  ];

  return (
    <div className="px-5 py-4 pb-6">
      {/* Heatmap Modal */}
      <HeatmapModal isOpen={showHeatmap} onClose={() => setShowHeatmap(false)} />

      {/* Greeting */}
      <div className="mb-5 slide-up">
        <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight animate-slide-in-left">Analytics Overview</h1>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5 animate-slide-in-left" style={{ animationDelay: '100ms' }}>Real-time demand & usage intelligence</p>
      </div>

      {/* Live Indicator with Real-Time Stats */}
      <div className="bg-gradient-to-r from-leaf-50 to-emerald-50 dark:from-leaf-950/30 dark:to-emerald-950/30 rounded-2xl p-4 mb-5 border border-leaf-200/50 dark:border-leaf-800/30 slide-up-d1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-full bg-leaf-500 pulse-ring"></div>
            <span className="text-[11px] font-bold text-leaf-600 dark:text-leaf-400 tracking-wider uppercase">
              {loading ? 'Connecting...' : `Live — Updated ${lastUpdate.toLocaleTimeString()}`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="material-icons text-leaf-600 text-sm">directions_car</span>
              <span className="text-xs font-black text-leaf-700 dark:text-leaf-400">{ongoingRides}</span>
              <span className="text-[9px] text-gray-500 font-semibold">ongoing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="material-icons text-blue-600 text-sm">person</span>
              <span className="text-xs font-black text-blue-700 dark:text-blue-400">{liveRiders}</span>
              <span className="text-[9px] text-gray-500 font-semibold">riders</span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard icon="directions_car" label="Total Rides" value={s.totalRides.toLocaleString()} sub="All time" color="bg-leaf-500" delay="slide-up-d1" />
        <StatCard icon="person" label="Active Drivers" value={displayActiveDrivers} sub="Online now" color="bg-blue-500" delay="slide-up-d1" pulse={true} />
        <StatCard icon="groups" label="Pool Success" value={`${s.poolSuccessRate}%`} sub="Match rate" color="bg-purple-500" delay="slide-up-d2" />
        <StatCard icon="eco" label="CO₂ Saved" value={`${(s.co2Saved / 1000).toFixed(1)}t`} sub="Tons saved" color="bg-emerald-600" delay="slide-up-d2" />
        <StatCard icon="schedule" label="Avg Wait" value={`${s.avgWaitTime} min`} sub="Rider wait" color="bg-amber-500" delay="slide-up-d3" />
        <StatCard icon="payments" label="Revenue" value={`₹${(s.revenue / 1000).toFixed(0)}K`} sub="Total earnings" color="bg-rose-500" delay="slide-up-d3" />
      </div>

      {/* Hourly Ride Volume */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-gray-100 dark:border-zinc-800 mb-5 slide-up-d3 hover:shadow-xl transition-shadow duration-300">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Today's Ride Volume</p>
            <p className="text-lg font-black text-gray-900 dark:text-white mt-0.5 animate-count-up">{hr.reduce((a, b) => a + b, 0).toLocaleString()} rides</p>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-leaf-50 dark:bg-leaf-900/30 animate-pulse-slow">
            <span className="text-[10px] font-bold text-leaf-600 dark:text-leaf-400">24H</span>
          </div>
        </div>
        <MiniChart data={hr} color="bg-gradient-to-t from-leaf-400 to-leaf-600" />
        <div className="flex justify-between mt-2">
          <span className="text-[9px] text-gray-400 font-semibold">12AM</span>
          <span className="text-[9px] text-gray-400 font-semibold">6AM</span>
          <span className="text-[9px] text-gray-400 font-semibold">12PM</span>
          <span className="text-[9px] text-gray-400 font-semibold">6PM</span>
          <span className="text-[9px] text-gray-400 font-semibold">11PM</span>
        </div>
      </div>

      {/* Peak Hour Badge */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-4 border border-amber-200/50 dark:border-amber-800/30 mb-5 slide-up-d4 hover:scale-[1.02] transition-transform duration-300">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20 animate-bounce-slow">
            <span className="material-icons text-white">bolt</span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Peak Hour Detected</p>
            <p className="text-sm font-black text-amber-900 dark:text-amber-200">{s.peakHour}</p>
            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">Surge notifications sent to off-duty drivers</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d4">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-2">
          {quickActions.map((a, i) => (
            <button 
              key={i} 
              onClick={a.action}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-zinc-800 hover:bg-gradient-to-r hover:from-leaf-50 hover:to-emerald-50 dark:hover:from-leaf-950/30 dark:hover:to-emerald-950/30 hover:scale-105 hover:shadow-lg transition-all duration-300 text-left group"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <span className="material-icons-outlined text-lg text-leaf-600 dark:text-leaf-400 group-hover:scale-110 transition-transform">{a.icon}</span>
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-white">{a.label}</p>
                <p className="text-[10px] text-gray-400 font-semibold">{a.sub}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;

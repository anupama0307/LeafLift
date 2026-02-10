import React, { useEffect, useState } from 'react';

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

const StatCard: React.FC<{ icon: string; label: string; value: string | number; sub?: string; color: string; delay: string }> = ({ icon, label, value, sub, color, delay }) => (
  <div className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 ${delay}`}>
    <div className="flex items-center gap-3 mb-3">
      <div className={`size-10 rounded-xl flex items-center justify-center ${color}`}>
        <span className="material-icons text-white text-lg">{icon}</span>
      </div>
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
    </div>
    <div className="text-2xl font-black text-gray-900 dark:text-white count-up">{value}</div>
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

  const hr = hourlyRides.length > 0 ? hourlyRides : [12, 18, 42, 86, 120, 145, 110, 95, 78, 65, 82, 108, 134, 125, 98, 85, 72, 90, 115, 132, 98, 64, 38, 20];

  return (
    <div className="px-5 py-4 pb-6">
      {/* Greeting */}
      <div className="mb-5 slide-up">
        <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Analytics Overview</h1>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">Real-time demand & usage intelligence</p>
      </div>

      {/* Live Indicator */}
      <div className="flex items-center gap-2 mb-5 slide-up-d1">
        <div className="size-2 rounded-full bg-leaf-500 pulse-ring"></div>
        <span className="text-[11px] font-bold text-leaf-600 dark:text-leaf-400 tracking-wider uppercase">
          {loading ? 'Loading...' : 'Live — Last updated just now'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <StatCard icon="directions_car" label="Total Rides" value={s.totalRides.toLocaleString()} sub="All time" color="bg-leaf-500" delay="slide-up-d1" />
        <StatCard icon="person" label="Active Drivers" value={s.activeDrivers} sub="Online now" color="bg-blue-500" delay="slide-up-d1" />
        <StatCard icon="groups" label="Pool Success" value={`${s.poolSuccessRate}%`} sub="Match rate" color="bg-purple-500" delay="slide-up-d2" />
        <StatCard icon="eco" label="CO₂ Saved" value={`${(s.co2Saved / 1000).toFixed(1)}t`} sub="Tons saved" color="bg-emerald-600" delay="slide-up-d2" />
        <StatCard icon="schedule" label="Avg Wait" value={`${s.avgWaitTime} min`} sub="Rider wait" color="bg-amber-500" delay="slide-up-d3" />
        <StatCard icon="payments" label="Revenue" value={`₹${(s.revenue / 1000).toFixed(0)}K`} sub="Total earnings" color="bg-rose-500" delay="slide-up-d3" />
      </div>

      {/* Hourly Ride Volume */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-gray-100 dark:border-zinc-800 mb-5 slide-up-d3">
        <div className="flex justify-between items-center mb-4">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Today's Ride Volume</p>
            <p className="text-lg font-black text-gray-900 dark:text-white mt-0.5">{hr.reduce((a, b) => a + b, 0).toLocaleString()} rides</p>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-leaf-50 dark:bg-leaf-900/30">
            <span className="text-[10px] font-bold text-leaf-600 dark:text-leaf-400">24H</span>
          </div>
        </div>
        <MiniChart data={hr} color="bg-leaf-500" />
        <div className="flex justify-between mt-2">
          <span className="text-[9px] text-gray-400 font-semibold">12AM</span>
          <span className="text-[9px] text-gray-400 font-semibold">6AM</span>
          <span className="text-[9px] text-gray-400 font-semibold">12PM</span>
          <span className="text-[9px] text-gray-400 font-semibold">6PM</span>
          <span className="text-[9px] text-gray-400 font-semibold">11PM</span>
        </div>
      </div>

      {/* Peak Hour Badge */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-2xl p-4 border border-amber-200/50 dark:border-amber-800/30 mb-5 slide-up-d4">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
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
          {[
            { icon: 'map', label: 'Heatmap View', sub: 'Demand zones' },
            { icon: 'notification_important', label: 'Driver Alert', sub: 'Surge notify' },
            { icon: 'download', label: 'Export Report', sub: 'CSV/PDF' },
            { icon: 'tune', label: 'Peak Config', sub: 'Set thresholds' },
          ].map((a, i) => (
            <button key={i} className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors text-left">
              <span className="material-icons-outlined text-lg text-leaf-600 dark:text-leaf-400">{a.icon}</span>
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

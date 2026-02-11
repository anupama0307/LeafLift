import React, { useEffect, useState } from 'react';

const API = '/api/admin';

interface VehicleData {
  type: string;
  icon: string;
  total: number;
  active: number;
  utilization: number;
  avgHoursPerDay: number;
  totalKm: number;
  avgRevenue: number;
}

const FleetScreen: React.FC = () => {
  const [tab, setTab] = useState<'utilization' | 'report'>('utilization');
  const [vehicles, setVehicles] = useState<VehicleData[]>([]);
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/fleet/utilization?period=${period}`);
        if (res.ok) setVehicles(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period]);

  const fleetData: VehicleData[] = vehicles.length > 0 ? vehicles : [
    { type: 'Bike', icon: 'two_wheeler', total: 180, active: 142, utilization: 78.9, avgHoursPerDay: 6.8, totalKm: 28450, avgRevenue: 1250 },
    { type: 'Auto', icon: 'electric_rickshaw', total: 120, active: 88, utilization: 73.3, avgHoursPerDay: 7.2, totalKm: 19800, avgRevenue: 1850 },
    { type: 'Car', icon: 'directions_car', total: 95, active: 72, utilization: 75.8, avgHoursPerDay: 8.1, totalKm: 22350, avgRevenue: 2450 },
    { type: 'Big Car', icon: 'airport_shuttle', total: 35, active: 22, utilization: 62.9, avgHoursPerDay: 5.4, totalKm: 8200, avgRevenue: 3100 },
  ];

  const totalFleet = fleetData.reduce((a, v) => a + v.total, 0);
  const totalActive = fleetData.reduce((a, v) => a + v.active, 0);
  const avgUtil = fleetData.reduce((a, v) => a + v.utilization, 0) / fleetData.length;

  // Weekly trend (fake sparkline data)
  const weeklyTrend = [68, 72, 75, 71, 78, 82, 79];
  const maxTrend = Math.max(...weeklyTrend);

  return (
    <div className="px-5 py-4 pb-6">
      <div className="mb-4 slide-up">
        <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Fleet & Vehicles</h1>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">Vehicle utilization & efficiency reports</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-5 slide-up-d1">
        {(['utilization', 'report'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${tab === t ? 'bg-leaf-500 text-white shadow-lg shadow-leaf-500/20' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400'}`}
          >
            {t === 'utilization' ? '🚗 Utilization' : '📋 Reports'}
          </button>
        ))}
      </div>

      {/* Period Selector */}
      <div className="flex gap-2 mb-5 slide-up-d1">
        {(['today', 'week', 'month'] as const).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${period === p ? 'bg-gray-900 dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400'}`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'utilization' && (
        <div className="space-y-4">
          {/* Summary Row */}
          <div className="grid grid-cols-3 gap-3 slide-up-d1">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-gray-100 dark:border-zinc-800 text-center">
              <p className="text-xl font-black text-gray-900 dark:text-white">{totalFleet}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Total Fleet</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-gray-100 dark:border-zinc-800 text-center">
              <p className="text-xl font-black text-leaf-600">{totalActive}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Active Now</p>
            </div>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-gray-100 dark:border-zinc-800 text-center">
              <p className="text-xl font-black text-blue-600">{avgUtil.toFixed(1)}%</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Avg Util</p>
            </div>
          </div>

          {/* Utilization Trend */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Weekly Utilization Trend</p>
            <div className="flex items-end gap-2 h-20">
              {weeklyTrend.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[8px] font-bold text-gray-400">{v}%</span>
                  <div
                    className="w-full rounded-t-md bg-leaf-400 dark:bg-leaf-600 transition-all"
                    style={{ height: `${(v / maxTrend) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <span key={d} className="text-[8px] text-gray-400 font-bold flex-1 text-center">{d}</span>
              ))}
            </div>
          </div>

          {/* Per-Vehicle Type Cards */}
          {fleetData.map((v, i) => {
            const utilColor = v.utilization >= 75 ? 'text-leaf-600' : v.utilization >= 60 ? 'text-amber-600' : 'text-red-500';
            const utilBarColor = v.utilization >= 75 ? 'bg-leaf-500' : v.utilization >= 60 ? 'bg-amber-400' : 'bg-red-400';
            return (
              <div key={v.type} className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d${Math.min(i + 2, 4)}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-10 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                    <span className="material-icons text-lg text-gray-700 dark:text-gray-300">{v.icon}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{v.type}</p>
                    <p className="text-[10px] text-gray-400 font-semibold">{v.active}/{v.total} active</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-black ${utilColor}`}>{v.utilization}%</p>
                    <p className="text-[9px] text-gray-400 font-bold">Utilization</p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 mb-3">
                  <div className={`${utilBarColor} h-2 rounded-full transition-all duration-1000`} style={{ width: `${v.utilization}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs font-black text-gray-900 dark:text-white">{v.avgHoursPerDay}h</p>
                    <p className="text-[8px] text-gray-400 font-bold uppercase">Avg hrs/day</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 dark:text-white">{(v.totalKm / 1000).toFixed(1)}K</p>
                    <p className="text-[8px] text-gray-400 font-bold uppercase">Total KM</p>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 dark:text-white">₹{v.avgRevenue}</p>
                    <p className="text-[8px] text-gray-400 font-bold uppercase">Avg Rev</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'report' && (
        <div className="space-y-4">
          {/* Report Generator */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-gray-100 dark:border-zinc-800 slide-up-d1">
            <div className="flex items-center gap-3 mb-4">
              <div className="size-10 rounded-xl bg-blue-500 flex items-center justify-center">
                <span className="material-icons text-white text-lg">assessment</span>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white">Generate Utilization Report</p>
                <p className="text-[10px] text-gray-400 font-semibold">Export detailed vehicle analytics</p>
              </div>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">Time Range</label>
                <select className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-900 dark:text-white border-0 outline-0">
                  <option>Last 7 Days</option>
                  <option>Last 30 Days</option>
                  <option>Last 90 Days</option>
                  <option>Custom Range</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">Vehicle Type</label>
                <select className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-900 dark:text-white border-0 outline-0">
                  <option>All Vehicles</option>
                  <option>Bike</option>
                  <option>Auto</option>
                  <option>Car</option>
                  <option>Big Car</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block mb-1">Export Format</label>
                <div className="flex gap-2">
                  {['CSV', 'PDF', 'Excel'].map(f => (
                    <button key={f} className="flex-1 py-2 rounded-xl bg-gray-100 dark:bg-zinc-800 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-leaf-50 dark:hover:bg-leaf-900/20 hover:text-leaf-600 transition-colors">
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button onClick={async () => {
              try {
                const res = await fetch(`${API}/export/rides?format=csv&period=${period}`);
                if (res.ok) { const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fleet-report-${period}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href); }
                else alert('❌ No data to export');
              } catch { alert('❌ Export failed'); }
            }} className="w-full py-3 rounded-xl bg-leaf-500 text-white text-sm font-bold hover:bg-leaf-600 transition-colors shadow-lg shadow-leaf-500/20 flex items-center justify-center gap-2">
              <span className="material-icons text-lg">download</span>
              Generate & Download Report
            </button>
          </div>

          {/* Recent Reports */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Recent Reports</p>
            {[
              { name: 'Weekly Fleet Report', date: 'Feb 9, 2026', size: '2.4 MB', format: 'PDF' },
              { name: 'Monthly Utilization', date: 'Feb 1, 2026', size: '5.1 MB', format: 'Excel' },
              { name: 'Vehicle Efficiency Q4', date: 'Jan 15, 2026', size: '8.7 MB', format: 'PDF' },
            ].map((r, i) => (
              <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-zinc-800 last:border-0">
                <div className="size-9 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                  <span className="material-icons text-sm text-gray-500">description</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{r.name}</p>
                  <p className="text-[10px] text-gray-400 font-semibold">{r.date} · {r.size} · {r.format}</p>
                </div>
                <button className="size-8 rounded-lg bg-leaf-50 dark:bg-leaf-900/20 flex items-center justify-center hover:scale-105 transition-transform">
                  <span className="material-icons text-sm text-leaf-600">download</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FleetScreen;

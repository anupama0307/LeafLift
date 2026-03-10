import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

interface EcoStats { totalCO2Saved: number; totalCO2Emitted: number; poolingImpact: number; avgEfficiency: number; greenRidesPct: number; }
interface MonthlyEco { month: string; saved: number; emitted: number; efficiency: number; greenTrips?: number; treesEquivalent?: number; poolingSaved?: number; }

const SustainabilityDashboard: React.FC = () => {
  const [stats, setStats] = useState<EcoStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyEco[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/eco/stats');
      if (res.ok) {
        const d = await res.json();
        setStats(d.current);
        setMonthly(d.monthly || []);
      }
    } catch (e) { console.error('Eco fetch error:', e); }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const socket = io({ path: '/socket.io' });
    socket.on('eco-update', (d: any) => { if (d?.current) { setStats(d.current); if (d.monthly) setMonthly(d.monthly); } });
    const iv = setInterval(fetchData, 30000);
    return () => { socket.disconnect(); clearInterval(iv); };
  }, [fetchData]);

  const maxMonthly = Math.max(...monthly.map(m => Math.max(m.saved, m.emitted)), 1) * 1.1;
  const totalGreenTrips = monthly.reduce((s, m) => s + (m.greenTrips || 0), 0);
  const totalTreesEquiv = monthly.reduce((s, m) => s + (m.treesEquivalent || 0), 0);
  const totalPoolingSaved = monthly.reduce((s, m) => s + (m.poolingSaved || 0), 0);
  const sustainabilityScore = stats ? Math.min(100, Math.round((stats.totalCO2Saved / Math.max(stats.totalCO2Emitted, 1)) * 50 + stats.greenRidesPct * 0.5)) : 0;
  const scoreColor = sustainabilityScore >= 70 ? 'text-accent-green' : sustainabilityScore >= 40 ? 'text-accent-yellow' : 'text-accent-rose';
  const scoreStroke = sustainabilityScore >= 70 ? 'stroke-accent-green' : sustainabilityScore >= 40 ? 'stroke-accent-yellow' : 'stroke-accent-rose';

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-accent-green/20 border-t-accent-green rounded-full animate-spin"></div></div>;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Sustainability Dashboard</h1>
        <p className="text-xs text-zinc-500">Environmental impact tracking and CO2 analytics (real-time)</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'CO2 Saved', value: `${stats.totalCO2Saved.toFixed(1)} kg`, color: 'text-accent-green', icon: 'eco' },
            { label: 'CO2 Emitted', value: `${stats.totalCO2Emitted.toFixed(1)} kg`, color: 'text-accent-rose', icon: 'cloud' },
            { label: 'Pool Impact', value: `${stats.poolingImpact.toFixed(1)}%`, color: 'text-accent-purple', icon: 'group' },
            { label: 'Efficiency', value: `${stats.avgEfficiency.toFixed(1)}%`, color: 'text-accent-yellow', icon: 'speed' },
            { label: 'Green Rides', value: `${stats.greenRidesPct.toFixed(1)}%`, color: 'text-accent-cyan', icon: 'electric_car' },
            { label: 'Green Trip Count', value: totalGreenTrips.toLocaleString(), color: 'text-accent-green', icon: 'nature' },
            { label: 'Trees Equivalent', value: totalTreesEquiv.toLocaleString(), color: 'text-emerald-400', icon: 'park' },
            { label: 'Pool CO2 Saved', value: `${totalPoolingSaved.toFixed(1)} kg`, color: 'text-accent-purple', icon: 'commute' },
          ].map((c, i) => (
            <div key={i} className="card !p-4">
              <div className="flex items-center gap-2">
                <span className={`material-icons text-base ${c.color} opacity-60`}>{c.icon}</span>
                <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
              </div>
              <p className="text-[9px] text-zinc-500 font-semibold uppercase mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly CO2 Trend */}
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">CO2 Monthly Trend (kg)</h3>
          {monthly.length > 0 ? (
            <>
              <div className="flex items-end gap-3 h-64">
                {monthly.map((m, i) => (
                  <div key={i} className="group flex-1 flex flex-col items-center gap-1 relative">
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[8px] px-1.5 py-0.5 rounded border border-zinc-700 whitespace-nowrap z-10">
                      Saved: {m.saved.toFixed(1)} / Emitted: {m.emitted.toFixed(1)}
                    </div>
                    <div className="w-full flex gap-0.5 items-end">
                      <div className="flex-1 bg-accent-green rounded-t transition-all" style={{ height: `${Math.max(Math.round((m.saved / maxMonthly) * 230), 3)}px` }}></div>
                      <div className="flex-1 bg-accent-rose rounded-t transition-all" style={{ height: `${Math.max(Math.round((m.emitted / maxMonthly) * 230), 3)}px` }}></div>
                    </div>
                    <span className="text-[7px] text-zinc-500 font-semibold">{m.month.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800">
                <span className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="w-2 h-2 rounded-full bg-accent-green"></span>Saved</span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="w-2 h-2 rounded-full bg-accent-rose"></span>Emitted</span>
              </div>
            </>
          ) : <p className="text-xs text-zinc-500 text-center py-8">No monthly data available</p>}
        </div>

        {/* Sustainability Score */}
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">Sustainability Score</h3>
          <div className="flex flex-col items-center py-4">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" strokeWidth="8" className="stroke-zinc-800" />
                <circle cx="60" cy="60" r="50" fill="none" strokeWidth="8" strokeLinecap="round"
                  className={scoreStroke}
                  strokeDasharray={`${sustainabilityScore * 3.14} 314`} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold ${scoreColor}`}>{sustainabilityScore}</span>
                <span className="text-[9px] text-zinc-500 font-semibold">/ 100</span>
              </div>
            </div>
            <p className="text-[10px] text-zinc-500 text-center mt-4 max-w-xs">
              {sustainabilityScore >= 70
                ? 'Excellent sustainability performance. Fleet is operating efficiently with strong environmental impact.'
                : sustainabilityScore >= 40
                  ? 'Moderate sustainability. There is room to increase pooling adoption and reduce emissions.'
                  : 'Sustainability needs improvement. Focus on increasing pooled rides and optimizing routes.'}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Data Table */}
      {monthly.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">Monthly Environmental Summary</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Month</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">CO2 Saved (kg)</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">CO2 Emitted (kg)</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Net Impact</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Green Trips</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Trees Equiv.</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => {
                  const net = m.saved - m.emitted;
                  return (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="text-[10px] font-semibold text-white py-3 pr-4">{m.month}</td>
                      <td className="text-[10px] text-accent-green py-3 pr-4 font-semibold">{m.saved.toFixed(1)}</td>
                      <td className="text-[10px] text-accent-rose py-3 pr-4">{m.emitted.toFixed(1)}</td>
                      <td className={`text-[10px] font-semibold py-3 pr-4 ${net > 0 ? 'text-accent-green' : 'text-accent-rose'}`}>
                        {net > 0 ? '+' : ''}{net.toFixed(1)}
                      </td>
                      <td className="text-[10px] text-accent-green py-3 pr-4 font-semibold">{m.greenTrips ?? 0}</td>
                      <td className="text-[10px] text-emerald-400 py-3 pr-4">{m.treesEquivalent ?? 0}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full max-w-[50px]">
                            <div className={`h-full rounded-full ${m.efficiency >= 70 ? 'bg-accent-green' : m.efficiency >= 40 ? 'bg-accent-yellow' : 'bg-accent-rose'}`}
                              style={{ width: `${m.efficiency}%` }}></div>
                          </div>
                          <span className="text-[10px] font-bold text-white">{m.efficiency.toFixed(1)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default SustainabilityDashboard;

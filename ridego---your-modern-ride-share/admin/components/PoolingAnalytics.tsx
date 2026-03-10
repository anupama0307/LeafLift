import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

interface PoolingStats { totalPooled: number; totalSolo: number; successRate: number; avgSavings: number; avgOccupancy: number; }
interface MonthlyPooling { month: string; pooled: number; solo: number; rate: number; }

const PoolingAnalytics: React.FC = () => {
  const [stats, setStats] = useState<PoolingStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPooling[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pooling/stats');
      if (res.ok) {
        const d = await res.json();
        setStats(d.current);
        setMonthly(d.monthly || []);
      }
    } catch (e) { console.error('Pooling fetch error:', e); }
    finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const socket = io({ path: '/socket.io' });
    socket.on('pooling-update', (d: any) => { if (d?.current) { setStats(d.current); if (d.monthly) setMonthly(d.monthly); } });
    const iv = setInterval(fetchData, 30000);
    return () => { socket.disconnect(); clearInterval(iv); };
  }, [fetchData]);

  const maxMonthly = Math.max(...monthly.map(m => m.pooled + m.solo), 1) * 1.1;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin"></div></div>;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Ride Pooling Analytics</h1>
        <p className="text-xs text-zinc-500">Pooling success rates, savings, and trends (real-time)</p>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Pooled Rides', value: stats.totalPooled.toLocaleString(), color: 'text-accent-purple' },
            { label: 'Solo Rides', value: stats.totalSolo.toLocaleString(), color: 'text-zinc-400' },
            { label: 'Success Rate', value: `${stats.successRate.toFixed(1)}%`, color: stats.successRate >= 50 ? 'text-accent-green' : 'text-accent-yellow' },
            { label: 'Avg Savings', value: `${stats.avgSavings.toFixed(0)}%`, color: 'text-accent-cyan' },
            { label: 'Avg Occupancy', value: stats.avgOccupancy.toFixed(1), color: 'text-accent-yellow' },
          ].map((c, i) => (
            <div key={i} className="card !p-4">
              <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
              <p className="text-[9px] text-zinc-500 font-semibold uppercase mt-1">{c.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend Chart */}
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">Monthly Pooling Trend</h3>
          {monthly.length > 0 ? (
            <>
              <div className="flex items-end gap-2 h-64">
                {monthly.map((m, i) => {
                  const total = m.pooled + m.solo;
                  const barH = Math.max(Math.round((total / maxMonthly) * 230), 3);
                  const pooledPct = total > 0 ? (m.pooled / total) * 100 : 0;
                  return (
                    <div key={i} className="group flex-1 flex flex-col items-center relative">
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[8px] px-1.5 py-0.5 rounded border border-zinc-700 whitespace-nowrap z-10">
                        {m.pooled}P / {m.solo}S ({m.rate.toFixed(0)}%)
                      </div>
                      <div className="w-full rounded-t overflow-hidden" style={{ height: `${barH}px` }}>
                        <div className="bg-accent-purple" style={{ height: `${pooledPct}%` }}></div>
                        <div className="bg-zinc-800" style={{ height: `${100 - pooledPct}%` }}></div>
                      </div>
                      <span className="text-[7px] text-zinc-500 mt-1 font-semibold">{m.month.slice(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800">
                <span className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="w-2 h-2 rounded-full bg-accent-purple"></span>Pooled</span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-400"><span className="w-2 h-2 rounded-full bg-zinc-800"></span>Solo</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-zinc-500 text-center py-8">No monthly data available</p>
          )}
        </div>

        {/* Success Rate Gauge */}
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">Pooling Performance</h3>
          {stats && (
            <div className="flex flex-col items-center py-4">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" className="stroke-zinc-800" />
                  <circle cx="60" cy="60" r="50" fill="none" strokeWidth="10" strokeLinecap="round"
                    className={stats.successRate >= 60 ? 'stroke-accent-green' : stats.successRate >= 40 ? 'stroke-accent-yellow' : 'stroke-accent-rose'}
                    strokeDasharray={`${stats.successRate * 3.14} 314`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-bold text-white">{stats.successRate.toFixed(1)}%</span>
                  <span className="text-[9px] text-zinc-500 font-semibold">Success Rate</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-6 w-full max-w-xs">
                {[
                  { label: 'Pooled', value: stats.totalPooled, color: 'text-accent-purple' },
                  { label: 'Solo', value: stats.totalSolo, color: 'text-zinc-400' },
                  { label: 'Total', value: stats.totalPooled + stats.totalSolo, color: 'text-white' },
                ].map((s, i) => (
                  <div key={i} className="text-center">
                    <p className={`text-sm font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
                    <p className="text-[9px] text-zinc-500 font-semibold uppercase">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      {monthly.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">Monthly Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Month</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Pooled</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Solo</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Total</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Rate</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3">Trend</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m, i) => {
                  const prev = i > 0 ? monthly[i - 1].rate : m.rate;
                  const delta = m.rate - prev;
                  return (
                    <tr key={i} className="border-b border-zinc-800/50">
                      <td className="text-[10px] font-semibold text-white py-3 pr-4">{m.month}</td>
                      <td className="text-[10px] text-accent-purple py-3 pr-4 font-semibold">{m.pooled}</td>
                      <td className="text-[10px] text-zinc-400 py-3 pr-4">{m.solo}</td>
                      <td className="text-[10px] text-white py-3 pr-4 font-semibold">{m.pooled + m.solo}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full max-w-[50px]">
                            <div className={`h-full rounded-full ${m.rate >= 60 ? 'bg-accent-green' : m.rate >= 40 ? 'bg-accent-yellow' : 'bg-accent-rose'}`}
                              style={{ width: `${m.rate}%` }}></div>
                          </div>
                          <span className="text-[10px] font-bold text-white">{m.rate.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={`text-[10px] font-semibold ${delta > 0 ? 'text-accent-green' : delta < 0 ? 'text-accent-rose' : 'text-zinc-500'}`}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                        </span>
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

export default PoolingAnalytics;

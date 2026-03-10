import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

interface VehicleUtil { type: string; total: number; active: number; idle: number; maintenance: number; utilization: number; }
interface FleetInsight { title: string; suggestion: string; impact: string; priority: string; }

const FleetScreen: React.FC = () => {
  const [tab, setTab] = useState<'utilization' | 'report' | 'optimization'>('utilization');
  const [vehicles, setVehicles] = useState<VehicleUtil[]>([]);
  const [insights, setInsights] = useState<FleetInsight[]>([]);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [loading, setLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [utilRes, insightRes] = await Promise.all([
        fetch(`/api/admin/fleet/utilization?period=${period}`),
        fetch('/api/admin/ml/fleet-insights'),
      ]);
      if (utilRes.ok) setVehicles(await utilRes.json());
      if (insightRes.ok) { const d = await insightRes.json(); setInsights(d.insights || []); }
    } catch (e) { console.error('Fleet fetch error:', e); }
    finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
    const socket = io({ path: '/socket.io' });
    socket.on('fleet-update', (d: any) => {
      if (Array.isArray(d)) {
        setVehicles(d);
        return;
      }
      if (Array.isArray(d?.vehicles)) {
        setVehicles(d.vehicles);
      }
    });
    return () => { socket.disconnect(); };
  }, [fetchData]);

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const res = await fetch(`/api/admin/export/rides?period=${period}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `fleet_report_${period}.csv`; a.click(); URL.revokeObjectURL(url);
      }
    } catch (e) { console.error('Export error:', e); }
    finally { setExportLoading(false); }
  };

  const totalVehicles = vehicles.reduce((s, v) => s + v.total, 0);
  const totalActive = vehicles.reduce((s, v) => s + v.active, 0);
  const totalIdle = vehicles.reduce((s, v) => s + v.idle, 0);
  const totalMaint = vehicles.reduce((s, v) => s + v.maintenance, 0);
  const avgUtil = totalVehicles > 0 ? (totalActive / totalVehicles * 100) : 0;

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin"></div></div>;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Fleet Management</h1>
          <p className="text-xs text-zinc-500">Vehicle utilization, optimization, and reports</p>
        </div>
        <button onClick={handleExport} disabled={exportLoading}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent-purple hover:bg-accent-purple/80 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50">
          <span className="material-icons text-sm">{exportLoading ? 'hourglass_empty' : 'download'}</span>Export CSV
        </button>
      </div>

      {/* Tabs + Period */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-zinc-900 p-1 rounded-full border border-zinc-800">
          {[{ key: 'utilization', label: 'Utilization' }, { key: 'report', label: 'Report' }, { key: 'optimization', label: 'Optimization' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key as any)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === t.key ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-zinc-900 p-1 rounded-full border border-zinc-800">
          {(['day', 'week', 'month'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded-full text-[10px] font-semibold ${period === p ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: totalVehicles, color: 'text-accent-purple' },
          { label: 'Active', value: totalActive, color: 'text-accent-green' },
          { label: 'Idle', value: totalIdle, color: 'text-accent-yellow' },
          { label: 'Maintenance', value: totalMaint, color: 'text-accent-rose' },
          { label: 'Utilization', value: `${avgUtil.toFixed(1)}%`, color: 'text-accent-cyan' },
        ].map((c, i) => (
          <div key={i} className="card !p-4">
            <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[9px] text-zinc-500 font-semibold uppercase mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Utilization Tab */}
      {tab === 'utilization' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.length === 0 && (
            <div className="col-span-2 card text-center py-8">
              <p className="text-xs text-zinc-500">No fleet data available yet. Waiting for server data...</p>
            </div>
          )}
          {vehicles.map((v, i) => (
            <div key={i} className="card">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white capitalize">{v.type}</h3>
                <span className={`text-sm font-bold ${v.utilization >= 70 ? 'text-accent-green' : v.utilization >= 40 ? 'text-accent-yellow' : 'text-accent-rose'}`}>
                  {v.utilization.toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-4">
                <div className={`h-full rounded-full transition-all ${v.utilization >= 70 ? 'bg-accent-green' : v.utilization >= 40 ? 'bg-accent-yellow' : 'bg-accent-rose'}`}
                  style={{ width: `${v.utilization}%` }}></div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', value: v.total, c: 'text-white' },
                  { label: 'Active', value: v.active, c: 'text-accent-green' },
                  { label: 'Idle', value: v.idle, c: 'text-accent-yellow' },
                  { label: 'Service', value: v.maintenance, c: 'text-accent-rose' },
                ].map((s, j) => (
                  <div key={j} className="text-center">
                    <p className={`text-xs font-bold ${s.c}`}>{s.value}</p>
                    <p className="text-[8px] text-zinc-500 font-semibold uppercase">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-zinc-800">
                {v.total > 0 && <>
                  <div className="bg-accent-green transition-all" style={{ width: `${(v.active / v.total) * 100}%` }}></div>
                  <div className="bg-accent-yellow transition-all" style={{ width: `${(v.idle / v.total) * 100}%` }}></div>
                  <div className="bg-accent-rose transition-all" style={{ width: `${(v.maintenance / v.total) * 100}%` }}></div>
                </>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Report Tab */}
      {tab === 'report' && (
        <div className="card">
          <h3 className="text-sm font-bold text-white mb-4">Fleet Report ({period})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Type</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Total</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Active</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Idle</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Maintenance</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3 pr-4">Utilization</th>
                  <th className="text-[9px] font-bold text-zinc-500 uppercase pb-3">Trend</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-xs text-zinc-600 py-8">No fleet data available yet.</td></tr>
                )}
                {vehicles.map((v, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="text-[10px] font-semibold text-white py-3 pr-4 capitalize">{v.type}</td>
                    <td className="text-[10px] text-zinc-300 py-3 pr-4">{v.total}</td>
                    <td className="text-[10px] text-accent-green py-3 pr-4 font-semibold">{v.active}</td>
                    <td className="text-[10px] text-accent-yellow py-3 pr-4">{v.idle}</td>
                    <td className="text-[10px] text-accent-rose py-3 pr-4">{v.maintenance}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full max-w-[60px]">
                          <div className={`h-full rounded-full ${v.utilization >= 70 ? 'bg-accent-green' : v.utilization >= 40 ? 'bg-accent-yellow' : 'bg-accent-rose'}`}
                            style={{ width: `${v.utilization}%` }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-white">{v.utilization.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={`material-icons text-sm ${v.utilization >= 70 ? 'text-accent-green' : 'text-accent-rose'}`}>
                        {v.utilization >= 70 ? 'trending_up' : 'trending_down'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Optimization Tab */}
      {tab === 'optimization' && (
        <div className="space-y-4">
          <div className="card !pb-3">
            <h3 className="text-sm font-bold text-white mb-1">Fleet Optimization Insights</h3>
            <p className="text-[10px] text-zinc-500">AI-generated recommendations to improve fleet efficiency</p>
          </div>
          {insights.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((ins, i) => {
                const prColors: Record<string, { border: string; accent: string }> = {
                  high: { border: 'border-red-500/30', accent: 'text-red-400' },
                  medium: { border: 'border-amber-500/30', accent: 'text-amber-400' },
                  low: { border: 'border-accent-cyan/30', accent: 'text-accent-cyan' },
                };
                const pc = prColors[ins.priority] || prColors.medium;
                return (
                  <div key={i} className={`card border-l-[3px] ${pc.border}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-xs font-bold text-white">{ins.title}</h4>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-zinc-800 ${pc.accent}`}>{ins.priority}</span>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-relaxed">{ins.suggestion}</p>
                    <p className={`text-[9px] font-semibold mt-2 ${pc.accent}`}>Impact: {ins.impact}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card text-center py-8">
              <p className="text-xs text-zinc-500">No optimization insights available. Start the ML service to generate recommendations.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FleetScreen;

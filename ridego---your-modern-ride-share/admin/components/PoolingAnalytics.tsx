import React, { useEffect, useState } from 'react';

const API = '/api/admin';

interface MonthlyPooling {
  month: string;
  totalRequests: number;
  matched: number;
  successRate: number;
}

const PoolingAnalytics: React.FC = () => {
  const [data, setData] = useState<MonthlyPooling[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/pooling/stats`);
        if (res.ok) setData(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const poolData: MonthlyPooling[] = data.length > 0 ? data : [
    { month: 'Aug', totalRequests: 820, matched: 540, successRate: 65.9 },
    { month: 'Sep', totalRequests: 950, matched: 652, successRate: 68.6 },
    { month: 'Oct', totalRequests: 1100, matched: 792, successRate: 72.0 },
    { month: 'Nov', totalRequests: 1250, matched: 937, successRate: 75.0 },
    { month: 'Dec', totalRequests: 980, matched: 715, successRate: 73.0 },
    { month: 'Jan', totalRequests: 1380, matched: 1062, successRate: 77.0 },
    { month: 'Feb', totalRequests: 1450, matched: 1145, successRate: 78.9 },
  ];

  const currentMonth = poolData[poolData.length - 1];
  const prevMonth = poolData[poolData.length - 2];
  const rateChange = currentMonth.successRate - prevMonth.successRate;
  const maxReqs = Math.max(...poolData.map(d => d.totalRequests));

  // Summary calculations
  const totalMatched = poolData.reduce((a, d) => a + d.matched, 0);
  const totalRequests = poolData.reduce((a, d) => a + d.totalRequests, 0);
  const overallRate = ((totalMatched / totalRequests) * 100).toFixed(1);
  const co2SavedByPooling = Math.round(totalMatched * 0.85); // ~0.85kg CO2 per pooled ride

  return (
    <div className="px-5 py-4 pb-6">
      <div className="mb-4 slide-up">
        <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Pooling Analytics</h1>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">Ride-pooling success rates & performance</p>
      </div>

      {/* Big Metric Card */}
      <div className="bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl p-5 mb-5 slide-up-d1">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-icons text-white/60 text-sm">groups</span>
          <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Current Pool Success Rate</span>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-4xl font-black text-white">{currentMonth.successRate}%</span>
          <span className={`text-sm font-bold ${rateChange >= 0 ? 'text-leaf-300' : 'text-red-300'}`}>
            {rateChange >= 0 ? '↑' : '↓'} {Math.abs(rateChange).toFixed(1)}%
          </span>
        </div>
        <p className="text-xs text-white/60 font-semibold">{currentMonth.matched.toLocaleString()} / {currentMonth.totalRequests.toLocaleString()} requests matched this month</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5 slide-up-d1">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-gray-100 dark:border-zinc-800 text-center">
          <p className="text-lg font-black text-purple-600">{overallRate}%</p>
          <p className="text-[8px] font-bold text-gray-400 uppercase">All-time Rate</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-gray-100 dark:border-zinc-800 text-center">
          <p className="text-lg font-black text-leaf-600">{totalMatched.toLocaleString()}</p>
          <p className="text-[8px] font-bold text-gray-400 uppercase">Total Matched</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-gray-100 dark:border-zinc-800 text-center">
          <p className="text-lg font-black text-emerald-600">{(co2SavedByPooling / 1000).toFixed(1)}t</p>
          <p className="text-[8px] font-bold text-gray-400 uppercase">CO₂ from Pool</p>
        </div>
      </div>

      {/* Monthly Trend Chart */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 mb-5 slide-up-d2">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Monthly Pool Trends</p>
        <div className="flex items-end gap-2 h-32">
          {poolData.map((d, i) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[8px] font-bold text-purple-500">{d.successRate}%</span>
              <div className="w-full flex flex-col gap-0.5">
                {/* Total requests bar (background) */}
                <div className="relative w-full rounded-t-md overflow-hidden" style={{ height: `${(d.totalRequests / maxReqs) * 80}px` }}>
                  <div className="absolute inset-0 bg-gray-200 dark:bg-zinc-700 rounded-t-md" />
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-purple-500 dark:bg-purple-400 rounded-t-md transition-all duration-500"
                    style={{ height: `${d.successRate}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {poolData.map(d => (
            <span key={d.month} className="text-[8px] text-gray-400 font-bold flex-1 text-center">{d.month}</span>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-gray-300 dark:bg-zinc-600"></div>
            <span className="text-[9px] text-gray-400 font-bold">Total Requests</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-purple-500"></div>
            <span className="text-[9px] text-gray-400 font-bold">Matched Pools</span>
          </div>
        </div>
      </div>

      {/* Success Rate Trend (Line-style) */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 mb-5 slide-up-d3">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Success Rate Trend</p>
        <div className="flex items-center gap-1 h-12">
          {poolData.map((d, i) => {
            const h = ((d.successRate - 50) / 35) * 100; // normalize 50-85% range
            return (
              <div key={d.month} className="flex-1 flex items-end justify-center h-full">
                <div
                  className="w-3 rounded-full bg-gradient-to-t from-purple-500 to-purple-300 transition-all duration-500"
                  style={{ height: `${Math.max(h, 10)}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          {poolData.map(d => (
            <span key={d.month} className="flex-1 text-center text-[8px] text-gray-400 font-bold">{d.month}</span>
          ))}
        </div>
      </div>

      {/* Monthly Breakdown Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d4">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Detailed Breakdown</p>
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2 pb-2 border-b border-gray-100 dark:border-zinc-800">
            <span className="text-[9px] font-bold text-gray-400 uppercase">Month</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase text-right">Requests</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase text-right">Matched</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase text-right">Rate</span>
          </div>
          {[...poolData].reverse().map((d, i) => (
            <div key={d.month} className="grid grid-cols-4 gap-2 py-1.5">
              <span className="text-xs font-bold text-gray-900 dark:text-white">{d.month}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-right">{d.totalRequests.toLocaleString()}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400 text-right">{d.matched.toLocaleString()}</span>
              <div className="flex items-center justify-end gap-1">
                <span className="text-xs font-bold text-purple-600">{d.successRate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PoolingAnalytics;

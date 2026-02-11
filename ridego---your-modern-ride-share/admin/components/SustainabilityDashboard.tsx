import React, { useEffect, useState } from 'react';

const API = '/api/admin';

interface MonthlyEco {
  month: string;
  co2Saved: number;
  co2Emitted: number;
  poolingSaved: number;
  treesEquivalent: number;
  greenTrips: number;
}

const SustainabilityDashboard: React.FC = () => {
  const [data, setData] = useState<MonthlyEco[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API}/eco/stats`);
        if (res.ok) setData(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const ecoData: MonthlyEco[] = data.length > 0 ? data : [
    { month: 'Aug', co2Saved: 320, co2Emitted: 1850, poolingSaved: 180, treesEquivalent: 14, greenTrips: 420 },
    { month: 'Sep', co2Saved: 410, co2Emitted: 2100, poolingSaved: 225, treesEquivalent: 18, greenTrips: 510 },
    { month: 'Oct', co2Saved: 520, co2Emitted: 2350, poolingSaved: 290, treesEquivalent: 23, greenTrips: 640 },
    { month: 'Nov', co2Saved: 610, co2Emitted: 2480, poolingSaved: 345, treesEquivalent: 27, greenTrips: 720 },
    { month: 'Dec', co2Saved: 480, co2Emitted: 2150, poolingSaved: 260, treesEquivalent: 21, greenTrips: 580 },
    { month: 'Jan', co2Saved: 720, co2Emitted: 2680, poolingSaved: 410, treesEquivalent: 32, greenTrips: 850 },
    { month: 'Feb', co2Saved: 680, co2Emitted: 2520, poolingSaved: 385, treesEquivalent: 30, greenTrips: 790 },
  ];

  const totalSaved = ecoData.reduce((a, d) => a + d.co2Saved, 0);
  const totalEmitted = ecoData.reduce((a, d) => a + d.co2Emitted, 0);
  const totalPoolSaved = ecoData.reduce((a, d) => a + d.poolingSaved, 0);
  const totalTrees = ecoData.reduce((a, d) => a + d.treesEquivalent, 0);
  const totalGreenTrips = ecoData.reduce((a, d) => a + d.greenTrips, 0);
  const netReduction = ((totalSaved / (totalEmitted + totalSaved)) * 100).toFixed(1);

  const currentMonth = ecoData[ecoData.length - 1];
  const prevMonth = ecoData[ecoData.length - 2];
  const savingsChange = currentMonth.co2Saved - prevMonth.co2Saved;

  const maxSaved = Math.max(...ecoData.map(d => d.co2Saved));
  const maxEmitted = Math.max(...ecoData.map(d => d.co2Emitted));

  return (
    <div className="px-5 py-4 pb-6">
      <div className="mb-4 slide-up">
        <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Sustainability Impact</h1>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">Environmental footprint analytics</p>
      </div>

      {/* Hero Card */}
      <div className="bg-gradient-to-br from-emerald-500 to-green-700 rounded-2xl p-5 mb-5 slide-up-d1 relative overflow-hidden">
        <div className="absolute -right-4 -top-4 size-24 rounded-full bg-white/10"></div>
        <div className="absolute -right-8 -bottom-8 size-32 rounded-full bg-white/5"></div>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-icons text-white/60 text-lg">eco</span>
          <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Total CO₂ Saved</span>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-4xl font-black text-white">{(totalSaved / 1000).toFixed(1)}</span>
          <span className="text-lg font-bold text-white/80">tonnes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${savingsChange >= 0 ? 'text-green-200' : 'text-red-200'}`}>
            {savingsChange >= 0 ? '↑' : '↓'} {Math.abs(savingsChange)} kg vs last month
          </span>
        </div>
        <p className="text-[10px] text-white/50 font-semibold mt-2">Equivalent to planting {totalTrees} trees 🌳</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 mb-5 slide-up-d1">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <span className="material-icons text-emerald-600 text-sm">forest</span>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Net Reduction</span>
          </div>
          <p className="text-xl font-black text-emerald-600">{netReduction}%</p>
          <p className="text-[9px] text-gray-400 font-semibold">Of total emissions</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <span className="material-icons text-purple-600 text-sm">groups</span>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Pooling Savings</span>
          </div>
          <p className="text-xl font-black text-purple-600">{(totalPoolSaved / 1000).toFixed(1)}t</p>
          <p className="text-[9px] text-gray-400 font-semibold">From shared rides</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-8 rounded-lg bg-leaf-100 dark:bg-leaf-900/30 flex items-center justify-center">
              <span className="material-icons text-leaf-600 text-sm">directions_bike</span>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Green Trips</span>
          </div>
          <p className="text-xl font-black text-leaf-600">{totalGreenTrips.toLocaleString()}</p>
          <p className="text-[9px] text-gray-400 font-semibold">Eco rides taken</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-icons text-amber-600 text-sm">park</span>
            </div>
            <span className="text-[10px] font-bold text-gray-400 uppercase">Trees Equiv</span>
          </div>
          <p className="text-xl font-black text-amber-600">{totalTrees}</p>
          <p className="text-[9px] text-gray-400 font-semibold">Trees planted equiv</p>
        </div>
      </div>

      {/* CO2 Monthly Trend */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 mb-5 slide-up-d2">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Monthly CO₂ Trend</p>
        <div className="flex items-end gap-2 h-32">
          {ecoData.map((d, i) => (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
              <span className="text-[7px] font-bold text-emerald-600">{d.co2Saved}</span>
              <div className="w-full flex flex-col gap-[2px]">
                {/* Saved bar */}
                <div
                  className="w-full rounded-t-sm bg-emerald-400 transition-all duration-500"
                  style={{ height: `${(d.co2Saved / maxSaved) * 50}px` }}
                />
                {/* Emitted bar */}
                <div
                  className="w-full rounded-b-sm bg-red-300/50 dark:bg-red-800/30 transition-all duration-500"
                  style={{ height: `${(d.co2Emitted / maxEmitted) * 30}px` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {ecoData.map(d => (
            <span key={d.month} className="flex-1 text-center text-[8px] text-gray-400 font-bold">{d.month}</span>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-emerald-400"></div>
            <span className="text-[9px] text-gray-400 font-bold">CO₂ Saved (kg)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2.5 rounded-full bg-red-300/50"></div>
            <span className="text-[9px] text-gray-400 font-bold">CO₂ Emitted (kg)</span>
          </div>
        </div>
      </div>

      {/* Pooling Impact Breakdown */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 mb-5 slide-up-d3">
        <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Pooling Environment Impact</p>
        <div className="space-y-3">
          {ecoData.map((d, i) => (
            <div key={d.month} className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-600 dark:text-gray-400 w-8">{d.month}</span>
              <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-4 relative overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-700"
                  style={{ width: `${(d.poolingSaved / Math.max(...ecoData.map(e => e.poolingSaved))) * 100}%` }}
                />
                <span className="absolute right-2 top-0 h-full flex items-center text-[8px] font-bold text-gray-500 dark:text-gray-400">{d.poolingSaved} kg</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Environmental Score */}
      <div className="bg-gradient-to-r from-leaf-50 to-emerald-50 dark:from-leaf-950/20 dark:to-emerald-950/20 rounded-2xl p-5 border border-leaf-200/50 dark:border-leaf-800/30 slide-up-d4">
        <div className="flex items-center gap-3 mb-3">
          <div className="size-12 rounded-xl bg-leaf-500 flex items-center justify-center shadow-lg shadow-leaf-500/20">
            <span className="material-icons text-white text-xl">emoji_nature</span>
          </div>
          <div>
            <p className="text-xs font-bold text-leaf-800 dark:text-leaf-300 uppercase tracking-wider">Sustainability Score</p>
            <p className="text-2xl font-black text-leaf-700 dark:text-leaf-400">A+</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 font-semibold leading-relaxed">
          LeafLift has saved <strong className="text-leaf-600">{(totalSaved / 1000).toFixed(1)} tonnes</strong> of CO₂ this year through pooling ({(totalPoolSaved / 1000).toFixed(1)}t),
          route optimization, and efficient fleet management. Equivalent to <strong className="text-leaf-600">{totalTrees} trees</strong> planted.
        </p>
      </div>
    </div>
  );
};

export default SustainabilityDashboard;

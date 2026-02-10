import React, { useEffect, useState } from 'react';

const API = '/api/admin';

interface PeakHour {
  hour: number;
  label: string;
  rides: number;
  isPeak: boolean;
  threshold: number;
}

interface RegionDemand {
  region: string;
  current: number;
  predicted: number;
  drivers: number;
  deficit: number;
  heatLevel: 'low' | 'medium' | 'high' | 'critical';
}

interface DriverAlert {
  zone: string;
  message: string;
  driversNotified: number;
  sentAt: string;
}

const DemandScreen: React.FC = () => {
  const [tab, setTab] = useState<'forecast' | 'peak' | 'allocation'>('forecast');
  const [regions, setRegions] = useState<RegionDemand[]>([]);
  const [peakHours, setPeakHours] = useState<PeakHour[]>([]);
  const [alerts, setAlerts] = useState<DriverAlert[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [loading, setLoading] = useState(true);
  const [forecastDays, setForecastDays] = useState(7);

  useEffect(() => {
    const load = async () => {
      try {
        const [regRes, peakRes, alertRes] = await Promise.all([
          fetch(`${API}/demand/regions`),
          fetch(`${API}/peak-hours`),
          fetch(`${API}/driver-alerts`),
        ]);
        if (regRes.ok) setRegions(await regRes.json());
        if (peakRes.ok) setPeakHours(await peakRes.json());
        if (alertRes.ok) setAlerts(await alertRes.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Fallback data
  const regionData: RegionDemand[] = regions.length > 0 ? regions : [
    { region: 'RS Puram', current: 145, predicted: 178, drivers: 28, deficit: 12, heatLevel: 'critical' },
    { region: 'Gandhipuram', current: 120, predicted: 155, drivers: 35, deficit: 5, heatLevel: 'high' },
    { region: 'Peelamedu', current: 88, predicted: 96, drivers: 22, deficit: 3, heatLevel: 'medium' },
    { region: 'Saibaba Colony', current: 72, predicted: 85, drivers: 20, deficit: -2, heatLevel: 'medium' },
    { region: 'Singanallur', current: 55, predicted: 62, drivers: 18, deficit: -5, heatLevel: 'low' },
    { region: 'Ukkadam', current: 98, predicted: 130, drivers: 15, deficit: 14, heatLevel: 'critical' },
    { region: 'Town Hall', current: 110, predicted: 142, drivers: 30, deficit: 8, heatLevel: 'high' },
    { region: 'Avinashi Road', current: 65, predicted: 70, drivers: 25, deficit: -8, heatLevel: 'low' },
  ];

  const peakData: PeakHour[] = peakHours.length > 0 ? peakHours : Array.from({ length: 24 }, (_, i) => {
    const rides = [12, 8, 5, 4, 6, 18, 55, 120, 145, 130, 95, 78, 82, 90, 88, 75, 85, 110, 135, 128, 92, 58, 32, 18][i];
    return { hour: i, label: `${i === 0 ? '12' : i > 12 ? i - 12 : i}${i < 12 ? 'AM' : 'PM'}`, rides, isPeak: rides > 100, threshold: 100 };
  });

  const alertData: DriverAlert[] = alerts.length > 0 ? alerts : [
    { zone: 'RS Puram', message: '🚨 High demand! 12 more drivers needed', driversNotified: 28, sentAt: '2 min ago' },
    { zone: 'Ukkadam', message: '🚨 Surge active! Extra drivers requested', driversNotified: 15, sentAt: '8 min ago' },
    { zone: 'Town Hall', message: '⚠️ Demand rising — 8 driver gap', driversNotified: 20, sentAt: '15 min ago' },
  ];

  const heatColor = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-500';
      case 'high': return 'bg-orange-500';
      case 'medium': return 'bg-amber-400';
      default: return 'bg-leaf-400';
    }
  };

  const heatBg = (level: string) => {
    switch (level) {
      case 'critical': return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/30';
      case 'high': return 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800/30';
      case 'medium': return 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30';
      default: return 'bg-leaf-50 dark:bg-leaf-950/20 border-leaf-200 dark:border-leaf-800/30';
    }
  };

  const maxRides = Math.max(...peakData.map(p => p.rides), 1);

  return (
    <div className="px-5 py-4 pb-6">
      <div className="mb-4 slide-up">
        <h1 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">Demand Intelligence</h1>
        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-0.5">Forecast, peak hours & driver allocation</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-5 slide-up-d1">
        {(['forecast', 'peak', 'allocation'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${tab === t ? 'bg-leaf-500 text-white shadow-lg shadow-leaf-500/20' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400'}`}
          >
            {t === 'forecast' ? '📊 Forecast' : t === 'peak' ? '⏰ Peak Hours' : '🚗 Allocation'}
          </button>
        ))}
      </div>

      {/* === FORECAST TAB === */}
      {tab === 'forecast' && (
        <div className="space-y-4">
          {/* Forecast Period Selector */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d1">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Forecast Period</p>
            <div className="flex gap-2">
              {[1, 3, 7, 14].map(d => (
                <button key={d} onClick={() => setForecastDays(d)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${forecastDays === d ? 'bg-leaf-500 text-white' : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400'}`}>
                  {d}D
                </button>
              ))}
            </div>
          </div>

          {/* Heatmap Grid */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d2">
            <div className="flex justify-between items-center mb-4">
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Demand Heatmap</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Predicted demand by region</p>
              </div>
              <div className="flex items-center gap-1.5">
                {['low', 'medium', 'high', 'critical'].map(l => (
                  <div key={l} className="flex items-center gap-1">
                    <div className={`size-2 rounded-full ${heatColor(l)}`}></div>
                    <span className="text-[8px] font-bold text-gray-400 capitalize">{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {regionData.map((r, i) => (
                <button
                  key={r.region}
                  onClick={() => setSelectedRegion(r.region === selectedRegion ? '' : r.region)}
                  className={`p-3 rounded-xl border transition-all text-left ${selectedRegion === r.region ? 'ring-2 ring-leaf-500 ' : ''}${heatBg(r.heatLevel)}`}
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={`size-2.5 rounded-full ${heatColor(r.heatLevel)}`}></div>
                    <span className="text-[11px] font-bold text-gray-900 dark:text-white truncate">{r.region}</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black text-gray-900 dark:text-white">{r.predicted}</span>
                    <span className="text-[10px] text-gray-400 font-semibold">predicted</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold text-gray-500">Now: {r.current}</span>
                    <span className="text-[10px] font-bold text-gray-500">🚗 {r.drivers}</span>
                  </div>
                  {r.deficit > 0 && (
                    <div className="mt-1.5 px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-900/30 inline-block">
                      <span className="text-[9px] font-bold text-red-600 dark:text-red-400">⚠ {r.deficit} drivers short</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Selected Region Detail */}
          {selectedRegion && (
            <div className="bg-gradient-to-r from-leaf-50 to-emerald-50 dark:from-leaf-950/20 dark:to-emerald-950/20 rounded-2xl p-4 border border-leaf-200/50 dark:border-leaf-800/30 slide-up">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-extrabold text-gray-900 dark:text-white">{selectedRegion} — Detailed Forecast</p>
                <button onClick={() => setSelectedRegion('')} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {(() => {
                  const r = regionData.find(x => x.region === selectedRegion)!;
                  return (
                    <>
                      <div className="text-center">
                        <p className="text-xl font-black text-leaf-600">{r.current}</p>
                        <p className="text-[9px] font-bold text-gray-500 uppercase">Current</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-black text-amber-600">{r.predicted}</p>
                        <p className="text-[9px] font-bold text-gray-500 uppercase">Predicted</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-black text-blue-600">{r.drivers}</p>
                        <p className="text-[9px] font-bold text-gray-500 uppercase">Drivers</p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* === PEAK HOURS TAB === */}
      {tab === 'peak' && (
        <div className="space-y-4">
          {/* Peak Summary */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-2xl p-4 border border-amber-200/50 dark:border-amber-800/30 slide-up-d1">
            <div className="flex items-center gap-3 mb-2">
              <div className="size-10 rounded-xl bg-amber-500 flex items-center justify-center">
                <span className="material-icons text-white text-lg">bolt</span>
              </div>
              <div>
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">Peak Hours Detected</p>
                <p className="text-sm font-black text-amber-900 dark:text-amber-200">
                  {peakData.filter(p => p.isPeak).map(p => p.label).join(', ') || 'None'}
                </p>
              </div>
            </div>
            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              Threshold: &gt;{peakData[0]?.threshold || 100} rides/hour — {peakData.filter(p => p.isPeak).length} peak hours flagged today
            </p>
          </div>

          {/* Hourly Bar Chart */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Hourly Ride Distribution</p>
            <div className="flex items-end gap-[3px] h-36">
              {peakData.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[7px] font-bold text-gray-400">{p.rides}</span>
                  <div
                    className={`w-full rounded-t-md transition-all duration-500 ${p.isPeak ? 'bg-amber-500' : 'bg-leaf-400 dark:bg-leaf-600'}`}
                    style={{ height: `${Math.max((p.rides / maxRides) * 100, 4)}%` }}
                  />
                  {p.isPeak && <div className="size-1.5 rounded-full bg-red-500"></div>}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              {[0, 6, 12, 18, 23].map(h => (
                <span key={h} className="text-[8px] text-gray-400 font-bold">{peakData[h]?.label}</span>
              ))}
            </div>
          </div>

          {/* Peak Configuration Panel */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d3">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Peak Configuration</p>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Volume Threshold</span>
                <span className="text-xs font-black text-leaf-600">100 rides/hr</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
                <div className="bg-leaf-500 h-2 rounded-full" style={{ width: '65%' }}></div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Auto-notify Drivers</span>
                <div className="w-10 h-6 bg-leaf-500 rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 size-4 bg-white rounded-full shadow-md"></div>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Surge Pricing</span>
                <div className="w-10 h-6 bg-leaf-500 rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 size-4 bg-white rounded-full shadow-md"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === ALLOCATION TAB === */}
      {tab === 'allocation' && (
        <div className="space-y-4">
          {/* Real-time Zone Monitor */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d1">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Zone Demand vs Drivers</p>
            {regionData.filter(r => r.deficit > 0).map((r, i) => (
              <div key={r.region} className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-zinc-800 last:border-0">
                <div className={`size-9 rounded-lg ${heatColor(r.heatLevel)} flex items-center justify-center`}>
                  <span className="text-white text-xs font-black">{r.deficit}</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{r.region}</p>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-[10px] text-gray-400">Demand: {r.predicted}</span>
                    <span className="text-[10px] text-gray-400">Drivers: {r.drivers}</span>
                  </div>
                </div>
                <button className="px-3 py-1.5 rounded-lg bg-leaf-500 text-white text-[10px] font-bold hover:bg-leaf-600 transition-colors">
                  Notify
                </button>
              </div>
            ))}
          </div>

          {/* Driver Alerts Log */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 slide-up-d2">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Driver Surge Alerts</p>
            {alertData.map((a, i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 dark:border-zinc-800 last:border-0">
                <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mt-0.5">
                  <span className="material-icons text-amber-600 text-sm">campaign</span>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{a.zone}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">{a.message}</p>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[9px] font-bold text-leaf-600">{a.driversNotified} drivers notified</span>
                    <span className="text-[9px] text-gray-400">{a.sentAt}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Broadcast Button */}
          <button className="w-full py-3.5 rounded-xl bg-leaf-500 text-white text-sm font-bold hover:bg-leaf-600 transition-colors shadow-lg shadow-leaf-500/20 flex items-center justify-center gap-2 slide-up-d3">
            <span className="material-icons text-lg">send</span>
            Broadcast Surge Alert to All Nearby Drivers
          </button>
        </div>
      )}
    </div>
  );
};

export default DemandScreen;

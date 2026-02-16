import React, { useEffect, useState } from 'react';

const API = '/api/admin';

interface MLPrediction {
  prediction: number;
  confidence: number;
  factors: { hourFactor: number; dayFactor: number; baseDemand: number };
  metadata: { dataPoints: number; targetHour: number; targetDay: number; region: string };
}

interface Bottleneck {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  value: number;
  message: string;
  recommendation: string;
}

const MLInsightsPanel: React.FC = () => {
  const [prediction, setPrediction] = useState<MLPrediction | null>(null);
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [predRes, bottleRes] = await Promise.all([
          fetch(`${API}/ml/predict-demand?hour=${selectedHour}`),
          fetch(`${API}/ml/bottlenecks`)
        ]);
        if (predRes.ok) setPrediction(await predRes.json());
        if (bottleRes.ok) { const data = await bottleRes.json(); setBottlenecks(data.bottlenecks || []); }
      } catch (e) { console.error('ML insights fetch error:', e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [selectedHour]);

  const severityStyle = (sev: string) => {
    switch (sev) {
      case 'critical': return { dot: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40', text: 'text-red-700 dark:text-red-400' };
      case 'warning': return { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40', text: 'text-amber-700 dark:text-amber-400' };
      default: return { dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/40', text: 'text-blue-700 dark:text-blue-400' };
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-black rounded-xl p-6 border border-gray-200 dark:border-zinc-900 animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-black rounded w-1/3 mb-4"></div>
        <div className="h-16 bg-gray-200 dark:bg-black rounded"></div>
      </div>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const targetDayName = dayNames[prediction?.metadata?.targetDay ?? new Date().getDay()];

  return (
    <div className="space-y-4">
      {/* ML Demand Prediction */}
      <div className="bg-white dark:bg-black rounded-xl p-5 border border-gray-200 dark:border-zinc-900">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons text-gray-500 dark:text-gray-400 text-lg">psychology</span>
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ML Demand Prediction</span>
        </div>

        {/* Prediction result */}
        <div className="flex items-center gap-6 mb-4">
          <div>
            <span className="text-3xl font-bold text-gray-900 dark:text-white">{prediction?.prediction || 0}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">rides/hour</span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 bg-gray-200 dark:bg-black rounded-full h-2">
              <div className="h-2 rounded-full bg-blue-500 dark:bg-blue-400 transition-all duration-500" style={{ width: `${prediction?.confidence || 0}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">{prediction?.confidence || 0}% confidence</span>
          </div>
        </div>

        {/* Hour selector - compact */}
        <div className="mb-4">
          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1.5">Select hour ({targetDayName})</p>
          <div className="flex gap-0.5">
            {[...Array(24)].map((_, h) => (
              <button key={h} onClick={() => setSelectedHour(h)}
                className={`flex-1 py-1.5 rounded text-[9px] font-semibold transition-all ${h === selectedHour ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-black text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-900'}`}>
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 dark:bg-black rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{prediction?.factors?.hourFactor?.toFixed(1) || '1.0'}x</p>
            <p className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Hour Factor</p>
          </div>
          <div className="bg-gray-50 dark:bg-black rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{prediction?.factors?.dayFactor?.toFixed(1) || '1.0'}x</p>
            <p className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Day Factor</p>
          </div>
          <div className="bg-gray-50 dark:bg-black rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-900 dark:text-white">{prediction?.factors?.baseDemand || 0}</p>
            <p className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase">Base Demand</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">Based on {prediction?.metadata?.dataPoints || 0} historical ride records from the last 30 days.</p>
      </div>

      {/* Operational Bottlenecks */}
      {bottlenecks.length > 0 && (
        <div className="bg-white dark:bg-black rounded-xl p-5 border border-gray-200 dark:border-zinc-900">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-icons text-gray-500 dark:text-gray-400 text-lg">warning_amber</span>
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Operational Issues</span>
            <span className="ml-auto text-[10px] font-semibold text-gray-400 dark:text-gray-500">{bottlenecks.length} detected</span>
          </div>
          <div className="space-y-2.5">
            {bottlenecks.map((b, i) => {
              const style = severityStyle(b.severity);
              return (
                <div key={i} className={`p-3 rounded-lg border ${style.bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`size-2 rounded-full ${style.dot}`}></div>
                    <span className={`text-xs font-semibold ${style.text}`}>{b.type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 ml-auto">{b.value}%</span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-1.5">{b.message}</p>
                  <div className="flex items-start gap-1.5">
                    <span className="material-icons text-xs text-gray-400 mt-0.5">lightbulb</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{b.recommendation}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MLInsightsPanel;

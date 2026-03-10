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
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [selectedHour]);

  const severityStyle = (sev: string) => {
    switch (sev) {
      case 'critical': return { dot: 'bg-accent-rose', border: 'border-l-accent-rose', text: 'text-accent-rose' };
      case 'warning': return { dot: 'bg-accent-yellow', border: 'border-l-accent-yellow', text: 'text-accent-yellow' };
      default: return { dot: 'bg-accent-cyan', border: 'border-l-accent-cyan', text: 'text-accent-cyan' };
    }
  };

  if (loading) {
    return (
      <div className="card animate-pulse">
        <div className="h-5 bg-zinc-800 rounded w-1/3 mb-4"></div>
        <div className="h-16 bg-zinc-800 rounded"></div>
      </div>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const targetDayName = dayNames[prediction?.metadata?.targetDay ?? new Date().getDay()];

  return (
    <div className="space-y-6">
      {/* ML Demand Prediction */}
      <div className="card">
        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-4">ML Demand Prediction</p>

        {/* Prediction result */}
        <div className="flex items-center gap-6 mb-5">
          <div>
            <span className="text-3xl font-bold text-white">{prediction?.prediction || 0}</span>
            <span className="text-sm text-zinc-500 ml-2">rides/hour</span>
          </div>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex-1 bg-zinc-800 rounded-full h-2">
              <div className="h-2 rounded-full bg-accent-purple transition-all duration-500" style={{ width: `${prediction?.confidence || 0}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-zinc-400">{prediction?.confidence || 0}%</span>
          </div>
        </div>

        {/* Hour selector */}
        <div className="mb-5">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase mb-2">Select hour ({targetDayName})</p>
          <div className="flex gap-0.5">
            {[...Array(24)].map((_, h) => (
              <button key={h} onClick={() => setSelectedHour(h)}
                className={`flex-1 py-1.5 rounded text-[9px] font-semibold transition-all ${h === selectedHour ? 'bg-accent-purple text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}>
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Hour Factor', value: `${prediction?.factors?.hourFactor?.toFixed(1) || '1.0'}x`, color: 'text-accent-purple' },
            { label: 'Day Factor', value: `${prediction?.factors?.dayFactor?.toFixed(1) || '1.0'}x`, color: 'text-accent-cyan' },
            { label: 'Base Demand', value: `${prediction?.factors?.baseDemand || 0}`, color: 'text-accent-yellow' },
          ].map((f, i) => (
            <div key={i} className="bg-zinc-900 rounded-xl p-3 text-center border border-zinc-800">
              <p className={`text-lg font-bold ${f.color}`}>{f.value}</p>
              <p className="text-[9px] font-semibold text-zinc-500 uppercase">{f.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500 mt-3">Based on {prediction?.metadata?.dataPoints || 0} historical ride records from the last 30 days.</p>
      </div>

      {/* Operational Bottlenecks */}
      {bottlenecks.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Operational Issues</p>
            <span className="text-[10px] font-semibold text-zinc-500">{bottlenecks.length} detected</span>
          </div>
          <div className="space-y-2.5">
            {bottlenecks.map((b, i) => {
              const style = severityStyle(b.severity);
              return (
                <div key={i} className={`p-3 rounded-xl bg-zinc-900 border-l-4 ${style.border}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2 h-2 rounded-full ${style.dot}`}></div>
                    <span className={`text-xs font-semibold ${style.text}`}>{b.type.replace(/_/g, ' ')}</span>
                    <span className="text-[10px] font-semibold text-zinc-500 ml-auto">{b.value}%</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mb-1.5">{b.message}</p>
                  <div className="flex items-start gap-1.5">
                    <span className="material-icons text-xs text-zinc-500 mt-0.5">lightbulb</span>
                    <span className="text-[10px] text-zinc-500">{b.recommendation}</span>
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

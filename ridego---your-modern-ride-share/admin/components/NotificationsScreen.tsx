import React, { useEffect, useState, useCallback } from 'react';

interface DriverOption { _id: string; name: string; email: string; region?: string; }
interface NotifRecord { _id: string; recipientId: string; recipientName: string; type: string; title: string; body: string; isSuggestion: boolean; region?: string; createdAt: string; }

const REGIONS = ['All Regions', 'RS Puram', 'Gandhipuram', 'Peelamedu', 'Saravanampatti', 'Singanallur', 'Ukkadam', 'Sulur', 'Mettupalayam', 'Kovaipudur'];

const NotificationsScreen: React.FC = () => {
  const [tab, setTab] = useState<'send' | 'history'>('send');
  const [mode, setMode] = useState<'individual' | 'broadcast'>('individual');
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSuggestion, setIsSuggestion] = useState(false);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<NotifRecord[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [regionFilter, setRegionFilter] = useState('All Regions');
  const [searchQ, setSearchQ] = useState('');

  const fetchDrivers = useCallback(async () => {
    try { const res = await fetch('/api/admin/notifications/drivers'); if (res.ok) setDrivers(await res.json()); } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistLoading(true);
    try { const res = await fetch('/api/admin/notifications/history'); if (res.ok) setHistory(await res.json()); } catch {}
    finally { setHistLoading(false); }
  }, []);

  useEffect(() => { fetchDrivers(); fetchHistory(); }, [fetchDrivers, fetchHistory]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return setError('Title and body are required');
    if (mode === 'individual' && !selectedDriver) return setError('Select a driver');
    setSending(true); setError(''); setSuccess('');
    try {
      const endpoint = mode === 'broadcast' ? '/api/admin/notifications/broadcast' : '/api/admin/notifications/send';
      const payload: any = { title, body, type: isSuggestion ? 'suggestion' : 'admin' };
      if (mode === 'individual') payload.driverId = selectedDriver;
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) { setSuccess(mode === 'broadcast' ? 'Broadcast sent successfully' : 'Notification sent'); setTitle(''); setBody(''); setSelectedDriver(''); fetchHistory(); }
      else { const d = await res.json(); setError(d.error || 'Failed to send'); }
    } catch (e: any) { setError(e.message || 'Network error'); }
    finally { setSending(false); }
  };

  const filteredHistory = history.filter(n => {
    const matchesRegion = regionFilter === 'All Regions' || (n.region || '').includes(regionFilter);
    const matchesSearch = !searchQ || n.title.toLowerCase().includes(searchQ.toLowerCase()) || n.recipientName.toLowerCase().includes(searchQ.toLowerCase()) || n.body.toLowerCase().includes(searchQ.toLowerCase());
    return matchesRegion && matchesSearch;
  });

  const quickTemplates = [
    { title: 'High Demand Zone', body: 'High ride demand detected in your area. Consider heading to the hotspot for more rides.' },
    { title: 'Shift Reminder', body: 'Your scheduled shift starts in 30 minutes. Please ensure you are available and ready.' },
    { title: 'Vehicle Inspection Due', body: 'Your vehicle inspection is due soon. Please schedule your visit at the nearest service center.' },
    { title: 'Performance Update', body: 'Your performance rating has been updated. Check the driver dashboard for details.' },
    { title: 'Safety Alert', body: 'A weather or traffic advisory has been issued for your region. Please drive carefully.' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-lg font-bold text-gray-900 dark:text-white">Notifications</h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">Send alerts and suggestions to drivers</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-black p-1 rounded-lg w-fit">
        {[{ key: 'send', label: 'Compose', icon: 'edit' }, { key: 'history', label: 'History', icon: 'history' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${tab === t.key ? 'bg-white dark:bg-black text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
            <span className="material-icons" style={{ fontSize: '14px' }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Send Tab */}
      {tab === 'send' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Form */}
          <div className="lg:col-span-2 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 p-5">
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 mb-4">
              {['individual', 'broadcast'].map(m => (
                <button key={m} onClick={() => setMode(m as any)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${mode === m ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border-gray-200 dark:border-zinc-900 text-gray-500 hover:border-gray-300'}`}>
                  <span className="material-icons" style={{ fontSize: '14px' }}>{m === 'individual' ? 'person' : 'campaign'}</span>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {mode === 'individual' && (
              <div className="mb-3">
                <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Recipient</label>
                <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
                  className="w-full p-2 bg-gray-50 dark:bg-black border border-gray-200 dark:border-zinc-900 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 outline-none">
                  <option value="">Select a driver...</option>
                  {drivers.map(d => <option key={d._id} value={d._id}>{d.name} ({d.email})</option>)}
                </select>
              </div>
            )}

            <div className="mb-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title"
                className="w-full p-2 bg-gray-50 dark:bg-black border border-gray-200 dark:border-zinc-900 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 outline-none" />
            </div>

            <div className="mb-3">
              <label className="text-[10px] font-bold text-gray-500 uppercase mb-1 block">Message</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Notification body..." rows={4}
                className="w-full p-2 bg-gray-50 dark:bg-black border border-gray-200 dark:border-zinc-900 rounded-lg text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600 outline-none resize-none" />
            </div>

            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => setIsSuggestion(!isSuggestion)}
                className={`size-4 rounded border transition-colors ${isSuggestion ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-zinc-900'}`}>
                {isSuggestion && <span className="material-icons text-white" style={{ fontSize: '12px' }}>check</span>}
              </button>
              <span className="text-[10px] font-semibold text-gray-600 dark:text-white">Mark as suggestion (non-critical)</span>
            </div>

            {error && <p className="text-xs text-red-500 font-semibold mb-3 flex items-center gap-1"><span className="material-icons text-sm">error</span>{error}</p>}
            {success && <p className="text-xs text-green-500 font-semibold mb-3 flex items-center gap-1"><span className="material-icons text-sm">check_circle</span>{success}</p>}

            <button onClick={handleSend} disabled={sending}
              className="w-full py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
              <span className="material-icons text-sm">{sending ? 'hourglass_empty' : 'send'}</span>{sending ? 'Sending...' : mode === 'broadcast' ? 'Send Broadcast' : 'Send Notification'}
            </button>
          </div>

          {/* Quick Templates */}
          <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900 p-4">
            <h3 className="text-xs font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <span className="material-icons text-sm text-amber-500">bolt</span>Quick Templates
            </h3>
            <div className="space-y-2">
              {quickTemplates.map((t, i) => (
                <button key={i} onClick={() => { setTitle(t.title); setBody(t.body); }}
                  className="w-full text-left p-2.5 rounded-lg bg-gray-50 dark:bg-black/50 hover:bg-gray-100 dark:hover:bg-zinc-900 border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 transition-all">
                  <p className="text-[10px] font-bold text-gray-900 dark:text-white">{t.title}</p>
                  <p className="text-[9px] text-gray-400 mt-0.5 line-clamp-2">{t.body}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-zinc-900">
          {/* Filters */}
          <div className="p-3 border-b border-gray-200 dark:border-zinc-900 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="material-icons text-sm text-gray-400">filter_list</span>
              <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
                className="p-1.5 bg-gray-50 dark:bg-black border border-gray-200 dark:border-zinc-900 rounded-lg text-[10px] font-semibold text-gray-700 dark:text-white outline-none">
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex-1 relative">
              <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" style={{ fontSize: '14px' }}>search</span>
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search notifications..."
                className="w-full pl-7 pr-2 py-1.5 bg-gray-50 dark:bg-black border border-gray-200 dark:border-zinc-900 rounded-lg text-[10px] text-gray-700 dark:text-white outline-none" />
            </div>
            <span className="text-[10px] text-gray-400 font-semibold">{filteredHistory.length} notifications</span>
          </div>
          {/* List */}
          <div className="max-h-[500px] overflow-y-auto">
            {histLoading ? (
              <div className="flex items-center justify-center py-12"><div className="size-6 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div></div>
            ) : filteredHistory.length > 0 ? (
              <div className="divide-y divide-gray-100 dark:divide-zinc-800/50">
                {filteredHistory.map(n => (
                  <div key={n._id} className="p-3 hover:bg-gray-50 dark:hover:bg-zinc-900/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`size-5 rounded-md flex items-center justify-center text-white ${n.isSuggestion ? 'bg-amber-500' : 'bg-blue-500'}`}>
                            <span className="material-icons" style={{ fontSize: '11px' }}>{n.isSuggestion ? 'lightbulb' : 'notifications'}</span>
                          </span>
                          <p className="text-[10px] font-bold text-gray-900 dark:text-white truncate">{n.title}</p>
                          {n.region && <span className="text-[8px] font-semibold px-1.5 py-0.5 bg-gray-100 dark:bg-black text-gray-500 dark:text-gray-400 rounded">{n.region}</span>}
                        </div>
                        <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">{n.body}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[9px] text-gray-400">{new Date(n.createdAt).toLocaleDateString()}</p>
                        <p className="text-[8px] text-gray-400">{new Date(n.createdAt).toLocaleTimeString()}</p>
                        <p className="text-[8px] text-gray-500 font-semibold mt-0.5">{n.recipientName || 'All Drivers'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <span className="material-icons text-3xl text-gray-300 dark:text-gray-600">inbox</span>
                <p className="text-xs text-gray-400 mt-2">{searchQ || regionFilter !== 'All Regions' ? 'No matching notifications' : 'No notifications sent yet'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsScreen;

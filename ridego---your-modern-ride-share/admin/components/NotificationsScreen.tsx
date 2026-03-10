import React, { useEffect, useState, useCallback } from 'react';

interface DriverOption { _id: string; name: string; email: string; region?: string; }
interface NotifRecord { _id: string; recipientId: string; recipientName: string; type: string; title: string; body: string; isSuggestion: boolean; region?: string; createdAt: string; }

const REGIONS = ['All Regions', 'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Jaipur'];

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
    try {
      const res = await fetch('/api/admin/drivers');
      if (res.ok) {
        const raw = await res.json();
        setDrivers(raw.map((d: any) => ({ _id: d._id, name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email, email: d.email, region: '' })));
      }
    } catch {}
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await fetch('/api/admin/notifications/sent');
      if (res.ok) {
        const raw = await res.json();
        setHistory(raw.map((n: any) => ({
          _id: n._id,
          recipientId: n.userId?._id || n.userId || '',
          recipientName: n.userId?.firstName ? `${n.userId.firstName} ${n.userId.lastName || ''}`.trim() : 'All Drivers',
          type: n.type || 'admin',
          title: n.title || '',
          body: n.message || '',
          isSuggestion: n.data?.isSuggestion || false,
          region: n.data?.zone || n.title || '',
          createdAt: n.createdAt || new Date().toISOString(),
        })));
      }
    } catch {}
    finally { setHistLoading(false); }
  }, []);

  useEffect(() => { fetchDrivers(); fetchHistory(); }, [fetchDrivers, fetchHistory]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) return setError('Title and body are required');
    if (mode === 'individual' && !selectedDriver) return setError('Select a driver');
    setSending(true); setError(''); setSuccess('');
    try {
      const endpoint = mode === 'broadcast' ? '/api/admin/notifications/broadcast' : '/api/admin/notifications/send';
      const payload: any = { title, message: body, type: isSuggestion ? 'suggestion' : 'SYSTEM' };
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
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white">Notifications</h1>
        <p className="text-xs text-zinc-500">Send alerts and suggestions to drivers</p>
      </div>

      {/* Pill Tabs */}
      <div className="flex gap-1 bg-zinc-900 p-1 rounded-full w-fit border border-zinc-800">
        {[{ key: 'send', label: 'Compose' }, { key: 'history', label: 'History' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${tab === t.key ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Send Tab */}
      {tab === 'send' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 card">
            {/* Mode Toggle */}
            <div className="flex items-center gap-2 mb-5">
              {['individual', 'broadcast'].map(m => (
                <button key={m} onClick={() => setMode(m as any)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all ${mode === m ? 'bg-accent-purple text-white' : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'}`}>
                  <span className="material-icons" style={{ fontSize: '14px' }}>{m === 'individual' ? 'person' : 'campaign'}</span>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {mode === 'individual' && (
              <div className="mb-4">
                <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1.5 block">Recipient</label>
                <select value={selectedDriver} onChange={e => setSelectedDriver(e.target.value)}
                  className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-accent-purple/50 outline-none">
                  <option value="">Select a driver...</option>
                  {drivers.map(d => <option key={d._id} value={d._id}>{d.name} ({d.email})</option>)}
                </select>
              </div>
            )}

            <div className="mb-4">
              <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1.5 block">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title"
                className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-accent-purple/50 outline-none placeholder:text-zinc-600" />
            </div>

            <div className="mb-4">
              <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1.5 block">Message</label>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Notification body..." rows={4}
                className="w-full p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:ring-2 focus:ring-accent-purple/50 outline-none resize-none placeholder:text-zinc-600" />
            </div>

            <div className="flex items-center gap-2 mb-5">
              <button onClick={() => setIsSuggestion(!isSuggestion)}
                className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${isSuggestion ? 'bg-accent-purple border-accent-purple' : 'border-zinc-700'}`}>
                {isSuggestion && <span className="material-icons text-white" style={{ fontSize: '12px' }}>check</span>}
              </button>
              <span className="text-[10px] font-semibold text-zinc-400">Mark as suggestion (non-critical)</span>
            </div>

            {error && <p className="text-xs text-accent-rose font-semibold mb-3 flex items-center gap-1"><span className="material-icons text-sm">error</span>{error}</p>}
            {success && <p className="text-xs text-accent-green font-semibold mb-3 flex items-center gap-1"><span className="material-icons text-sm">check_circle</span>{success}</p>}

            <button onClick={handleSend} disabled={sending}
              className="w-full py-2.5 bg-accent-purple hover:bg-accent-purple/80 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
              <span className="material-icons text-sm">{sending ? 'hourglass_empty' : 'send'}</span>{sending ? 'Sending...' : mode === 'broadcast' ? 'Send Broadcast' : 'Send Notification'}
            </button>
          </div>

          {/* Quick Templates */}
          <div className="card">
            <h3 className="text-sm font-bold text-white mb-4">Quick Templates</h3>
            <div className="space-y-2">
              {quickTemplates.map((t, i) => (
                <button key={i} onClick={() => { setTitle(t.title); setBody(t.body); }}
                  className="w-full text-left p-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-transparent hover:border-zinc-700 transition-all">
                  <p className="text-[10px] font-bold text-white">{t.title}</p>
                  <p className="text-[9px] text-zinc-500 mt-0.5 line-clamp-2">{t.body}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="card !p-0 overflow-hidden">
          {/* Filters */}
          <div className="p-4 border-b border-zinc-800 flex items-center gap-3 flex-wrap">
            <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-semibold text-white outline-none">
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div className="flex-1 relative">
              <span className="material-icons absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" style={{ fontSize: '14px' }}>search</span>
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search notifications..."
                className="w-full pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] text-white outline-none placeholder:text-zinc-600" />
            </div>
            <span className="text-[10px] text-zinc-500 font-semibold">{filteredHistory.length} notifications</span>
          </div>
          {/* List */}
          <div className="max-h-[500px] overflow-y-auto">
            {histLoading ? (
              <div className="flex items-center justify-center py-12"><div className="w-6 h-6 border-2 border-accent-purple/20 border-t-accent-purple rounded-full animate-spin"></div></div>
            ) : filteredHistory.length > 0 ? (
              <div className="divide-y divide-zinc-800/50">
                {filteredHistory.map(n => (
                  <div key={n._id} className="p-4 hover:bg-zinc-900/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-lg flex items-center justify-center text-white ${n.isSuggestion ? 'bg-accent-yellow' : 'bg-accent-purple'}`}>
                            <span className="material-icons" style={{ fontSize: '11px' }}>{n.isSuggestion ? 'lightbulb' : 'notifications'}</span>
                          </span>
                          <p className="text-[10px] font-bold text-white truncate">{n.title}</p>
                          {n.region && <span className="text-[8px] font-semibold px-1.5 py-0.5 bg-zinc-900 text-zinc-400 rounded-full border border-zinc-800">{n.region}</span>}
                        </div>
                        <p className="text-[9px] text-zinc-500 mt-1 line-clamp-1">{n.body}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[9px] text-zinc-500">{new Date(n.createdAt).toLocaleDateString()}</p>
                        <p className="text-[8px] text-zinc-600">{new Date(n.createdAt).toLocaleTimeString()}</p>
                        <p className="text-[8px] text-zinc-500 font-semibold mt-0.5">{n.recipientName || 'All Drivers'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <span className="material-icons text-3xl text-zinc-700">inbox</span>
                <p className="text-xs text-zinc-500 mt-2">{searchQ || regionFilter !== 'All Regions' ? 'No matching notifications' : 'No notifications sent yet'}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationsScreen;

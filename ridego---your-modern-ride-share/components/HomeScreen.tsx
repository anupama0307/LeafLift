
import React, { useEffect, useState } from 'react';
import { MAIN_SUGGESTIONS, RECENT_LOCATIONS, VEHICLE_CATEGORIES } from '../constants';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

interface HomeScreenProps {
  onOpenPlan: (vehicleCategory?: string) => void;
}

interface ScheduledRide {
  _id: string;
  pickup: { address: string };
  dropoff: { address: string };
  scheduledFor: string;
  vehicleCategory: string;
  fare: number;
  status: string;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onOpenPlan }) => {
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [scheduledRides, setScheduledRides] = useState<ScheduledRide[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleForName, setScheduleForName] = useState('');
  const [scheduleForPhone, setScheduleForPhone] = useState('');

  const userStr = localStorage.getItem('leaflift_user');
  const user = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    if (!user?._id) return;
    fetch(`${API_BASE_URL}/api/users/${user._id}/wallet`)
      .then(r => r.ok ? r.json() : { balance: 0 })
      .then(d => setWalletBalance(d.balance || 0))
      .catch(() => { });

    fetch(`${API_BASE_URL}/api/rides/scheduled/${user._id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setScheduledRides(d || []))
      .catch(() => { });
  }, []);

  const handleCancelScheduled = async (rideId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/rides/scheduled/${rideId}`, { method: 'DELETE' });
      setScheduledRides(prev => prev.filter(r => r._id !== rideId));
    } catch { }
  };

  return (
    <div className="pb-32 pt-12 bg-white dark:bg-zinc-950 min-h-screen animate-in fade-in duration-1000 hide-scrollbar">
      {/* Search Header - Redesigned for Premium Feel */}
      <div className="px-6 mb-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="size-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.3em]">Ready to roll</span>
          </div>
          {user?.privacySettings?.locationSharing && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 animate-in fade-in zoom-in duration-500">
              <span className="material-icons text-[12px] text-blue-500">location_on</span>
              <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Live Sharing</span>
            </div>
          )}
        </div>
        <h1 className="text-4xl font-black mb-8 dark:text-white leading-[1.1] tracking-tight">Where are we <br />heading today?</h1>

        <div
          onClick={() => onOpenPlan()}
          className="bg-zinc-100 dark:bg-zinc-900 rounded-[32px] flex items-center p-2.5 shadow-sm border border-transparent hover:border-emerald-500/30 cursor-pointer transition-all group"
        >
          <div className="flex items-center flex-1 pl-5 gap-5">
            <span className="material-icons text-zinc-400 group-hover:text-emerald-500 transition-colors">search</span>
            <span className="text-lg font-bold text-zinc-400 dark:text-zinc-500">Search destination...</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowScheduleModal(true); }}
            className="bg-zinc-950 dark:bg-white flex items-center gap-2 px-6 py-4 rounded-[24px] shadow-xl text-[10px] font-black text-white dark:text-black uppercase tracking-widest active:scale-95 transition-all"
          >
            <span className="material-icons text-sm">schedule</span>
            Later
          </button>
        </div>
      </div>

      {/* Categories - Tactile & Premium */}
      <div className="px-6 mb-12">
        <div className="flex overflow-x-auto gap-5 py-2 hide-scrollbar -mx-6 px-6">
          {MAIN_SUGGESTIONS.map((item) => (
            <div
              key={item.id}
              onClick={() => onOpenPlan(item.label)}
              className="flex flex-col items-center gap-3 shrink-0 group cursor-pointer"
            >
              <div className="size-24 bg-zinc-50 dark:bg-zinc-900 rounded-[36px] flex items-center justify-center transition-all group-hover:bg-emerald-600 group-hover:shadow-2xl group-hover:shadow-emerald-500/20 group-hover:-translate-y-1">
                <span className="material-icons text-4xl text-zinc-900 dark:text-white group-hover:text-white transition-colors">{item.iconUrl}</span>
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wallet & Stats - High Contrast Premium */}
      <div className="px-6 mb-12">
        <div className="grid grid-cols-2 gap-5">
          <div className="relative overflow-hidden bg-zinc-950 dark:bg-zinc-900 rounded-[44px] p-8 flex flex-col justify-between h-48 shadow-2xl shadow-zinc-950/20 group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-700" />
            <span className="material-icons text-white/20 text-4xl">account_balance_wallet</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Total Balance</p>
              <h3 className="text-4xl font-black text-white">₹{walletBalance.toFixed(0)}</h3>
            </div>
          </div>
          <div className="relative overflow-hidden bg-emerald-50 dark:bg-emerald-900/10 rounded-[44px] p-8 flex flex-col justify-between h-48 border border-emerald-100 dark:border-emerald-800/30 shadow-xl shadow-emerald-500/5 group">
            <span className="material-icons text-emerald-600 text-4xl">eco</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/60 mb-1">Carbon Impact</p>
              <h3 className="text-4xl font-black text-emerald-950 dark:text-emerald-50">12.4<span className="text-xs ml-1 font-bold">kg</span></h3>
            </div>
          </div>
        </div>
      </div>

      {/* Impact Promo - Premium Banner */}
      <div className="px-6 mb-12">
        <div className="bg-gradient-to-br from-emerald-600 to-emerald-800 rounded-[48px] p-10 relative overflow-hidden shadow-2xl shadow-emerald-500/20 group">
          <div className="absolute right-0 bottom-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-1000">
            <span className="material-icons text-[180px]">forest</span>
          </div>
          <div className="relative z-10">
            <span className="inline-block px-4 py-1.5 bg-white/20 backdrop-blur-md border border-white/20 text-[10px] font-black text-white uppercase tracking-[.3em] rounded-full mb-6">Green Initiative</span>
            <h3 className="text-3xl font-black text-white leading-[1.1] mb-4">Plant trees <br />while you travel.</h3>
            <p className="text-emerald-50 text-xs font-bold max-w-[200px] mb-8 opacity-80 uppercase tracking-widest leading-relaxed">Every pool ride plants a seed for our future.</p>
            <button
              onClick={() => onOpenPlan('POOLED')}
              className="bg-white text-emerald-950 px-10 py-5 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all"
            >
              Start Pooling
            </button>
          </div>
        </div>
      </div>

      {/* Scheduled Rides */}
      {scheduledRides.length > 0 && (
        <div className="px-6 mb-12">
          <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6 px-1">Scheduled for you</h2>
          <div className="space-y-5">
            {scheduledRides.map((ride) => (
              <div key={ride._id} className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-[36px] p-6 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div className="size-14 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-md">
                    <span className="material-icons text-emerald-600">event</span>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{new Date(ride.scheduledFor).toLocaleDateString()}</p>
                    <p className="text-2xl font-black dark:text-white">{new Date(ride.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="space-y-4 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="size-2 bg-zinc-300 rounded-full" />
                    <p className="text-xs font-bold text-zinc-500 truncate">{ride.pickup?.address || 'Pickup'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="size-2 bg-emerald-500 rounded-full shadow-[0_0_8px_emerald]" />
                    <p className="text-xs font-black dark:text-white truncate">{ride.dropoff?.address || 'Dropoff'}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleCancelScheduled(ride._id)}
                  className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancel booking
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Frequent Stops */}
      <div className="px-6 mb-16">
        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400 mb-6 px-1">Frequent Stops</h2>
        <div className="grid grid-cols-2 gap-5">
          {RECENT_LOCATIONS.slice(0, 2).map((loc) => (
            <div
              key={loc.id}
              onClick={() => onOpenPlan()}
              className="p-6 bg-zinc-50 dark:bg-zinc-900/50 rounded-[40px] border border-zinc-100 dark:border-zinc-800/50 cursor-pointer active:scale-95 transition-all shadow-sm"
            >
              <div className="size-12 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center mb-5 shadow-md">
                <span className="material-icons text-zinc-400 text-2xl">{loc.icon}</span>
              </div>
              <h4 className="font-black text-zinc-900 dark:text-white text-sm mb-1">{loc.name}</h4>
              <p className="text-[10px] text-zinc-400 font-bold truncate tracking-tight">{loc.address}</p>
            </div>
          ))}
        </div>
      </div>


      {/* Schedule Ride Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[70] flex items-end justify-center">
          <div className="w-full max-w-lg bg-white dark:bg-zinc-950 rounded-t-[40px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-500" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-8"></div>
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-3xl font-black dark:text-white leading-tight">Pick a time</h3>
              <button onClick={() => setShowScheduleModal(false)} className="size-12 bg-gray-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center">
                <span className="material-icons-outlined text-gray-500">close</span>
              </button>
            </div>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">Date</label>
                  <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-zinc-900 border border-transparent rounded-2xl p-4 text-sm font-black dark:text-white focus:ring-2 focus:ring-leaf-500 transition-all shadow-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">Time</label>
                  <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-zinc-900 border border-transparent rounded-2xl p-4 text-sm font-black dark:text-white focus:ring-2 focus:ring-leaf-500 transition-all shadow-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">Ride for someone else?</label>
                <div className="flex flex-col gap-3">
                  <input type="text" placeholder="Full Name" value={scheduleForName} onChange={e => setScheduleForName(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-zinc-900 border border-transparent rounded-2xl p-4 text-sm font-black dark:text-white focus:ring-2 focus:ring-leaf-500 transition-all shadow-sm" />
                  <input type="tel" placeholder="Mobile Number" value={scheduleForPhone} onChange={e => setScheduleForPhone(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-zinc-900 border border-transparent rounded-2xl p-4 text-sm font-black dark:text-white focus:ring-2 focus:ring-leaf-500 transition-all shadow-sm" />
                </div>
              </div>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  onOpenPlan();
                }}
                disabled={!scheduleDate || !scheduleTime}
                className="w-full bg-leaf-600 dark:bg-leaf-500 text-white py-5 rounded-[28px] font-black shadow-xl shadow-leaf-500/20 disabled:opacity-30 disabled:shadow-none transition-all mt-4 text-lg"
              >
                Set Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;

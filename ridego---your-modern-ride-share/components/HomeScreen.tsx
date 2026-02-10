
import React, { useEffect, useState } from 'react';
import { MAIN_SUGGESTIONS, RECENT_LOCATIONS, VEHICLE_CATEGORIES } from '../constants';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

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
  const [carbonSaved, setCarbonSaved] = useState<number>(0);
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

    fetch(`${API_BASE_URL}/api/users/${user._id}/stats`)
      .then(r => r.ok ? r.json() : { totalCO2Saved: 0 })
      .then(d => setCarbonSaved(d.totalCO2Saved || 0))
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
    <div className="pb-24 pt-4 bg-white dark:bg-zinc-950 min-h-screen animate-in fade-in duration-700">
      {/* Search Bar - Redesigned */}
      <div className="px-5 py-6">
        <h1 className="text-3xl font-black mb-6 dark:text-white leading-tight">Where would you <br /> like to go?</h1>
        <div
          onClick={() => onOpenPlan()}
          className="bg-[#f3f3f3] dark:bg-zinc-900 rounded-[24px] flex items-center p-2 shadow-sm border border-transparent hover:border-leaf-500/50 cursor-pointer transition-all group"
        >
          <div className="flex items-center flex-1 pl-4 gap-4">
            <span className="material-icons-outlined text-leaf-600 dark:text-leaf-500 text-2xl group-hover:scale-110 transition-transform">search</span>
            <span className="text-lg font-bold text-gray-400 dark:text-zinc-500">Destination...</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowScheduleModal(true); }}
            className="bg-black dark:bg-white flex items-center gap-2 px-6 py-3 rounded-[20px] shadow-lg text-xs font-black text-white dark:text-black uppercase tracking-widest active:scale-95 transition-all"
          >
            <span className="material-icons-outlined text-sm">schedule</span>
            Later
          </button>
        </div>
      </div>

      {/* Categories Horizontal - Redesigned */}
      <div className="px-5 mb-8">
        <div className="flex overflow-x-auto gap-4 py-2 hide-scrollbar -mx-5 px-5">
          {MAIN_SUGGESTIONS.map((item) => (
            <div
              key={item.id}
              onClick={() => onOpenPlan(item.label)}
              className="flex flex-col items-center gap-3 shrink-0 group cursor-pointer"
            >
              <div className="size-20 bg-[#f3f3f3] dark:bg-zinc-900 rounded-[28px] flex items-center justify-center transition-all group-hover:bg-leaf-500 group-hover:shadow-xl group-hover:shadow-leaf-500/20">
                <span className="material-icons-outlined text-3xl text-black dark:text-white group-hover:text-white transition-colors">{item.iconUrl}</span>
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest text-gray-500 dark:text-zinc-400">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wallet & Stats */}
      <div className="px-5 mb-10">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-leaf-600 dark:bg-leaf-500 rounded-[32px] p-6 flex flex-col justify-between h-40 shadow-xl shadow-leaf-500/10">
            <span className="material-icons-outlined text-white text-3xl opacity-50">account_balance_wallet</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Balance</p>
              <h3 className="text-3xl font-black text-white">₹{walletBalance.toFixed(0)}</h3>
            </div>
          </div>
          <div className="bg-zinc-900 rounded-[32px] p-6 flex flex-col justify-between h-40 shadow-xl shadow-black/10">
            <span className="material-icons-outlined text-leaf-500 text-3xl">leaf</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Carbon Saved</p>
              <h3 className="text-3xl font-black text-white">{carbonSaved.toFixed(1)}<span className="text-xs ml-1 opacity-50">kg</span></h3>
            </div>
          </div>
        </div>
      </div>

      {/* Scheduled Rides */}
      {scheduledRides.length > 0 && (
        <div className="px-5 mb-10">
          <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-4">Upcoming Schedule</h2>
          <div className="space-y-4">
            {scheduledRides.map((ride) => (
              <div key={ride._id} className="bg-gray-50 dark:bg-zinc-900/50 rounded-[28px] p-5 border border-gray-100 dark:border-zinc-800">
                <div className="flex justify-between items-start mb-4">
                  <div className="size-12 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-sm">
                    <span className="material-icons-outlined text-leaf-600 dark:text-leaf-500">event</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-black dark:text-white">{new Date(ride.scheduledFor).toLocaleDateString()}</p>
                    <p className="text-xl font-black text-leaf-600 dark:text-leaf-400">{new Date(ride.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1 mb-6">
                  <p className="text-xs font-bold text-black dark:text-white line-clamp-1">From: {ride.pickup?.address || 'Pickup'}</p>
                  <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 line-clamp-1">To: {ride.dropoff?.address || 'Drop'}</p>
                </div>
                <button
                  onClick={() => handleCancelScheduled(ride._id)}
                  className="w-full py-3 bg-red-50 dark:bg-red-900/10 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancel Booking
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highlights / Promos */}
      <div className="px-5 mb-10">
        <div className="bg-gradient-to-br from-black to-zinc-800 dark:from-zinc-900 dark:to-black rounded-[40px] p-8 relative overflow-hidden shadow-2xl">
          <div className="relative z-10">
            <span className="inline-block px-3 py-1 bg-leaf-600 text-[10px] font-black text-white uppercase tracking-[.2em] rounded-full mb-4">Impact</span>
            <h3 className="text-2xl font-black text-white leading-tight mb-2">Plant trees <br />while you ride.</h3>
            <p className="text-zinc-400 text-xs font-medium max-w-[180px] mb-6">Every pooled ride contributes to local reforestation projects.</p>
            <button
              onClick={() => onOpenPlan('POOLED')}
              className="bg-white text-black px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all"
            >
              Ride Green
            </button>
          </div>
          <span className="material-icons-outlined absolute -right-4 -bottom-4 text-[200px] text-white/5 rotate-12">forest</span>
        </div>
      </div>

      {/* Home Locations */}
      <div className="px-5 mb-12">
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6">Frequent Stops</h2>
        <div className="grid grid-cols-2 gap-4">
          {RECENT_LOCATIONS.slice(0, 2).map((loc) => (
            <div
              key={loc.id}
              onClick={() => onOpenPlan()}
              className="p-5 bg-[#fbfbfb] dark:bg-zinc-900/50 rounded-[32px] border border-gray-100 dark:border-zinc-800 cursor-pointer hover:scale-105 transition-all"
            >
              <div className="size-10 bg-white dark:bg-zinc-800 rounded-xl flex items-center justify-center mb-4 shadow-sm">
                <span className="material-icons-outlined text-gray-600 dark:text-zinc-400 text-xl">{loc.icon}</span>
              </div>
              <h4 className="font-black text-black dark:text-white text-sm mb-1">{loc.name}</h4>
              <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-bold truncate">{loc.address}</p>
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

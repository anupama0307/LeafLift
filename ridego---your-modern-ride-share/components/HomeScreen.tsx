
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
      .catch(() => {});

    fetch(`${API_BASE_URL}/api/rides/scheduled/${user._id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setScheduledRides(d || []))
      .catch(() => {});
  }, []);

  const handleCancelScheduled = async (rideId: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/rides/scheduled/${rideId}`, { method: 'DELETE' });
      setScheduledRides(prev => prev.filter(r => r._id !== rideId));
    } catch {}
  };

  return (
    <div className="pb-20 pt-4 bg-white dark:bg-black">
      {/* Search Bar */}
      <div className="px-4 py-4">
        <div
          onClick={() => onOpenPlan()}
          className="bg-white dark:bg-zinc-900 rounded-2xl flex items-center p-1.5 shadow-md shadow-black/5 dark:shadow-none border border-gray-100 dark:border-zinc-800 cursor-pointer hover:border-leaf-500/50 transition-all"
        >
          <div className="flex items-center flex-1 pl-4 gap-3">
            <span className="material-icons-outlined text-leaf-600 dark:text-leaf-500">search</span>
            <span className="text-lg font-bold text-gray-400 dark:text-zinc-500">Where to?</span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); setShowScheduleModal(true); }}
            className="bg-leaf-50 dark:bg-zinc-800 flex items-center gap-2 px-5 py-2.5 rounded-xl shadow-sm text-sm font-black text-leaf-700 dark:text-leaf-400"
          >
            <span className="material-icons-outlined text-sm">schedule</span>
            Schedule
            <span className="material-icons-outlined text-xs">expand_more</span>
          </button>
        </div>
      </div>

      {/* Vehicle Category Grid: Bike, Auto, Car, Big Car */}
      <div className="px-4 mt-2">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-black dark:text-white">Book a ride</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {MAIN_SUGGESTIONS.map((item) => (
            <div
              key={item.id}
              onClick={() => onOpenPlan(item.label)}
              className="flex flex-col items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="relative bg-gray-50 dark:bg-zinc-900 w-full aspect-square rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100 dark:border-zinc-800">
                <span className="material-icons-outlined text-3xl opacity-70 text-black dark:text-white">{item.iconUrl}</span>
                {item.promo && (
                  <div className="absolute top-1 left-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                    {item.promo}
                  </div>
                )}
              </div>
              <span className="text-xs font-bold text-black dark:text-white">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wallet Card */}
      <div className="px-4 mt-6">
        <div className="bg-gradient-to-br from-leaf-600 to-leaf-700 dark:from-leaf-500 dark:to-leaf-600 rounded-2xl p-5 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/70">LeafLift Wallet</p>
            <h3 className="text-2xl font-black text-white mt-1">₹{walletBalance.toFixed(2)}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-icons-outlined text-white/80 text-3xl">account_balance_wallet</span>
          </div>
        </div>
      </div>

      {/* Scheduled Rides */}
      {scheduledRides.length > 0 && (
        <div className="px-4 mt-6">
          <h2 className="text-lg font-bold text-black dark:text-white mb-3">Scheduled Rides</h2>
          <div className="space-y-3">
            {scheduledRides.map((ride) => (
              <div key={ride._id} className="bg-gray-50 dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {ride.vehicleCategory || 'CAR'} • {new Date(ride.scheduledFor).toLocaleDateString()}
                    </span>
                    <p className="text-sm font-bold text-black dark:text-white mt-1">
                      {new Date(ride.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="font-bold text-green-600 dark:text-green-400">₹{ride.fare}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {ride.pickup?.address || 'Pickup'} → {ride.dropoff?.address || 'Drop'}
                </p>
                <button
                  onClick={() => handleCancelScheduled(ride._id)}
                  className="mt-2 text-xs font-bold text-red-500 hover:text-red-600"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promo Banner - Save with UPI */}
      <div className="px-4 mt-6">
        <div className="bg-gradient-to-br from-black to-zinc-800 dark:from-leaf-500 dark:to-leaf-600 rounded-3xl p-6 flex justify-between items-center relative overflow-hidden h-36 shadow-2xl shadow-leaf-500/10">
          <div className="z-10 max-w-[65%]">
            <h3 className="text-xl font-black text-white leading-tight">Save ₹50 with UPI</h3>
            <p className="text-zinc-400 dark:text-leaf-100 text-xs mt-1 font-bold">Get ₹50 off on your next 3 rides. Pay via UPI.</p>
            <button
              onClick={() => onOpenPlan()}
              className="mt-4 bg-leaf-500 dark:bg-white text-white dark:text-leaf-700 px-5 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 hover:scale-105 transition-all shadow-lg active:scale-95"
            >
              Book Now
              <span className="material-icons-outlined text-sm">arrow_forward</span>
            </button>
          </div>
          <div className="absolute right-0 bottom-0 top-0 w-1/3 flex items-center justify-center">
            <span className="material-icons-outlined text-8xl opacity-20 text-white -rotate-12">payments</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-6 px-4">
        <h2 className="text-lg font-bold text-black dark:text-white mb-3">Recent</h2>
        {RECENT_LOCATIONS.map((loc) => (
          <div
            key={loc.id}
            onClick={() => onOpenPlan()}
            className="flex items-center gap-4 py-4 border-b border-gray-100 dark:border-zinc-900 last:border-none cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900/50 px-2 -mx-2 rounded-lg transition-colors"
          >
            <div className="w-10 h-10 bg-[#f3f3f3] dark:bg-zinc-800 rounded-full flex items-center justify-center">
              <span className="material-icons-outlined text-gray-600 dark:text-zinc-400">{loc.icon}</span>
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-black dark:text-white">{loc.name}</h4>
              <p className="text-xs text-gray-500 dark:text-zinc-500">{loc.address}</p>
            </div>
            <span className="material-icons-outlined text-gray-400 dark:text-zinc-600 text-sm">chevron_right</span>
          </div>
        ))}
      </div>

      {/* Schedule Ride Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={() => setShowScheduleModal(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold dark:text-white">Schedule a Ride</h3>
              <button onClick={() => setShowScheduleModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full">
                <span className="material-icons-outlined text-gray-500">close</span>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">Date</label>
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl px-4 py-3 text-sm font-bold dark:text-white" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">Time</label>
                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl px-4 py-3 text-sm font-bold dark:text-white" />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1 block">Booking for someone? (optional)</label>
                <input type="text" placeholder="Name" value={scheduleForName} onChange={e => setScheduleForName(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl px-4 py-3 text-sm font-bold dark:text-white mb-2" />
                <input type="tel" placeholder="Phone" value={scheduleForPhone} onChange={e => setScheduleForPhone(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl px-4 py-3 text-sm font-bold dark:text-white" />
              </div>
              <button
                onClick={() => {
                  setShowScheduleModal(false);
                  onOpenPlan();
                }}
                disabled={!scheduleDate || !scheduleTime}
                className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-black disabled:opacity-50"
              >
                Continue to Book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeScreen;

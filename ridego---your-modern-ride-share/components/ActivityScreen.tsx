
import React, { useState, useEffect } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const ActivityScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Upcoming' | 'Past' | 'Sent Requests'>('Past');
  const [rides, setRides] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const userStr = localStorage.getItem('leaflift_user');
  const user = userStr ? JSON.parse(userStr) : null;

  useEffect(() => {
    if (!user?._id) return;

    if (activeTab === 'Sent Requests') {
      fetchSentRequests();
    } else {
      fetchRides();
    }
  }, [activeTab]);

  const fetchRides = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/rides/user/${user._id}`);
      if (resp.ok) {
        const data = await resp.json();
        setRides(data);
      }
    } catch (error) {
      console.error('Fetch rides error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSentRequests = async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/notifications/sent/${user._id}`);
      if (resp.ok) {
        const data = await resp.json();
        setSentRequests(data);
      }
    } catch (error) {
      console.error('Fetch requests error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const upcomingRides = rides.filter(r =>
    ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(r.status)
  );

  const pastRides = rides.filter(r =>
    ['COMPLETED', 'CANCELED'].includes(r.status)
  );

  const renderRideItem = (ride: any) => (
    <div key={ride._id} className="flex gap-4 p-4 hover:bg-gray-50 dark:hover:bg-zinc-900 rounded-[32px] transition-all cursor-pointer group border border-gray-100 dark:border-zinc-800 shadow-sm mb-4 bg-white dark:bg-zinc-900/50">
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${ride.status === 'SEARCHING' ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-gray-50 dark:bg-zinc-800'}`}>
        <span className={`material-icons-outlined text-3xl ${ride.status === 'SEARCHING' ? 'text-yellow-600 animate-pulse' : 'opacity-40 dark:text-white'}`}>
          {ride.status === 'CANCELED' ? 'block' : 'directions_car'}
        </span>
      </div>
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-black text-base leading-tight dark:text-white truncate pr-2">{ride.dropoff?.address?.split(',')[0] || 'Unknown Dropoff'}</h3>
          <span className="font-black text-sm dark:text-white">₹{ride.currentFare || ride.fare}</span>
        </div>
        <p className="text-xs font-bold text-gray-400 dark:text-zinc-500 mb-2 truncate">
          {new Date(ride.bookingTime || ride.createdAt).toLocaleDateString()} • {ride.vehicleCategory || 'Ride'}
        </p>
        <div className="flex gap-2">
          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${ride.status === 'COMPLETED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
              ride.status === 'SEARCHING' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                ride.status === 'CANCELED' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            }`}>
            {ride.status.replace('_', ' ')}
          </span>
          {ride.status === 'COMPLETED' && (
            <button className="bg-leaf-600 text-white dark:bg-leaf-500 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-md shadow-leaf-500/10">Rebook</button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-700 bg-white dark:bg-zinc-950 min-h-screen">
      <h1 className="text-4xl font-black tracking-tight mt-6 mb-8 dark:text-white">Activity</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2 -mx-2 px-2 hide-scrollbar">
        {(['Upcoming', 'Past', 'Sent Requests'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 rounded-full text-[12px] font-black transition-all shrink-0 uppercase tracking-widest ${activeTab === tab ? 'bg-leaf-600 text-white dark:bg-leaf-500 shadow-xl shadow-leaf-500/20' : 'bg-gray-100 dark:bg-zinc-900 text-gray-400 dark:text-zinc-500'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-20 text-center animate-pulse">
          <span className="material-icons-outlined text-5xl animate-spin text-leaf-500">sync</span>
        </div>
      ) : (
        <>
          {activeTab === 'Upcoming' && (
            <div className="space-y-1">
              {upcomingRides.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <span className="material-icons-outlined text-4xl opacity-10 dark:text-white">event_busy</span>
                  </div>
                  <h2 className="text-xl font-black dark:text-white">No active trips</h2>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 font-bold uppercase tracking-widest">Book a ride and it will appear here.</p>
                </div>
              ) : (
                upcomingRides.map(renderRideItem)
              )}
            </div>
          )}

          {activeTab === 'Past' && (
            <div className="space-y-1">
              {pastRides.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <span className="material-icons-outlined text-4xl opacity-10 dark:text-white">history</span>
                  </div>
                  <h2 className="text-xl font-black dark:text-white">No trip history</h2>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 font-bold uppercase tracking-widest">Your past rides will show up here.</p>
                </div>
              ) : (
                pastRides.map(renderRideItem)
              )}
            </div>
          )}

          {activeTab === 'Sent Requests' && (
            <div className="space-y-4">
              {sentRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-6">
                    <span className="material-icons-outlined text-4xl opacity-10 dark:text-white">history_toggle_off</span>
                  </div>
                  <h2 className="text-xl font-black dark:text-white">No requests sent</h2>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2 font-bold uppercase tracking-widest">Any partner requests will appear here.</p>
                </div>
              ) : (
                sentRequests.map((req) => (
                  <div key={req._id} className="p-6 bg-gray-50 dark:bg-zinc-900/50 rounded-[32px] border border-gray-100 dark:border-zinc-800 shadow-sm group">
                    <div className="flex justify-between items-start mb-6">
                      <div className="size-14 bg-black dark:bg-white rounded-2xl flex items-center justify-center shadow-lg">
                        <span className="material-icons-outlined text-white dark:text-black text-2xl">handshake</span>
                      </div>
                      <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${req.isRead ? 'bg-gray-100 text-gray-400 dark:bg-zinc-800' : 'bg-leaf-100 text-leaf-600 dark:bg-leaf-900/30 dark:text-leaf-400'}`}>
                        {req.isRead ? 'Closed' : 'Pending'}
                      </div>
                    </div>
                    <h4 className="font-black text-black dark:text-white text-lg mb-2">{req.title}</h4>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 font-medium mb-6 leading-relaxed line-clamp-2">{req.message}</p>
                    <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest border-t border-gray-100 dark:border-zinc-800 pt-4">
                      <span className="material-icons-outlined text-sm">schedule</span>
                      {new Date(req.createdAt).toLocaleDateString()} at {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ActivityScreen;

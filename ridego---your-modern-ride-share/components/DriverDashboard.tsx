
import React, { useState, useEffect } from 'react';

interface DriverDashboardProps {
  user: any;
}

const DriverDashboard: React.FC<DriverDashboardProps> = ({ user }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [ecoScore, setEcoScore] = useState(88);
  const [telemetryTip, setTelemetryTip] = useState<string | null>(null);

  // Simulated logic for ride matching
  useEffect(() => {
    if (isOnline && !activeRide && !showRequest) {
      const timer = setTimeout(() => setShowRequest(true), 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, activeRide, showRequest]);

  // Simulated telemetry tips
  useEffect(() => {
    if (activeRide) {
      const tips = ["Gentle braking saves fuel", "Optimal speed detected", "Efficient route chosen", "Smooth acceleration +5 Eco"];
      const interval = setInterval(() => {
        const randomTip = tips[Math.floor(Math.random() * tips.length)];
        setTelemetryTip(randomTip);
        setTimeout(() => setTelemetryTip(null), 3000);
      }, 8000);
      return () => clearInterval(interval);
    }
  }, [activeRide]);

  const handleAcceptRide = () => {
    setShowRequest(false);
    setActiveRide({
      passenger: 'Aravind K.',
      pickup: 'Brookefields Mall',
      dropoff: 'Airport Rd',
      eta: '4 mins',
      diversion: '2 mins',
      passengers: 1,
      earnings: '₹245',
      co2Saved: '1.2kg'
    });
  };

  return (
    <div className="relative flex-1 bg-black overflow-hidden h-full">
      {/* 1. Map Layer (Full Background) */}
      <div className="absolute inset-0 z-0">
        <img 
          src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1000&auto=format&fit=crop" 
          className={`w-full h-full object-cover transition-all duration-1000 ${isOnline ? 'opacity-70 dark:opacity-40 grayscale-0' : 'opacity-20 dark:opacity-10 grayscale'}`}
          alt="Map"
        />
        
        {/* Demand Hotspots (Simulated) */}
        {isOnline && !activeRide && (
          <>
            <div className="absolute top-[25%] right-[20%] w-32 h-32 bg-orange-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute top-[25%] right-[20%] text-orange-500 flex flex-col items-center">
               <span className="material-icons-outlined text-sm">local_fire_department</span>
               <span className="text-[10px] font-black uppercase tracking-tighter">High Demand</span>
            </div>
            <div className="absolute bottom-[40%] left-[15%] w-24 h-24 bg-orange-500/10 rounded-full blur-2xl"></div>
          </>
        )}

        {/* Navigation Overlays */}
        {activeRide && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
             <div className="relative w-full h-full">
                <div className="absolute top-[40%] left-[30%] animate-bounce">
                  <div className="w-6 h-6 bg-blue-500 rounded-full border-4 border-white shadow-lg"></div>
                </div>
                <div className="absolute bottom-[35%] right-[25%]">
                   <div className="w-8 h-8 bg-red-500 rounded-full border-4 border-white shadow-2xl flex items-center justify-center">
                      <span className="material-icons-outlined text-white text-sm">person_pin_circle</span>
                   </div>
                </div>
             </div>
          </div>
        )}
      </div>

      {/* 2. Top Bar (Command Center) */}
      <div className="absolute top-0 inset-x-0 z-20 p-4 pt-12 flex items-center justify-between pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
          {/* Eco Score Widget */}
          <div className="bg-white/95 dark:bg-black/80 backdrop-blur-xl px-3 py-2 rounded-2xl flex items-center gap-2 shadow-2xl border border-white/20">
            <span className="material-icons-outlined text-green-500">eco</span>
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-tighter leading-none">Eco Score</span>
              <span className="text-sm font-black text-black dark:text-white leading-tight">{ecoScore}%</span>
            </div>
          </div>
          <button className="size-12 bg-red-600 rounded-2xl flex items-center justify-center shadow-2xl active:scale-90 transition-transform pointer-events-auto">
            <span className="material-icons-outlined text-white font-bold">sos</span>
          </button>
        </div>

        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          <button 
            onClick={() => setIsOnline(!isOnline)}
            className={`px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-2xl border-2 ${isOnline ? 'bg-[#f2b90d] text-black border-black' : 'bg-zinc-800 text-zinc-500 border-transparent'}`}
          >
            {isOnline ? 'Active Online' : 'Go Online'}
          </button>
          
          <div className="bg-white/95 dark:bg-black/80 backdrop-blur-xl px-3 py-2 rounded-2xl flex items-center gap-2 shadow-2xl border border-white/20">
            <span className="material-icons-outlined text-blue-500 text-sm">bolt</span>
            <span className="text-xs font-black">92% Health</span>
          </div>
        </div>
      </div>

      {/* Telemetry Tips Overlay */}
      {telemetryTip && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top duration-300">
           <div className="bg-green-500 text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 font-bold text-sm">
              <span className="material-icons-outlined text-sm">tips_and_updates</span>
              {telemetryTip}
           </div>
        </div>
      )}

      {/* 3. Match Request Card */}
      {showRequest && (
        <div className="absolute inset-x-4 top-1/3 z-40 animate-in zoom-in-95 fade-in duration-300">
          <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-6 shadow-[0_32px_64px_rgba(0,0,0,0.5)] border-4 border-[#f2b90d]">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2">
                <span className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Ride Match</span>
                <span className="text-[10px] font-black uppercase text-gray-400">1 + 1 Passenger</span>
              </div>
              <p className="text-xl font-black text-green-600">₹245</p>
            </div>
            
            <div className="flex items-center gap-3 mb-6">
              <div className="relative">
                <img src="https://i.pravatar.cc/100?u=aravind" className="w-14 h-14 rounded-full border-2 border-[#f2b90d]" alt="" />
                <span className="absolute -bottom-1 -right-1 material-icons text-blue-500 bg-white dark:bg-zinc-900 rounded-full text-lg">verified</span>
              </div>
              <div>
                <p className="font-black text-lg">Aravind K.</p>
                <div className="flex items-center gap-1">
                   <span className="text-xs font-bold text-gray-500">4.9 • Safety Badge</span>
                   <span className="material-icons-outlined text-sm text-[#f2b90d]">accessible</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl mb-6">
              <div className="flex flex-col items-center">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <div className="w-0.5 h-6 bg-gray-300 dark:bg-zinc-700 my-1"></div>
                <div className="w-2 h-2 bg-red-500"></div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-black text-blue-500 uppercase tracking-tighter">2 mins diversion</p>
                <p className="text-sm font-bold truncate">Brookefields Mall → Peelamedu</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowRequest(false)} className="py-4 rounded-2xl font-black bg-gray-100 dark:bg-zinc-800 text-sm">Decline</button>
              <button onClick={handleAcceptRide} className="py-4 rounded-2xl font-black bg-[#f2b90d] text-black shadow-xl text-sm">Accept Ride</button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Contextual Bottom Sheet */}
      <div className={`absolute bottom-0 inset-x-0 z-30 transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1) transform ${activeRide || !isOnline ? 'translate-y-0' : 'translate-y-[calc(100%-110px)]'}`}>
        <div className="bg-white dark:bg-zinc-950 rounded-t-[40px] p-6 shadow-[0_-16px_48px_rgba(0,0,0,0.3)] pb-12 border-t border-gray-100 dark:border-zinc-900">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-zinc-800 rounded-full mx-auto mb-6"></div>
          
          {!isOnline ? (
             <div className="text-center py-4">
                <div className="mb-4">
                  <span className="bg-zinc-100 dark:bg-zinc-900 px-4 py-2 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest">Offline Dashboard</span>
                </div>
                <h3 className="text-3xl font-black mb-8">Ready to earn?</h3>
                <div className="grid grid-cols-3 gap-3 mb-8">
                   <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
                      <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Earnings</p>
                      <p className="text-lg font-black tracking-tight">₹0.00</p>
                   </div>
                   <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
                      <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Hours</p>
                      <p className="text-lg font-black tracking-tight">0.0</p>
                   </div>
                   <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800">
                      <p className="text-[9px] font-black text-gray-500 uppercase mb-1">Eco Rating</p>
                      <p className="text-lg font-black tracking-tight text-green-500">88%</p>
                   </div>
                </div>
                <button 
                   onClick={() => setIsOnline(true)}
                   className="w-full bg-[#f2b90d] text-black py-5 rounded-[24px] font-black text-xl shadow-[0_8px_24px_rgba(242,185,13,0.3)] active:scale-[0.98] transition-all"
                >
                   Go Online
                </button>
             </div>
          ) : activeRide ? (
            <div className="animate-in slide-in-from-bottom duration-500">
               <div className="flex justify-between items-start mb-6">
                  <div>
                     <div className="flex items-center gap-2 mb-1">
                        <span className="bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">Active Navigation</span>
                        <span className="text-[10px] font-black text-gray-400">1.2km away</span>
                     </div>
                     <h3 className="text-2xl font-black leading-tight">Pick up {activeRide.passenger}</h3>
                  </div>
                  <div className="bg-black dark:bg-white text-white dark:text-black size-12 rounded-2xl flex items-center justify-center font-black text-sm">
                     4m
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-3 mb-8">
                  <div className="flex items-center gap-3 bg-[#f3f3f3] dark:bg-zinc-900 p-4 rounded-3xl border border-gray-100 dark:border-zinc-800">
                     <span className="material-icons-outlined text-green-500">eco</span>
                     <div>
                        <p className="text-[9px] font-black uppercase text-gray-400">CO2 Prevented</p>
                        <p className="text-sm font-black">{activeRide.co2Saved}</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-3 bg-[#f3f3f3] dark:bg-zinc-900 p-4 rounded-3xl border border-gray-100 dark:border-zinc-800">
                     <span className="material-icons-outlined text-blue-500">location_on</span>
                     <div>
                        <p className="text-[9px] font-black uppercase text-gray-400">ETA</p>
                        <p className="text-sm font-black">4:45 PM</p>
                     </div>
                  </div>
               </div>

               <button 
                  onClick={() => setActiveRide(null)}
                  className="w-full bg-black dark:bg-white text-white dark:text-black py-5 rounded-[24px] font-black text-xl shadow-2xl active:scale-[0.98] transition-all"
               >
                  I've Arrived
               </button>
            </div>
          ) : (
            <div className="text-center py-6">
               <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                    <div className="size-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center relative">
                       <span className="material-icons text-blue-600 dark:text-blue-400 text-3xl">radar</span>
                    </div>
                  </div>
               </div>
               <h3 className="text-2xl font-black mb-2">Searching for Ride Matches</h3>
               <p className="text-gray-500 font-bold max-w-xs mx-auto text-sm">Matches prioritize eco-efficient routes and multi-passenger pooling.</p>
            </div>
          )}
        </div>
      </div>
      
      {/* 5. Sustainability Telemetry Indicators */}
      {activeRide && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 space-y-4 pointer-events-none">
           <div className="bg-black/80 backdrop-blur-xl p-4 rounded-3xl flex flex-col items-center border border-white/10 shadow-2xl animate-in slide-in-from-right duration-700">
              <span className="material-icons-outlined text-green-500 mb-2">speed</span>
              <div className="h-12 w-1.5 bg-zinc-800 rounded-full relative overflow-hidden">
                 <div className="absolute bottom-0 w-full bg-green-500 h-[80%]"></div>
              </div>
              <span className="text-[8px] font-black text-white uppercase mt-2 tracking-widest opacity-60">Speed</span>
           </div>
           <div className="bg-black/80 backdrop-blur-xl p-4 rounded-3xl flex flex-col items-center border border-white/10 shadow-2xl animate-in slide-in-from-right delay-150 duration-700">
              <span className="material-icons-outlined text-orange-500 mb-2">warning_amber</span>
              <div className="h-12 w-1.5 bg-zinc-800 rounded-full relative overflow-hidden">
                 <div className="absolute bottom-0 w-full bg-orange-500 h-[30%]"></div>
              </div>
              <span className="text-[8px] font-black text-white uppercase mt-2 tracking-widest opacity-60">Brake</span>
           </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;

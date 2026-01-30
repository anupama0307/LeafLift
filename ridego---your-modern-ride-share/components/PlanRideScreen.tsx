
import React, { useState } from 'react';
import { PLAN_SUGGESTIONS } from '../constants';

interface PlanRideScreenProps {
  onBack: () => void;
}

interface RideOption {
  id: string;
  name: string;
  price: string;
  eta: string;
  capacity: number;
  icon: string;
  description: string;
  isPooled?: boolean;
}

const SOLO_OPTIONS: RideOption[] = [
  {
    id: 'r1',
    name: 'Uber Go',
    price: '₹245',
    eta: '5 min',
    capacity: 4,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    description: 'Affordable, compact rides'
  },
  {
    id: 'r2',
    name: 'Premier',
    price: '₹312',
    eta: '3 min',
    capacity: 4,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s',
    description: 'Comfortable sedans, top-rated drivers'
  }
];

const POOLED_OPTIONS: RideOption[] = [
  {
    id: 'p1',
    name: 'Uber Go Pool',
    price: '₹165',
    eta: '8 min',
    capacity: 2,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    description: 'Share with 1-2 others & save CO2',
    isPooled: true
  },
  {
    id: 'p2',
    name: 'Premier Pool',
    price: '₹210',
    eta: '6 min',
    capacity: 2,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s',
    description: 'Sedan pooling for comfort',
    isPooled: true
  }
];

type PaymentMethod = 'Cash' | 'UPI' | 'Wallet';

const PlanRideScreen: React.FC<PlanRideScreenProps> = ({ onBack }) => {
  const [destination, setDestination] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [rideMode, setRideMode] = useState<'Solo' | 'Pooled'>('Solo');
  const [selectedRideId, setSelectedRideId] = useState(SOLO_OPTIONS[0].id);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  
  const [pickupTime, setPickupTime] = useState<'Now' | 'Later'>('Now');
  const [passenger, setPassenger] = useState<'Me' | 'Others'>('Me');

  const handleSelectLocation = (locName: string) => {
    setDestination(locName);
    setShowOptions(true);
  };

  const handleBack = () => {
    if (showOptions) {
      setShowOptions(false);
    } else {
      onBack();
    }
  };

  const activeOptions = rideMode === 'Solo' ? SOLO_OPTIONS : POOLED_OPTIONS;

  if (showOptions) {
    return (
      <div className="bg-white dark:bg-[#121212] min-h-screen flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
        {/* Simple Mock Map */}
        <div className="relative h-1/4 bg-gray-200 dark:bg-zinc-800 overflow-hidden">
          <img 
            alt="Map view" 
            src="https://images.unsplash.com/photo-1524661135-423995f22d0b?q=80&w=1000&auto=format&fit=crop" 
            className="w-full h-full object-cover opacity-60 dark:opacity-40"
          />
          <button 
            onClick={handleBack}
            className="absolute top-12 left-4 w-10 h-10 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-lg"
          >
            <span className="material-icons-outlined">arrow_back</span>
          </button>
        </div>

        {/* Ride Options List */}
        <div className="flex-1 bg-white dark:bg-[#121212] -mt-4 rounded-t-3xl shadow-2xl z-10 p-4 overflow-y-auto hide-scrollbar">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-zinc-800 rounded-full mx-auto mb-6"></div>
          
          {/* Solo vs Pooled Toggle */}
          <div className="flex bg-gray-100 dark:bg-zinc-900 p-1 rounded-full mb-6">
            <button 
              onClick={() => { setRideMode('Solo'); setSelectedRideId(SOLO_OPTIONS[0].id); }}
              className={`flex-1 py-2.5 rounded-full text-sm font-black transition-all ${rideMode === 'Solo' ? 'bg-white dark:bg-zinc-800 shadow-md text-black dark:text-white' : 'text-gray-500'}`}
            >
              Solo Ride
            </button>
            <button 
              onClick={() => { setRideMode('Pooled'); setSelectedRideId(POOLED_OPTIONS[0].id); }}
              className={`flex-1 py-2.5 rounded-full text-sm font-black transition-all flex items-center justify-center gap-2 ${rideMode === 'Pooled' ? 'bg-[#f2b90d] shadow-md text-black' : 'text-gray-500'}`}
            >
              <span className="material-icons-outlined text-sm">eco</span>
              Pooled Ride
            </button>
          </div>
          
          <h2 className="text-xl font-black mb-4 px-1">{rideMode === 'Solo' ? 'Private rides' : 'Eco-matched rides'}</h2>
          
          <div className="space-y-3">
            {activeOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedRideId(option.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                  selectedRideId === option.id 
                    ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800/50' 
                    : 'border-transparent bg-gray-100 dark:bg-zinc-800/20'
                }`}
              >
                <img alt={option.name} src={option.icon} className="w-14 h-14 object-contain" />
                <div className="flex-1 text-left">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">{option.name}</span>
                    <span className="font-bold text-lg">{option.price}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-zinc-400">
                    <span className="material-icons-outlined text-sm">schedule</span>
                    {option.eta} • {option.capacity} seats
                  </div>
                  {option.isPooled && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-black text-green-600 dark:text-green-400 uppercase tracking-widest">
                       <span className="material-icons-outlined text-[10px]">energy_savings_leaf</span>
                       Save 1.2kg CO2
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>

          <div 
            onClick={() => setShowPaymentModal(true)}
            className="mt-6 flex items-center justify-between p-4 bg-gray-50 dark:bg-zinc-900 rounded-2xl cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors border border-gray-100 dark:border-zinc-800"
          >
            <div className="flex items-center gap-3">
              <span className="material-icons-outlined text-green-600">
                {paymentMethod === 'Cash' ? 'payments' : paymentMethod === 'UPI' ? 'account_balance' : 'account_balance_wallet'}
              </span>
              <span className="font-bold">Personal • {paymentMethod}</span>
            </div>
            <span className="material-icons-outlined text-gray-400">chevron_right</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#121212] border-t border-gray-100 dark:border-gray-800 ios-safe-bottom">
          <button className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-[18px] text-lg font-black hover:scale-[0.98] transition-transform shadow-xl">
            Confirm {activeOptions.find(r => r.id === selectedRideId)?.name}
          </button>
        </div>

        {/* Payment Selection Bottom Sheet */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-[60] flex flex-col justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPaymentModal(false)}></div>
            <div className="bg-white dark:bg-zinc-900 rounded-t-[32px] p-6 z-10 animate-in slide-in-from-bottom duration-300">
              <div className="w-12 h-1 bg-gray-200 dark:bg-zinc-800 rounded-full mx-auto mb-6"></div>
              <h2 className="text-xl font-black mb-6">Payment Options</h2>
              <div className="space-y-3">
                {[
                  { id: 'Cash', label: 'Cash', icon: 'payments' },
                  { id: 'UPI', label: 'UPI', icon: 'account_balance', promo: 'Save ₹50' },
                  { id: 'Wallet', label: 'Wallet', icon: 'account_balance_wallet', balance: '₹420.00' }
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setPaymentMethod(p.id as PaymentMethod); setShowPaymentModal(false); }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${paymentMethod === p.id ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800' : 'border-transparent bg-gray-100 dark:bg-zinc-800/40'}`}
                  >
                    <span className={`material-icons-outlined text-2xl ${p.id === 'UPI' ? 'text-blue-500' : 'text-green-600'}`}>{p.icon}</span>
                    <div className="flex-1 text-left">
                       <p className="font-bold">{p.label}</p>
                       {p.balance && <p className="text-xs text-gray-500">{p.balance}</p>}
                    </div>
                    {p.promo && <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter">{p.promo}</span>}
                    {paymentMethod === p.id && <span className="material-icons text-black dark:text-white">check_circle</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowPaymentModal(false)} className="w-full mt-6 py-4 rounded-xl font-black bg-gray-100 dark:bg-zinc-800">Close</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#121212] min-h-screen flex flex-col animate-in fade-in slide-in-from-right duration-300">
      <header className="ios-safe-top sticky top-0 bg-white dark:bg-[#121212] z-20 px-4 py-4 flex items-center">
        <button onClick={handleBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
          <span className="material-icons-outlined text-2xl">arrow_back</span>
        </button>
        <h1 className="text-xl font-bold flex-1 text-center mr-8">Plan your ride</h1>
      </header>

      <main className="flex-1 px-4">
        {/* Interactive Selectors */}
        <div className="flex gap-2 mb-6">
          <div className="relative group">
            <button 
              onClick={() => setPickupTime(pickupTime === 'Now' ? 'Later' : 'Now')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${
                pickupTime === 'Now' ? 'bg-gray-100 dark:bg-zinc-800' : 'bg-black text-white dark:bg-white dark:text-black'
              }`}
            >
              <span className="material-icons-outlined text-lg">schedule</span>
              <span>Pickup {pickupTime.toLowerCase()}</span>
              <span className="material-icons-outlined text-lg">expand_more</span>
            </button>
          </div>
          <div className="relative group">
            <button 
              onClick={() => setPassenger(passenger === 'Me' ? 'Others' : 'Me')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${
                passenger === 'Me' ? 'bg-gray-100 dark:bg-zinc-800' : 'bg-black text-white dark:bg-white dark:text-black'
              }`}
            >
              <span className="material-icons-outlined text-lg">person</span>
              <span>For {passenger.toLowerCase()}</span>
              <span className="material-icons-outlined text-lg">expand_more</span>
            </button>
          </div>
        </div>

        {/* Search Input Group */}
        <div className="relative flex items-start gap-4 p-4 mb-6 bg-gray-100 dark:bg-zinc-800 rounded-2xl border border-transparent focus-within:border-gray-400 dark:focus-within:border-gray-600 transition-all shadow-sm">
          <div className="flex flex-col items-center mt-2.5">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 dark:border-zinc-500 bg-white dark:bg-zinc-800"></div>
            <div className="w-0.5 h-10 bg-gray-300 dark:bg-zinc-700 my-1"></div>
            <div className="w-2.5 h-2.5 bg-black dark:bg-white rounded-sm"></div>
          </div>
          <div className="flex-1 flex flex-col gap-3">
            <div className="relative">
              <input 
                className="w-full bg-transparent border-none p-0 text-base font-bold focus:ring-0 placeholder-gray-500" 
                placeholder="Current location" 
                type="text" 
                defaultValue="Academic Block 3"
              />
            </div>
            <div className="h-px bg-gray-200 dark:bg-zinc-700 w-full"></div>
            <div className="relative">
              <input 
                autoFocus
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setShowOptions(true)}
                className="w-full bg-transparent border-none p-0 text-base font-bold focus:ring-0 placeholder-gray-500 text-blue-500" 
                placeholder="Where to?" 
                type="text"
              />
            </div>
          </div>
          <button className="flex items-center justify-center w-8 h-8 bg-gray-200 dark:bg-zinc-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
            <span className="material-icons-outlined text-lg">add</span>
          </button>
        </div>

        {/* Suggestion List */}
        <div className="space-y-1">
          {PLAN_SUGGESTIONS.map((loc) => (
            <button 
              key={loc.id} 
              onClick={() => handleSelectLocation(loc.name)}
              className="w-full flex items-center gap-4 py-3 group hover:bg-gray-50 dark:hover:bg-zinc-800/30 rounded-xl transition-colors px-2 -mx-2"
            >
              <div className="flex items-center justify-center w-10 h-10 bg-gray-100 dark:bg-zinc-800 rounded-full group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                <span className="material-icons-outlined text-xl opacity-70">location_on</span>
              </div>
              <div className="flex-1 text-left border-b border-gray-100 dark:border-gray-800 pb-3 group-last:border-none">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-base">{loc.name}</span>
                  <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">{loc.distance}</span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[280px]">{loc.address}</p>
              </div>
            </button>
          ))}
        </div>
      </main>

      <div className="ios-safe-bottom flex justify-center pb-2">
        <div className="w-32 h-1 bg-gray-200 dark:bg-zinc-800 rounded-full"></div>
      </div>
    </div>
  );
};

export default PlanRideScreen;

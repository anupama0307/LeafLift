import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { PLAN_SUGGESTIONS } from '../constants';

// Fix Leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface PlanRideScreenProps {
  onBack: () => void;
}

interface RideOption {
  id: string;
  name: string;
  price: number;
  eta: string;
  capacity: number;
  icon: string;
  description: string;
  isPooled?: boolean;
  co2?: number; // kg saved
}

const RIDE_OPTIONS: RideOption[] = [
  {
    id: 'r1',
    name: 'Uber Go',
    price: 245,
    eta: '5 min',
    capacity: 4,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    description: 'Affordable, compact rides',
    isPooled: false
  },
  {
    id: 'r2',
    name: 'Premier',
    price: 312,
    eta: '3 min',
    capacity: 4,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s',
    description: 'Comfortable sedans, top-rated drivers',
    isPooled: false
  },
  {
    id: 'p1',
    name: 'Uber Go Pool',
    price: 165,
    eta: '8 min',
    capacity: 2,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    description: 'Share with 1-2 others & save CO2',
    isPooled: true,
    co2: 1.2
  },
  {
    id: 'p2',
    name: 'Premier Pool',
    price: 210,
    eta: '6 min',
    capacity: 2,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s',
    description: 'Sedan pooling for comfort',
    isPooled: true,
    co2: 1.5
  }
];

type PaymentMethod = 'Cash' | 'UPI' | 'Wallet';

// Helper component to center map
function RecenterAutomatically({ lat, lng }: { lat: number, lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

const PlanRideScreen: React.FC<PlanRideScreenProps> = ({ onBack }) => {
  const [destination, setDestination] = useState('');
  const [pickup, setPickup] = useState('Academic Block 3');
  const [showOptions, setShowOptions] = useState(false);
  const [rideMode, setRideMode] = useState<'Solo' | 'Pooled'>('Solo');
  const [selectedRideId, setSelectedRideId] = useState(RIDE_OPTIONS[0].id);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');

  const [focusedInput, setFocusedInput] = useState<'pickup' | 'dropoff'>('dropoff');
  const [pickupTime, setPickupTime] = useState<'Now' | 'Later'>('Now');
  const [passenger, setPassenger] = useState<'Me' | 'Others'>('Me');

  // Map State
  const [mapCenter, setMapCenter] = useState<[number, number]>([11.0168, 76.9558]); // Coimbatore default
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
      const data = await response.json();
      setSuggestions(data);
    } catch (error) {
      console.error("Error fetching places:", error);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const query = focusedInput === 'pickup' ? pickup : destination;
      if (query && !showOptions) {
        fetchSuggestions(query);
      }
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [pickup, destination, focusedInput, showOptions]);

  const handleSelectSuggestion = (item: any) => {
    const address = item.display_name.split(',')[0];
    const coords: [number, number] = [parseFloat(item.lat), parseFloat(item.lon)];

    setMapCenter(coords);

    if (focusedInput === 'pickup') {
      setPickup(address);
      setFocusedInput('dropoff');
    } else {
      setDestination(address);
      setShowOptions(true);
    }
    setSuggestions([]);
  };

  const handleSwapLocations = () => {
    const temp = pickup;
    setPickup(destination);
    setDestination(temp);
  };

  const activeOptions = RIDE_OPTIONS.filter(r => r.isPooled === (rideMode === 'Pooled'));

  const comparePrice = (currentOption: RideOption) => {
    if (rideMode === 'Solo') {
      // Find cheaper pooled option
      const pool = RIDE_OPTIONS.find(r => r.isPooled && r.name.includes(currentOption.name.split(' ')[0]));
      const diff = pool ? currentOption.price - pool.price : 0;
      return diff > 0 ? `Save ₹${diff} with Pool` : null;
    } else {
      // Find solo option to compare speed?
      return null;
    }
  };

  if (showOptions) {
    return (
      <div className="bg-white dark:bg-[#121212] min-h-screen flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
        {/* Map View */}
        <div className="relative h-1/3 bg-gray-200 dark:bg-zinc-800 overflow-hidden z-0">
          <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            <Marker position={mapCenter}>
              <Popup>{destination}</Popup>
            </Marker>
            <RecenterAutomatically lat={mapCenter[0]} lng={mapCenter[1]} />
          </MapContainer>
          <button
            onClick={() => setShowOptions(false)}
            className="absolute top-12 left-4 w-10 h-10 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-lg z-[400]"
          >
            <span className="material-icons-outlined">arrow_back</span>
          </button>
        </div>

        {/* Ride Options List */}
        <div className="flex-1 bg-white dark:bg-[#121212] -mt-6 rounded-t-3xl shadow-2xl z-10 p-4 overflow-y-auto hide-scrollbar">
          <div className="w-12 h-1.5 bg-gray-200 dark:bg-zinc-800 rounded-full mx-auto mb-6"></div>

          {/* Comparisons */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => { setRideMode('Solo'); setSelectedRideId(RIDE_OPTIONS[0].id); }}
              className={`flex-1 p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${rideMode === 'Solo' ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800' : 'border-transparent bg-gray-50/50 dark:bg-zinc-900'}`}
            >
              <span className="font-black">Solo</span>
              <span className="text-xs text-gray-500">Faster</span>
            </button>
            <button
              onClick={() => { setRideMode('Pooled'); setSelectedRideId(RIDE_OPTIONS[2].id); }}
              className={`flex-1 p-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 relative overflow-hidden ${rideMode === 'Pooled' ? 'border-leaf-500 bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400' : 'border-transparent bg-gray-50/50 dark:bg-zinc-900'}`}
            >
              <div className="absolute top-0 right-0 bg-leaf-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-bl-lg">SAVE ₹50+</div>
              <span className="font-black flex items-center gap-1">
                Pool <span className="material-icons-outlined text-sm">eco</span>
              </span>
              <span className="text-xs opacity-80">Eco-friendly</span>
            </button>
          </div>

          <h2 className="text-xl font-black mb-4 px-1 flex justify-between items-center">
            {rideMode === 'Solo' ? 'Private rides' : 'Eco-matched rides'}
            <span className="text-xs font-normal text-gray-500 bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded-full">
              {rideMode === 'Pooled' ? '🌱 2 passengers nearby' : 'Traffic: Moderate'}
            </span>
          </h2>

          <div className="space-y-3">
            {activeOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setSelectedRideId(option.id)}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${selectedRideId === option.id
                  ? (rideMode === 'Pooled' ? 'border-leaf-500 bg-leaf-50/50 dark:bg-leaf-900/10' : 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800')
                  : 'border-transparent bg-gray-50 dark:bg-zinc-800/20'
                  }`}
              >
                <img alt={option.name} src={option.icon} className="w-14 h-14 object-contain" />
                <div className="flex-1 text-left">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">{option.name}</span>
                    <span className="font-bold text-lg">₹{option.price}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-zinc-400">
                    <span className="material-icons-outlined text-sm">schedule</span>
                    {option.eta} • {option.capacity} seats
                  </div>
                  {/* Analysis/Promo Text */}
                  {option.isPooled ? (
                    <div className="mt-1 flex items-center gap-1 text-[10px] font-black text-green-600 dark:text-green-400 uppercase tracking-widest">
                      <span className="material-icons-outlined text-[10px]">energy_savings_leaf</span>
                      Save {option.co2}kg CO2
                    </div>
                  ) : (
                    comparePrice(option) && (
                      <div className="mt-1 text-[10px] font-bold text-leaf-600 dark:text-leaf-500">
                        {comparePrice(option)}
                      </div>
                    )
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
              <span className="material-icons-outlined text-leaf-600">
                {paymentMethod === 'Cash' ? 'payments' : paymentMethod === 'UPI' ? 'account_balance' : 'account_balance_wallet'}
              </span>
              <span className="font-black">Personal • {paymentMethod}</span>
            </div>
            <span className="material-icons-outlined text-gray-400">chevron_right</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-[#121212] border-t border-gray-100 dark:border-gray-800 ios-safe-bottom">
          <button className="w-full bg-leaf-600 dark:bg-leaf-500 text-white py-4 rounded-2xl text-lg font-black hover:scale-[0.98] transition-all shadow-xl shadow-leaf-500/20 active:scale-95">
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
                    <span className={`material-icons-outlined text-2xl ${p.id === 'UPI' ? 'text-blue-500' : 'text-leaf-600'}`}>{p.icon}</span>
                    <div className="flex-1 text-left">
                      <p className="font-black text-black dark:text-white">{p.label}</p>
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
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
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
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all shadow-sm ${pickupTime === 'Now' ? 'bg-gray-100 dark:bg-zinc-800' : 'bg-black text-white dark:bg-white dark:text-black'
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
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-black transition-all shadow-sm ${passenger === 'Me' ? 'bg-gray-100 dark:bg-zinc-800' : 'bg-leaf-600 text-white dark:bg-leaf-500'
                }`}
            >
              <span className="material-icons-outlined text-lg">person</span>
              <span>For {passenger.toLowerCase()}</span>
              <span className="material-icons-outlined text-lg">expand_more</span>
            </button>
          </div>
        </div>

        {/* Search Input Group */}
        <div className="relative flex items-center gap-4 p-4 mb-6 bg-gray-100 dark:bg-zinc-800 rounded-2xl border border-transparent focus-within:border-gray-400 dark:focus-within:border-gray-600 transition-all shadow-sm">
          <div className="flex flex-col items-center self-stretch py-2">
            <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 dark:border-zinc-500 bg-white dark:bg-zinc-800"></div>
            <div className="w-0.5 flex-1 bg-gray-300 dark:bg-zinc-700 my-1 border-l border-dashed border-gray-400 dark:border-zinc-600"></div>
            <div className="w-2.5 h-2.5 bg-black dark:bg-white rounded-sm shadow-sm"></div>
          </div>
          <div className="flex-1 flex flex-col gap-3">
            <div className="relative group">
              <label className="text-[10px] uppercase font-bold text-gray-400 dark:text-gray-500 mb-0.5 block tracking-wider">Pickup</label>
              <input
                className="w-full bg-transparent border-none p-0 text-base font-bold focus:ring-0 placeholder-gray-400 text-black dark:text-white"
                placeholder="Current location"
                type="text"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                onFocus={() => setFocusedInput('pickup')}
              />
              {pickup && (
                <button
                  onClick={() => setPickup('')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <span className="material-icons-outlined text-sm">close</span>
                </button>
              )}
            </div>
            <div className="h-px bg-gray-200 dark:bg-zinc-700 w-full"></div>
            <div className="relative group">
              <label className="text-[10px] uppercase font-bold text-leaf-600 dark:text-leaf-500 mb-0.5 block tracking-wider">Drop-off</label>
              <input
                autoFocus
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                onFocus={() => setFocusedInput('dropoff')}
                onKeyDown={(e) => e.key === 'Enter' && setShowOptions(true)}
                className="w-full bg-transparent border-none p-0 text-base font-black focus:ring-0 placeholder-gray-400 text-leaf-600 dark:text-leaf-400"
                placeholder="Where to?"
                type="text"
              />
              {destination && (
                <button
                  onClick={() => setDestination('')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <span className="material-icons-outlined text-sm">close</span>
                </button>
              )}
            </div>
          </div>
          <button
            onClick={handleSwapLocations}
            className="flex items-center justify-center w-10 h-10 bg-white dark:bg-zinc-700 rounded-full hover:bg-gray-50 dark:hover:bg-gray-600 transition-all shadow-sm border border-gray-100 dark:border-zinc-600 active:scale-95 text-leaf-600 dark:text-leaf-400"
            title="Swap locations"
          >
            <span className="material-icons-outlined text-xl">swap_vert</span>
          </button>
        </div>

        {/* Suggestion List (Dynamic) */}
        <div className="space-y-1 overflow-y-auto pb-4">
          {isSearching ? (
            <div className="flex justify-center py-4">
              <span className="material-icons-outlined animate-spin text-leaf-500">refresh</span>
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((item) => (
              <button
                key={item.place_id}
                onClick={() => handleSelectSuggestion(item)}
                className="w-full flex items-center gap-4 py-3 group hover:bg-gray-50 dark:hover:bg-zinc-800/30 rounded-xl transition-colors px-2 -mx-2"
              >
                <div className="flex items-center justify-center w-10 h-10 bg-gray-100 dark:bg-zinc-800 rounded-full group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                  <span className="material-icons-outlined text-xl opacity-70">location_on</span>
                </div>
                <div className="flex-1 text-left border-b border-gray-100 dark:border-gray-800 pb-3 group-last:border-none">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-base truncate max-w-[200px]">{item.display_name.split(',')[0]}</span>
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">{(Math.random() * 10).toFixed(1)} KM</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[280px]">{item.display_name}</p>
                </div>
              </button>
            ))
          ) : (
            // Default Suggestions (Static)
            PLAN_SUGGESTIONS.map((loc) => (
              <button
                key={loc.id}
                onClick={() => handleSelectSuggestion({
                  display_name: loc.name + ", " + loc.address,
                  lat: "11.0168", // Fallback coords for static data
                  lon: "76.9558"
                })}
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
            ))
          )}
        </div>
      </main>
    </div>
  );
};

export default PlanRideScreen;

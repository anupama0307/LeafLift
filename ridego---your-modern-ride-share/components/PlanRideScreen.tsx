import React, { useState, useEffect, useRef } from 'react';
import { MAPPLS_CONFIG } from '../constants';
import { searchPlaces, getRoute, calculateFare, formatRouteInfo, reverseGeocode } from '../src/utils/mapplsApi';
import { MapplsPlace, RouteInfo } from '../types';

declare global {
  interface Window {
    mappls: any;
  }
}

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
  co2?: number;
}

const RIDE_OPTIONS_BASE: Omit<RideOption, 'price' | 'eta'>[] = [
  {
    id: 'r1',
    name: 'Uber Go',
    capacity: 4,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    description: 'Affordable, compact rides',
    isPooled: false
  },
  {
    id: 'r2',
    name: 'Premier',
    capacity: 4,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s',
    description: 'Comfortable sedans, top-rated drivers',
    isPooled: false
  },
  {
    id: 'p1',
    name: 'Uber Go Pool',
    capacity: 2,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    description: 'Share with 1-2 others & save CO2',
    isPooled: true,
    co2: 1.2
  },
  {
    id: 'p2',
    name: 'Premier Pool',
    capacity: 2,
    icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s',
    description: 'Sedan pooling for comfort',
    isPooled: true,
    co2: 1.5
  }
];

type PaymentMethod = 'Cash' | 'UPI' | 'Wallet';

const PlanRideScreen: React.FC<PlanRideScreenProps> = ({ onBack }) => {
  // State management
  const [destination, setDestination] = useState('');
  const [pickup, setPickup] = useState('Current Location');
  const [showOptions, setShowOptions] = useState(false);
  const [rideMode, setRideMode] = useState<'Solo' | 'Pooled'>('Solo');
  const [selectedRideId, setSelectedRideId] = useState('r1');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
  const [focusedInput, setFocusedInput] = useState<'pickup' | 'dropoff'>('dropoff');
  const [pickupTime, setPickupTime] = useState<'Now' | 'Later'>('Now');
  const [passenger, setPassenger] = useState<'Me' | 'Others'>('Me');
  const [isRequesting, setIsRequesting] = useState(false);

  // Map state
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Route and suggestions
  const [suggestions, setSuggestions] = useState<MapplsPlace[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [rideOptions, setRideOptions] = useState<RideOption[]>([]);

  // Markers and route layer
  const pickupMarkerRef = useRef<any>(null);
  const dropoffMarkerRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);

  // Get User Location on Mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const coords = { lat: latitude, lng: longitude };
          setPickupCoords(coords);

          if (mapRef.current) {
            mapRef.current.setCenter(coords);
            // Add/Update user marker
            if (pickupMarkerRef.current) {
              pickupMarkerRef.current.setPosition(coords);
            } else {
              const marker = new window.mappls.Marker({
                map: mapRef.current,
                position: coords,
                icon: 'https://apis.mappls.com/map_v3/1.png',
                fitbounds: true,
                draggable: true
              });

              marker.addListener('dragend', async () => {
                const pos = marker.getPosition();
                const { lat, lng } = pos;
                setPickupCoords({ lat, lng });
                setPickup("Locating...");
                const address = await reverseGeocode(lat, lng);
                setPickup(address);
              });

              pickupMarkerRef.current = marker;
            }
          }

          // Reverse Geocode
          try {
            const address = await reverseGeocode(latitude, longitude);
            setPickup(address);
          } catch (error) {
            console.error('Reverse Geocode failed', error);
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          // Fallback to default/Coimbatore if needed, or just let users search
        }
      );
    }
  }, [mapLoaded]); // Depend on mapLoaded to ensure we can manipulate map if needed, though state update is independent

  // Initialize MapmyIndia map
  useEffect(() => {
    if (!mapContainerRef.current || mapLoaded) return;

    const loadMap = () => {
      if (window.mappls) {
        try {
          const map = new window.mappls.Map(mapContainerRef.current, {
            center: [11.0168, 76.9558], // Default to Coimbatore until geo loads
            zoom: 15,
            zoomControl: false, // Cleaner UI
            location: false // We handle location manually
          });

          map.on('load', () => {
            mapRef.current = map;
            setMapLoaded(true);

            // If we already have coords from geo (race condition), add marker
            if (pickupCoords) {
              pickupMarkerRef.current = new window.mappls.Marker({
                map: map,
                position: pickupCoords,
                icon: 'https://apis.mappls.com/map_v3/1.png',
                fitbounds: true,
                draggable: true // Allow user to adjust location
              });

              // Update address on drag end
              pickupMarkerRef.current.addListener('dragend', async () => {
                const pos = pickupMarkerRef.current.getPosition();
                // Mappls returns {lat: x, lng: y} or [x, y]? Usually object or can accept object. 
                // If getPosition returns object:
                const { lat, lng } = pos;
                setPickupCoords({ lat, lng });
                setPickup("Locating..."); // Temporary state
                const address = await reverseGeocode(lat, lng);
                setPickup(address);
              });
            }
          });
        } catch (error) {
          console.error('Error initializing map:', error);
        }
      } else {
        setTimeout(loadMap, 500);
      }
    };

    loadMap();
  }, [mapLoaded]);

  // Fetch place suggestions
  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setIsSearching(true);
    try {
      // Use current location as bias for better suggestions
      const locationBias = pickupCoords ? `${pickupCoords.lat},${pickupCoords.lng}` : undefined;
      const results = await searchPlaces(query, locationBias);
      setSuggestions(results);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      const query = focusedInput === 'pickup' ? pickup : destination;
      if (query && query.length > 2 && !showOptions) {
        fetchSuggestions(query);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [pickup, destination, focusedInput, showOptions]);

  // Handle place selection
  const handleSelectSuggestion = async (place: MapplsPlace) => {
    const coords = { lat: place.latitude, lng: place.longitude };

    if (focusedInput === 'pickup') {
      setPickup(place.placeName);
      setPickupCoords(coords);
      setFocusedInput('dropoff');

      if (pickupMarkerRef.current && mapRef.current) {
        pickupMarkerRef.current.setPosition(coords);
        mapRef.current.panTo(coords);
      }
    } else {
      setDestination(place.placeName);
      setDropoffCoords(coords);
      setSuggestions([]); // Clear suggestions to show map view

      // Calculate route immediately if we have both points
      if (pickupCoords) {
        await calculateRoute(pickupCoords, coords);
        setShowOptions(true); // Enter "Route Mode"
      }
    }
    setSuggestions([]);
  };

  // Calculate route and update map
  const calculateRoute = async (
    start: { lat: number; lng: number },
    end: { lat: number; lng: number }
  ) => {
    try {
      const routes = await getRoute(start.lat, start.lng, end.lat, end.lng);

      // Mappls returns an array now thanks to earlier edit
      const route = (routes && routes.length > 0) ? routes[0] : null;

      if (route && mapRef.current) {
        const info = formatRouteInfo(route);
        setRouteInfo(info);

        const basePrice = info.fare;
        const updatedOptions: RideOption[] = RIDE_OPTIONS_BASE.map(opt => ({
          ...opt,
          price: opt.id === 'r1' ? basePrice :
            opt.id === 'r2' ? Math.round(basePrice * 1.3) :
              opt.id === 'p1' ? Math.round(basePrice * 0.67) :
                Math.round(basePrice * 0.85),
          eta: opt.isPooled ? `${Math.round(parseInt(info.duration) * 1.3)} min` : info.duration
        }));
        setRideOptions(updatedOptions);

        if (dropoffMarkerRef.current) dropoffMarkerRef.current.remove();
        dropoffMarkerRef.current = new window.mappls.Marker({
          map: mapRef.current,
          position: end,
          icon: 'https://apis.mappls.com/map_v3/2.png',
          fitbounds: false // We fit bounds manually below
        });

        if (routeLayerRef.current) mapRef.current.removeLayer(routeLayerRef.current);

        const polyline = window.mappls.Polyline({
          map: mapRef.current,
          paths: decodePolyline(route.geometry),
          strokeColor: '#000',
          strokeOpacity: 0.8,
          strokeWeight: 5,
          fitbounds: true // Mappls auto-fits here
        });

        routeLayerRef.current = polyline;
      }
    } catch (error) {
      console.error('Error calculating route:', error);
    }
  };

  const decodePolyline = (encoded: string): Array<{ lat: number; lng: number }> => {
    const points: Array<{ lat: number; lng: number }> = [];
    let index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lat += dlat;
      shift = 0; result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
      lng += dlng;
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  };

  const handleConfirmRide = async () => {
    setIsRequesting(true);
    const selectedOption = rideOptions.find(r => r.id === selectedRideId);

    // Get user from localStorage
    const userStr = localStorage.getItem('leaflift_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const userId = user && user._id ? user._id : '65c2a1234567890abcdef123'; // Fallback for dev

    const rideData = {
      userId,
      status: 'SEARCHING',
      pickup: {
        address: pickup,
        lat: pickupCoords?.lat,
        lng: pickupCoords?.lng
      },
      dropoff: {
        address: destination,
        lat: dropoffCoords?.lat,
        lng: dropoffCoords?.lng
      },
      fare: selectedOption?.price,
      distance: routeInfo?.distance,
      duration: routeInfo?.duration,
      rideType: selectedOption?.name,
      paymentMethod
    };

    try {
      const response = await fetch('http://localhost:5000/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rideData)
      });

      if (response.ok) {
        alert('Ride requested successfully! Searching for drivers...');
      } else {
        alert('Failed to request ride. Please try again.');
      }
    } catch (error) {
      console.error('Error requesting ride:', error);
      alert('Network error. Check server.');
    } finally {
      setIsRequesting(false);
    }
  };

  const activeOptions = rideOptions.filter(r => r.isPooled === (rideMode === 'Pooled'));

  return (
    <div className="relative w-full h-screen bg-white dark:bg-black overflow-hidden">

      {/* Full Screen Map */}
      <div
        id="mappls-map"
        ref={mapContainerRef}
        className="absolute inset-0 z-0 bg-gray-100 dark:bg-zinc-800"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Back Button (Always visible) */}
      <div className="absolute top-4 left-4 z-50">
        <button
          onClick={onBack}
          className="w-10 h-10 bg-white dark:bg-zinc-800 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        >
          <span className="material-icons-outlined">arrow_back</span>
        </button>
      </div>

      {/* SEARCH OVERLAY (Visible when !showOptions) */}
      {!showOptions && (
        <div className="absolute top-16 left-4 right-4 z-50">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-4 transition-all">

            {/* Input Fields */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-black dark:bg-white"></div>
                <input
                  value={pickup}
                  onChange={e => setPickup(e.target.value)}
                  onFocus={() => setFocusedInput('pickup')}
                  className="flex-1 bg-transparent border-none p-2 text-sm font-bold focus:ring-0"
                  placeholder="Current Location"
                />
                {pickup && (
                  <button onClick={() => setPickup('')} className="p-1">
                    <span className="material-icons-outlined text-gray-400 text-sm">close</span>
                  </button>
                )}
              </div>
              <div className="h-px bg-gray-100 dark:bg-gray-800 ml-5" />
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-sm bg-black dark:bg-white"></div>
                <input
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  onFocus={() => setFocusedInput('dropoff')}
                  autoFocus
                  className="flex-1 bg-transparent border-none p-2 text-sm font-bold focus:ring-0"
                  placeholder="Where to?"
                />
                {destination && (
                  <button onClick={() => setDestination('')} className="p-1">
                    <span className="material-icons-outlined text-gray-400 text-sm">close</span>
                  </button>
                )}
                {/* Manual Go/Route Button */}
                <button
                  onClick={() => {
                    if (destination && pickupCoords && dropoffCoords) {
                      calculateRoute(pickupCoords, dropoffCoords);
                      setShowOptions(true);
                    } else if (destination && suggestions.length > 0) {
                      handleSelectSuggestion(suggestions[0]);
                    }
                  }}
                  className="ml-2 bg-leaf-500 hover:bg-leaf-600 text-white rounded-lg p-2 flex items-center justify-center shadow-md transition-all active:scale-95"
                >
                  <span className="material-icons-outlined text-lg">directions</span>
                </button>
              </div>
            </div>

            {/* Suggestions List (Expandable) */}
            {suggestions.length > 0 && (
              <div className="mt-4 max-h-[50vh] overflow-y-auto border-t border-gray-100 dark:border-gray-800 pt-2">
                {suggestions.map(place => (
                  <button
                    key={place.eLoc}
                    onClick={() => handleSelectSuggestion(place)}
                    className="w-full flex items-center gap-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg px-2 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                      <span className="material-icons-outlined text-sm">location_on</span>
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-bold text-sm truncate">{place.placeName}</p>
                      <p className="text-xs text-gray-500 truncate">{place.placeAddress}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RIDE OPTIONS SHEET (Slide Up) */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-white dark:bg-black rounded-t-3xl shadow-[0_-5px_20px_rgba(0,0,0,0.2)] z-50 transition-transform duration-300 ease-in-out transform flex flex-col max-h-[60vh] ${showOptions ? 'translate-y-0' : 'translate-y-full'
          }`}
      >
        {/* Handle */}
        <div className="w-full flex justify-center pt-3 pb-1">
          <div className="w-12 h-1.5 bg-gray-300 dark:bg-zinc-700 rounded-full" />
        </div>

        {/* Header Content */}
        <div className="px-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold">Choose a ride</h2>
            {routeInfo && <p className="text-xs text-gray-500">{routeInfo.distance} • {routeInfo.duration} drop-off</p>}
          </div>

          <div className="flex bg-gray-100 dark:bg-zinc-900 rounded-lg p-1">
            <button
              onClick={() => setRideMode('Solo')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${rideMode === 'Solo' ? 'bg-white dark:bg-zinc-800 shadow-sm' : 'text-gray-500'}`}
            >
              Solo
            </button>
            <button
              onClick={() => setRideMode('Pooled')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${rideMode === 'Pooled' ? 'bg-green-100 text-green-700' : 'text-gray-500'}`}
            >
              Pool
            </button>
          </div>
        </div>

        {/* Scrollable Options */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeOptions.map((option) => (
            <button
              key={option.id}
              onClick={() => setSelectedRideId(option.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${selectedRideId === option.id
                ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800'
                : 'border-transparent hover:bg-gray-50 dark:hover:bg-zinc-900'
                }`}
            >
              <img src={option.icon} className="w-12 h-12 object-contain" />
              <div className="flex-1 text-left">
                <div className="flex justify-between items-center">
                  <p className="font-bold">{option.name}</p>
                  <p className="font-bold">₹{option.price}</p>
                </div>
                <p className="text-xs text-gray-500">{option.eta} • {option.capacity} seats</p>
              </div>
            </button>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-black">
          <div className="flex items-center justify-between mb-4 px-2 cursor-pointer" onClick={() => setShowPaymentModal(true)}>
            <div className="flex items-center gap-2">
              <span className="material-icons-outlined text-green-600">payments</span>
              <span className="font-bold text-sm">{paymentMethod}</span>
            </div>
            <span className="material-icons-outlined text-gray-400 text-sm">chevron_right</span>
          </div>

          <button
            onClick={handleConfirmRide}
            disabled={isRequesting}
            className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isRequesting ? 'Requesting...' : `Confirm ${activeOptions.find(r => r.id === selectedRideId)?.name}`}
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div onClick={() => setShowPaymentModal(false)} className="fixed inset-0 bg-black/50 z-[60] flex items-end">
          <div onClick={e => e.stopPropagation()} className="w-full bg-white dark:bg-zinc-900 rounded-t-3xl p-6">
            <h3 className="text-xl font-bold mb-4">Payment Options</h3>
            <div className="space-y-3">
              {[
                { id: 'Cash', label: 'Cash', icon: 'payments' },
                { id: 'UPI', label: 'UPI', icon: 'account_balance', promo: 'Save ₹50' },
                { id: 'Wallet', label: 'Wallet', icon: 'account_balance_wallet', balance: '₹420.00' }
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setPaymentMethod(p.id as PaymentMethod); setShowPaymentModal(false); }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 ${paymentMethod === p.id ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800' : 'border-transparent bg-gray-100 dark:bg-zinc-800/40'
                    }`}
                >
                  <span className="material-icons-outlined">{p.icon}</span>
                  <span className="flex-1 text-left font-bold">{p.label}</span>
                  {p.balance && <span className="text-sm text-gray-500">{p.balance}</span>}
                  {p.promo && <span className="text-xs bg-green-500 text-white px-2 py-1 rounded">{p.promo}</span>}
                  {paymentMethod === p.id && <span className="material-icons-outlined text-green-500">check_circle</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PlanRideScreen;

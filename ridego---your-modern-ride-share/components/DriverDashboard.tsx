import React, { useEffect, useRef, useState } from 'react';
import { OLA_CONFIG } from '../constants';
import { joinRideRoom, registerSocket } from '../src/services/realtime';

declare global {
  interface Window {
    maplibregl: any;
  }
}

interface DriverDashboardProps {
  user: any;
}

type RideStatus = 'IDLE' | 'SEARCHING' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

interface ChatMessage {
  senderId?: string;
  senderRole?: string;
  message: string;
  createdAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const DriverDashboard: React.FC<DriverDashboardProps> = ({ user }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [activeRide, setActiveRide] = useState<any>(null);
  const [riderDetails, setRiderDetails] = useState<any>(null);
  const [rideStatus, setRideStatus] = useState<RideStatus>('IDLE');
  const [otpInput, setOtpInput] = useState('');
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [riderLocation, setRiderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentFare, setCurrentFare] = useState<number | null>(null);
  const [searchLat, setSearchLat] = useState('');
  const [searchLng, setSearchLng] = useState('');

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  const getMapStyle = (darkMode: boolean) => {
    return darkMode
      ? 'https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json'
      : 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json';
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapLoaded) return;

    const initMap = () => {
      if (typeof window.maplibregl === 'undefined') {
        setTimeout(initMap, 300);
        return;
      }

      const apiKey = OLA_CONFIG.apiKey;
      const map = new window.maplibregl.Map({
        container: mapContainerRef.current,
        center: [76.9558, 11.0168],
        zoom: 13,
        style: getMapStyle(document.documentElement.classList.contains('dark')),
        transformRequest: (url: string) => {
          if (url.includes('olamaps.io')) {
            const separator = url.includes('?') ? '&' : '?';
            return { url: `${url}${separator}api_key=${apiKey}` };
          }
          return { url };
        },
        attributionControl: false
      });

      map.on('load', () => {
        mapRef.current = map;
        setMapLoaded(true);
      });
    };

    setTimeout(initMap, 400);
  }, [mapLoaded]);

  useEffect(() => {
    if (!user?._id) return;
    const socket = registerSocket(user._id, 'DRIVER');

    const handleRequest = (payload: any) => {
      if (!payload?.rideId) return;
      setRequests((prev) => {
        if (prev.some((r) => r.rideId === payload.rideId)) return prev;
        return [payload, ...prev];
      });
    };

    const handleStatus = (payload: any) => {
      if (payload?.status) {
        setRideStatus(payload.status);
        if (payload.status === 'COMPLETED') {
          setChatOpen(false);
        }
      }
    };

    const handleOtp = () => {
      setRideStatus('ARRIVED');
    };

    const handleRiderLocation = (payload: any) => {
      if (!payload?.location) return;
      setRiderLocation(payload.location);
    };

    const handleFareUpdate = (payload: any) => {
      if (payload?.currentFare) setCurrentFare(payload.currentFare);
    };

    const handleChatMessage = (msg: any) => {
      if (!msg?.message) return;
      setChatMessages((prev) => [...prev, { ...msg, createdAt: msg.createdAt || new Date().toISOString() }]);
    };

    socket.on('ride:request', handleRequest);
    socket.on('ride:status', handleStatus);
    socket.on('ride:otp', handleOtp);
    socket.on('ride:rider-location', handleRiderLocation);
    socket.on('ride:fare-update', handleFareUpdate);
    socket.on('chat:message', handleChatMessage);

    return () => {
      socket.off('ride:request', handleRequest);
      socket.off('ride:status', handleStatus);
      socket.off('ride:otp', handleOtp);
      socket.off('ride:rider-location', handleRiderLocation);
      socket.off('ride:fare-update', handleFareUpdate);
      socket.off('chat:message', handleChatMessage);
    };
  }, [user]);

  useEffect(() => {
    if (!isOnline && !activeRide) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = { lat: latitude, lng: longitude };
        setDriverLocation(coords);

        if (activeRide?._id) {
          fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: 'DRIVER', lat: latitude, lng: longitude })
          }).catch(() => null);
        } else if (user?._id) {
          fetch(`${API_BASE_URL}/api/drivers/online`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverId: user._id, location: coords })
          }).catch(() => null);
        }
      },
      () => null,
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, activeRide, user]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    if (driverLocation) {
      if (!driverMarkerRef.current) {
        const el = document.createElement('div');
        el.style.width = '26px';
        el.style.height = '26px';
        el.style.borderRadius = '50%';
        el.style.backgroundColor = '#22C55E';
        el.style.border = '3px solid white';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
        driverMarkerRef.current = new window.maplibregl.Marker({ element: el })
          .setLngLat([driverLocation.lng, driverLocation.lat])
          .addTo(mapRef.current);
      } else {
        driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
      }
      mapRef.current.flyTo({ center: [driverLocation.lng, driverLocation.lat], zoom: 14, speed: 0.6 });
    }
  }, [driverLocation, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (!riderLocation) return;

    if (!riderMarkerRef.current) {
      const el = document.createElement('div');
      el.style.width = '26px';
      el.style.height = '26px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#EF4444';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      riderMarkerRef.current = new window.maplibregl.Marker({ element: el })
        .setLngLat([riderLocation.lng, riderLocation.lat])
        .addTo(mapRef.current);
    } else {
      riderMarkerRef.current.setLngLat([riderLocation.lng, riderLocation.lat]);
    }
  }, [riderLocation, mapLoaded]);

  const fetchRequests = async () => {
    try {
      const lat = searchLat ? Number(searchLat) : driverLocation?.lat;
      const lng = searchLng ? Number(searchLng) : driverLocation?.lng;
      const query = lat && lng ? `?lat=${lat}&lng=${lng}&radius=6` : '';
      const response = await fetch(`${API_BASE_URL}/api/rides/nearby${query}`);
      if (response.ok) {
        const data = await response.json();
        const mapped = data.map((ride: any) => ({
          rideId: ride._id,
          pickup: ride.pickup,
          dropoff: ride.dropoff,
          fare: ride.currentFare || ride.fare,
          isPooled: ride.isPooled,
          routeIndex: ride.routeIndex
        }));
        setRequests(mapped);
      }
    } catch (error) {
      console.error('Failed to fetch requests', error);
    }
  };

  const handleAcceptRide = async (rideId: string) => {
    if (!user?._id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/rides/${rideId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: user._id, driverLocation })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to accept ride');

      setActiveRide(data.ride);
      setRiderDetails(data.rider || null);
      setRideStatus('ACCEPTED');
      setCurrentFare(data.ride.currentFare || data.ride.fare);
      setRequests((prev) => prev.filter((r) => r.rideId !== rideId));
      if (data.ride?._id) {
        joinRideRoom(data.ride._id);
        const messages = await fetch(`${API_BASE_URL}/api/rides/${data.ride._id}/messages`);
        if (messages.ok) {
          const msgs = await messages.json();
          setChatMessages(msgs || []);
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleReached = async () => {
    if (!activeRide?._id) return;
    await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/reached`, { method: 'POST' });
  };

  const handleVerifyOtp = async () => {
    if (!activeRide?._id) return;
    const response = await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp: otpInput })
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.message || 'Invalid OTP');
    } else {
      setRideStatus('IN_PROGRESS');
      setOtpInput('');
    }
  };

  const handleCompleteRide = async () => {
    if (!activeRide?._id) return;
    await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/complete`, { method: 'POST' });
  };

  const handleAddPooledRider = async () => {
    if (!activeRide?._id) return;
    await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/pool/add`, { method: 'POST' });
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeRide?._id) return;
    await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: user?._id,
        senderRole: 'DRIVER',
        message: chatInput.trim()
      })
    });
    setChatInput('');
  };

  const handleClearRide = () => {
    setActiveRide(null);
    setRiderDetails(null);
    setRideStatus('IDLE');
    setOtpInput('');
    setRiderLocation(null);
    setCurrentFare(null);
  };

  return (
    <div className="relative flex-1 bg-black overflow-hidden h-full">
      <div ref={mapContainerRef} className="absolute inset-0" />

      <div className="absolute top-0 inset-x-0 z-30 p-4 pt-10 flex items-center justify-between">
        <div className="bg-white/90 dark:bg-black/80 backdrop-blur-xl px-3 py-2 rounded-2xl shadow-lg border border-white/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Driver Mode</p>
          <p className="text-sm font-bold text-black dark:text-white">{user?.firstName} {user?.lastName}</p>
        </div>
        <button
          onClick={() => {
            const next = !isOnline;
            setIsOnline(next);
            if (next) fetchRequests();
          }}
          className={`px-5 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-2xl border-2 ${isOnline ? 'bg-[#f2b90d] text-black border-black' : 'bg-zinc-800 text-zinc-400 border-transparent'}`}
        >
          {isOnline ? 'Online' : 'Go Online'}
        </button>
      </div>

      {!activeRide && (
      <div className="absolute bottom-0 inset-x-0 z-40 bg-white dark:bg-zinc-950 rounded-t-[32px] p-5 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-black dark:text-white">Ride Requests</h3>
          <button onClick={fetchRequests} className="text-xs font-bold text-blue-600 dark:text-blue-400">Refresh</button>
        </div>
        <div className="flex gap-2 mb-4">
          <input
            value={searchLat}
            onChange={(e) => setSearchLat(e.target.value)}
            className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-xl px-3 py-2 text-xs"
            placeholder="Search lat"
          />
          <input
            value={searchLng}
            onChange={(e) => setSearchLng(e.target.value)}
            className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-xl px-3 py-2 text-xs"
            placeholder="Search lng"
          />
          <button onClick={fetchRequests} className="px-3 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold">
            Search
          </button>
        </div>
          {requests.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {isOnline ? 'No nearby requests yet.' : 'Go online to receive ride requests.'}
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.rideId} className="p-4 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400">{req.isPooled ? 'Pool' : 'Solo'}</span>
                    <span className="font-bold text-green-600 dark:text-green-400">₹{req.fare}</span>
                  </div>
                  <div className="text-sm font-semibold dark:text-white truncate">
                    {req.pickup?.address || 'Pickup'} → {req.dropoff?.address || 'Drop'}
                  </div>
                  <button
                    onClick={() => handleAcceptRide(req.rideId)}
                    className="mt-3 w-full bg-black dark:bg-white text-white dark:text-black py-2 rounded-xl font-bold"
                  >
                    Accept Ride
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeRide && (
        <div className="absolute bottom-0 inset-x-0 z-40 bg-white dark:bg-zinc-950 rounded-t-[32px] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-gray-400">Active Ride</p>
              <h3 className="text-xl font-black dark:text-white">{rideStatus.replace('_', ' ')}</h3>
            </div>
            {currentFare !== null && (
              <div className="text-green-600 dark:text-green-400 font-black">₹{currentFare}</div>
            )}
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {activeRide.pickup?.address || 'Pickup'} → {activeRide.dropoff?.address || 'Drop'}
          </div>

          {riderDetails?.name && (
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Rider: {riderDetails.name}
            </div>
          )}

          <div className="flex gap-2 mb-4">
            <button onClick={() => setChatOpen(true)} className="flex-1 bg-gray-100 dark:bg-zinc-800 py-2 rounded-xl font-bold">
              Chat
            </button>
            <button
              onClick={() => alert(`Call rider via masked number: ${riderDetails?.maskedPhone || 'Unavailable'}`)}
              className="flex-1 bg-gray-100 dark:bg-zinc-800 py-2 rounded-xl font-bold"
            >
              Call
            </button>
          </div>

          {rideStatus === 'ACCEPTED' && (
            <button onClick={handleReached} className="w-full bg-[#f2b90d] text-black py-3 rounded-xl font-black">
              Reached Pickup
            </button>
          )}

          {rideStatus === 'ARRIVED' && (
            <div className="space-y-3">
              <input
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value)}
                className="w-full bg-gray-100 dark:bg-zinc-800 rounded-xl px-4 py-3 text-lg font-bold"
                placeholder="Enter rider OTP"
              />
              <button onClick={handleVerifyOtp} className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-black">
                Verify OTP & Start Ride
              </button>
            </div>
          )}

          {rideStatus === 'IN_PROGRESS' && (
            <div className="space-y-3">
              {activeRide.isPooled && (
                <button onClick={handleAddPooledRider} className="w-full bg-green-500 text-white py-3 rounded-xl font-black">
                  Add Pooled Rider
                </button>
              )}
              <button onClick={handleCompleteRide} className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-black">
                Complete Ride
              </button>
            </div>
          )}

          {rideStatus === 'COMPLETED' && (
            <button onClick={handleClearRide} className="w-full bg-black dark:bg-white text-white dark:text-black py-3 rounded-xl font-black">
              Done
            </button>
          )}
        </div>
      )}

      {chatOpen && activeRide && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4" onClick={() => setChatOpen(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800">
              <h3 className="font-bold dark:text-white">Ride Chat</h3>
              <button onClick={() => setChatOpen(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800">
                <span className="material-icons-outlined">close</span>
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && (
                <p className="text-sm text-gray-400 text-center">No messages yet.</p>
              )}
              {chatMessages.map((msg, idx) => (
                <div key={`${msg.createdAt}-${idx}`} className={`flex ${msg.senderRole === 'DRIVER' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    msg.senderRole === 'DRIVER'
                      ? 'bg-black text-white dark:bg-white dark:text-black'
                      : 'bg-gray-100 dark:bg-zinc-800 dark:text-white'
                  }`}>
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendChat} className="p-3 border-t border-gray-100 dark:border-zinc-800 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full px-4 text-sm"
                placeholder="Type a message..."
              />
              <button type="submit" className="bg-black dark:bg-white text-white dark:text-black rounded-full px-4">
                Send
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;

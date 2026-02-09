import React, { useEffect, useRef, useState } from 'react';
import { OLA_CONFIG } from '../constants';
import { joinRideRoom, registerSocket } from '../src/services/realtime';
import { decodePolyline, formatRouteInfo, getRoute, searchPlaces } from '../src/utils/olaApi';
import { OlaPlace } from '../types';

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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<OlaPlace[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [selectedRouteInfo, setSelectedRouteInfo] = useState<{ distance?: string; duration?: string } | null>(null);
  const [earlyCompleteLoading, setEarlyCompleteLoading] = useState(false);
  const [poolJoinRequests, setPoolJoinRequests] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [driverRides, setDriverRides] = useState<any[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [dashboardView, setDashboardView] = useState<'HOME' | 'MAP'>('HOME');

  // Daily Route State
  const [isRouteModalOpen, setIsRouteModalOpen] = useState(false);
  const [dailyRouteSource, setDailyRouteSource] = useState<OlaPlace | null>(null);
  const [dailyRouteDest, setDailyRouteDest] = useState<OlaPlace | null>(null);
  const [routeSearchQuery, setRouteSearchQuery] = useState('');
  const [routeSearchType, setRouteSearchType] = useState<'source' | 'dest'>('source');
  const [routeSuggestions, setRouteSuggestions] = useState<OlaPlace[]>([]);

  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const driverMarkerRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const requestMarkersRef = useRef<Map<string, any>>(new Map());
  const requestDataRef = useRef<Map<string, any>>(new Map());
  const socketRef = useRef<any>(null);
  const routeLayerIdRef = useRef<string | null>(null);
  const activeRouteLayerRef = useRef<string | null>(null);
  const lastRouteUpdateRef = useRef<number>(0);
  const lastRouteLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

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
      });

      map.on('load', () => {
        mapRef.current = map;
        setMapLoaded(true);
      });
    };

    initMap();
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const observer = new MutationObserver((mutations) => {
      const isDark = document.documentElement.classList.contains('dark');
      if (isDark !== isDarkMode) {
        setIsDarkMode(isDark);
        mapRef.current.setStyle(getMapStyle(isDark));
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isDarkMode, mapLoaded]);

  useEffect(() => {
    if (!user?._id && !user?.id) return;
    const userId = user._id || user.id;
    const socket = registerSocket(userId, 'DRIVER');
    socketRef.current = socket;

    const handleRequest = (payload: any) => {
      if (!payload?.rideId) return;
      const request = {
        rideId: payload.rideId,
        pickup: payload.pickup,
        dropoff: payload.dropoff,
        fare: payload.currentFare || payload.fare,
        isPooled: payload.isPooled,
        routeIndex: payload.routeIndex
      };
      addOrUpdateRequestMarker(request);
      setRequests((prev) => {
        if (prev.some((r) => r.rideId === payload.rideId)) return prev;
        return [request, ...prev];
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

    const handleNearbyRiderUpdate = (payload: any) => {
      if (!payload?.rideId) return;
      const request = {
        rideId: payload.rideId,
        pickup: payload.pickup,
        dropoff: payload.dropoff,
        fare: payload.fare,
        isPooled: payload.isPooled
      };
      if (!isWithinRadius(request)) {
        removeRequestMarker(request.rideId);
        setRequests((prev) => prev.filter((r) => r.rideId !== request.rideId));
        if (selectedRequest?.rideId === request.rideId) setSelectedRequest(null);
        return;
      }
      addOrUpdateRequestMarker(request);
      setRequests((prev) => {
        const existing = prev.find((r) => r.rideId === payload.rideId);
        if (existing) {
          return prev.map((r) => (r.rideId === payload.rideId ? { ...r, ...request } : r));
        }
        return [request, ...prev];
      });
    };

    const handleNearbyRiderRemove = (payload: any) => {
      if (!payload?.rideId) return;
      removeRequestMarker(payload.rideId);
      setRequests((prev) => prev.filter((r) => r.rideId !== payload.rideId));
    };

    const handlePoolJoinRequest = (payload: any) => {
      if (!payload?.userId) return;
      setPoolJoinRequests((prev) => [...prev, payload]);
    };

    const handleNewNotification = (notification: any) => {
      setNotifications(prev => [notification, ...prev]);
    };

    socket.on('ride:request', handleRequest);
    socket.on('ride:status', handleStatus);
    socket.on('ride:otp', handleOtp);
    socket.on('notification:new', handleNewNotification);
    socket.on('ride:rider-location', handleRiderLocation);
    socket.on('ride:fare-update', handleFareUpdate);
    socket.on('chat:message', handleChatMessage);
    socket.on('nearby:rider:update', handleNearbyRiderUpdate);
    socket.on('nearby:rider:remove', handleNearbyRiderRemove);
    socket.on('pool:join-request', handlePoolJoinRequest);

    return () => {
      socket.off('ride:request', handleRequest);
      socket.off('ride:status', handleStatus);
      socket.off('ride:otp', handleOtp);
      socket.off('notification:new', handleNewNotification);
      socket.off('ride:rider-location', handleRiderLocation);
      socket.off('ride:fare-update', handleFareUpdate);
      socket.off('chat:message', handleChatMessage);
      socket.off('nearby:rider:update', handleNearbyRiderUpdate);
      socket.off('nearby:rider:remove', handleNearbyRiderRemove);
      socket.off('pool:join-request', handlePoolJoinRequest);
    };
  }, [user?._id, user?.id]);

  useEffect(() => {
    fetchNotifications();
    fetchDriverRides();
  }, [user?._id, user?.id]);

  const fetchDriverRides = async () => {
    const userId = user?._id || user?.id;
    if (!userId) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/rides/driver/${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        setDriverRides(data);
      }
    } catch (err) {
      console.error('Fetch driver rides error:', err);
    }
  };

  const fetchNotifications = async () => {
    const userId = user?._id || user?.id;
    if (!userId) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/notifications/${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error('Fetch notifications error:', error);
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (error) {
      console.error('Mark read error:', error);
    }
  };

  useEffect(() => {
    if (!isOnline && !activeRide) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const coords = { lat: latitude, lng: longitude };
        setDriverLocation(coords);
        socketRef.current?.emit('driver:location', { driverId: user?._id || user?.id, lat: latitude, lng: longitude });

        const userId = user?._id || user?.id;
        if (isOnline && userId) {
          fetch(`${API_BASE_URL}/api/drivers/online`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, role: 'DRIVER', lat: latitude, lng: longitude })
          }).catch(() => null);
          if (activeRide?._id) {
            fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/location`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(coords),
            }).catch(console.error);
          }
        }
      },
      (error) => console.error('Geolocation error:', error),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, activeRide, user?._id, user?.id]);

  useEffect(() => {
    if (isOnline || activeRide) {
      setDashboardView('MAP');
    } else {
      setDashboardView('HOME');
    }
  }, [isOnline, activeRide]);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (riderLocation) {
      if (!riderMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-lg animate-pulse';
        riderMarkerRef.current = new window.maplibregl.Marker({ element: el })
          .setLngLat([riderLocation.lng, riderLocation.lat])
          .addTo(mapRef.current);
      } else {
        riderMarkerRef.current.setLngLat([riderLocation.lng, riderLocation.lat]);
      }
    } else if (riderMarkerRef.current) {
      riderMarkerRef.current.remove();
      riderMarkerRef.current = null;
    }

    if (driverLocation) {
      if (!driverMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'w-8 h-8 flex items-center justify-center';
        el.innerHTML = `<span class="material-icons-outlined text-leaf-600 dark:text-leaf-500 text-3xl">navigation</span>`;
        driverMarkerRef.current = new window.maplibregl.Marker({ element: el })
          .setLngLat([driverLocation.lng, driverLocation.lat])
          .addTo(mapRef.current);
      } else {
        driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
        mapRef.current.easeTo({ center: [driverLocation.lng, driverLocation.lat], duration: 1000 });
      }
    }
  }, [riderLocation, driverLocation, mapLoaded]);

  const isWithinRadius = (req: any, radiusKm = 6) => {
    if (!driverLocation || !req.pickup) return true;
    const R = 6371;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const dLat = toRad(req.pickup.lat - driverLocation.lat);
    const dLon = toRad(req.pickup.lng - driverLocation.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(driverLocation.lat)) * Math.cos(toRad(req.pickup.lat)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c <= radiusKm;
  };

  const addOrUpdateRequestMarker = (request: any) => {
    if (!mapRef.current || !request.pickup) return;
    let marker = requestMarkersRef.current.get(request.rideId);
    if (!marker) {
      const el = document.createElement('div');
      el.className = 'size-10 bg-black dark:bg-white rounded-2xl flex items-center justify-center shadow-2xl border-2 border-leaf-500 cursor-pointer hover:scale-110 transition-transform';
      el.innerHTML = `<span class="material-icons-outlined text-leaf-500 text-xl">person_pin_circle</span>`;
      el.onclick = () => setSelectedRequest(request);
      marker = new window.maplibregl.Marker({ element: el })
        .setLngLat([request.pickup.lng, request.pickup.lat])
        .addTo(mapRef.current);
      requestMarkersRef.current.set(request.rideId, marker);
    }
    requestDataRef.current.set(request.rideId, request);
  };

  const removeRequestMarker = (rideId: string) => {
    const marker = requestMarkersRef.current.get(rideId);
    if (marker) {
      marker.remove();
      requestMarkersRef.current.delete(rideId);
    }
    requestDataRef.current.delete(rideId);
  };

  const fetchRequests = async () => {
    if (!isOnline) {
      setIsOnline(true);
    }
    try {
      const resp = await fetch(`${API_BASE_URL}/api/users`);
      if (resp.ok) {
        // Mocking fetching nearby riders from all users if they have active searches
        // In real app, there would be a dedicated /api/rides/nearby endpoint
      }
    } catch (error) {
      console.error('Fetch requests error:', error);
    }
  };

  const handleSearchByPlace = async (place?: OlaPlace) => {
    if (!place && !searchQuery) return;
    setIsSearchingSuggestions(true);
    try {
      const searchTerm = place ? place.description : searchQuery;
      // In a real app, we'd fetch rides near this specific place
      setSearchSuggestions([]);
      setSearchQuery(searchTerm);
    } catch (error) {
      console.error('Search by place error:', error);
    } finally {
      setIsSearchingSuggestions(false);
    }
  };

  const handleRouteSearch = async (val: string, type: 'source' | 'dest') => {
    setRouteSearchQuery(val);
    setRouteSearchType(type);
    if (val.length < 3) {
      setRouteSuggestions([]);
      return;
    }
    try {
      const results = await searchPlaces(val);
      setRouteSuggestions(results);
    } catch (e) {
      console.error(e);
    }
  };

  const selectRoutePlace = (place: OlaPlace) => {
    if (routeSearchType === 'source') setDailyRouteSource(place);
    else setDailyRouteDest(place);
    setRouteSuggestions([]);
    setRouteSearchQuery('');
  };

  const handleSaveRoute = async () => {
    const id = user?._id || user?.id;
    if (!id || !dailyRouteSource || !dailyRouteDest) {
      alert('Please select both source and destination');
      return;
    }

    try {
      const resp = await fetch(`${API_BASE_URL}/api/driver/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: id,
          source: {
            address: dailyRouteSource.structuredFormatting.mainText,
            lat: dailyRouteSource.latitude,
            lng: dailyRouteSource.longitude
          },
          destination: {
            address: dailyRouteDest.structuredFormatting.mainText,
            lat: dailyRouteDest.latitude,
            lng: dailyRouteDest.longitude
          },
          isActive: true
        })
      });

      if (resp.ok) {
        alert('Daily route updated successfully!');
        setIsRouteModalOpen(false);
      } else {
        alert('Failed to update route');
      }
    } catch (error) {
      console.error('Save route error:', error);
      alert('Network error');
    }
  };

  const clearRoutePreview = () => {
    if (!mapRef.current) return;
    if (routeLayerIdRef.current && mapRef.current.getLayer(routeLayerIdRef.current)) {
      mapRef.current.removeLayer(routeLayerIdRef.current);
      mapRef.current.removeSource(routeLayerIdRef.current);
    }
    routeLayerIdRef.current = null;
  };

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (selectedRequest) {
      drawRouteForRequest(selectedRequest);
    } else {
      clearRoutePreview();
    }
  }, [selectedRequest, mapLoaded]);

  const drawRouteForRequest = async (request: any) => {
    if (!mapRef.current || !request.pickup || !request.dropoff) return;
    clearRoutePreview();
    try {
      const route = await getRoute(
        request.pickup.lat,
        request.pickup.lng,
        request.dropoff.lat,
        request.dropoff.lng
      );
      if (route && route.length > 0) {
        const polyline = route[0].geometry;
        const decoded = decodePolyline(polyline);
        const geojson = {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: decoded.map(p => [p.lng, p.lat])
          }
        };
        const layerId = `route-${Date.now()}`;
        mapRef.current.addSource(layerId, { type: 'geojson', data: geojson });
        mapRef.current.addLayer({
          id: layerId,
          type: 'line',
          source: layerId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#22c55e', 'line-width': 5, 'line-opacity': 0.8 }
        });
        routeLayerIdRef.current = layerId;
        setSelectedRouteInfo(formatRouteInfo(route[0]));

        // Fit map to route
        const bounds = decoded.reduce((acc: any, p: any) => acc.extend([p.lng, p.lat]), new window.maplibregl.LngLatBounds());
        mapRef.current.fitBounds(bounds, { padding: 100 });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptRide = async (rideId: string) => {
    const id = user?._id || user?.id;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/rides/${rideId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: id })
      });
      if (resp.ok) {
        const data = await resp.json();
        setActiveRide(data.ride);
        setRiderDetails({
          name: data.rider?.firstName + ' ' + data.rider?.lastName,
          phone: data.rider?.phone,
          maskedPhone: data.ride?.contact?.riderMasked
        });
        setRideStatus('ACCEPTED');
        setSelectedRequest(null);
        setRequests([]);
        requestMarkersRef.current.forEach(m => m.remove());
        requestMarkersRef.current.clear();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReached = async () => {
    if (!activeRide?._id) return;
    await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/reached`, { method: 'POST' });
    setRideStatus('ARRIVED');
  };

  const handleRequestEarlyComplete = async () => {
    if (!activeRide?._id || !driverLocation) return;
    setEarlyCompleteLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/early-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: driverLocation.lat,
          lng: driverLocation.lng
        })
      });
      if (resp.ok) {
        alert('Partial completion request sent to rider.');
      }
    } catch (error) {
      console.error(error);
    } finally {
      setEarlyCompleteLoading(false);
    }
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
    fetchDriverRides();
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
        senderId: user?._id || user?.id,
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
    clearRoutePreview();
  };

  return (
    <div className="relative flex-1 bg-white dark:bg-zinc-950 overflow-hidden h-full flex flex-col">
      {/* Background Map (hidden in HOME view but loaded) */}
      <div
        ref={mapContainerRef}
        className={`absolute inset-0 transition-opacity duration-700 ${dashboardView === 'HOME' ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      />

      {dashboardView === 'HOME' && (
        <div className="flex-1 overflow-y-auto px-6 pt-12 pb-24 z-10 animate-in fade-in duration-500">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-black text-black dark:text-white leading-tight">Welcome,</h1>
              <h2 className="text-2xl font-bold text-leaf-600 dark:text-leaf-400">{user?.firstName || 'Driver'}</h2>
            </div>
            <button
              onClick={() => setIsNotificationsOpen(true)}
              className="size-14 bg-[#f3f3f3] dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl flex items-center justify-center relative shadow-sm group"
            >
              <span className="material-icons-outlined text-black dark:text-white group-hover:scale-110 transition-transform">notifications</span>
              {notifications.some(n => !n.isRead) && (
                <span className="absolute top-3 right-3 size-3 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900 animate-pulse"></span>
              )}
            </button>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[
              {
                label: 'Today',
                value: `₹${driverRides.filter(r => r.status === 'COMPLETED' && new Date(r.bookingTime || r.createdAt).toDateString() === new Date().toDateString()).reduce((acc, r) => acc + (r.currentFare || r.fare || 0), 0)}`,
                color: 'bg-leaf-600',
                icon: 'payments'
              },
              { label: 'Rating', value: user?.rating?.toFixed(1) || '5.0', color: 'bg-zinc-900', icon: 'star' },
              { label: 'Trips', value: String(driverRides.filter(r => r.status === 'COMPLETED').length), color: 'bg-[#f3f3f3]', icon: 'speed' }
            ].map((stat, i) => (
              <div key={i} className={`${stat.color} p-4 rounded-3xl flex flex-col justify-between aspect-[4/5] shadow-lg shadow-black/5`}>
                <span className={`material-icons-outlined text-xl ${stat.color === 'bg-leaf-600' || stat.color === 'bg-zinc-900' ? 'text-white' : 'text-zinc-400'}`}>{stat.icon}</span>
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${stat.color === 'bg-[#f3f3f3]' ? 'text-gray-400' : 'text-white/60'}`}>{stat.label}</p>
                  <p className={`text-lg font-black ${stat.color === 'bg-[#f3f3f3]' ? 'text-black' : 'text-white'}`}>{stat.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Actions */}
          <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 px-1">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4 mb-10">
            <button
              onClick={() => { setIsOnline(true); setDashboardView('MAP'); fetchRequests(); }}
              className="bg-black dark:bg-white p-6 rounded-[32px] text-white dark:text-black flex flex-col items-center gap-3 active:scale-95 transition-all shadow-xl"
            >
              <span className="material-icons-outlined text-3xl">sensors</span>
              <span className="font-black text-sm uppercase tracking-widest">Go Online</span>
            </button>
            <button
              onClick={() => setIsRouteModalOpen(true)}
              className="bg-leaf-500 p-6 rounded-[32px] text-white flex flex-col items-center gap-3 active:scale-95 transition-all shadow-xl"
            >
              <span className="material-icons-outlined text-3xl">route</span>
              <span className="font-black text-sm uppercase tracking-widest">Daily Route</span>
            </button>
          </div>

          {/* Recent Activity */}
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-black dark:text-white">Recent Activity</h3>
            <button className="text-xs font-bold text-gray-400 uppercase tracking-widest">See All</button>
          </div>

          <div className="space-y-4">
            {notifications.length === 0 && driverRides.length === 0 ? (
              <div className="py-12 bg-gray-50 dark:bg-zinc-900 rounded-[32px] flex flex-col items-center justify-center opacity-40">
                <span className="material-icons-outlined text-4xl mb-2">history</span>
                <p className="font-bold text-sm">No recent activity</p>
              </div>
            ) : (
              [
                ...notifications.map(n => ({ ...n, entryType: 'NOTIFICATION' })),
                ...driverRides.slice(0, 10).map(r => ({ ...r, entryType: 'RIDE' }))
              ]
                .sort((a, b) => new Date(b.createdAt || b.bookingTime).getTime() - new Date(a.createdAt || a.bookingTime).getTime())
                .slice(0, 5)
                .map((item: any) => (
                  <div key={item._id} className="p-4 bg-[#fbfbfb] dark:bg-zinc-900/50 rounded-2xl flex items-center gap-4 border border-gray-100 dark:border-zinc-900">
                    <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 border border-gray-100 dark:border-zinc-800 ${item.entryType === 'RIDE' ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-white dark:bg-zinc-800'}`}>
                      <span className={`material-icons-outlined ${item.entryType === 'RIDE' ? 'text-blue-600 dark:text-blue-400' : 'text-leaf-600 dark:text-leaf-400'}`}>
                        {item.entryType === 'RIDE' ? 'directions_car' : (item.type === 'DAILY_JOIN_REQUEST' ? 'person_add' : 'notifications_active')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-black dark:text-white truncate">
                        {item.entryType === 'RIDE' ? `Trip to ${item.dropoff?.address?.split(',')[0] || 'Unknown'}` : item.title}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-zinc-500 font-bold">
                        {item.entryType === 'RIDE' ? `₹${item.currentFare || item.fare} • ${item.status}` : new Date(item.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="material-icons-outlined text-gray-300 text-sm">chevron_right</span>
                  </div>
                ))
            )}
          </div>
        </div>
      )}

      {dashboardView === 'MAP' && (
        <>
          <div className="absolute top-0 inset-x-0 z-30 p-4 pt-10 flex items-center justify-between">
            <button
              onClick={() => { setIsOnline(false); setDashboardView('HOME'); socketRef.current?.emit('driver:offline', { driverId: user?._id || user?.id }); }}
              className="bg-white/90 dark:bg-black/80 backdrop-blur-xl size-12 rounded-2xl shadow-lg border border-white/10 flex items-center justify-center"
            >
              <span className="material-icons-outlined text-black dark:text-white">arrow_back</span>
            </button>

            <div className="flex-1 mx-4 bg-white/90 dark:bg-black/80 backdrop-blur-xl px-4 py-2 rounded-2xl shadow-lg border border-white/10 flex flex-col items-center justify-center">
              <div className="flex items-center gap-2">
                <div className={`size-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{isOnline ? 'Online & Searching' : 'Offline'}</p>
              </div>
              <p className="text-xs font-bold text-black dark:text-white">Waiting for ride requests...</p>
            </div>

            <button
              onClick={() => setIsNotificationsOpen(true)}
              className="size-12 bg-white/90 dark:bg-black/80 backdrop-blur-xl rounded-2xl shadow-lg border border-white/10 flex items-center justify-center relative"
            >
              <span className="material-icons-outlined text-black dark:text-white">notifications</span>
              {notifications.some(n => !n.isRead) && (
                <span className="absolute top-3 right-3 size-2.5 bg-red-500 rounded-full border-2 border-white dark:border-black"></span>
              )}
            </button>
          </div>

          {!activeRide && (
            <div className="absolute bottom-0 inset-x-0 z-40 bg-white dark:bg-zinc-950 rounded-t-[40px] p-6 shadow-2xl animate-in slide-in-from-bottom duration-500">
              <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-6"></div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-black dark:text-white">Nearby Requests</h3>
                <button onClick={fetchRequests} className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-black uppercase tracking-widest">Refresh</button>
              </div>

              {requests.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-gray-100 dark:border-zinc-900 rounded-[32px] flex flex-col items-center justify-center text-center px-10">
                  <div className="relative mb-4">
                    <div className="size-16 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center">
                      <span className="material-icons-outlined text-3xl opacity-20 dark:text-white">radar</span>
                    </div>
                    <div className="absolute inset-0 border-2 border-green-500/20 rounded-full animate-ping"></div>
                  </div>
                  <p className="text-lg font-bold dark:text-white mb-2 underline underline-offset-4 decoration-leaf-500 h-10 decoration-2">Finding riders...</p>
                  <p className="text-xs text-gray-400 font-medium">Keep the app open and stay near high-demand areas.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1 custom-scrollbar">
                  {requests.map((req) => (
                    <div
                      key={req.rideId}
                      onClick={() => setSelectedRequest(req)}
                      className="p-5 rounded-[28px] border border-gray-100 dark:border-zinc-900 bg-[#fbfbfb] dark:bg-zinc-900/50 cursor-pointer active:scale-[0.98] transition-all group"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-black dark:bg-white text-white dark:text-black rounded-lg text-[10px] font-black uppercase tracking-widest">
                            {req.isPooled ? 'Pool' : 'Solo'}
                          </span>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{req.routeIndex ? `Route #${req.routeIndex}` : 'Direct'}</span>
                        </div>
                        <span className="font-black text-2xl text-leaf-600 dark:text-leaf-400">₹{req.fare}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <div className="size-2 bg-leaf-500 rounded-full"></div>
                          <div className="w-0.5 flex-1 bg-gray-200 dark:bg-zinc-800 min-h-[12px]"></div>
                          <div className="size-2 bg-red-500 rounded-full"></div>
                        </div>
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="text-sm font-bold dark:text-white truncate mb-1">{req.pickup?.address || 'Pickup'}</p>
                          <p className="text-sm font-bold dark:text-white truncate">{req.dropoff?.address || 'Drop'}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAcceptRide(req.rideId); }}
                        className="w-full bg-leaf-600 dark:bg-leaf-500 text-white py-3 rounded-2xl font-black text-sm shadow-lg shadow-leaf-500/20 group-hover:scale-[1.02] transition-all"
                      >
                        Accept Ride
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Shared Ride Overlay */}
      {activeRide && (
        <div className="absolute bottom-0 inset-x-0 z-50 bg-white dark:bg-zinc-950 rounded-t-[40px] p-6 shadow-[0_-20px_50px_-12px_rgba(0,0,0,0.3)] border-t border-gray-100 dark:border-zinc-900">
          <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-6"></div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="size-16 bg-[#f3f3f3] dark:bg-zinc-900 rounded-2xl flex items-center justify-center shrink-0 border border-gray-100 dark:border-zinc-800 overflow-hidden">
                <img src={riderDetails?.photoUrl || `https://i.pravatar.cc/150?u=${activeRide.userId}`} className="w-full h-full object-cover" />
              </div>
              <div>
                <h3 className="text-xl font-black dark:text-white">{riderDetails?.name || 'Rider'}</h3>
                <p className="text-xs font-black uppercase tracking-widest text-[#f2b90d]">{rideStatus.replace('_', ' ')}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Fare</p>
              <p className="text-2xl font-black text-green-600 dark:text-green-400">₹{currentFare || activeRide.fare}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setChatOpen(true)}
              className="bg-gray-50 dark:bg-zinc-900 p-4 rounded-2xl flex items-center justify-center gap-2 border border-gray-100 dark:border-zinc-800 group"
            >
              <span className="material-icons-outlined text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">chat_bubble</span>
              <span className="text-sm font-black dark:text-white uppercase tracking-widest">Message</span>
            </button>
            <button
              onClick={() => alert(`Call rider via masked number: ${riderDetails?.maskedPhone || 'Unavailable'}`)}
              className="bg-gray-50 dark:bg-zinc-900 p-4 rounded-2xl flex items-center justify-center gap-2 border border-gray-100 dark:border-zinc-800 group"
            >
              <span className="material-icons-outlined text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">phone_enabled</span>
              <span className="text-sm font-black dark:text-white uppercase tracking-widest">Call</span>
            </button>
          </div>

          {rideStatus === 'ACCEPTED' && (
            <button onClick={handleReached} className="w-full bg-[#f2b90d] text-black py-4 rounded-[28px] font-black shadow-xl shadow-[#f2b90d]/20 active:scale-95 transition-all text-lg">
              Reached Pickup
            </button>
          )}

          {rideStatus === 'ARRIVED' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {[0, 1, 2, 3].map(i => (
                  <input
                    key={i}
                    value={otpInput[i] || ''}
                    onChange={(e) => {
                      const val = e.target.value.slice(-1);
                      const newOtp = otpInput.split('');
                      newOtp[i] = val;
                      setOtpInput(newOtp.join(''));
                      if (val && e.target.nextElementSibling) (e.target.nextElementSibling as HTMLInputElement).focus();
                    }}
                    className="flex-1 h-16 bg-gray-50 dark:bg-zinc-900 border-2 border-gray-100 dark:border-zinc-800 rounded-2xl text-center text-2xl font-black dark:text-white focus:border-leaf-500 focus:ring-0 transition-all"
                    placeholder="-"
                  />
                ))}
              </div>
              <button onClick={handleVerifyOtp} className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-[28px] font-black text-lg shadow-xl active:scale-95 transition-all h-20">
                Start Trip
              </button>
            </div>
          )}

          {rideStatus === 'IN_PROGRESS' && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-800">
                <p className="text-xs font-bold text-green-700 dark:text-green-400 mb-1">On the way to destination</p>
                <p className="text-[10px] text-green-600 dark:text-green-500 font-medium">Please drive safely and follow the route.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCompleteRide}
                  className="flex-[2] bg-black dark:bg-white text-white dark:text-black py-4 rounded-[28px] font-black text-lg shadow-xl active:scale-95 transition-all"
                >
                  Complete Ride
                </button>
                <button
                  onClick={handleRequestEarlyComplete}
                  disabled={earlyCompleteLoading}
                  className="flex-1 bg-gray-100 dark:bg-zinc-900 text-gray-500 dark:text-zinc-400 py-4 rounded-[28px] font-black text-xs uppercase tracking-tight disabled:opacity-50"
                >
                  {earlyCompleteLoading ? '...' : 'End Early'}
                </button>
              </div>
            </div>
          )}

          {rideStatus === 'COMPLETED' && (
            <div className="text-center py-6">
              <div className="size-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-white">
                <span className="material-icons-outlined text-4xl">check_circle</span>
              </div>
              <h4 className="text-2xl font-black mb-6 dark:text-white">Trip Completed!</h4>
              <button onClick={handleClearRide} className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-[28px] font-black text-lg">
                Back to Dashboard
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isRouteModalOpen && (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end justify-center">
          <div className="bg-white dark:bg-zinc-950 w-full max-w-lg rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl">
            <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-8"></div>
            <h3 className="text-3xl font-black mb-8 dark:text-white leading-tight">Your Daily Commute</h3>

            <div className="space-y-6">
              <div className="relative">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">Home / Start</label>
                <div className="relative">
                  <input
                    value={routeSearchType === 'source' && routeSearchQuery ? routeSearchQuery : (dailyRouteSource?.structuredFormatting.mainText || '')}
                    onChange={(e) => handleRouteSearch(e.target.value, 'source')}
                    placeholder="Search for start location"
                    className="w-full bg-gray-50 dark:bg-zinc-900 p-4 rounded-2xl text-base font-bold dark:text-white pr-12 focus:ring-2 focus:ring-leaf-500 transition-all border border-transparent"
                  />
                  <span className="material-icons-outlined absolute right-4 top-4 text-leaf-500">home</span>
                </div>
                {routeSearchType === 'source' && routeSuggestions.length > 0 && (
                  <div className="absolute mt-2 w-full bg-white dark:bg-zinc-900 shadow-2xl rounded-2xl z-[110] border border-gray-100 dark:border-zinc-800 max-h-60 overflow-y-auto overflow-x-hidden">
                    {routeSuggestions.map((place, i) => (
                      <div key={i} onClick={() => selectRoutePlace(place)} className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 border-b border-gray-50 dark:border-zinc-800 last:border-none flex items-center gap-3">
                        <span className="material-icons-outlined text-gray-400">place</span>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-sm dark:text-white truncate">{place.structuredFormatting.mainText}</p>
                          <p className="text-xs text-gray-500 truncate">{place.structuredFormatting.secondaryText}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-1">Office / Destination</label>
                <div className="relative">
                  <input
                    value={routeSearchType === 'dest' && routeSearchQuery ? routeSearchQuery : (dailyRouteDest?.structuredFormatting.mainText || '')}
                    onChange={(e) => handleRouteSearch(e.target.value, 'dest')}
                    placeholder="Search for destination"
                    className="w-full bg-gray-50 dark:bg-zinc-900 p-4 rounded-2xl text-base font-bold dark:text-white pr-12 focus:ring-2 focus:ring-leaf-500 transition-all border border-transparent"
                  />
                  <span className="material-icons-outlined absolute right-4 top-4 text-leaf-500">work</span>
                </div>
                {routeSearchType === 'dest' && routeSuggestions.length > 0 && (
                  <div className="absolute mt-2 w-full bg-white dark:bg-zinc-900 shadow-2xl rounded-2xl z-[110] border border-gray-100 dark:border-zinc-800 max-h-60 overflow-y-auto">
                    {routeSuggestions.map((place, i) => (
                      <div key={i} onClick={() => selectRoutePlace(place)} className="p-4 hover:bg-gray-50 dark:hover:bg-zinc-800 border-b border-gray-50 dark:border-zinc-800 last:border-none flex items-center gap-3">
                        <span className="material-icons-outlined text-gray-400">place</span>
                        <div className="flex-1 overflow-hidden">
                          <p className="font-bold text-sm dark:text-white truncate">{place.structuredFormatting.mainText}</p>
                          <p className="text-xs text-gray-500 truncate">{place.structuredFormatting.secondaryText}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4 mt-10 mb-6">
              <button
                onClick={() => setIsRouteModalOpen(false)}
                className="flex-1 py-4 rounded-2xl font-black text-sm bg-gray-100 dark:bg-zinc-900 text-gray-500"
              >
                Dismiss
              </button>
              <button
                onClick={handleSaveRoute}
                className="flex-[2] py-4 rounded-2xl font-black text-sm bg-leaf-600 dark:bg-leaf-500 text-white shadow-xl shadow-leaf-500/20"
              >
                Save Daily Route
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 font-bold uppercase tracking-widest">Publishing your route allows riders to find you.</p>
          </div>
        </div>
      )}

      {isNotificationsOpen && (
        <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-end justify-center">
          <div className="bg-white dark:bg-zinc-950 w-full max-w-lg rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-300 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-8 shrink-0" onClick={() => setIsNotificationsOpen(false)}></div>
            <div className="flex justify-between items-center mb-8 shrink-0">
              <h3 className="text-3xl font-black dark:text-white">Activity</h3>
              <button onClick={() => setIsNotificationsOpen(false)} className="size-12 bg-gray-50 dark:bg-zinc-900 rounded-2xl flex items-center justify-center">
                <span className="material-icons-outlined dark:text-white">close</span>
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto pr-2 pb-10 custom-scrollbar flex-1">
              {notifications.length === 0 ? (
                <div className="text-center py-20 opacity-20">
                  <span className="material-icons-outlined text-7xl mb-4 block">notifications_none</span>
                  <p className="font-black text-xl">Quiet for now</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n._id}
                    className={`p-6 rounded-[32px] border transition-all ${n.isRead ? 'bg-transparent border-gray-100 dark:border-zinc-900' : 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-800'}`}
                    onClick={() => markNotificationRead(n._id)}
                  >
                    <div className="flex gap-5">
                      <div className="size-14 bg-black dark:bg-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg">
                        <span className="material-icons-outlined text-white dark:text-black text-2xl">
                          {n.type === 'DAILY_JOIN_REQUEST' ? 'group_add' : 'info'}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-black text-black dark:text-white text-lg leading-none">{n.title}</h4>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-zinc-400 font-medium leading-relaxed mb-4">{n.message}</p>

                        {n.type === 'DAILY_JOIN_REQUEST' && !n.isRead && (
                          <div className="flex gap-3">
                            <button className="flex-1 py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">Partner Accept</button>
                            <button className="flex-1 py-3 bg-gray-100 dark:bg-zinc-900 text-gray-500 rounded-xl text-[10px] font-black uppercase tracking-widest">Later</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {chatOpen && activeRide && (
        <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xl flex flex-col h-full animate-in fade-in zoom-in-95 duration-300">
          <div className="h-12 w-full flex items-center justify-between px-6 pt-10 mb-4 shrink-0">
            <button onClick={() => setChatOpen(false)} className="size-12 bg-white/10 rounded-2xl flex items-center justify-center">
              <span className="material-icons-outlined text-white">close</span>
            </button>
            <div className="text-center">
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-[.2em]">Live Chat</p>
              <p className="text-xl font-black text-white">{riderDetails?.name || 'Rider'}</p>
            </div>
            <div className="size-12"></div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 custom-scrollbar">
            {chatMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center opacity-30 text-white">
                <span className="material-icons-outlined text-5xl mb-4">chat</span>
                <p className="font-bold">Starts the conversation...</p>
              </div>
            )}
            {chatMessages.map((msg, idx) => (
              <div key={`${msg.createdAt}-${idx}`} className={`flex ${msg.senderRole === 'DRIVER' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-[24px] px-6 py-4 text-sm shadow-xl ${msg.senderRole === 'DRIVER'
                  ? 'bg-leaf-600 text-white rounded-br-none'
                  : 'bg-white text-black rounded-bl-none'
                  }`}>
                  <p className="font-medium leading-relaxed">{msg.message}</p>
                  <p className={`text-[9px] mt-2 font-black uppercase tracking-widest ${msg.senderRole === 'DRIVER' ? 'text-white/40' : 'text-black/30'}`}>
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendChat} className="p-6 pb-12 shrink-0 flex gap-3 bg-black/50 border-t border-white/5">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-white/10 rounded-2xl px-6 py-4 text-white text-sm font-bold placeholder:text-white/30 outline-none focus:ring-2 focus:ring-leaf-500 border border-white/5"
              placeholder="Write your message..."
            />
            <button
              type="submit"
              className="bg-leaf-500 size-14 rounded-2xl flex items-center justify-center shadow-lg shadow-leaf-500/20 active:scale-95 transition-all"
            >
              <span className="material-icons-outlined text-white">send</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default DriverDashboard;

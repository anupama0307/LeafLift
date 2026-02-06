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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

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
        attributionControl: false
      });

      map.on('load', () => {
        mapRef.current = map;
        setMapLoaded(true);
      });
    };

    setTimeout(initMap, 400);
  }, [mapLoaded]);

  // Dark mode listener
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      if (dark !== isDarkMode) {
        setIsDarkMode(dark);
        if (mapRef.current && mapLoaded) {
          mapRef.current.setStyle(getMapStyle(dark) + `?api_key=${OLA_CONFIG.apiKey}`);
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isDarkMode, mapLoaded]);

  useEffect(() => {
    if (!user?._id) return;
    const socket = registerSocket(user._id, 'DRIVER');
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

    socket.on('ride:request', handleRequest);
    socket.on('ride:status', handleStatus);
    socket.on('ride:otp', handleOtp);
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
      socket.off('ride:rider-location', handleRiderLocation);
      socket.off('ride:fare-update', handleFareUpdate);
      socket.off('chat:message', handleChatMessage);
      socket.off('nearby:rider:update', handleNearbyRiderUpdate);
      socket.off('nearby:rider:remove', handleNearbyRiderRemove);
      socket.off('pool:join-request', handlePoolJoinRequest);
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
        socketRef.current?.emit('driver:location', { driverId: user?._id, lat: latitude, lng: longitude });

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

  useEffect(() => {
    if (!mapLoaded) return;
    if (selectedRequest) {
      drawRoutePreview(selectedRequest);
    } else {
      clearRoutePreview();
      setSelectedRouteInfo(null);
    }
  }, [selectedRequest, mapLoaded]);

  // Draw active route based on ride status
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !activeRide) return;
    
    const drawActiveRoute = async () => {
      try {
        let origin, destination;
        
        if (rideStatus === 'ACCEPTED' && driverLocation && activeRide.pickup) {
          // Show route to pickup location
          origin = { lat: driverLocation.lat, lng: driverLocation.lng };
          destination = { lat: activeRide.pickup.lat, lng: activeRide.pickup.lng };
        } else if (rideStatus === 'IN_PROGRESS' && driverLocation && activeRide.dropoff) {
          // Show route to dropoff location
          origin = { lat: driverLocation.lat, lng: driverLocation.lng };
          destination = { lat: activeRide.dropoff.lat, lng: activeRide.dropoff.lng };
        }

        if (!origin || !destination) return;

        // Only update route if driver moved significantly or enough time passed
        const now = Date.now();
        const timeSinceLastUpdate = now - lastRouteUpdateRef.current;
        const shouldUpdateByTime = timeSinceLastUpdate > 15000; // 15 seconds
        
        let shouldUpdateByDistance = false;
        if (lastRouteLocationRef.current) {
          const distance = getDistanceKm(
            lastRouteLocationRef.current.lat,
            lastRouteLocationRef.current.lng,
            origin.lat,
            origin.lng
          );
          shouldUpdateByDistance = distance > 0.05; // 50 meters
        }

        if (!shouldUpdateByTime && !shouldUpdateByDistance && activeRouteLayerRef.current) {
          return; // Skip update
        }

        lastRouteUpdateRef.current = now;
        lastRouteLocationRef.current = origin;

        // Clear previous active route
        if (activeRouteLayerRef.current) {
          if (mapRef.current.getLayer(activeRouteLayerRef.current)) {
            mapRef.current.removeLayer(activeRouteLayerRef.current);
          }
          if (mapRef.current.getSource(activeRouteLayerRef.current)) {
            mapRef.current.removeSource(activeRouteLayerRef.current);
          }
          activeRouteLayerRef.current = null;
        }

        const routes = await getRoute(origin.lat, origin.lng, destination.lat, destination.lng);
        if (!routes || routes.length === 0) return;

        const route = routes[0];
        const coords = decodePolyline(route.geometry).map(p => [p.lng, p.lat]);
        
        const layerId = 'active-ride-route';
        activeRouteLayerRef.current = layerId;

        mapRef.current.addSource(layerId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords }
          }
        });

        mapRef.current.addLayer({
          id: layerId,
          type: 'line',
          source: layerId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': rideStatus === 'ACCEPTED' ? '#3B82F6' : '#22C55E',
            'line-width': 6,
            'line-opacity': 0.9
          }
        });

        // Fit bounds to show the route (only on first draw or status change)
        if (timeSinceLastUpdate > 20000) {
          const bounds = new window.maplibregl.LngLatBounds();
          coords.forEach((c: any) => bounds.extend(c));
          mapRef.current.fitBounds(bounds, {
            padding: { top: 80, bottom: 300, left: 60, right: 60 },
            duration: 1000
          });
        }
      } catch (error) {
        console.error('Failed to draw active route:', error);
      }
    };

    drawActiveRoute();
  }, [mapLoaded, activeRide, rideStatus, driverLocation]);

  useEffect(() => {
    if (isOnline) return;
    setRequests([]);
    setSelectedRequest(null);
    requestMarkersRef.current.forEach((marker) => marker.remove());
    requestMarkersRef.current.clear();
  }, [isOnline]);

  useEffect(() => {
    if (!driverLocation) return;
    setRequests((prev) => {
      const filtered = prev.filter((req) => isWithinRadius(req));
      const removed = prev.filter((req) => !isWithinRadius(req));
      removed.forEach((req) => removeRequestMarker(req.rideId));
      if (selectedRequest && !isWithinRadius(selectedRequest)) {
        setSelectedRequest(null);
      }
      return filtered;
    });
  }, [driverLocation]);

  const addOrUpdateRequestMarker = (req: any) => {
    if (!mapRef.current || !req?.pickup?.lat || !req?.pickup?.lng) return;
    const key = req.rideId;
    requestDataRef.current.set(key, req);
    let marker = requestMarkersRef.current.get(key);
    if (!marker) {
      const el = document.createElement('div');
      el.style.width = '18px';
      el.style.height = '18px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#EF4444';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.35)';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const latest = requestDataRef.current.get(key);
        setSelectedRequest(latest);
      });
      marker = new window.maplibregl.Marker({ element: el })
        .setLngLat([req.pickup.lng, req.pickup.lat])
        .addTo(mapRef.current);
      requestMarkersRef.current.set(key, marker);
    } else {
      marker.setLngLat([req.pickup.lng, req.pickup.lat]);
    }
  };

  const removeRequestMarker = (rideId: string) => {
    const marker = requestMarkersRef.current.get(rideId);
    if (marker) {
      marker.remove();
      requestMarkersRef.current.delete(rideId);
    }
    requestDataRef.current.delete(rideId);
  };

  const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const isWithinRadius = (req: any, radiusKm = 6) => {
    if (!driverLocation || !req?.pickup?.lat || !req?.pickup?.lng) return true;
    const distance = getDistanceKm(driverLocation.lat, driverLocation.lng, req.pickup.lat, req.pickup.lng);
    return distance <= radiusKm;
  };

  const clearRoutePreview = () => {
    if (!mapRef.current || !routeLayerIdRef.current) return;
    const layerId = routeLayerIdRef.current;
    try {
      if (mapRef.current.getLayer(layerId)) {
        mapRef.current.removeLayer(layerId);
      }
      if (mapRef.current.getSource(layerId)) {
        mapRef.current.removeSource(layerId);
      }
    } catch (error) {}
    routeLayerIdRef.current = null;
  };

  const drawRoutePreview = async (req: any) => {
    if (!mapRef.current || !req?.pickup?.lat || !req?.dropoff?.lat) return;
    clearRoutePreview();

    try {
      const routes = await getRoute(req.pickup.lat, req.pickup.lng, req.dropoff.lat, req.dropoff.lng);
      if (!routes || routes.length === 0) return;
      const route = routes[0];
      const info = formatRouteInfo(route);
      setSelectedRouteInfo({ distance: info.distance, duration: info.duration });

      const decodedPath = decodePolyline(route.geometry);
      const coordinates = decodedPath.map((p) => [p.lng, p.lat]);
      const layerId = `preview-route-${req.rideId}`;

      mapRef.current.addSource(layerId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates
          }
        }
      });

      mapRef.current.addLayer({
        id: layerId,
        type: 'line',
        source: layerId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#F59E0B',
          'line-width': 5,
          'line-opacity': 0.8
        }
      });

      routeLayerIdRef.current = layerId;
    } catch (error) {
      console.error('Failed to draw route preview', error);
    }
  };

  const fetchSearchSuggestions = async (query: string) => {
    if (query.length < 3) { setSearchSuggestions([]); return; }
    setIsSearchingSuggestions(true);
    try {
      const bias = driverLocation ? `${driverLocation.lat},${driverLocation.lng}` : undefined;
      const results = await searchPlaces(query, bias);
      setSearchSuggestions(results);
    } catch { setSearchSuggestions([]); }
    finally { setIsSearchingSuggestions(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length > 2) fetchSearchSuggestions(searchQuery);
      else setSearchSuggestions([]);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearchByPlace = async (place?: OlaPlace) => {
    setSearchSuggestions([]);
    try {
      let url = `${API_BASE_URL}/api/rides/nearby`;
      if (place && place.latitude && place.longitude) {
        url += `?lat=${place.latitude}&lng=${place.longitude}&radius=6`;
        setSearchQuery(place.structuredFormatting.mainText);
        if (mapRef.current) {
          mapRef.current.flyTo({ center: [place.longitude, place.latitude], zoom: 14, duration: 1000 });
        }
      } else if (driverLocation) {
        url += `?lat=${driverLocation.lat}&lng=${driverLocation.lng}&radius=6`;
      }
      const response = await fetch(url);
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
        requestMarkersRef.current.forEach((marker) => marker.remove());
        requestMarkersRef.current.clear();
        requestDataRef.current.clear();
        setRequests(mapped);
        mapped.forEach(addOrUpdateRequestMarker);
      }
    } catch (error) {
      console.error('Failed to fetch requests', error);
    }
  };

  const fetchRequests = () => handleSearchByPlace();

  const handleRequestEarlyComplete = async () => {
    if (!activeRide?._id || !driverLocation) return;
    setEarlyCompleteLoading(true);
    try {
      const resp = await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/request-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverLat: driverLocation.lat, driverLng: driverLocation.lng })
      });
      if (!resp.ok) {
        const d = await resp.json();
        alert(d.message || 'Failed to request early completion');
      }
    } catch { alert('Network error'); }
    finally { setEarlyCompleteLoading(false); }
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
      removeRequestMarker(rideId);
      setSelectedRequest(null);
      clearRoutePreview();
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
    clearRoutePreview();
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
            if (!next) socketRef.current?.emit('driver:offline', { driverId: user?._id });
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
        <div className="relative mb-4">
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-gray-100 dark:bg-zinc-800 rounded-xl px-3">
              <span className="material-icons-outlined text-gray-400 text-sm mr-1">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent py-2 text-sm font-semibold focus:outline-none dark:text-white"
                placeholder="Search by area or place name"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchSuggestions([]); }} className="p-1">
                  <span className="material-icons-outlined text-gray-400 text-sm">close</span>
                </button>
              )}
            </div>
            <button onClick={fetchRequests} className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold">
              Nearby
            </button>
          </div>
          {searchSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white dark:bg-zinc-900 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto z-50 border border-gray-100 dark:border-zinc-700">
              {searchSuggestions.map((place, idx) => (
                <button
                  key={`${place.placeId}-${idx}`}
                  onClick={() => handleSearchByPlace(place)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-zinc-800 text-left"
                >
                  <span className="material-icons-outlined text-gray-400 text-sm">location_on</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold dark:text-white truncate">{place.structuredFormatting.mainText}</div>
                    <div className="text-xs text-gray-400 truncate">{place.structuredFormatting.secondaryText}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {isSearchingSuggestions && (
            <div className="absolute top-full left-0 right-0 bg-white dark:bg-zinc-900 rounded-xl shadow-xl mt-1 p-3 text-center z-50">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-500 mx-auto"></div>
            </div>
          )}
        </div>
        {selectedRequest && (
          <div className="mb-4 p-4 rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-black uppercase tracking-widest text-gray-500">Selected Rider</span>
              <span className="font-bold text-green-600 dark:text-green-400">₹{selectedRequest.fare}</span>
            </div>
            <div className="text-sm font-semibold dark:text-white">
              {selectedRequest.pickup?.address || 'Pickup'} → {selectedRequest.dropoff?.address || 'Drop'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {selectedRequest.isPooled ? 'Pool eligible' : 'Solo ride'}
            </div>
            {selectedRouteInfo && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Route: {selectedRouteInfo.distance} • {selectedRouteInfo.duration}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleAcceptRide(selectedRequest.rideId)}
                className="flex-1 bg-black dark:bg-white text-white dark:text-black py-2 rounded-xl font-bold"
              >
                Accept
              </button>
              <button
                onClick={() => setSelectedRequest(null)}
                className="flex-1 bg-gray-100 dark:bg-zinc-800 py-2 rounded-xl font-bold"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        
        {/* Pool Join Requests - shown when driver has active pooled ride */}
        {activeRide && activeRide.isPooled && poolJoinRequests.length > 0 && (
          <div className="mb-4 p-4 rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-black uppercase tracking-widest text-gray-500">🌱 Pool Join Requests</span>
              <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full">{poolJoinRequests.length}</span>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {poolJoinRequests.map((req, idx) => (
                <div key={idx} className="p-3 bg-white dark:bg-zinc-900 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div className="text-sm font-semibold dark:text-white mb-1">
                    📍 {req.pickup?.address || 'Pickup'} → {req.dropoff?.address || 'Drop'}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                    {req.passengers} passenger{req.passengers > 1 ? 's' : ''}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        try {
                          const resp = await fetch(`${API_BASE_URL}/api/rides/${activeRide._id}/pool/add`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: req.userId, fareAdjustment: 0 })
                          });
                          if (resp.ok) {
                            setPoolJoinRequests((prev) => prev.filter((_, i) => i !== idx));
                            alert('Pool rider added!');
                          }
                        } catch (error) {
                          console.error('Error adding pool rider:', error);
                        }
                      }}
                      className="flex-1 bg-green-500 text-white py-1.5 rounded-lg text-xs font-bold"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => setPoolJoinRequests((prev) => prev.filter((_, i) => i !== idx))}
                      className="flex-1 bg-gray-200 dark:bg-zinc-700 py-1.5 rounded-lg text-xs font-bold"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

          {requests.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              {isOnline ? 'No nearby requests yet.' : 'Go online to receive ride requests.'}
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div
                  key={req.rideId}
                  onClick={() => setSelectedRequest(req)}
                  className="p-4 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900 cursor-pointer"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-black uppercase tracking-widest text-gray-400">{req.isPooled ? 'Pool' : 'Solo'}</span>
                    <span className="font-bold text-green-600 dark:text-green-400">₹{req.fare}</span>
                  </div>
                  <div className="text-sm font-semibold dark:text-white truncate">
                    {req.pickup?.address || 'Pickup'} → {req.dropoff?.address || 'Drop'}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAcceptRide(req.rideId); }}
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
              <button
                onClick={handleRequestEarlyComplete}
                disabled={earlyCompleteLoading}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-black disabled:opacity-50 transition-colors"
              >
                {earlyCompleteLoading ? 'Requesting...' : 'End Ride Early'}
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

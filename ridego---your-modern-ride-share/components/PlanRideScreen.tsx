import React, { useState, useEffect, useRef } from 'react';
import { OLA_CONFIG, VEHICLE_CATEGORIES } from '../constants';
import { searchPlaces, getRoute, formatRouteInfo, reverseGeocode, decodePolyline } from '../src/utils/olaApi';
import { joinRideRoom, leaveRideRoom, registerSocket } from '../src/services/realtime';
import { OlaPlace, RouteInfo } from '../types';

declare global {
    interface Window {
        maplibregl: any;
    }
}

interface PlanRideScreenProps {
    onBack: () => void;
    initialVehicleCategory?: string;
}

type RideStatus = 'IDLE' | 'SEARCHING' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';
type PaymentMethod = 'Cash' | 'UPI' | 'Wallet';

interface DriverDetails {
    id: string;
    name: string;
    rating: number;
    vehicle: string;
    vehicleNumber: string;
    photoUrl?: string;
    maskedPhone?: string;
}

interface RideChatMessage {
    senderId?: string;
    senderRole?: string;
    message: string;
    createdAt: string;
}

const NEARBY_RADIUS_KM = 6;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const PlanRideScreen: React.FC<PlanRideScreenProps> = ({ onBack, initialVehicleCategory }) => {
    const [destination, setDestination] = useState('');
    const [pickup, setPickup] = useState('Current Location');
    const [showOptions, setShowOptions] = useState(false);
    const [rideMode, setRideMode] = useState<'Solo' | 'Pooled'>('Solo');
    const [selectedCategory, setSelectedCategory] = useState('CAR');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash');
    const [focusedInput, setFocusedInput] = useState<'pickup' | 'dropoff'>('dropoff');
    const [isRequesting, setIsRequesting] = useState(false);
    const [rideStatus, setRideStatus] = useState<RideStatus>('IDLE');
    const [activeRideId, setActiveRideId] = useState<string | null>(null);
    const [driverDetails, setDriverDetails] = useState<DriverDetails | null>(null);
    const [etaToPickup, setEtaToPickup] = useState<string | null>(null);
    const [otpCode, setOtpCode] = useState<string | null>(null);
    const [currentFare, setCurrentFare] = useState<number | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState<RideChatMessage[]>([]);
    const [maskedDriverPhone, setMaskedDriverPhone] = useState<string | null>(null);
    const [passengers, setPassengers] = useState(1);
    const [maxPassengers, setMaxPassengers] = useState(4);
    const [confirmCompleteData, setConfirmCompleteData] = useState<any>(null);
    const [inProgressPooledRides, setInProgressPooledRides] = useState<any[]>([]);

    const mapRef = useRef<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);

    const [suggestions, setSuggestions] = useState<OlaPlace[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const [categoryPrices, setCategoryPrices] = useState<Map<string, number>>(new Map());

    const pickupMarkerRef = useRef<any>(null);
    const dropoffMarkerRef = useRef<any>(null);
    const routeLayerRef = useRef<string | null>(null);
    const driverMarkerRef = useRef<any>(null);
    const riderMarkerRef = useRef<any>(null);
    const nearbyDriverMarkersRef = useRef<Map<string, any>>(new Map());
    const nearbyDriverPositionsRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());
    const socketRef = useRef<any>(null);
    const activeRouteLayerRef = useRef<string | null>(null);
    const driverLocationRef = useRef<{ lat: number; lng: number } | null>(null);
    const lastRouteUpdateRef = useRef<number>(0);
    const lastRouteLocationRef = useRef<{ lat: number; lng: number } | null>(null);

    const [availableRoutes, setAvailableRoutes] = useState<any[]>([]);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
    const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

    // ─── Dark mode listener ───
    useEffect(() => {
        const observer = new MutationObserver(() => {
            const d = document.documentElement.classList.contains('dark');
            if (d !== isDarkMode) { setIsDarkMode(d); if (mapRef.current && mapLoaded) updateMapStyle(d); }
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, [isDarkMode, mapLoaded]);

    // ─── Initial category from prop ───
    useEffect(() => {
        if (initialVehicleCategory) {
            const cat = VEHICLE_CATEGORIES.find(
                c => c.label.toUpperCase() === initialVehicleCategory.toUpperCase() || c.id === initialVehicleCategory.toUpperCase()
            );
            if (cat) setSelectedCategory(cat.id);
        }
    }, [initialVehicleCategory]);

    // ─── Socket setup ───
    useEffect(() => {
        const userStr = localStorage.getItem('leaflift_user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        const socket = registerSocket(user._id, 'RIDER');
        socketRef.current = socket;

        socket.on('ride:accepted', (payload: any) => {
            if (!payload?.ride?._id) return;
            setActiveRideId(payload.ride._id);
            setRideStatus('ACCEPTED');
            setDriverDetails(payload.driver);
            setEtaToPickup(payload.ride.etaToPickup || null);
            setMaskedDriverPhone(payload.driver?.maskedPhone || null);
            setCurrentFare(payload.ride.currentFare || payload.ride.fare || null);
        });

        socket.on('ride:otp', (payload: any) => {
            if (payload?.otp) { setOtpCode(payload.otp); setRideStatus('ARRIVED'); }
        });

        socket.on('ride:status', (payload: any) => {
            if (!payload?.status) return;
            if (payload.status === 'IN_PROGRESS') setOtpCode(null);
            if (payload.status === 'COMPLETED') setChatOpen(false);
            setRideStatus(payload.status);
            if (payload.fare) setCurrentFare(payload.fare);
        });

        socket.on('ride:confirm-complete', (payload: any) => {
            setConfirmCompleteData(payload);
        });

        socket.on('ride:driver-location', (payload: any) => {
            if (!payload?.location) return;
            const { lat, lng } = payload.location;
            if (!mapRef.current || typeof lat !== 'number') return;
            
            driverLocationRef.current = { lat, lng };
            
            if (!driverMarkerRef.current) {
                const el = document.createElement('div');
                el.style.cssText = 'width:28px;height:28px;border-radius:50%;background:#2563EB;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)';
                driverMarkerRef.current = new window.maplibregl.Marker({ element: el })
                    .setLngLat([lng, lat]).addTo(mapRef.current);
            } else {
                driverMarkerRef.current.setLngLat([lng, lat]);
            }
        });

        socket.on('ride:fare-update', (payload: any) => {
            if (payload?.currentFare) setCurrentFare(payload.currentFare);
        });

        socket.on('chat:message', (msg: any) => {
            if (!msg?.message) return;
            setChatMessages(prev => [...prev, { ...msg, createdAt: msg.createdAt || new Date().toISOString() }]);
        });

        socket.on('nearby:driver:update', (payload: any) => {
            if (!payload?.driverId || typeof payload.lat !== 'number') return;
            nearbyDriverPositionsRef.current.set(payload.driverId, { lat: payload.lat, lng: payload.lng });
            if (pickupCoords) {
                const dist = getDistanceKm(pickupCoords.lat, pickupCoords.lng, payload.lat, payload.lng);
                if (dist > NEARBY_RADIUS_KM) { removeNearbyDriverMarker(payload.driverId); return; }
            }
            upsertNearbyDriverMarker(payload.driverId, payload.lat, payload.lng);
        });

        socket.on('nearby:driver:remove', (payload: any) => {
            if (payload?.driverId) {
                removeNearbyDriverMarker(payload.driverId);
                nearbyDriverPositionsRef.current.delete(payload.driverId);
            }
        });

        return () => { socket.removeAllListeners(); };
    }, []);

    // ─── Join ride room & load messages ───
    useEffect(() => {
        if (!activeRideId) return;
        joinRideRoom(activeRideId);
        fetch(`${API_BASE_URL}/api/rides/${activeRideId}/messages`)
            .then(r => r.ok ? r.json() : [])
            .then(d => setChatMessages(d || []))
            .catch(() => {});
        return () => { leaveRideRoom(activeRideId); };
    }, [activeRideId]);

    // ─── Filter nearby drivers ───
    useEffect(() => {
        if (!pickupCoords) return;
        nearbyDriverPositionsRef.current.forEach((pos, id) => {
            const dist = getDistanceKm(pickupCoords.lat, pickupCoords.lng, pos.lat, pos.lng);
            if (dist > NEARBY_RADIUS_KM) removeNearbyDriverMarker(id);
            else upsertNearbyDriverMarker(id, pos.lat, pos.lng);
        });
    }, [pickupCoords]);

    // ─── Broadcast search to drivers ───
    useEffect(() => {
        const socket = socketRef.current;
        if (!socket) return;
        const userStr = localStorage.getItem('leaflift_user');
        const user = userStr ? JSON.parse(userStr) : null;
        if (rideStatus === 'SEARCHING' && activeRideId && pickupCoords) {
            socket.emit('rider:search', {
                rideId: activeRideId, riderId: user?._id,
                pickup: { address: pickup, lat: pickupCoords.lat, lng: pickupCoords.lng },
                dropoff: dropoffCoords
                    ? { address: destination, lat: dropoffCoords.lat, lng: dropoffCoords.lng }
                    : null,
                fare: currentFare, isPooled: rideMode === 'Pooled'
            });
        } else if (activeRideId) {
            socket.emit('rider:search:stop', { rideId: activeRideId });
        }
    }, [rideStatus, activeRideId, pickupCoords, dropoffCoords, currentFare, destination, pickup, rideMode]);

    // ─── Clear nearby markers when ride is active ───
    useEffect(() => {
        if (rideStatus !== 'IDLE' && rideStatus !== 'SEARCHING') {
            nearbyDriverMarkersRef.current.forEach(m => m.remove());
            nearbyDriverMarkersRef.current.clear();
            nearbyDriverPositionsRef.current.clear();
        }
    }, [rideStatus]);

    // ─── Draw active ride route based on status ───
    useEffect(() => {
        if (!mapLoaded || !mapRef.current || !activeRideId) return;

        const drawRideRoute = async () => {
            try {
                let origin, destination;

                if (rideStatus === 'ACCEPTED' && driverLocationRef.current && pickupCoords) {
                    // Show driver approaching pickup
                    origin = driverLocationRef.current;
                    destination = pickupCoords;
                } else if (rideStatus === 'IN_PROGRESS' && pickupCoords && dropoffCoords) {
                    // Show route to dropoff
                    origin = pickupCoords;
                    destination = dropoffCoords;
                } else if (rideStatus === 'ARRIVED' && pickupCoords && dropoffCoords) {
                    // Show upcoming route to dropoff while waiting for OTP
                    origin = pickupCoords;
                    destination = dropoffCoords;
                }

                if (!origin || !destination) return;

                // Only update route if driver moved significantly or enough time passed
                const now = Date.now();
                const timeSinceLastUpdate = now - lastRouteUpdateRef.current;
                const shouldUpdateByTime = timeSinceLastUpdate > 15000; // 15 seconds
                
                let shouldUpdateByDistance = false;
                if (lastRouteLocationRef.current && rideStatus === 'ACCEPTED') {
                    const distance = getDistanceKm(
                        lastRouteLocationRef.current.lat,
                        lastRouteLocationRef.current.lng,
                        origin.lat,
                        origin.lng
                    );
                    shouldUpdateByDistance = distance > 0.05; // 50 meters
                }

                // For status changes, always update
                const statusChanged = timeSinceLastUpdate === now || timeSinceLastUpdate > 30000;
                
                if (!statusChanged && !shouldUpdateByTime && !shouldUpdateByDistance && activeRouteLayerRef.current) {
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
                if (statusChanged) {
                    const bounds = new window.maplibregl.LngLatBounds();
                    coords.forEach((c: any) => bounds.extend(c));
                    mapRef.current.fitBounds(bounds, {
                        padding: { top: 120, bottom: 450, left: 60, right: 60 },
                        duration: 1000
                    });
                }
            } catch (error) {
                console.error('Failed to draw ride route:', error);
            }
        };

        drawRideRoute();
    }, [mapLoaded, activeRideId, rideStatus, pickupCoords, dropoffCoords, driverLocationRef.current]);

    // ─── Send rider live location ───
    useEffect(() => {
        if (!activeRideId || !navigator.geolocation) return;
        const watchId = navigator.geolocation.watchPosition(
            pos => {
                const { latitude, longitude } = pos.coords;
                fetch(`${API_BASE_URL}/api/rides/${activeRideId}/location`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: 'RIDER', lat: latitude, lng: longitude })
                }).catch(() => null);
                if (mapRef.current) {
                    if (!riderMarkerRef.current) {
                        const el = document.createElement('div');
                        el.style.cssText = 'width:22px;height:22px;border-radius:50%;background:#22C55E;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
                        riderMarkerRef.current = new window.maplibregl.Marker({ element: el })
                            .setLngLat([longitude, latitude]).addTo(mapRef.current);
                    } else {
                        riderMarkerRef.current.setLngLat([longitude, latitude]);
                    }
                }
            },
            () => null, { enableHighAccuracy: true, maximumAge: 5001 }
        );
        return () => navigator.geolocation.clearWatch(watchId);
    }, [activeRideId]);

    // ─── Helpers ───
    const getMapStyle = (dark: boolean) =>
        dark ? 'https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json'
             : 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json';

    const updateMapStyle = (dark: boolean) => {
        if (!mapRef.current) return;
        mapRef.current.setStyle(getMapStyle(dark) + `?api_key=${OLA_CONFIG.apiKey}`);
        mapRef.current.once('styledata', () => {
            if (availableRoutes.length > 0 && dropoffCoords) redrawRoutes();
        });
    };

    const getDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
        const toRad = (v: number) => (v * Math.PI) / 180;
        const R = 6371;
        const dLat = toRad(lat2 - lat1);
        const dLng = toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const calculateCO2 = (distMeters: number, type: string): number => {
        const km = distMeters / 1000;
        const rates: Record<string, number> = { BIKE: 20, AUTO: 60, CAR: 120, BIG_CAR: 180, pool: 40 };
        return Math.round(km * (rates[type] || 120));
    };

    const upsertNearbyDriverMarker = (driverId: string, lat: number, lng: number) => {
        if (!mapRef.current) return;
        let marker = nearbyDriverMarkersRef.current.get(driverId);
        if (!marker) {
            const el = document.createElement('div');
            el.innerHTML = '<span class="material-icons-outlined" style="font-size:20px;color:#2563EB">two_wheeler</span>';
            el.style.cssText = 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3)';
            marker = new window.maplibregl.Marker({ element: el })
                .setLngLat([lng, lat]).addTo(mapRef.current);
            nearbyDriverMarkersRef.current.set(driverId, marker);
        } else {
            marker.setLngLat([lng, lat]);
        }
    };

    const removeNearbyDriverMarker = (driverId: string) => {
        const m = nearbyDriverMarkersRef.current.get(driverId);
        if (m) { m.remove(); nearbyDriverMarkersRef.current.delete(driverId); }
    };

    // ─── Init Map ───
    useEffect(() => {
        if (!mapContainerRef.current || mapLoaded) return;
        const initMap = () => {
            if (typeof window.maplibregl === 'undefined') { setTimeout(initMap, 300); return; }
            const apiKey = OLA_CONFIG.apiKey;
            const map = new window.maplibregl.Map({
                container: mapContainerRef.current,
                center: [76.9558, 11.0168],
                zoom: 13,
                style: getMapStyle(isDarkMode),
                transformRequest: (url: string) => {
                    if (url.includes('olamaps.io')) {
                        const sep = url.includes('?') ? '&' : '?';
                        return { url: `${url}${sep}api_key=${apiKey}` };
                    }
                    return { url };
                },
                attributionControl: false
            });
            map.on('load', () => { mapRef.current = map; setMapLoaded(true); });
            map.on('error', (e: any) => {
                if (e.error?.message?.includes('Source layer') || e.error?.message?.includes('does not exist')) return;
            });
        };
        setTimeout(initMap, 500);
    }, [mapLoaded, isDarkMode]);

    // ─── Get User Location ───
    useEffect(() => {
        if (!mapLoaded) return;
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    setPickupCoords({ lat: latitude, lng: longitude });
                    if (mapRef.current) {
                        mapRef.current.flyTo({ center: [longitude, latitude], zoom: 15 });
                        const el = document.createElement('div');
                        el.style.cssText = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:3px solid #22C55E;cursor:grab';
                        el.innerHTML = '<span class="material-icons" style="font-size:20px;color:#22C55E">person_pin_circle</span>';
                        const marker = new window.maplibregl.Marker({ element: el, draggable: true })
                            .setLngLat([longitude, latitude]).addTo(mapRef.current);
                        marker.on('dragend', async () => {
                            const lngLat = marker.getLngLat();
                            setPickupCoords({ lat: lngLat.lat, lng: lngLat.lng });
                            setPickup('Locating...');
                            const address = await reverseGeocode(lngLat.lat, lngLat.lng);
                            setPickup(address);
                        });
                        pickupMarkerRef.current = marker;
                        try {
                            const address = await reverseGeocode(latitude, longitude);
                            setPickup(address);
                        } catch {}
                    }
                    // Fetch nearby drivers to show on map
                    try {
                        const resp = await fetch(`${API_BASE_URL}/api/drivers/nearby?lat=${latitude}&lng=${longitude}&radius=${NEARBY_RADIUS_KM}`);
                        if (resp.ok) {
                            const drivers = await resp.json();
                            drivers.forEach((d: any) => {
                                if (d.location) upsertNearbyDriverMarker(d.driverId, d.location.lat, d.location.lng);
                            });
                        }
                    } catch {}
                },
                () => { setPickupCoords({ lat: 11.0168, lng: 76.9558 }); }
            );
        } else {
            setPickupCoords({ lat: 11.0168, lng: 76.9558 });
        }
    }, [mapLoaded]);

    // ─── Search suggestions ───
    const fetchSuggestions = async (query: string) => {
        if (query.length < 3) { setSuggestions([]); return; }
        setIsSearching(true);
        try {
            const bias = pickupCoords ? `${pickupCoords.lat},${pickupCoords.lng}` : undefined;
            setSuggestions(await searchPlaces(query, bias));
        } catch { setSuggestions([]); }
        finally { setIsSearching(false); }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            const q = focusedInput === 'pickup' ? pickup : destination;
            if (q && q.length > 2 && !showOptions && q !== 'Current Location' && q !== 'Locating...') {
                fetchSuggestions(q);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [pickup, destination, focusedInput, showOptions]);

    const handleSelectSuggestion = async (place: OlaPlace) => {
        let lat = place.latitude;
        let lng = place.longitude;
        if (!lat || !lng || (lat === 0 && lng === 0)) {
            alert('Unable to get coordinates. Please try another location.');
            return;
        }
        const coords = { lat, lng };
        if (focusedInput === 'pickup') {
            setPickup(place.structuredFormatting.mainText);
            setPickupCoords(coords);
            setFocusedInput('dropoff');
            if (pickupMarkerRef.current && mapRef.current) {
                pickupMarkerRef.current.setLngLat([lng, lat]);
                mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 });
            }
        } else {
            setDestination(place.structuredFormatting.mainText);
            setDropoffCoords(coords);
            setSuggestions([]);
            if (pickupCoords) {
                await calculateRoute(pickupCoords, coords);
                setShowOptions(true);
            }
        }
        setSuggestions([]);
    };

    // ─── Redraw routes after style change ───
    const redrawRoutes = () => {
        if (!mapRef.current || availableRoutes.length === 0 || !dropoffCoords) return;
        for (let i = 0; i < 5; i++) {
            const lid = `route-${i}`;
            try {
                if (mapRef.current.getLayer(lid)) mapRef.current.removeLayer(lid);
                if (mapRef.current.getSource(lid)) mapRef.current.removeSource(lid);
            } catch {}
        }
        if (dropoffMarkerRef.current) dropoffMarkerRef.current.remove();
        const el2 = document.createElement('div');
        el2.style.cssText = 'width:30px;height:30px;border-radius:50%;background:#EF4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
        dropoffMarkerRef.current = new window.maplibregl.Marker({ element: el2 })
            .setLngLat([dropoffCoords.lng, dropoffCoords.lat]).addTo(mapRef.current);
        const colors = isDarkMode ? ['#FFFFFF', '#D1D5DB', '#9CA3AF'] : ['#000000', '#4B5563', '#9CA3AF'];
        availableRoutes.forEach((route, idx) => {
            const coords = decodePolyline(route.geometry).map(p => [p.lng, p.lat]);
            const lid = `route-${idx}`;
            mapRef.current.addSource(lid, {
                type: 'geojson',
                data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
            });
            mapRef.current.addLayer({
                id: lid, type: 'line', source: lid,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': colors[idx] || colors[2],
                    'line-width': idx === selectedRouteIndex ? 6 : 4,
                    'line-opacity': idx === selectedRouteIndex ? 0.9 : 0.5
                }
            });
            mapRef.current.on('click', lid, () => handleRouteSelect(idx));
        });
    };

    // ─── Calculate route ───
    const calculateRoute = async (
        start: { lat: number; lng: number },
        end: { lat: number; lng: number }
    ) => {
        try {
            const routes = await getRoute(start.lat, start.lng, end.lat, end.lng);
            if (routes && routes.length > 0 && mapRef.current) {
                setAvailableRoutes(routes);
                setSelectedRouteIndex(0);
                const route = routes[0];
                const info = formatRouteInfo(route);
                setRouteInfo(info);

                // Calculate prices for all categories
                const prices = new Map<string, number>();
                VEHICLE_CATEGORIES.forEach(cat => {
                    const price = Math.round(cat.baseRate + (route.distance / 1000) * cat.perKmRate);
                    prices.set(cat.id, rideMode === 'Pooled' ? Math.round(price * 0.67) : price);
                });
                setCategoryPrices(prices);

                // Add destination marker
                if (dropoffMarkerRef.current) dropoffMarkerRef.current.remove();
                const el2 = document.createElement('div');
                el2.style.cssText = 'width:30px;height:30px;border-radius:50%;background:#EF4444;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
                dropoffMarkerRef.current = new window.maplibregl.Marker({ element: el2 })
                    .setLngLat([end.lng, end.lat]).addTo(mapRef.current);

                // Clear old routes
                for (let i = 0; i < 5; i++) {
                    const lid = `route-${i}`;
                    try {
                        if (mapRef.current.getLayer(lid)) mapRef.current.removeLayer(lid);
                        if (mapRef.current.getSource(lid)) mapRef.current.removeSource(lid);
                    } catch {}
                }

                // Draw routes
                const colors = isDarkMode
                    ? ['#FFFFFF', '#D1D5DB', '#9CA3AF']
                    : ['#000000', '#4B5563', '#9CA3AF'];
                const allCoords: any[] = [];

                routes.forEach((r, idx) => {
                    const coords = decodePolyline(r.geometry).map(p => [p.lng, p.lat]);
                    allCoords.push(...coords);
                    const lid = `route-${idx}`;
                    mapRef.current.addSource(lid, {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            properties: { routeIndex: idx },
                            geometry: { type: 'LineString', coordinates: coords }
                        }
                    });
                    mapRef.current.addLayer({
                        id: lid, type: 'line', source: lid,
                        layout: { 'line-join': 'round', 'line-cap': 'round' },
                        paint: {
                            'line-color': colors[idx] || colors[2],
                            'line-width': idx === 0 ? 6 : 4,
                            'line-opacity': idx === 0 ? 0.9 : 0.5
                        }
                    });
                    mapRef.current.on('click', lid, () => handleRouteSelect(idx));
                });

                routeLayerRef.current = 'route-0';
                const bounds = new window.maplibregl.LngLatBounds();
                allCoords.forEach((c: any) => bounds.extend(c));
                mapRef.current.fitBounds(bounds, {
                    padding: { top: 100, bottom: 450, left: 50, right: 50 },
                    duration: 1000
                });
            }
        } catch (error) {
            console.error('Route error:', error);
            alert('Failed to calculate route. Please try again.');
        }
    };

    // ─── Handle route selection ───
    const handleRouteSelect = (idx: number) => {
        if (idx === selectedRouteIndex || !availableRoutes[idx]) return;
        setSelectedRouteIndex(idx);
        const route = availableRoutes[idx];
        const info = formatRouteInfo(route);
        setRouteInfo(info);
        const prices = new Map<string, number>();
        VEHICLE_CATEGORIES.forEach(cat => {
            const price = Math.round(cat.baseRate + (route.distance / 1000) * cat.perKmRate);
            prices.set(cat.id, rideMode === 'Pooled' ? Math.round(price * 0.67) : price);
        });
        setCategoryPrices(prices);
        availableRoutes.forEach((_, i) => {
            const lid = `route-${i}`;
            if (mapRef.current?.getLayer(lid)) {
                mapRef.current.setPaintProperty(lid, 'line-width', i === idx ? 6 : 4);
                mapRef.current.setPaintProperty(lid, 'line-opacity', i === idx ? 0.9 : 0.5);
            }
        });
    };

    // ─── Recalc prices on mode change ───
    useEffect(() => {
        if (availableRoutes.length === 0) return;
        const route = availableRoutes[selectedRouteIndex];
        if (!route) return;
        const prices = new Map<string, number>();
        VEHICLE_CATEGORIES.forEach(cat => {
            const price = Math.round(cat.baseRate + (route.distance / 1000) * cat.perKmRate);
            prices.set(cat.id, rideMode === 'Pooled' ? Math.round(price * 0.67) : price);
        });
        setCategoryPrices(prices);
    }, [rideMode, selectedRouteIndex, availableRoutes]);

    // ─── Fetch in-progress pooled rides for joining ───
    useEffect(() => {
        if (!pickupCoords || !dropoffCoords || rideMode !== 'Pooled') {
            setInProgressPooledRides([]);
            return;
        }
        if (selectedCategory !== 'CAR' && selectedCategory !== 'BIG_CAR') {
            setInProgressPooledRides([]);
            return;
        }

        const fetchPooledRides = async () => {
            try {
                const url = `${API_BASE_URL}/api/rides/pooled-in-progress?lat=${pickupCoords.lat}&lng=${pickupCoords.lng}&destLat=${dropoffCoords.lat}&destLng=${dropoffCoords.lng}&vehicleCategory=${selectedCategory}&radius=3`;
                const resp = await fetch(url);
                if (resp.ok) {
                    const data = await resp.json();
                    setInProgressPooledRides(data);
                }
            } catch (error) {
                console.error('Error fetching pooled rides:', error);
            }
        };

        fetchPooledRides();
    }, [pickupCoords, dropoffCoords, rideMode, selectedCategory]);

    // ─── Book ride ───
    const handleConfirmRide = async () => {
        setIsRequesting(true);
        const userStr = localStorage.getItem('leaflift_user');
        const user = userStr ? JSON.parse(userStr) : null;
        if (!user?._id) { alert('Please log in'); setIsRequesting(false); return; }

        const selectedRoute = availableRoutes[selectedRouteIndex];
        const price = categoryPrices.get(selectedCategory) || 0;
        const cat = VEHICLE_CATEGORIES.find(c => c.id === selectedCategory);

        const rideData = {
            userId: user._id,
            status: 'SEARCHING',
            pickup: { address: pickup, lat: pickupCoords?.lat, lng: pickupCoords?.lng },
            dropoff: { address: destination, lat: dropoffCoords?.lat, lng: dropoffCoords?.lng },
            fare: price,
            distance: routeInfo?.distance,
            duration: routeInfo?.duration,
            rideType: cat?.label || 'Car',
            paymentMethod,
            routeIndex: selectedRouteIndex,
            vehicleCategory: selectedCategory,
            co2Emissions: calculateCO2(selectedRoute?.distance || 0, selectedCategory),
            co2Saved: rideMode === 'Pooled'
                ? calculateCO2(selectedRoute?.distance || 0, selectedCategory) - calculateCO2(selectedRoute?.distance || 0, 'pool')
                : 0,
            isPooled: rideMode === 'Pooled' && (selectedCategory === 'CAR' || selectedCategory === 'BIG_CAR'),
            passengers,
            maxPassengers: rideMode === 'Pooled' ? maxPassengers : passengers,
            bookingTime: new Date().toISOString()
        };

        try {
            const resp = await fetch(`${API_BASE_URL}/api/rides`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rideData)
            });
            if (resp.ok) {
                const data = await resp.json();
                setActiveRideId(data._id);
                setRideStatus('SEARCHING');
                setCurrentFare(data.currentFare || data.fare || price);
                setShowOptions(false);
            } else {
                alert('Failed to book ride.');
            }
        } catch {
            alert('Network error.');
        } finally {
            setIsRequesting(false);
        }
    };

    // ─── Chat ───
    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !activeRideId) return;
        const userStr = localStorage.getItem('leaflift_user');
        const user = userStr ? JSON.parse(userStr) : null;
        await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senderId: user?._id, senderRole: 'RIDER', message: chatInput.trim() })
        }).catch(() => {});
        setChatInput('');
    };

    // ─── Confirm ride completion ───
    const handleConfirmComplete = async (confirmed: boolean) => {
        if (!activeRideId) return;
        await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/confirm-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmed })
        }).catch(() => {});
        if (confirmed) {
            setCurrentFare(confirmCompleteData?.completedFare || currentFare);
        }
        setConfirmCompleteData(null);
    };

    // ─── Reset ───
    const handleResetRide = () => {
        setRideStatus('IDLE');
        setActiveRideId(null);
        setDriverDetails(null);
        setEtaToPickup(null);
        setOtpCode(null);
        setCurrentFare(null);
        setChatMessages([]);
        setChatOpen(false);
        setMaskedDriverPhone(null);
        setDestination('');
        setDropoffCoords(null);
        setAvailableRoutes([]);
        setConfirmCompleteData(null);
        if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }
        if (riderMarkerRef.current) { riderMarkerRef.current.remove(); riderMarkerRef.current = null; }
        nearbyDriverMarkersRef.current.forEach(m => m.remove());
        nearbyDriverMarkersRef.current.clear();
        nearbyDriverPositionsRef.current.clear();
    };

    // ─── RENDER ───
    return (
        <div className="relative w-full h-screen overflow-hidden bg-white dark:bg-zinc-950">
            {/* Map */}
            <div
                ref={mapContainerRef}
                className="absolute inset-0 w-full h-full"
                style={{ minHeight: '100vh' }}
            >
                {!mapLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-zinc-900 z-10">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                            <p className="text-gray-600 dark:text-gray-300 font-semibold">Loading Map...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Back Button */}
            <button
                onClick={onBack}
                className="absolute top-4 left-4 z-50 bg-white dark:bg-zinc-900 rounded-full p-3 shadow-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
                <span className="material-icons-outlined text-gray-900 dark:text-white">arrow_back</span>
            </button>

            {/* ── Search Overlay ── */}
            {rideStatus === 'IDLE' && !showOptions && (
                <div className="absolute top-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 shadow-xl rounded-b-3xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex flex-col gap-2 flex-1">
                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 rounded-xl px-3">
                                <span className="material-icons-outlined text-gray-500">trip_origin</span>
                                <input
                                    type="text"
                                    value={pickup}
                                    onChange={(e) => setPickup(e.target.value)}
                                    onFocus={() => setFocusedInput('pickup')}
                                    className="flex-1 bg-transparent border-none p-2 text-sm font-bold focus:ring-0 focus:outline-none dark:text-white"
                                    placeholder="Current Location"
                                />
                            </div>
                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 rounded-xl px-3">
                                <span className="material-icons-outlined text-green-500">location_on</span>
                                <input
                                    type="text"
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                    onFocus={() => setFocusedInput('dropoff')}
                                    autoFocus
                                    className="flex-1 bg-transparent border-none p-2 text-sm font-bold focus:ring-0 focus:outline-none dark:text-white"
                                    placeholder="Where to?"
                                />
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                if (destination && pickupCoords && dropoffCoords) {
                                    calculateRoute(pickupCoords, dropoffCoords);
                                    setShowOptions(true);
                                }
                            }}
                            disabled={!destination || !pickupCoords}
                            className="ml-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg p-2 transition-colors"
                        >
                            <span className="material-icons-outlined">directions</span>
                        </button>
                    </div>
                    {suggestions.length > 0 && (
                        <div className="mt-4 max-h-80 overflow-y-auto">
                            {suggestions.map((place, idx) => (
                                <button
                                    key={`${place.placeId}-${idx}`}
                                    onClick={() => handleSelectSuggestion(place)}
                                    className="w-full flex items-center gap-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg px-2 transition-colors"
                                >
                                    <span className="material-icons-outlined text-gray-500">location_on</span>
                                    <div className="flex-1 text-left">
                                        <div className="font-semibold text-sm dark:text-white">{place.structuredFormatting.mainText}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">{place.structuredFormatting.secondaryText}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    {isSearching && (
                        <div className="mt-4 text-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500 mx-auto"></div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Ride Options Sheet ── */}
            {rideStatus === 'IDLE' && showOptions && (
                <div className="absolute bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl max-h-[75vh] flex flex-col">
                    <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto my-3" />
                    <div className="px-4 pb-3">
                        <h2 className="text-xl font-bold mb-1 dark:text-white">Choose a ride</h2>
                        {routeInfo && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {routeInfo.distance} • {routeInfo.duration}
                            </p>
                        )}

                        {/* Alternative Routes */}
                        {availableRoutes.length > 1 && (
                            <div className="mt-3 mb-3">
                                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
                                    {availableRoutes.length} Routes
                                </p>
                                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                                    {availableRoutes.map((route, idx) => {
                                        const info = formatRouteInfo(route);
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => handleRouteSelect(idx)}
                                                className={`flex-shrink-0 w-28 p-2 rounded-lg border-2 transition-all ${
                                                    idx === selectedRouteIndex
                                                        ? 'border-black dark:border-white bg-gray-100 dark:bg-zinc-800'
                                                        : 'border-gray-200 dark:border-zinc-700 hover:border-gray-400'
                                                }`}
                                            >
                                                <div className="text-xs font-bold dark:text-white">
                                                    Route {idx + 1}
                                                    {idx === 0 && <span className="text-green-500 ml-1">⚡</span>}
                                                </div>
                                                <div className="text-xs text-gray-500">{info.distance} • {info.duration}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Mode Toggle */}
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => setRideMode('Solo')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    rideMode === 'Solo'
                                        ? 'bg-black dark:bg-white text-white dark:text-black'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                Solo
                            </button>
                            <button
                                onClick={() => setRideMode('Pooled')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    rideMode === 'Pooled'
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                🌱 Pool
                            </button>
                        </div>

                        {/* Passengers */}
                        <div className="flex items-center gap-3 mt-3">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Passengers:</span>
                            {[1, 2, 3, 4].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setPassengers(n)}
                                    className={`w-8 h-8 rounded-full text-xs font-bold ${
                                        passengers === n
                                            ? 'bg-black dark:bg-white text-white dark:text-black'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                    }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>

                        {/* Max Passengers for Pooled Rides (CAR/BIG_CAR only) */}
                        {rideMode === 'Pooled' && (selectedCategory === 'CAR' || selectedCategory === 'BIG_CAR') && (
                            <div className="flex items-center gap-3 mt-3">
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Max Pool:</span>
                                {[2, 3, 4, selectedCategory === 'BIG_CAR' ? 6 : null].filter(Boolean).map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setMaxPassengers(n!)}
                                        className={`w-8 h-8 rounded-full text-xs font-bold ${
                                            maxPassengers === n
                                                ? 'bg-green-500 text-white'
                                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                        }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        )}

                        {rideMode === 'Pooled' && (selectedCategory === 'BIKE' || selectedCategory === 'AUTO') && (
                            <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                                <p className="text-xs text-yellow-700 dark:text-yellow-400">⚠️ Pooling only available for Car & Big Car</p>
                            </div>
                        )}
                    </div>

                    {/* In-Progress Pooled Rides */}
                    {rideMode === 'Pooled' && inProgressPooledRides.length > 0 && (
                        <div className="px-4 py-3 border-t border-gray-200 dark:border-zinc-700">
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                🚗 Join Ongoing Pool Rides
                            </h3>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {inProgressPooledRides.map((ride) => (
                                    <div
                                        key={ride._id}
                                        className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="material-icons text-green-600 dark:text-green-400" style={{ fontSize: '18px' }}>
                                                        {ride.vehicleCategory === 'BIG_CAR' ? 'airport_shuttle' : 'directions_car'}
                                                    </span>
                                                    <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
                                                        {ride.vehicleCategory === 'BIG_CAR' ? 'Big Car' : 'Car'}
                                                    </span>
                                                    <span className="text-xs text-gray-600 dark:text-gray-400">
                                                        • {ride.availableSeats} seat{ride.availableSeats > 1 ? 's' : ''} left
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                    {ride.status === 'ACCEPTED' ? '📍 Picking up' : '🚗 In progress'}
                                                </p>
                                            </div>
                                            <button
                                                onClick={async () => {
                                                    const userStr = localStorage.getItem('leaflift_user');
                                                    const user = userStr ? JSON.parse(userStr) : null;
                                                    if (!user?._id) return;
                                                    try {
                                                        const resp = await fetch(`${API_BASE_URL}/api/rides/${ride._id}/pool/join`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({
                                                                userId: user._id,
                                                                pickup: { address: pickup, lat: pickupCoords?.lat, lng: pickupCoords?.lng },
                                                                dropoff: { address: destination, lat: dropoffCoords?.lat, lng: dropoffCoords?.lng },
                                                                passengers
                                                            })
                                                        });
                                                        if (resp.ok) {
                                                            alert('Pool request sent to driver!');
                                                        }
                                                    } catch (error) {
                                                        console.error('Join pool error:', error);
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600"
                                            >
                                                Join
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Vehicle Categories */}
                    <div className="flex-1 overflow-y-auto px-4 py-2 hide-scrollbar">
                        {VEHICLE_CATEGORIES.map(cat => {
                            const price = categoryPrices.get(cat.id) || 0;
                            const route = availableRoutes[selectedRouteIndex];
                            const co2 = route ? calculateCO2(route.distance, cat.id) : 0;
                            const co2Pool = route ? calculateCO2(route.distance, 'pool') : 0;
                            const etaMin = route ? Math.round(route.duration / 60) : 0;

                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 mb-3 transition-all ${
                                        selectedCategory === cat.id
                                            ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800'
                                            : 'border-transparent hover:bg-gray-50 dark:hover:bg-zinc-800'
                                    }`}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-zinc-700 flex items-center justify-center">
                                        <span className="material-icons-outlined text-2xl text-gray-700 dark:text-white">
                                            {cat.icon}
                                        </span>
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="font-bold text-base dark:text-white">{cat.label}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {etaMin} min • {cat.capacity} seats
                                        </div>
                                        {rideMode === 'Pooled' ? (
                                            <div className="mt-1 inline-flex items-center gap-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                                                🌱 Save {co2 - co2Pool}g CO₂
                                            </div>
                                        ) : (
                                            <div className="mt-1 text-xs text-gray-400">~{co2}g CO₂</div>
                                        )}
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-lg dark:text-white">₹{price}</div>
                                        {selectedCategory === cat.id && (
                                            <div className="text-green-500 text-xs mt-1">✓</div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
                        <button
                            onClick={() => setShowPaymentModal(true)}
                            className="w-full flex items-center justify-between mb-3 p-3 bg-gray-50 dark:bg-zinc-800 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
                        >
                            <span className="font-semibold dark:text-white">{paymentMethod}</span>
                            <span className="material-icons-outlined dark:text-white">chevron_right</span>
                        </button>
                        <button
                            onClick={handleConfirmRide}
                            disabled={isRequesting}
                            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                        >
                            {isRequesting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    Booking...
                                </span>
                            ) : (
                                `Book ${VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.label} - ₹${categoryPrices.get(selectedCategory) || 0}`
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Searching State ── */}
            {rideStatus === 'SEARCHING' && (
                <div className="absolute inset-0 z-50 flex items-end">
                    <div className="w-full bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold dark:text-white">Searching for drivers</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    We'll notify you when someone accepts.
                                </p>
                            </div>
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500"></div>
                        </div>
                        {currentFare !== null && (
                            <div className="mt-4 text-sm font-semibold text-green-600 dark:text-green-400">
                                Estimated: ₹{currentFare}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Active Ride Panel ── */}
            {rideStatus !== 'IDLE' && rideStatus !== 'SEARCHING' && (
                <div className="absolute bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Ride Status</p>
                            <h3 className="text-xl font-black dark:text-white">
                                {rideStatus.replace('_', ' ')}
                            </h3>
                        </div>
                        {etaToPickup && (rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED') && (
                            <div className="bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 rounded-full text-xs font-bold">
                                ETA {etaToPickup}
                            </div>
                        )}
                    </div>

                    {driverDetails && (
                        <div className="flex items-center gap-3 mb-4">
                            <img
                                src={driverDetails.photoUrl}
                                className="w-12 h-12 rounded-full object-cover"
                                alt=""
                            />
                            <div className="flex-1">
                                <div className="font-bold dark:text-white">{driverDetails.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {driverDetails.vehicle} • {driverDetails.vehicleNumber}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    ⭐ {driverDetails.rating?.toFixed(1)}
                                </div>
                            </div>
                            <button
                                onClick={() => maskedDriverPhone && alert(`Call: ${maskedDriverPhone}`)}
                                className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full"
                                title="Call driver"
                            >
                                <span className="material-icons-outlined">phone</span>
                            </button>
                            <button
                                onClick={() => setChatOpen(true)}
                                className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full"
                                title="Chat"
                            >
                                <span className="material-icons-outlined">chat</span>
                            </button>
                        </div>
                    )}

                    {rideStatus === 'ARRIVED' && otpCode && (
                        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl mb-4">
                            <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest">
                                Share OTP with driver
                            </p>
                            <div className="text-3xl font-black text-green-600 dark:text-green-400 mt-1">
                                {otpCode}
                            </div>
                        </div>
                    )}

                    {currentFare !== null && (
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Current Fare</span>
                            <span className="font-bold text-lg dark:text-white">₹{currentFare}</span>
                        </div>
                    )}

                    {rideStatus === 'COMPLETED' && (
                        <>
                            <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                                Payment completed via {paymentMethod}.
                            </div>
                            <button
                                onClick={handleResetRide}
                                className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-3 rounded-xl"
                            >
                                Done
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Rider Confirmation Modal for Early Completion ── */}
            {confirmCompleteData && (
                <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl">
                        <h3 className="text-lg font-bold dark:text-white mb-2">Ride Complete?</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            Driver has marked the ride as complete.
                        </p>
                        {confirmCompleteData.actualDistanceKm && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Distance traveled: {confirmCompleteData.actualDistanceKm} km
                            </p>
                        )}
                        <p className="text-lg font-bold text-green-600 dark:text-green-400 mt-2">
                            Fare: ₹{confirmCompleteData.completedFare}
                        </p>
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => handleConfirmComplete(true)}
                                className="flex-1 bg-green-500 text-white py-3 rounded-xl font-bold"
                            >
                                Confirm & Pay
                            </button>
                            <button
                                onClick={() => handleConfirmComplete(false)}
                                className="flex-1 bg-gray-100 dark:bg-zinc-800 py-3 rounded-xl font-bold dark:text-white"
                            >
                                Dispute
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Chat Modal ── */}
            {chatOpen && activeRideId && (
                <div
                    className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
                    onClick={() => setChatOpen(false)}
                >
                    <div
                        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-zinc-800">
                            <h3 className="font-bold dark:text-white">Ride Chat</h3>
                            <button
                                onClick={() => setChatOpen(false)}
                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800"
                            >
                                <span className="material-icons-outlined">close</span>
                            </button>
                        </div>
                        <div className="max-h-72 overflow-y-auto p-4 space-y-3">
                            {chatMessages.length === 0 && (
                                <p className="text-sm text-gray-400 text-center">No messages yet.</p>
                            )}
                            {chatMessages.map((msg, idx) => (
                                <div
                                    key={`${msg.createdAt}-${idx}`}
                                    className={`flex ${msg.senderRole === 'RIDER' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                                            msg.senderRole === 'RIDER'
                                                ? 'bg-black text-white dark:bg-white dark:text-black'
                                                : 'bg-gray-100 dark:bg-zinc-800 dark:text-white'
                                        }`}
                                    >
                                        {msg.message}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <form
                            onSubmit={handleSendChat}
                            className="p-3 border-t border-gray-100 dark:border-zinc-800 flex gap-2"
                        >
                            <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full px-4 text-sm dark:text-white"
                                placeholder="Type a message..."
                            />
                            <button
                                type="submit"
                                className="bg-black dark:bg-white text-white dark:text-black rounded-full px-4"
                            >
                                Send
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Payment Modal ── */}
            {showPaymentModal && (
                <div
                    onClick={() => setShowPaymentModal(false)}
                    className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold dark:text-white">Payment Method</h3>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <span className="material-icons-outlined text-gray-500">close</span>
                            </button>
                        </div>
                        {[
                            { id: 'Cash', label: 'Cash', icon: 'payments', desc: 'Pay with cash after ride' },
                            { id: 'UPI', label: 'UPI', icon: 'account_balance', desc: 'PhonePe, GPay, Paytm' },
                            { id: 'Wallet', label: 'LeafLift Wallet', icon: 'account_balance_wallet', desc: 'Fast & secure' }
                        ].map((p) => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    setPaymentMethod(p.id as PaymentMethod);
                                    setShowPaymentModal(false);
                                }}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 mb-3 transition-all ${
                                    paymentMethod === p.id
                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                        : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                                }`}
                            >
                                <div
                                    className={`p-3 rounded-full ${
                                        paymentMethod === p.id
                                            ? 'bg-green-500 text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                >
                                    <span className="material-icons-outlined">{p.icon}</span>
                                </div>
                                <div className="flex-1 text-left">
                                    <div className="font-bold dark:text-white">{p.label}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">{p.desc}</div>
                                </div>
                                {paymentMethod === p.id && (
                                    <span className="material-icons-outlined text-green-500">check_circle</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlanRideScreen;

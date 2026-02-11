import React, { useState, useEffect, useRef } from 'react';
import { OLA_CONFIG, VEHICLE_CATEGORIES } from '../constants';
import { searchPlaces, getRoute, formatRouteInfo, reverseGeocode, decodePolyline } from '../src/utils/olaApi';
import { joinRideRoom, leaveRideRoom, registerSocket } from '../src/services/realtime';
import { OlaPlace, RouteInfo } from '../types';
import ActiveRideScreen from './ActiveRideScreen';

declare global {
    interface Window {
        maplibregl: any;
    }
}

interface PlanRideScreenProps {
    user: any;
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
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const PlanRideScreen: React.FC<PlanRideScreenProps> = ({ user, onBack, initialVehicleCategory }) => {
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
    const [matchedDrivers, setMatchedDrivers] = useState<DriverDetails[]>([]);
    const [isNoDriversFound, setIsNoDriversFound] = useState(false);

    // Pooling Preferences
    const [genderPreference, setGenderPreference] = useState<'Any' | 'Male only' | 'Female only'>('Any');
    const [safetyOptions, setSafetyOptions] = useState<string[]>([]);
    const [accessibilityOptions, setAccessibilityOptions] = useState<string[]>([]);
    const [isPoolingConfigOpen, setIsPoolingConfigOpen] = useState(false);
    const [poolConsentRequest, setPoolConsentRequest] = useState<any>(null);
    const [pooledRiders, setPooledRiders] = useState<any[]>([]);
    const [showActiveRideScreen, setShowActiveRideScreen] = useState(false);
    const [activeRideData, setActiveRideData] = useState<any>(null);

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
            console.log('🎉 Ride accepted event received:', payload);
            if (!payload?.ride?._id) {
                console.warn('⚠️ Invalid payload - missing ride._id');
                return;
            }
            console.log('✅ Setting ride status to ACCEPTED, rideId:', payload.ride._id);

            // Prepare complete ride data for ActiveRideScreen
            const rideData = {
                ...payload.ride,
                driver: payload.driver,
                rider: payload.rider
            };

            setActiveRideId(payload.ride._id);
            setRideStatus('ACCEPTED');
            setDriverDetails(payload.driver);
            setEtaToPickup(payload.ride.etaToPickup || null);
            setMaskedDriverPhone(payload.driver?.maskedPhone || null);
            setCurrentFare(payload.ride.currentFare || payload.ride.fare || null);
            setActiveRideData(rideData);
            setShowActiveRideScreen(true);
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

        socket.on('pool:consent-request', (payload: any) => {
            setPoolConsentRequest(payload);
        });

        socket.on('ride:pooled-rider-added', (payload: any) => {
            if (payload.pooledRiders) setPooledRiders(payload.pooledRiders);
            if (payload.currentFare) setCurrentFare(payload.currentFare);
        });

        socket.on('pool:join-result', (payload: any) => {
            if (payload.approved) {
                alert('Your request to join the pooled ride was approved!');
            } else {
                alert('Your request to join the pooled ride was declined.');
            }
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

    // ─── Search Timeout Logic ───
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (rideStatus === 'SEARCHING') {
            setIsNoDriversFound(false);
            timer = setTimeout(() => {
                if (rideStatus === 'SEARCHING') {
                    setIsNoDriversFound(true);
                }
            }, 15000); // 15 seconds timeout
        } else {
            setIsNoDriversFound(false);
        }
        return () => clearTimeout(timer);
    }, [rideStatus]);

    // ─── Join ride room & load messages ───
    useEffect(() => {
        if (!activeRideId) return;
        joinRideRoom(activeRideId);
        fetch(`${API_BASE_URL}/api/rides/${activeRideId}/messages`)
            .then(r => r.ok ? r.json() : [])
            .then(d => setChatMessages(d || []))
            .catch(() => { });
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
            () => null, { enableHighAccuracy: true, maximumAge: 5000 }
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

    useEffect(() => {
        checkActiveRide();
    }, []);

    const checkActiveRide = async () => {
        const userStr = localStorage.getItem('leaflift_user');
        if (!userStr) return;
        const userObj = JSON.parse(userStr);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/rider/${userObj._id}/active-ride`);
            if (resp.ok) {
                const data = await resp.json();
                if (data.ride) {
                    console.log('🚗 Rider: Found active ride on mount:', data.ride._id);
                    const rideData = {
                        ...data.ride,
                        driver: data.driver,
                        rider: data.rider
                    };
                    setActiveRideId(data.ride._id);
                    setRideStatus(data.ride.status);
                    setDriverDetails(data.driver);
                    setCurrentFare(data.ride.currentFare || data.ride.fare);
                    setActiveRideData(rideData);
                    setShowActiveRideScreen(true);
                }
            }
        } catch (e) {
            console.error('Error checking active ride:', e);
        }
    };
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
                        } catch { }
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
                    } catch { }
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
            } catch { }
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

    const fetchMatchingDrivers = async (start: { lat: number; lng: number }, end: { lat: number; lng: number }) => {
        try {
            const accStr = accessibilityOptions.join(',');
            const resp = await fetch(`${API_BASE_URL}/api/rider/match-driver?pickupLat=${start.lat}&pickupLng=${start.lng}&dropoffLat=${end.lat}&dropoffLng=${end.lng}&accessibilityOptions=${accStr}`);
            if (resp.ok) {
                const data = await resp.json();
                setMatchedDrivers(data);
            }
        } catch (error) {
            console.error('Failed to fetch matching drivers', error);
        }
    };

    const handleRequestJoin = async (driverId: string) => {
        if (!user?._id && !user?.id) return;
        if (!pickupCoords || !dropoffCoords) return;

        try {
            const resp = await fetch(`${API_BASE_URL}/api/rider/request-daily-join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    riderId: user._id || user.id,
                    driverId,
                    pickup: { address: pickup, ...pickupCoords },
                    dropoff: { address: destination, ...dropoffCoords }
                })
            });

            if (resp.ok) {
                alert('Join request sent to driver!');
            } else {
                alert('Failed to send request');
            }
        } catch (error) {
            console.error('Join request error:', error);
            alert('Connection error');
        }
    };


    // ─── Calculate route ───
    const calculateRoute = async (
        start: { lat: number; lng: number },
        end: { lat: number; lng: number }
    ) => {
        try {
            const routes = await getRoute(start.lat, start.lng, end.lat, end.lng);
            if (routes && routes.length > 0 && mapRef.current) {
                fetchMatchingDrivers(start, end);
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
                    } catch { }
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
            genderPreference,
            maxPoolSize: rideMode === 'Pooled' ? maxPassengers : passengers,
            safetyOptions,
            accessibilityOptions,
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
        }).catch(() => { });
        setChatInput('');
    };

    const handleConsent = (approved: boolean) => {
        if (!poolConsentRequest || !activeRideId || !socketRef.current) return;
        socketRef.current.emit('pool:rider-consent', {
            rideId: activeRideId,
            newRiderId: poolConsentRequest.newRider.id,
            approved
        });
        setPoolConsentRequest(null);
    };

    // ─── Confirm ride completion ───
    const handleConfirmComplete = async (confirmed: boolean) => {
        if (!activeRideId) return;
        await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/confirm-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmed })
        }).catch(() => { });
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
    // Show ActiveRideScreen if ride is accepted
    console.log('🔍 PlanRideScreen render check:', {
        showActiveRideScreen,
        hasActiveRideData: !!activeRideData,
        rideStatus,
        activeRideId
    });

    if (showActiveRideScreen && activeRideData) {
        console.log('✅ RENDERING ActiveRideScreen with data:', activeRideData);
        return (
            <ActiveRideScreen
                user={user}
                rideData={activeRideData}
                onBack={() => {
                    console.log('🔙 ActiveRideScreen onBack called');
                    setShowActiveRideScreen(false);
                    setActiveRideData(null);
                    handleResetRide();
                }}
            />
        );
    }

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

            {/* ── Premium Ride Options Sheet ── */}
            {rideStatus === 'IDLE' && showOptions && (
                <div className="absolute inset-x-0 bottom-0 z-50 animate-in slide-in-from-bottom duration-500 pointer-events-none">
                    <div className="max-w-[430px] mx-auto bg-white dark:bg-zinc-900 rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.1)] dark:shadow-none border-t border-zinc-100 dark:border-zinc-800 pointer-events-auto flex flex-col max-h-[85vh]">
                        {/* Drag Handle */}
                        <div className="w-12 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mx-auto my-4 shrink-0" />

                        <div className="px-6 flex-1 overflow-y-auto hide-scrollbar pb-6">
                            <div className="mb-6">
                                <h2 className="text-2xl font-black dark:text-white leading-tight">Pick your ride</h2>
                                {routeInfo && (
                                    <div className="flex items-center gap-2 mt-1 text-zinc-400 font-bold text-xs uppercase tracking-widest">
                                        <span>{routeInfo.distance}</span>
                                        <div className="size-1 bg-zinc-200 rounded-full" />
                                        <span>{routeInfo.duration}</span>
                                    </div>
                                )}
                            </div>

                            {/* Ride Mode Selector */}
                            <div className="flex p-1 bg-zinc-100 dark:bg-zinc-800 rounded-2xl mb-6">
                                <button
                                    onClick={() => setRideMode('Solo')}
                                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${rideMode === 'Solo' ? 'bg-white dark:bg-zinc-900 shadow-sm dark:text-white' : 'text-zinc-400'}`}
                                >
                                    Solo
                                </button>
                                <button
                                    onClick={() => setRideMode('Pooled')}
                                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all gap-2 flex items-center justify-center ${rideMode === 'Pooled' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-400'}`}
                                >
                                    <span className="material-icons text-sm">eco</span>
                                    Pool
                                </button>
                            </div>

                            {/* Categories Grid */}
                            <div className="space-y-3 mb-8">
                                {VEHICLE_CATEGORIES.map(cat => {
                                    const price = categoryPrices.get(cat.id) || 0;
                                    const isSelected = selectedCategory === cat.id;
                                    const route = availableRoutes[selectedRouteIndex];
                                    const co2 = route ? calculateCO2(route.distance, cat.id) : 0;
                                    const co2Pool = route ? calculateCO2(route.distance, 'pool') : 0;
                                    const etaMin = route ? Math.round(route.duration / 60) : Math.floor(Math.random() * 5) + 2;

                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => setSelectedCategory(cat.id)}
                                            className={`w-full group p-4 rounded-[28px] border-2 transition-all flex items-center gap-4 ${isSelected ? 'border-zinc-950 dark:border-white bg-zinc-50 dark:bg-zinc-800' : 'border-zinc-50 dark:border-zinc-800/50 hover:border-zinc-200'}`}
                                        >
                                            <div className={`size-16 rounded-2xl flex items-center justify-center transition-colors ${isSelected ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
                                                <span className="material-icons text-3xl">{cat.icon}</span>
                                            </div>

                                            <div className="flex-1 text-left">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black dark:text-white">{cat.label}</span>
                                                    {etaMin < 5 && <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Fastest</span>}
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="material-icons text-[14px] text-zinc-400">schedule</span>
                                                    <span className="text-xs font-bold text-zinc-400">{etaMin} min away</span>
                                                </div>
                                                {rideMode === 'Pooled' && (cat.id === 'CAR' || cat.id === 'BIG_CAR') && (
                                                    <div className="mt-2 flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                                        <span className="material-icons text-[14px]">eco</span>
                                                        <span className="text-[10px] font-black uppercase tracking-widest">Save {co2 - co2Pool}g CO₂</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="text-right">
                                                <p className="text-xl font-black dark:text-white">₹{price}</p>
                                                {isSelected && (
                                                    <div className="size-5 bg-emerald-500 rounded-full flex items-center justify-center ml-auto mt-1">
                                                        <span className="material-icons text-white text-[12px]">check</span>
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Ride Preferences */}
                            {(rideMode === 'Pooled' || (selectedCategory === 'CAR' || selectedCategory === 'BIG_CAR')) && (
                                <div className="p-6 bg-emerald-50 dark:bg-emerald-900/10 rounded-[32px] border border-emerald-100 dark:border-emerald-800/30 mb-8 animate-in zoom-in duration-300">
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="size-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                            <span className="material-icons text-white">tune</span>
                                        </div>
                                        <h3 className="text-sm font-black dark:text-white uppercase tracking-widest">Preferences</h3>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        {rideMode === 'Pooled' && (
                                            <div>
                                                <label className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest mb-1.5 block">Max Riders</label>
                                                <div className="flex gap-2">
                                                    {[2, 3, 4].map(n => (
                                                        <button
                                                            key={n}
                                                            onClick={() => setMaxPassengers(n)}
                                                            className={`size-10 rounded-xl font-black text-xs transition-all ${maxPassengers === n ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-zinc-800 text-zinc-400 border border-emerald-100 dark:border-emerald-800'}`}
                                                        >
                                                            {n}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <div className={rideMode === 'Solo' ? 'col-span-2' : ''}>
                                            <label className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest mb-1.5 block">Safety</label>
                                            <select
                                                value={genderPreference}
                                                onChange={(e) => setGenderPreference(e.target.value as any)}
                                                className="w-full h-10 bg-white dark:bg-zinc-800 border border-emerald-100 dark:border-emerald-800 rounded-xl text-xs font-black dark:text-white px-2 focus:ring-2 focus:ring-emerald-500 outline-none"
                                            >
                                                <option value="Any">Mixed Group</option>
                                                <option value="Male only">Male only</option>
                                                <option value="Female only">Female only</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {[
                                            { id: 'Women Safety', icon: 'female' },
                                            { id: 'Verified Profiles', icon: 'verified' },
                                            { id: 'Wheelchair', icon: 'accessible' }
                                        ].map(opt => {
                                            const isSelected = safetyOptions.includes(opt.id) || accessibilityOptions.includes(opt.id);
                                            return (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => {
                                                        if (opt.id === 'Wheelchair') {
                                                            setAccessibilityOptions(prev => prev.includes(opt.id) ? prev.filter(o => o !== opt.id) : [...prev, opt.id]);
                                                        } else {
                                                            setSafetyOptions(prev => prev.includes(opt.id) ? prev.filter(o => o !== opt.id) : [...prev, opt.id]);
                                                        }
                                                    }}
                                                    className={`px-4 py-2 rounded-full text-[10px] font-bold border transition-all flex items-center gap-1.5 ${isSelected ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/10' : 'bg-white dark:bg-zinc-800 text-emerald-600 border-emerald-100 dark:border-emerald-800'}`}
                                                >
                                                    <span className="material-icons text-[12px]">{opt.icon}</span>
                                                    {opt.id}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Ongoing Pools - Redesigned */}
                            {rideMode === 'Pooled' && inProgressPooledRides.length > 0 && (
                                <div className="mb-8">
                                    <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-[.25em] mb-4">Join active pools</h3>
                                    <div className="space-y-3">
                                        {inProgressPooledRides.slice(0, 2).map((ride) => (
                                            <div key={ride._id} className="p-4 bg-zinc-900 dark:bg-black rounded-[28px] text-white flex items-center gap-4 relative overflow-hidden group">
                                                <div className="absolute right-0 top-0 size-24 bg-emerald-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                                                <div className="size-12 bg-zinc-800 rounded-2xl flex items-center justify-center">
                                                    <span className="material-icons text-emerald-400">{ride.vehicleCategory === 'BIG_CAR' ? 'airport_shuttle' : 'directions_car'}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-black truncate">Near your pickup</p>
                                                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{ride.availableSeats} seats available</p>
                                                </div>
                                                <button
                                                    onClick={() => {/* Join logic */ }}
                                                    className="px-6 py-2.5 bg-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
                                                >
                                                    Join
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sticky Action Footer */}
                        <div className="p-6 bg-white dark:bg-zinc-900 border-t border-zinc-50 dark:border-zinc-800 shrink-0">
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setShowPaymentModal(true)}
                                    className="size-16 bg-zinc-50 dark:bg-zinc-800 rounded-[24px] flex flex-col items-center justify-center border border-zinc-100 dark:border-zinc-700 shadow-sm active:scale-90 transition-all"
                                >
                                    <span className="material-icons-outlined text-zinc-600 dark:text-zinc-400">payments</span>
                                    <span className="text-[8px] font-black uppercase mt-0.5">{paymentMethod}</span>
                                </button>
                                <button
                                    onClick={handleConfirmRide}
                                    disabled={isRequesting}
                                    className="flex-1 h-16 bg-zinc-950 dark:bg-white text-white dark:text-black rounded-[24px] font-black text-sm uppercase tracking-[.2em] shadow-2xl shadow-zinc-950/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {isRequesting ? (
                                        <div className="size-5 border-2 border-white dark:border-black border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>Book {VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.label}</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}


            {/* ── Searching State ── */}
            {rideStatus === 'SEARCHING' && (
                <div className="absolute inset-0 z-50 flex items-end">
                    <div className="w-full bg-white dark:bg-zinc-900 rounded-t-[40px] shadow-2xl p-8 animate-in slide-in-from-bottom duration-500">
                        <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-8"></div>
                        {!isNoDriversFound ? (
                            <div className="flex flex-col items-center text-center pb-8">
                                <div className="relative mb-8">
                                    <div className="size-24 bg-green-50 dark:bg-green-900/10 rounded-full flex items-center justify-center">
                                        <span className="material-icons-outlined text-4xl text-green-500">radar</span>
                                    </div>
                                    <div className="absolute inset-0 border-4 border-green-500/20 rounded-full animate-ping"></div>
                                </div>
                                <h3 className="text-2xl font-black mb-2 dark:text-white">Finding your ride</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium max-w-[240px]">
                                    We're connecting you with active drivers in your area.
                                </p>
                                {currentFare !== null && (
                                    <div className="mt-6 bg-leaf-600 text-white px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-leaf-500/20">
                                        Estimate ₹{currentFare}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center text-center pb-8">
                                <div className="size-24 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center mb-8">
                                    <span className="material-icons-outlined text-4xl text-red-500">location_off</span>
                                </div>
                                <h3 className="text-2xl font-black mb-2 dark:text-white">No drivers found</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium max-w-[280px]">
                                    Sorry, there aren't any drivers travelling in this location at the moment.
                                </p>
                                <div className="flex gap-3 w-full mt-10">
                                    <button
                                        onClick={() => setRideStatus('IDLE')}
                                        className="flex-1 py-4 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-2xl font-black text-sm uppercase tracking-widest"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsNoDriversFound(false);
                                            // Re-trigger search or just wait more
                                            // For now we'll just reset the timer by toggling state
                                            setRideStatus('IDLE');
                                            setTimeout(() => setRideStatus('SEARCHING'), 100);
                                        }}
                                        className="flex-[2] py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl"
                                    >
                                        Try Again
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Active Ride Panel ── */}
            {(() => {
                const shouldShow = rideStatus !== 'IDLE' && rideStatus !== 'SEARCHING';
                console.log('🚗 Active Ride Panel Check:', { rideStatus, shouldShow, activeRideId, driverDetails });
                return shouldShow;
            })() && (
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
                                    <div className="font-bold dark:text-white flex items-center gap-1.5">
                                        {driverDetails.name}
                                        {driverDetails.isVerified && <span className="material-icons text-emerald-500 text-[16px]">verified</span>}
                                    </div>
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

                        {rideMode === 'Pooled' && pooledRiders.length > 0 && (
                            <div className="mt-4 border-t border-gray-100 dark:border-zinc-800 pt-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Pooled Riders</p>
                                <div className="space-y-3">
                                    {pooledRiders.filter(r => r.status === 'JOINED').map((rider, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-800/50 p-3 rounded-2xl">
                                            <div className="size-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                                                <span className="material-icons-outlined text-green-600 dark:text-green-400">person</span>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-bold dark:text-white">{rider.firstName} {rider.lastName}</p>
                                                <p className="text-[10px] text-gray-500 truncate">{rider.pickup?.address?.split(',')[0]} → {rider.dropoff?.address?.split(',')[0]}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
                                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.senderRole === 'RIDER'
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
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 mb-3 transition-all ${paymentMethod === p.id
                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                    : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                                    }`}
                            >
                                <div
                                    className={`p-3 rounded-full ${paymentMethod === p.id
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

            {/* ── Pool Consent Modal ── */}
            {poolConsentRequest && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-end justify-center">
                    <div className="w-full bg-white dark:bg-zinc-900 rounded-t-[40px] p-8 animate-in slide-in-from-bottom duration-500">
                        <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-8"></div>
                        <div className="flex flex-col items-center text-center">
                            <div className="size-20 bg-leaf-50 dark:bg-leaf-900/10 rounded-3xl flex items-center justify-center mb-6">
                                <span className="material-icons-outlined text-4xl text-leaf-500">person_add</span>
                            </div>
                            <h3 className="text-2xl font-black mb-2 dark:text-white">New Pool Request</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-8">
                                <span className="font-black text-black dark:text-white">{poolConsentRequest.newRider.name}</span> wants to join your ride.
                                <br />This will reduce your fare further!
                            </p>

                            <div className="w-full bg-gray-50 dark:bg-zinc-800 p-4 rounded-3xl mb-8 text-left">
                                <div className="flex items-start gap-3 mb-4">
                                    <span className="material-icons-outlined text-gray-400 text-sm mt-0.5">trip_origin</span>
                                    <p className="text-xs font-bold dark:text-white truncate">{poolConsentRequest.newRider.pickup?.address}</p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="material-icons-outlined text-leaf-500 text-sm mt-0.5">location_on</span>
                                    <p className="text-xs font-bold dark:text-white truncate">{poolConsentRequest.newRider.dropoff?.address}</p>
                                </div>
                            </div>

                            <div className="flex gap-4 w-full">
                                <button
                                    onClick={() => handleConsent(false)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-2xl font-black text-sm uppercase tracking-widest"
                                >
                                    Decline
                                </button>
                                <button
                                    onClick={() => handleConsent(true)}
                                    className="flex-[2] py-4 bg-leaf-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-leaf-500/20"
                                >
                                    Approve
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlanRideScreen;

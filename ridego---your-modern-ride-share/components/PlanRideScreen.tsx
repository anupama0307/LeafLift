import React, { useState, useEffect, useRef } from 'react';
import { OLA_CONFIG } from '../constants';
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
    co2Saved?: number; // grams of CO2
}

type RideStatus = 'IDLE' | 'SEARCHING' | 'ACCEPTED' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED';

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

const RIDE_OPTIONS_BASE: Omit<RideOption, 'price' | 'eta' | 'co2Saved'>[] = [
    {
        id: 'r1',
        name: 'Uber Go',
        capacity: 4,
        icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
        description: 'Affordable rides',
        isPooled: false
    },
    {
        id: 'r2',
        name: 'Premier',
        capacity: 4,
        icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s',
        description: 'Comfortable sedans',
        isPooled: false
    },
    {
        id: 'p1',
        name: 'Go Pool',
        capacity: 2,
        icon: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
        description: 'Share & save the planet',
        isPooled: true
    }
];

type PaymentMethod = 'Cash' | 'UPI' | 'Wallet';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const PlanRideScreen: React.FC<PlanRideScreenProps> = ({ onBack }) => {
    const [destination, setDestination] = useState('');
    const [pickup, setPickup] = useState('Current Location');
    const [showOptions, setShowOptions] = useState(false);
    const [rideMode, setRideMode] = useState<'Solo' | 'Pooled'>('Solo');
    const [selectedRideId, setSelectedRideId] = useState('r1');
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

    const mapRef = useRef<any>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [dropoffCoords, setDropoffCoords] = useState<{ lat: number; lng: number } | null>(null);

    const [suggestions, setSuggestions] = useState<OlaPlace[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
    const [rideOptions, setRideOptions] = useState<RideOption[]>([]);

    const pickupMarkerRef = useRef<any>(null);
    const dropoffMarkerRef = useRef<any>(null);
    const routeLayerRef = useRef<string | null>(null);
    const driverMarkerRef = useRef<any>(null);

    // Alternative routes state
    const [availableRoutes, setAvailableRoutes] = useState<any[]>([]);
    const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

    // 🆕 Sync dark mode with app
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return document.documentElement.classList.contains('dark');
    });

    // 🆕 Listen for app-level dark mode changes
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    const newDarkMode = document.documentElement.classList.contains('dark');
                    if (newDarkMode !== isDarkMode) {
                        setIsDarkMode(newDarkMode);
                        if (mapRef.current && mapLoaded) {
                            updateMapStyle(newDarkMode);
                        }
                    }
                }
            });
        });

        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['class']
        });

        return () => observer.disconnect();
    }, [isDarkMode, mapLoaded]);

    // Realtime socket setup for rider
    useEffect(() => {
        const userStr = localStorage.getItem('leaflift_user');
        if (!userStr) return;
        const user = JSON.parse(userStr);
        const socket = registerSocket(user._id, 'RIDER');

        const handleAccepted = (payload: any) => {
            if (!payload?.ride?._id) return;
            setActiveRideId(payload.ride._id);
            setRideStatus('ACCEPTED');
            setDriverDetails(payload.driver);
            setEtaToPickup(payload.ride.etaToPickup || null);
            setMaskedDriverPhone(payload.driver?.maskedPhone || null);
            setCurrentFare(payload.ride.currentFare || payload.ride.fare || null);
        };

        const handleOtp = (payload: any) => {
            if (payload?.otp) {
                setOtpCode(payload.otp);
                setRideStatus('ARRIVED');
            }
        };

        const handleStatus = (payload: any) => {
            if (!payload?.status) return;
            if (payload.status === 'IN_PROGRESS') setOtpCode(null);
            if (payload.status === 'COMPLETED') setChatOpen(false);
            setRideStatus(payload.status);
        };

        const handleDriverLocation = (payload: any) => {
            if (!payload?.location) return;
            const { lat, lng } = payload.location;
            if (!mapRef.current || typeof lat !== 'number' || typeof lng !== 'number') return;

            if (!driverMarkerRef.current) {
                const el = document.createElement('div');
                el.style.width = '28px';
                el.style.height = '28px';
                el.style.borderRadius = '50%';
                el.style.backgroundColor = '#2563EB';
                el.style.border = '3px solid white';
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
                driverMarkerRef.current = new window.maplibregl.Marker({ element: el })
                    .setLngLat([lng, lat])
                    .addTo(mapRef.current);
            } else {
                driverMarkerRef.current.setLngLat([lng, lat]);
            }
        };

        const handleFareUpdate = (payload: any) => {
            if (payload?.currentFare) {
                setCurrentFare(payload.currentFare);
            }
        };

        const handleChatMessage = (msg: any) => {
            if (!msg?.message) return;
            setChatMessages((prev) => [...prev, { ...msg, createdAt: msg.createdAt || new Date().toISOString() }]);
        };

        socket.on('ride:accepted', handleAccepted);
        socket.on('ride:otp', handleOtp);
        socket.on('ride:status', handleStatus);
        socket.on('ride:driver-location', handleDriverLocation);
        socket.on('ride:fare-update', handleFareUpdate);
        socket.on('chat:message', handleChatMessage);

        return () => {
            socket.off('ride:accepted', handleAccepted);
            socket.off('ride:otp', handleOtp);
            socket.off('ride:status', handleStatus);
            socket.off('ride:driver-location', handleDriverLocation);
            socket.off('ride:fare-update', handleFareUpdate);
            socket.off('chat:message', handleChatMessage);
        };
    }, []);

    useEffect(() => {
        if (!activeRideId) return;
        joinRideRoom(activeRideId);

        const loadMessages = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/messages`);
                if (response.ok) {
                    const data = await response.json();
                    setChatMessages(data || []);
                }
            } catch (error) {
                console.error('Failed to load messages', error);
            }
        };
        loadMessages();

        return () => {
            leaveRideRoom(activeRideId);
        };
    }, [activeRideId]);

    useEffect(() => {
        if (!activeRideId) return;
        if (!navigator.geolocation) return;

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                fetch(`${API_BASE_URL}/api/rides/${activeRideId}/location`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ role: 'RIDER', lat: latitude, lng: longitude })
                }).catch(() => null);
            },
            () => null,
            { enableHighAccuracy: true, maximumAge: 5000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, [activeRideId]);

    // Map style URLs
    const getMapStyle = (darkMode: boolean) => {
        return darkMode 
            ? 'https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json'
            : 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json';
    };

    // 🆕 Calculate CO2 emissions (grams per km)
    const calculateCO2 = (distanceMeters: number, rideType: 'go' | 'premier' | 'pool'): number => {
        const distanceKm = distanceMeters / 1000;
        // Average emissions: Car = 120g/km, Pool = 40g/km (shared)
        const emissionRates = {
            go: 120,      // Standard car
            premier: 150, // Larger car
            pool: 40      // Shared ride
        };
        
        return Math.round(distanceKm * emissionRates[rideType]);
    };

    // 🆕 Update map style dynamically
    const updateMapStyle = (darkMode: boolean) => {
        if (!mapRef.current) return;
        
        const apiKey = OLA_CONFIG.apiKey;
        const newStyle = getMapStyle(darkMode) + `?api_key=${apiKey}`;
        
        mapRef.current.setStyle(newStyle);
        
        // Re-add markers and routes after style change
        mapRef.current.once('styledata', () => {
            console.log('🎨 Map style updated to', darkMode ? 'dark' : 'light');
            
            if (availableRoutes.length > 0 && dropoffCoords) {
                redrawRoutes();
            }
        });
    };

    // Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current || mapLoaded) return;

        const initializeMap = () => {
            if (typeof window.maplibregl === 'undefined') {
                setTimeout(initializeMap, 300);
                return;
            }

            try {
                console.log('✅ MapLibre found, initializing OLA Maps...');
                
                const apiKey = OLA_CONFIG.apiKey;

                const map = new window.maplibregl.Map({
                    container: mapContainerRef.current,
                    center: [76.9558, 11.0168],
                    zoom: 13,
                    style: getMapStyle(isDarkMode),
                    transformRequest: (url: string, resourceType: string) => {
                        if (url.includes('olamaps.io')) {
                            const separator = url.includes('?') ? '&' : '?';
                            return {
                                url: `${url}${separator}api_key=${apiKey}`
                            };
                        }
                        return { url };
                    },
                    attributionControl: false
                });

                map.on('load', () => {
                    console.log('✅ OLA Map loaded');
                    mapRef.current = map;
                    setMapLoaded(true);
                });

                map.on('error', (e: any) => {
                    if (e.error?.message?.includes('Source layer') || 
                        e.error?.message?.includes('does not exist')) {
                        return;
                    }
                });

            } catch (error) {
                console.error('❌ Error initializing map:', error);
            }
        };

        setTimeout(initializeMap, 500);
    }, [mapLoaded, isDarkMode]);

    // Get User Location
    useEffect(() => {
        if (!mapLoaded) return;

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async (position) => {
                    const { latitude, longitude } = position.coords;
                    const coords = { lat: latitude, lng: longitude };
                    
                    setPickupCoords(coords);

                    if (mapRef.current) {
                        mapRef.current.flyTo({ center: [longitude, latitude], zoom: 15 });

                        const el = document.createElement('div');
                        el.style.width = '30px';
                        el.style.height = '30px';
                        el.style.borderRadius = '50%';
                        el.style.backgroundColor = '#22C55E';
                        el.style.border = '3px solid white';
                        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
                        el.style.cursor = 'grab';

                        const marker = new window.maplibregl.Marker({
                            element: el,
                            draggable: true
                        })
                        .setLngLat([longitude, latitude])
                        .addTo(mapRef.current);

                        marker.on('dragend', async () => {
                            const lngLat = marker.getLngLat();
                            setPickupCoords({ lat: lngLat.lat, lng: lngLat.lng });
                            setPickup("Locating...");
                            const address = await reverseGeocode(lngLat.lat, lngLat.lng);
                            setPickup(address);
                        });

                        pickupMarkerRef.current = marker;

                        try {
                            const address = await reverseGeocode(latitude, longitude);
                            setPickup(address);
                        } catch (error) {
                            console.error('Reverse geocode failed', error);
                        }
                    }
                },
                (error) => {
                    console.error('Geolocation error:', error);
                    setPickupCoords({ lat: 11.0168, lng: 76.9558 });
                }
            );
        } else {
            setPickupCoords({ lat: 11.0168, lng: 76.9558 });
        }
    }, [mapLoaded]);

    // Fetch suggestions
    const fetchSuggestions = async (query: string) => {
        if (query.length < 3) {
            setSuggestions([]);
            return;
        }

        setIsSearching(true);
        try {
            const locationBias = pickupCoords ? `${pickupCoords.lat},${pickupCoords.lng}` : undefined;
            const results = await searchPlaces(query, locationBias);
            setSuggestions(results);
        } catch (error) {
            console.error('Search error:', error);
            setSuggestions([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            const query = focusedInput === 'pickup' ? pickup : destination;
            if (query && query.length > 2 && !showOptions && query !== 'Current Location' && query !== 'Locating...') {
                fetchSuggestions(query);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [pickup, destination, focusedInput, showOptions]);

    // Handle place selection
    const handleSelectSuggestion = async (place: OlaPlace) => {
        let lat = place.latitude;
        let lng = place.longitude;

        if (!lat || !lng || (lat === 0 && lng === 0)) {
            alert(`Unable to get coordinates. Please try another location.`);
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

    // Redraw routes after style change
    const redrawRoutes = () => {
        if (!mapRef.current || availableRoutes.length === 0 || !dropoffCoords) return;

        for (let i = 0; i < 5; i++) {
            const layerId = `route-${i}`;
            try {
                if (mapRef.current.getLayer(layerId)) {
                    mapRef.current.removeLayer(layerId);
                }
                if (mapRef.current.getSource(layerId)) {
                    mapRef.current.removeSource(layerId);
                }
            } catch (e) {}
        }

        if (dropoffMarkerRef.current) {
            dropoffMarkerRef.current.remove();
        }

        const el2 = document.createElement('div');
        el2.style.width = '30px';
        el2.style.height = '30px';
        el2.style.borderRadius = '50%';
        el2.style.backgroundColor = '#EF4444';
        el2.style.border = '3px solid white';
        el2.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';

        const destMarker = new window.maplibregl.Marker({ element: el2 })
            .setLngLat([dropoffCoords.lng, dropoffCoords.lat])
            .addTo(mapRef.current);

        dropoffMarkerRef.current = destMarker;

        const routeColors = isDarkMode 
            ? ['#FFFFFF', '#D1D5DB', '#9CA3AF']
            : ['#000000', '#4B5563', '#9CA3AF'];

        availableRoutes.forEach((route, index) => {
            const decodedPath = decodePolyline(route.geometry);
            const coordinates = decodedPath.map(p => [p.lng, p.lat]);

            const layerId = `route-${index}`;
            const isSelected = index === selectedRouteIndex;

            mapRef.current.addSource(layerId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: { routeIndex: index },
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
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
                    'line-color': routeColors[index] || (isDarkMode ? '#6B7280' : '#D1D5DB'),
                    'line-width': isSelected ? 6 : 4,
                    'line-opacity': isSelected ? 0.9 : 0.5
                }
            });

            mapRef.current.on('click', layerId, () => {
                handleRouteSelect(index);
            });

            mapRef.current.on('mouseenter', layerId, () => {
                mapRef.current.getCanvas().style.cursor = 'pointer';
            });

            mapRef.current.on('mouseleave', layerId, () => {
                mapRef.current.getCanvas().style.cursor = '';
            });
        });
    };

    // Calculate route with alternatives
    const calculateRoute = async (
        start: { lat: number; lng: number },
        end: { lat: number; lng: number }
    ) => {
        try {
            console.log('🚗 Calculating routes...');
            const routes = await getRoute(start.lat, start.lng, end.lat, end.lng);

            if (routes && routes.length > 0 && mapRef.current) {
                console.log(`✅ Found ${routes.length} route(s)`);
                setAvailableRoutes(routes);
                setSelectedRouteIndex(0);

                const route = routes[0];
                const info = formatRouteInfo(route);
                setRouteInfo(info);

                const basePrice = info.fare;
                const distanceMeters = route.distance;

                // 🆕 Calculate with CO2 emissions
                const updatedOptions: RideOption[] = RIDE_OPTIONS_BASE.map(opt => ({
                    ...opt,
                    price: opt.id === 'r1' ? basePrice :
                           opt.id === 'r2' ? Math.round(basePrice * 1.3) :
                           Math.round(basePrice * 0.67),
                    eta: opt.isPooled ? `${Math.round(parseInt(info.duration) * 1.3)} min` : info.duration,
                    co2Saved: opt.isPooled 
                        ? calculateCO2(distanceMeters, 'go') - calculateCO2(distanceMeters, 'pool')
                        : undefined
                }));

                setRideOptions(updatedOptions);

                // Add destination marker
                if (dropoffMarkerRef.current) {
                    dropoffMarkerRef.current.remove();
                }

                const el2 = document.createElement('div');
                el2.style.width = '30px';
                el2.style.height = '30px';
                el2.style.borderRadius = '50%';
                el2.style.backgroundColor = '#EF4444';
                el2.style.border = '3px solid white';
                el2.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';

                const destMarker = new window.maplibregl.Marker({ element: el2 })
                    .setLngLat([end.lng, end.lat])
                    .addTo(mapRef.current);

                dropoffMarkerRef.current = destMarker;

                // Remove old routes
                for (let i = 0; i < 5; i++) {
                    const layerId = `route-${i}`;
                    try {
                        if (mapRef.current.getLayer(layerId)) {
                            mapRef.current.removeLayer(layerId);
                        }
                        if (mapRef.current.getSource(layerId)) {
                            mapRef.current.removeSource(layerId);
                        }
                    } catch (e) {}
                }

                // Draw all routes
                const routeColors = isDarkMode 
                    ? ['#FFFFFF', '#D1D5DB', '#9CA3AF']
                    : ['#000000', '#4B5563', '#9CA3AF'];
                const allCoordinates: any[] = [];

                routes.forEach((route, index) => {
                    const decodedPath = decodePolyline(route.geometry);
                    const coordinates = decodedPath.map(p => [p.lng, p.lat]);
                    allCoordinates.push(...coordinates);

                    const layerId = `route-${index}`;
                    const isSelected = index === 0;

                    mapRef.current.addSource(layerId, {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            properties: { routeIndex: index },
                            geometry: {
                                type: 'LineString',
                                coordinates: coordinates
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
                            'line-color': routeColors[index] || (isDarkMode ? '#6B7280' : '#D1D5DB'),
                            'line-width': isSelected ? 6 : 4,
                            'line-opacity': isSelected ? 0.9 : 0.5
                        }
                    });

                    mapRef.current.on('click', layerId, () => {
                        handleRouteSelect(index);
                    });

                    mapRef.current.on('mouseenter', layerId, () => {
                        mapRef.current.getCanvas().style.cursor = 'pointer';
                    });

                    mapRef.current.on('mouseleave', layerId, () => {
                        mapRef.current.getCanvas().style.cursor = '';
                    });
                });

                routeLayerRef.current = 'route-0';

                // Fit bounds
                const bounds = new window.maplibregl.LngLatBounds();
                allCoordinates.forEach((coord: any) => bounds.extend(coord));
                mapRef.current.fitBounds(bounds, { 
                    padding: { top: 100, bottom: 450, left: 50, right: 50 },
                    duration: 1000
                });

                console.log('✅ All routes displayed');
            }
        } catch (error) {
            console.error('Route error:', error);
            alert('Failed to calculate route. Please try again.');
        }
    };

    // Handle route selection
    const handleRouteSelect = (index: number) => {
        if (index === selectedRouteIndex || !availableRoutes[index]) return;

        console.log(`🔄 Switching to route ${index + 1}`);
        setSelectedRouteIndex(index);

        const route = availableRoutes[index];
        const info = formatRouteInfo(route);
        setRouteInfo(info);

        const basePrice = info.fare;
        const distanceMeters = route.distance;

        const updatedOptions: RideOption[] = RIDE_OPTIONS_BASE.map(opt => ({
            ...opt,
            price: opt.id === 'r1' ? basePrice :
                   opt.id === 'r2' ? Math.round(basePrice * 1.3) :
                   Math.round(basePrice * 0.67),
            eta: opt.isPooled ? `${Math.round(parseInt(info.duration) * 1.3)} min` : info.duration,
            co2Saved: opt.isPooled 
                ? calculateCO2(distanceMeters, 'go') - calculateCO2(distanceMeters, 'pool')
                : undefined
        }));

        setRideOptions(updatedOptions);

        // Update route styling
        availableRoutes.forEach((_, i) => {
            const layerId = `route-${i}`;
            if (mapRef.current && mapRef.current.getLayer(layerId)) {
                mapRef.current.setPaintProperty(layerId, 'line-width', i === index ? 6 : 4);
                mapRef.current.setPaintProperty(layerId, 'line-opacity', i === index ? 0.9 : 0.5);
            }
        });
    };

    // 🆕 Confirm ride and save to MongoDB
    const handleConfirmRide = async () => {
        setIsRequesting(true);
        const selectedOption = rideOptions.find(r => r.id === selectedRideId);
        const selectedRoute = availableRoutes[selectedRouteIndex];

        const userStr = localStorage.getItem('leaflift_user');
        const user = userStr ? JSON.parse(userStr) : null;

        if (!user || !user._id) {
            alert('⚠️ Please log in to book a ride');
            setIsRequesting(false);
            return;
        }

        const rideData = {
            userId: user._id,
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
            paymentMethod,
            routeIndex: selectedRouteIndex,
            co2Emissions: selectedOption?.co2Saved 
                ? calculateCO2(selectedRoute.distance, 'go') 
                : calculateCO2(selectedRoute.distance, selectedOption?.id === 'r2' ? 'premier' : 'go'),
            co2Saved: selectedOption?.co2Saved || 0,
            isPooled: selectedOption?.isPooled || false,
            bookingTime: new Date().toISOString()
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/rides`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rideData)
            });

            if (response.ok) {
                const data = await response.json();
                console.log('✅ Ride created:', data);
                setActiveRideId(data._id);
                setRideStatus('SEARCHING');
                setCurrentFare(data.currentFare || data.fare || selectedOption?.price || null);
                setShowOptions(false);
            } else {
                const error = await response.json();
                console.error('❌ Failed to create ride:', error);
                alert('❌ Failed to book ride. Please try again.');
            }
        } catch (error) {
            console.error('Error requesting ride:', error);
            alert('❌ Network error. Please check your connection.');
        } finally {
            setIsRequesting(false);
        }
    };

    const activeOptions = rideOptions.filter(r => r.isPooled === (rideMode === 'Pooled'));

    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !activeRideId) return;

        const userStr = localStorage.getItem('leaflift_user');
        const user = userStr ? JSON.parse(userStr) : null;

        try {
            await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    senderId: user?._id,
                    senderRole: 'RIDER',
                    message: chatInput.trim()
                })
            });
            setChatInput('');
        } catch (error) {
            console.error('Failed to send message', error);
        }
    };

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
        if (driverMarkerRef.current) {
            driverMarkerRef.current.remove();
            driverMarkerRef.current = null;
        }
    };

    const handleCallDriver = () => {
        if (!maskedDriverPhone) return;
        alert(`Contacting driver via masked number: ${maskedDriverPhone}`);
    };

    return (
        <div className="relative w-full h-screen overflow-hidden bg-white dark:bg-zinc-950">
            {/* Map Container */}
            <div 
                ref={mapContainerRef} 
                className="absolute inset-0 w-full h-full"
                style={{ minHeight: '100vh' }}
            >
                {!mapLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-zinc-900 z-10">
                        <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                            <p className="text-gray-600 dark:text-gray-300 font-semibold">Loading OLA Maps...</p>
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

            {/* Search Overlay */}
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

                    {/* Suggestions */}
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

            {/* Ride Options Sheet */}
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
                                    {availableRoutes.length} Routes Available
                                </p>
                                <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                                    {availableRoutes.map((route, index) => {
                                        const info = formatRouteInfo(route);
                                        const isSelected = index === selectedRouteIndex;
                                        return (
                                            <button
                                                key={index}
                                                onClick={() => handleRouteSelect(index)}
                                                className={`flex-shrink-0 w-28 p-2 rounded-lg border-2 transition-all ${
                                                    isSelected 
                                                        ? 'border-black dark:border-white bg-gray-100 dark:bg-zinc-800' 
                                                        : 'border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500'
                                                }`}
                                            >
                                                <div className="text-xs font-bold dark:text-white mb-1">
                                                    Route {index + 1}
                                                    {index === 0 && <span className="text-green-500 ml-1">⚡</span>}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {info.distance}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {info.duration}
                                                </div>
                                                <div className="text-xs font-bold text-green-600 dark:text-green-400 mt-1">
                                                    ₹{info.fare}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Ride Mode Toggle */}
                        <div className="flex gap-2 mt-3">
                            <button
                                onClick={() => setRideMode('Solo')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    rideMode === 'Solo' 
                                        ? 'bg-black dark:bg-white text-white dark:text-black' 
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                Solo Rides
                            </button>
                            <button
                                onClick={() => setRideMode('Pooled')}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    rideMode === 'Pooled' 
                                        ? 'bg-green-500 text-white' 
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'
                                }`}
                            >
                                🌱 Pool (Eco)
                            </button>
                        </div>
                    </div>

                    {/* Ride Options List with Emissions */}
                    <div className="flex-1 overflow-y-auto px-4 py-2 hide-scrollbar">
                        {activeOptions.map((option) => (
                            <button
                                key={option.id}
                                onClick={() => setSelectedRideId(option.id)}
                                className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 mb-3 transition-all ${
                                    selectedRideId === option.id 
                                        ? 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800' 
                                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-zinc-800'
                                }`}
                            >
                                <img src={option.icon} alt={option.name} className="w-14 h-14 object-contain" />
                                <div className="flex-1 text-left">
                                    <div className="font-bold text-base dark:text-white">{option.name}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {option.eta} • {option.capacity} seats
                                    </div>
                                    
                                    {/* 🆕 CO2 Emissions Badge */}
                                    {option.co2Saved ? (
                                        <div className="mt-1.5 inline-flex items-center gap-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200 text-xs font-semibold px-2 py-0.5 rounded-full">
                                            <span className="text-sm">🌱</span>
                                            Save {option.co2Saved}g CO₂
                                        </div>
                                    ) : (
                                        <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
                                            ~{calculateCO2(availableRoutes[selectedRouteIndex]?.distance || 5000, option.id === 'r2' ? 'premier' : 'go')}g CO₂
                                        </div>
                                    )}
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-lg dark:text-white">₹{option.price}</div>
                                    {selectedRideId === option.id && (
                                        <div className="text-green-500 text-xs mt-1">✓ Selected</div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Footer Actions */}
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
                                `Book ${activeOptions.find(r => r.id === selectedRideId)?.name} - ₹${activeOptions.find(r => r.id === selectedRideId)?.price}`
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Searching State */}
            {rideStatus === 'SEARCHING' && (
                <div className="absolute inset-0 z-50 flex items-end">
                    <div className="w-full bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold dark:text-white">Searching for nearby drivers</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    We’ll notify you as soon as someone accepts.
                                </p>
                            </div>
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500"></div>
                        </div>
                        {currentFare !== null && (
                            <div className="mt-4 text-sm font-semibold text-green-600 dark:text-green-400">
                                Estimated fare: ₹{currentFare}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Active Ride Panel */}
            {rideStatus !== 'IDLE' && rideStatus !== 'SEARCHING' && (
                <div className="absolute bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Ride Status</p>
                            <h3 className="text-xl font-black dark:text-white">{rideStatus.replace('_', ' ')}</h3>
                        </div>
                        {etaToPickup && (rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED') && (
                            <div className="bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 rounded-full text-xs font-bold">
                                ETA {etaToPickup}
                            </div>
                        )}
                    </div>

                    {driverDetails && (
                        <div className="flex items-center gap-3 mb-4">
                            <img src={driverDetails.photoUrl} className="w-12 h-12 rounded-full object-cover" alt="" />
                            <div className="flex-1">
                                <div className="font-bold dark:text-white">{driverDetails.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {driverDetails.vehicle} • {driverDetails.vehicleNumber}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    ⭐ {driverDetails.rating.toFixed(1)}
                                </div>
                            </div>
                            <button
                                onClick={handleCallDriver}
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
                        <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                            Payment completed via {paymentMethod}.
                        </div>
                    )}

                    {rideStatus === 'COMPLETED' && (
                        <button
                            onClick={handleResetRide}
                            className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-3 rounded-xl"
                        >
                            Done
                        </button>
                    )}
                </div>
            )}

            {/* Chat Modal */}
            {chatOpen && activeRideId && (
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
                                <div key={`${msg.createdAt}-${idx}`} className={`flex ${msg.senderRole === 'RIDER' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                                        msg.senderRole === 'RIDER'
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

            {/* 🆕 Payment Modal (Mobile-optimized) */}
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
                                onClick={() => { setPaymentMethod(p.id as PaymentMethod); setShowPaymentModal(false); }}
                                className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 mb-3 transition-all ${
                                    paymentMethod === p.id 
                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20' 
                                        : 'border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
                                }`}
                            >
                                <div className={`p-3 rounded-full ${
                                    paymentMethod === p.id 
                                        ? 'bg-green-500 text-white' 
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'
                                }`}>
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

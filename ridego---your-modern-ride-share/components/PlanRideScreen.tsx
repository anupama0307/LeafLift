import React, { useState, useEffect, useRef } from 'react';
import { OLA_CONFIG, VEHICLE_CATEGORIES, getEcoTier } from '../constants';
import { searchPlaces, getRoute, formatRouteInfo, reverseGeocode, decodePolyline } from '../src/utils/olaApi';
import { joinRideRoom, leaveRideRoom, registerSocket } from '../src/services/realtime';
import { OlaPlace, RouteInfo } from '../types';

declare global {
    interface Window {
        maplibregl: any;
    }
}

interface PlanRideScreenProps {
    user: any;
    onBack: () => void;
    initialVehicleCategory?: string;
    scheduleInfo?: { scheduledFor: string; forName?: string; forPhone?: string };
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

const toDateTimeInputValue = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const roundToNextFiveMinutes = (date: Date) => {
    const rounded = new Date(date);
    rounded.setSeconds(0, 0);
    const minutes = rounded.getMinutes();
    const next = Math.ceil(minutes / 5) * 5;
    if (next === 60) {
        rounded.setHours(rounded.getHours() + 1, 0, 0, 0);
    } else {
        rounded.setMinutes(next, 0, 0);
    }
    return rounded;
};

const formatDateTimeLabel = (iso?: string) => {
    if (!iso) return '';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

const PlanRideScreen: React.FC<PlanRideScreenProps> = ({ user, onBack, initialVehicleCategory, scheduleInfo }) => {
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
    const [safetyPrefs, setSafetyPrefs] = useState({ womenOnly: false, verifiedOnly: false, noSmoking: false, needsWheelchair: false, wheelchairFriendly: false, genderPreference: 'any' as 'any' | 'male' | 'female' });
    const [accessibilityOptions, setAccessibilityOptions] = useState<string[]>([]);
    const [confirmCompleteData, setConfirmCompleteData] = useState<any>(null);
    const [rideSummary, setRideSummary] = useState<any>(null);

    const [isNoDriversFound, setIsNoDriversFound] = useState(false);
    const [poolProposal, setPoolProposal] = useState<{
        proposalId: string;
        matchedRider: { name: string; gender: string; isVerified: boolean; safetyTags: string[]; pickup: any; dropoff: any };
        originalFare: number;
        poolFare: number;
    } | null>(null);
    const [poolMatchInfo, setPoolMatchInfo] = useState<{
        poolGroupId: string;
        matchedRider: { name: string; isVerified: boolean; safetyTags: string[]; pickup: any; dropoff: any };
        originalFare: number;
        poolFare: number;
        confirmedPickupSlot?: string;
        confirmedWindowStart?: string;
        confirmedWindowEnd?: string;
    } | null>(null);
    const [pickupWindowStart, setPickupWindowStart] = useState('');
    const [pickupWindowEnd, setPickupWindowEnd] = useState('');
    const [poolStopUpdates, setPoolStopUpdates] = useState<any[]>([]);
    const poolMatchedRef = useRef(false);

    // ─── Live ETA State ───
    const [liveEtaText, setLiveEtaText] = useState<string | null>(null);
    const [liveEtaLabel, setLiveEtaLabel] = useState<'pickup' | 'dropoff' | null>(null);
    const [liveEtaSource, setLiveEtaSource] = useState<string | null>(null);
    const [liveEtaUpdatedAt, setLiveEtaUpdatedAt] = useState<string | null>(null);

    // ─── Delay Alert State ───
    const [delayAlert, setDelayAlert] = useState<{ delayMinutes: number; message: string; etaText: string; etaLabel: string } | null>(null);
    const delayAlertTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ─── Multi-Stop State ───
    const [stops, setStops] = useState<Array<{ address: string; lat: number; lng: number }>>([]);
    const [showStopSearch, setShowStopSearch] = useState(false);
    const [stopSearchQuery, setStopSearchQuery] = useState('');
    const [stopSuggestions, setStopSuggestions] = useState<OlaPlace[]>([]);
    const [isStopSearching, setIsStopSearching] = useState(false);
    const [activeRideStops, setActiveRideStops] = useState<Array<{ address: string; lat: number; lng: number; order: number; status: string; reachedAt?: string }>>([]);
    const [currentStopIndex, setCurrentStopIndex] = useState(0);
    const stopMarkerRefs = useRef<any[]>([]);

    // ─── Cancellation State ───
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [riderCancelReason, setRiderCancelReason] = useState('');
    const [isCanceling, setIsCanceling] = useState(false);
    const [canceledByDriver, setCanceledByDriver] = useState(false);
    const [driverCancelInfo, setDriverCancelInfo] = useState<{ cancelReason: string; cancellationFee: number } | null>(null);
    const [isAutoReSearching, setIsAutoReSearching] = useState(false);
    const [reSearchDriversNotified, setReSearchDriversNotified] = useState(0);
    const reSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // ─── US 1.5 — Pool opt-out State ───
    const [optedOutToSolo, setOptedOutToSolo] = useState(false);
    const [soloOptOutFare, setSoloOptOutFare] = useState<number | null>(null);
    const [isOptingOut, setIsOptingOut] = useState(false);

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
    const pickupManuallyEditedRef = useRef(false);
    const pickupSelectedByUserRef = useRef(false);
    const resolvedPickupCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

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

    useEffect(() => {
        if (pickupWindowStart && pickupWindowEnd) return;
        const start = roundToNextFiveMinutes(new Date(Date.now() + 5 * 60 * 1000));
        const end = new Date(start.getTime() + 20 * 60 * 1000);
        setPickupWindowStart(toDateTimeInputValue(start));
        setPickupWindowEnd(toDateTimeInputValue(end));
    }, [pickupWindowStart, pickupWindowEnd]);

    // ─── Auto-switch to Solo for BIKE/AUTO (no pooling) ───
    useEffect(() => {
        if ((selectedCategory === 'BIKE' || selectedCategory === 'AUTO') && rideMode === 'Pooled') {
            setRideMode('Solo');
        }
    }, [selectedCategory, rideMode]);

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
            // Clear re-search / cancel state
            setIsAutoReSearching(false);
            setCanceledByDriver(false);
            setDriverCancelInfo(null);
            if (reSearchTimeoutRef.current) clearTimeout(reSearchTimeoutRef.current);
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

        socket.on('ride:eta-update', (payload: any) => {
            if (!payload?.etaText) return;
            setLiveEtaText(payload.etaText);
            setLiveEtaLabel(payload.etaLabel || null);
            setLiveEtaSource(payload.source || null);
            setLiveEtaUpdatedAt(payload.updatedAt || new Date().toISOString());
            // Also update the static etaToPickup if this is a pickup ETA
            if (payload.etaLabel === 'pickup') {
                setEtaToPickup(payload.etaText);
            }
        });

        // ─── Delay Alert Handler (User Story 2.6) ───
        socket.on('ride:delay-alert', (payload: any) => {
            if (!payload?.delayMinutes) return;
            setDelayAlert({
                delayMinutes: payload.delayMinutes,
                message: payload.message || `Delayed ~${payload.delayMinutes} min due to traffic`,
                etaText: payload.etaText || '',
                etaLabel: payload.etaLabel || 'dropoff'
            });
            // Auto-dismiss after 10 seconds
            if (delayAlertTimerRef.current) clearTimeout(delayAlertTimerRef.current);
            delayAlertTimerRef.current = setTimeout(() => setDelayAlert(null), 10000);
        });

        // ─── Multi-Stop Handlers ───
        socket.on('ride:stop-reached', (payload: any) => {
            if (payload?.stopIndex !== undefined) {
                setCurrentStopIndex(payload.stopIndex + 1);
                setActiveRideStops(prev => prev.map((s, i) =>
                    i === payload.stopIndex ? { ...s, status: 'REACHED', reachedAt: new Date().toISOString() } : s
                ));
            }
        });

        socket.on('ride:stop-skipped', (payload: any) => {
            if (payload?.stopIndex !== undefined) {
                setCurrentStopIndex(payload.stopIndex + 1);
                setActiveRideStops(prev => prev.map((s, i) =>
                    i === payload.stopIndex ? { ...s, status: 'SKIPPED' } : s
                ));
            }
        });

        // ─── Ride Canceled Handler ───
        socket.on('ride:canceled', (payload: any) => {
            if (payload?.canceledBy === 'DRIVER') {
                setCanceledByDriver(true);
                setDriverCancelInfo({
                    cancelReason: payload.cancelReason || '',
                    cancellationFee: payload.cancellationFee || 0
                });
                setRideStatus('CANCELED');
                setDriverDetails(null);
                setEtaToPickup(null);
                setOtpCode(null);
                setLiveEtaText(null);
            }
        });

        // ─── Auto Re-Search Handler ───
        socket.on('ride:re-search', (payload: any) => {
            if (payload?.newRideId) {
                setIsAutoReSearching(true);
                setActiveRideId(payload.newRideId);
                setReSearchDriversNotified(payload.driversNotified || 0);
                setRideStatus('SEARCHING');
                setCanceledByDriver(false);
                setDriverCancelInfo(null);
                // Auto-timeout after 60s if no driver accepts
                if (reSearchTimeoutRef.current) clearTimeout(reSearchTimeoutRef.current);
                reSearchTimeoutRef.current = setTimeout(() => {
                    setIsAutoReSearching(false);
                }, 60000);
            }
        });

        socket.on('ride:fare-update', (payload: any) => {
            if (payload?.currentFare) setCurrentFare(payload.currentFare);
        });

        socket.on('chat:message', (msg: any) => {
            if (!msg?.message) return;
            // Avoid duplicating optimistically-added messages from self
            setChatMessages(prev => {
                const isDupe = prev.some(m => m.message === msg.message && m.senderRole === msg.senderRole && Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt || Date.now()).getTime()) < 3000);
                if (isDupe) return prev;
                return [...prev, { ...msg, createdAt: msg.createdAt || new Date().toISOString() }];
            });
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

        socket.on('pool:rider-joined', (payload: any) => {
            if (payload?.rideId && activeRideId === payload.rideId) {
                alert(`✅ ${payload.newRider?.name || 'A rider'} joined your pool! New fare per person: ₹${payload.perPersonFare}`);
                setCurrentFare(payload.perPersonFare);
            }
        });

        socket.on('pool:proposal', (payload: any) => {
            console.log('🤝 Pool proposal received:', payload);
            if (payload?.matchedRider && payload?.proposalId) {
                setPoolProposal({
                    proposalId: payload.proposalId,
                    matchedRider: {
                        name: payload.matchedRider.name,
                        gender: payload.matchedRider.gender || 'Not specified',
                        isVerified: payload.matchedRider.isVerified || false,
                        safetyTags: payload.matchedRider.safetyTags || [],
                        pickup: payload.matchedRider.pickup,
                        dropoff: payload.matchedRider.dropoff
                    },
                    originalFare: payload.originalFare || 0,
                    poolFare: payload.poolFare || 0
                });
            }
        });

        socket.on('pool:confirmed', (payload: any) => {
            console.log('✅ Pool confirmed:', payload);
            setPoolProposal(null);
            poolMatchedRef.current = true;
            if (payload?.matchedRider) {
                setPoolMatchInfo({
                    poolGroupId: payload.poolGroupId,
                    matchedRider: {
                        ...payload.matchedRider,
                        isVerified: payload.matchedRider.isVerified || false,
                        safetyTags: payload.matchedRider.safetyTags || [],
                    },
                    originalFare: payload.originalFare || 0,
                    poolFare: payload.poolFare || 0,
                    confirmedPickupSlot: payload.confirmedPickupSlot,
                    confirmedWindowStart: payload.confirmedWindowStart,
                    confirmedWindowEnd: payload.confirmedWindowEnd
                });
                if (payload.poolFare) {
                    setCurrentFare(payload.poolFare);
                }
            }
        });

        socket.on('pool:rejected', (payload: any) => {
            console.log('❌ Pool rejected:', payload);
            setPoolProposal(null);
            // Stay in SEARCHING state — individual ride re-broadcast happens on server
        });

        socket.on('pool:timeout', (payload: any) => {
            console.log('⏰ Pool timeout:', payload);
            setPoolProposal(null);
            setIsNoDriversFound(true);
        });

        socket.on('pool:stop-update', (payload: any) => {
            console.log('📍 Pool stop update:', payload);
            setPoolStopUpdates(prev => [...prev, payload]);
        });

        return () => { socket.removeAllListeners(); };
    }, []);

    // ─── Search Timeout Logic ───
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (rideStatus === 'SEARCHING') {
            setIsNoDriversFound(false);
            poolMatchedRef.current = false;
            // Pooled rides get longer timeout (60s) since rider matching + driver search takes more time
            const timeoutMs = rideMode === 'Pooled' ? 60000 : 15000;
            timer = setTimeout(() => {
                if (rideStatus === 'SEARCHING' && !poolMatchedRef.current) {
                    setIsNoDriversFound(true);
                }
                // If pool matched but no driver yet, don't show 'no drivers' — keep waiting
            }, timeoutMs);
        } else {
            setIsNoDriversFound(false);
            setPoolMatchInfo(null);
        }
        return () => clearTimeout(timer);
    }, [rideStatus, rideMode]);

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

    // ─── Live ETA polling fallback (every 60s) ───
    useEffect(() => {
        if (!activeRideId || rideStatus === 'IDLE' || rideStatus === 'SEARCHING' || rideStatus === 'COMPLETED' || rideStatus === 'CANCELED') {
            setLiveEtaText(null);
            setLiveEtaLabel(null);
            setLiveEtaSource(null);
            setLiveEtaUpdatedAt(null);
            return;
        }

        const fetchLiveEta = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/live-eta`);
                if (!res.ok) return;
                const data = await res.json();
                if (data.etaText && data.etaText !== 'N/A') {
                    setLiveEtaText(data.etaText);
                    setLiveEtaLabel(data.rideStatus === 'IN_PROGRESS' ? 'dropoff' : 'pickup');
                    setLiveEtaSource(data.source || null);
                    setLiveEtaUpdatedAt(new Date().toISOString());
                    if (data.rideStatus !== 'IN_PROGRESS') {
                        setEtaToPickup(data.etaText);
                    }
                }
            } catch { }
        };

        // Fetch immediately on ride status change
        fetchLiveEta();
        const interval = setInterval(fetchLiveEta, 60000);
        return () => clearInterval(interval);
    }, [activeRideId, rideStatus]);

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
            const resolvedPickup = resolvedPickupCoordsRef.current || pickupCoords;
            socket.emit('rider:search', {
                rideId: activeRideId, riderId: user?._id,
                pickup: { address: pickup, lat: resolvedPickup.lat, lng: resolvedPickup.lng },
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
                    // Don't overwrite user-selected pickup coords with GPS
                    if (pickupSelectedByUserRef.current) return;
                    setPickupCoords({ lat: latitude, lng: longitude });
                    resolvedPickupCoordsRef.current = { lat: latitude, lng: longitude };
                    if (mapRef.current) {
                        mapRef.current.flyTo({ center: [longitude, latitude], zoom: 15 });
                        const el = document.createElement('div');
                        el.style.cssText = 'width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:3px solid #22C55E;cursor:grab';
                        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#22C55E"><path d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>';
                        const marker = new window.maplibregl.Marker({ element: el, draggable: true })
                            .setLngLat([longitude, latitude]).addTo(mapRef.current);
                        marker.on('dragend', async () => {
                            const lngLat = marker.getLngLat();
                            const dragCoords = { lat: lngLat.lat, lng: lngLat.lng };
                            setPickupCoords(dragCoords);
                            resolvedPickupCoordsRef.current = dragCoords;
                            pickupManuallyEditedRef.current = false;
                            pickupSelectedByUserRef.current = true;
                            setPickup('Locating...');
                            const address = await reverseGeocode(lngLat.lat, lngLat.lng);
                            setPickup(address);
                        });
                        pickupMarkerRef.current = marker;
                        try {
                            const address = await reverseGeocode(latitude, longitude);
                            setPickup(address);
                            pickupManuallyEditedRef.current = false;
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

    // ─── Multi-Stop search & management ───
    const fetchStopSuggestions = async (query: string) => {
        if (query.length < 3) { setStopSuggestions([]); return; }
        setIsStopSearching(true);
        try {
            const bias = pickupCoords ? `${pickupCoords.lat},${pickupCoords.lng}` : undefined;
            setStopSuggestions(await searchPlaces(query, bias));
        } catch { setStopSuggestions([]); }
        finally { setIsStopSearching(false); }
    };

    useEffect(() => {
        if (!showStopSearch) return;
        const timer = setTimeout(() => {
            if (stopSearchQuery.length > 2) fetchStopSuggestions(stopSearchQuery);
        }, 500);
        return () => clearTimeout(timer);
    }, [stopSearchQuery, showStopSearch]);

    const handleAddStop = async (place: OlaPlace) => {
        const lat = place.latitude;
        const lng = place.longitude;
        if (!lat || !lng) { alert('Unable to get coordinates for this stop.'); return; }
        const newStop = { address: place.structuredFormatting.mainText, lat, lng };
        const updatedStops = [...stops, newStop];
        setStops(updatedStops);
        setShowStopSearch(false);
        setStopSearchQuery('');
        setStopSuggestions([]);

        // Add stop marker on map
        if (mapRef.current && window.maplibregl) {
            const el = document.createElement('div');
            el.style.cssText = 'width:26px;height:26px;border-radius:50%;background:#F59E0B;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;color:white';
            el.innerText = `${updatedStops.length}`;
            const marker = new window.maplibregl.Marker({ element: el })
                .setLngLat([lng, lat]).addTo(mapRef.current);
            stopMarkerRefs.current.push(marker);
        }

        // Recalculate route with waypoints
        if (pickupCoords && dropoffCoords) {
            await calculateRoute(pickupCoords, dropoffCoords, updatedStops);
        }
    };

    const handleRemoveStop = async (index: number) => {
        const updatedStops = stops.filter((_, i) => i !== index);
        setStops(updatedStops);

        // Remove marker
        if (stopMarkerRefs.current[index]) {
            stopMarkerRefs.current[index].remove();
            stopMarkerRefs.current.splice(index, 1);
        }
        // Re-number remaining markers
        stopMarkerRefs.current.forEach((marker, i) => {
            const el = marker.getElement();
            if (el) el.innerText = `${i + 1}`;
        });

        // Recalculate route
        if (pickupCoords && dropoffCoords) {
            await calculateRoute(pickupCoords, dropoffCoords, updatedStops);
        }
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
            resolvedPickupCoordsRef.current = coords;
            pickupManuallyEditedRef.current = false;
            pickupSelectedByUserRef.current = true;
            setFocusedInput('dropoff');
            if (pickupMarkerRef.current && mapRef.current) {
                pickupMarkerRef.current.setLngLat([lng, lat]);
                mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1000 });
            }
        } else {
            setDestination(place.structuredFormatting.mainText);
            setDropoffCoords(coords);
            setSuggestions([]);
            // Geocode pickup text if user typed it manually without selecting a suggestion
            let startCoords = pickupCoords;
            if (pickupManuallyEditedRef.current && pickup && pickup.length > 2) {
                try {
                    const results = await searchPlaces(pickup);
                    if (results.length > 0 && results[0].latitude && results[0].longitude) {
                        startCoords = { lat: results[0].latitude, lng: results[0].longitude };
                        setPickupCoords(startCoords);
                        resolvedPickupCoordsRef.current = startCoords;
                        pickupManuallyEditedRef.current = false;
                        pickupSelectedByUserRef.current = true;
                        if (pickupMarkerRef.current) {
                            pickupMarkerRef.current.setLngLat([startCoords.lng, startCoords.lat]);
                        }
                    }
                } catch { }
            }
            if (startCoords) {
                await calculateRoute(startCoords, coords);
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



    // ─── Calculate route ───
    const calculateRoute = async (
        start: { lat: number; lng: number },
        end: { lat: number; lng: number },
        waypoints?: Array<{ lat: number; lng: number }>
    ) => {
        try {
            const wp = waypoints || (stops.length > 0 ? stops.map(s => ({ lat: s.lat, lng: s.lng })) : undefined);
            const routes = await getRoute(start.lat, start.lng, end.lat, end.lng, wp);
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
                    prices.set(cat.id, rideMode === 'Pooled' ? Math.round(price * 0.67 * passengers) : price);
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
            prices.set(cat.id, rideMode === 'Pooled' ? Math.round(price * 0.67 * passengers) : price);
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

    // ─── Recalc prices on mode/passenger change ───
    useEffect(() => {
        if (availableRoutes.length === 0) return;
        const route = availableRoutes[selectedRouteIndex];
        if (!route) return;
        const prices = new Map<string, number>();
        VEHICLE_CATEGORIES.forEach(cat => {
            const price = Math.round(cat.baseRate + (route.distance / 1000) * cat.perKmRate);
            prices.set(cat.id, rideMode === 'Pooled' ? Math.round(price * 0.67 * passengers) : price);
        });
        setCategoryPrices(prices);
    }, [rideMode, selectedRouteIndex, availableRoutes, passengers]);

    // ─── Auto-switch from BIKE when entering Pooled mode, reset passengers on Solo ───
    useEffect(() => {
        if (rideMode === 'Pooled' && selectedCategory === 'BIKE') {
            setSelectedCategory('CAR');
        }
        if (rideMode === 'Solo') {
            setPassengers(1);
        }
    }, [rideMode]);



    // ─── Book ride ───
    const handleConfirmRide = async () => {
        setIsRequesting(true);
        const userStr = localStorage.getItem('leaflift_user');
        const user = userStr ? JSON.parse(userStr) : null;
        if (!user?._id) { alert('Please log in'); setIsRequesting(false); return; }

        // Resolve pickup coords: prefer the ref (set during route calc), fallback to state
        let finalPickupCoords = resolvedPickupCoordsRef.current || pickupCoords;

        // Safety net: if pickup text was manually edited, geocode it before creating ride
        if (pickupManuallyEditedRef.current && pickup && pickup.length > 2) {
            try {
                const results = await searchPlaces(pickup);
                if (results.length > 0 && results[0].latitude && results[0].longitude) {
                    finalPickupCoords = { lat: results[0].latitude, lng: results[0].longitude };
                    setPickupCoords(finalPickupCoords);
                    resolvedPickupCoordsRef.current = finalPickupCoords;
                    pickupManuallyEditedRef.current = false;
                    pickupSelectedByUserRef.current = true;
                }
            } catch { }
        }

        const selectedRoute = availableRoutes[selectedRouteIndex];
        const price = categoryPrices.get(selectedCategory) || 0;
        const cat = VEHICLE_CATEGORIES.find(c => c.id === selectedCategory);
        let parsedWindowStart: Date | null = null;
        let parsedWindowEnd: Date | null = null;

        if (rideMode === 'Pooled') {
            if (!pickupWindowStart || !pickupWindowEnd) {
                alert('Please choose a pickup time window for pooled rides.');
                setIsRequesting(false);
                return;
            }

            parsedWindowStart = new Date(pickupWindowStart);
            parsedWindowEnd = new Date(pickupWindowEnd);

            if (Number.isNaN(parsedWindowStart.getTime()) || Number.isNaN(parsedWindowEnd.getTime()) || parsedWindowEnd <= parsedWindowStart) {
                alert('Pickup window is invalid. End time must be after start time.');
                setIsRequesting(false);
                return;
            }
        }

        const rideData = {
            userId: user._id,
            status: scheduleInfo ? 'SCHEDULED' : 'SEARCHING',
            pickup: { address: pickup, lat: finalPickupCoords?.lat, lng: finalPickupCoords?.lng },
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
            isPooled: rideMode === 'Pooled',
            ...(rideMode === 'Pooled' && parsedWindowStart && parsedWindowEnd ? {
                pickupWindowStart: parsedWindowStart.toISOString(),
                pickupWindowEnd: parsedWindowEnd.toISOString()
            } : {}),
            ...(accessibilityOptions.length > 0 ? { accessibilityOptions } : {}),
            passengers,
            maxPassengers: rideMode === 'Pooled' ? maxPassengers : passengers,
            safetyPreferences: safetyPrefs,
            bookingTime: new Date().toISOString(),
            ...(stops.length > 0 ? {
                stops: stops.map((s, i) => ({ address: s.address, lat: s.lat, lng: s.lng, order: i }))
            } : {}),
            ...(scheduleInfo ? {
                isScheduled: true,
                scheduledFor: scheduleInfo.scheduledFor,
                scheduledForName: scheduleInfo.forName,
                scheduledForPhone: scheduleInfo.forPhone
            } : {})
        };

        try {
            const endpoint = scheduleInfo
                ? `${API_BASE_URL}/api/rides/schedule`
                : `${API_BASE_URL}/api/rides`;
            const resp = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rideData)
            });
            if (resp.ok) {
                const data = await resp.json();
                if (scheduleInfo) {
                    alert(`Ride scheduled for ${new Date(scheduleInfo.scheduledFor).toLocaleString()}!`);
                    onBack();
                } else {
                    setActiveRideId(data._id);
                    setRideStatus('SEARCHING');
                    setCurrentFare(data.currentFare || data.fare || price);
                    setShowOptions(false);
                    // Populate multi-stop tracking state
                    if (stops.length > 0) {
                        setActiveRideStops(stops.map((s, i) => ({ ...s, order: i, status: 'PENDING' })));
                        setCurrentStopIndex(0);
                    }
                }
            } else {
                alert('Failed to book ride.');
            }
        } catch {
            alert('Network error.');
        } finally {
            setIsRequesting(false);
        }
    };

    // ─── Cancel Ride (Rider) ───
    const handleRiderCancelRide = async () => {
        if (!activeRideId) return;
        setIsCanceling(true);
        try {
            const resp = await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/cancel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    canceledBy: 'RIDER',
                    cancelReason: riderCancelReason || 'Rider canceled'
                })
            });
            if (resp.ok) {
                const data = await resp.json();
                setShowCancelModal(false);
                setRiderCancelReason('');
                setRideStatus('IDLE');
                setActiveRideId(null);
                setDriverDetails(null);
                setEtaToPickup(null);
                setOtpCode(null);
                setCurrentFare(null);
                setShowOptions(false);
                if (data.cancellationFee > 0) {
                    alert(`Ride canceled. A ₹${data.cancellationFee} fee has been charged.`);
                }
            } else {
                const err = await resp.json();
                alert(err.message || 'Failed to cancel ride');
            }
        } catch {
            alert('Network error while canceling');
        } finally {
            setIsCanceling(false);
        }
    };

    // ─── Chat ───
    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !activeRideId) return;
        const userStr = localStorage.getItem('leaflift_user');
        const user = userStr ? JSON.parse(userStr) : null;
        const msgText = chatInput.trim();
        const optimisticMsg = {
            senderId: user?._id,
            senderRole: 'RIDER',
            message: msgText,
            createdAt: new Date().toISOString()
        };
        setChatMessages(prev => [...prev, optimisticMsg]);
        setChatInput('');
        try {
            await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senderId: user?._id, senderRole: 'RIDER', message: msgText })
            });
        } catch (err) {
            console.error('Failed to send message', err);
        }
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
            // Client-side CO2 fallback: if server sent 0 (legacy ride), derive from distance
            const summaryData = { ...confirmCompleteData };
            if (!summaryData.co2EmittedG && summaryData.actualDistanceKm) {
                const distKm = parseFloat(summaryData.actualDistanceKm) || 0;
                const co2G = Math.round(distKm * 120); // CAR baseline 120 g/km
                summaryData.co2EmittedG = co2G;
                summaryData.co2EmittedKg = parseFloat((co2G / 1000).toFixed(3));
                summaryData.treeEquivalent = parseFloat((co2G / 21000).toFixed(3));
                summaryData.co2SavedG = summaryData.co2SavedG || 0;
                summaryData.co2SavedKg = summaryData.co2SavedKg || 0;
            }
            setRideSummary(summaryData);
        }
        setConfirmCompleteData(null);
    };

    // ─── Reset ───
    const handleResetRide = () => {
        setRideStatus('IDLE');
        setActiveRideId(null);
        setDriverDetails(null);
        setEtaToPickup(null);
        setLiveEtaText(null);
        setLiveEtaLabel(null);
        setLiveEtaSource(null);
        setLiveEtaUpdatedAt(null);
        setDelayAlert(null);
        if (delayAlertTimerRef.current) clearTimeout(delayAlertTimerRef.current);
        setOtpCode(null);
        setCurrentFare(null);
        setPoolProposal(null);
        setPoolMatchInfo(null);
        setChatMessages([]);
        setChatOpen(false);
        setMaskedDriverPhone(null);
        setDestination('');
        setDropoffCoords(null);
        const resetStart = roundToNextFiveMinutes(new Date(Date.now() + 5 * 60 * 1000));
        const resetEnd = new Date(resetStart.getTime() + 20 * 60 * 1000);
        setPickupWindowStart(toDateTimeInputValue(resetStart));
        setPickupWindowEnd(toDateTimeInputValue(resetEnd));
        setAvailableRoutes([]);
        setConfirmCompleteData(null);
        setRideSummary(null);
        if (driverMarkerRef.current) { driverMarkerRef.current.remove(); driverMarkerRef.current = null; }
        if (riderMarkerRef.current) { riderMarkerRef.current.remove(); riderMarkerRef.current = null; }
        nearbyDriverMarkersRef.current.forEach(m => m.remove());
        nearbyDriverMarkersRef.current.clear();
        nearbyDriverPositionsRef.current.clear();
        // Clear multi-stop state
        setStops([]);
        setActiveRideStops([]);
        setCurrentStopIndex(0);
        stopMarkerRefs.current.forEach(m => m.remove());
        stopMarkerRefs.current = [];
        // Clear cancellation state
        setCanceledByDriver(false);
        setDriverCancelInfo(null);
        setIsAutoReSearching(false);
        setReSearchDriversNotified(0);
        if (reSearchTimeoutRef.current) clearTimeout(reSearchTimeoutRef.current);
        // Clear pool opt-out state
        setOptedOutToSolo(false);
        setSoloOptOutFare(null);
        // Navigate back to home screen
        onBack();
    };

    // ─── US 1.5 — Handle opt-out of pooling ───
    const handleOptOutPool = async () => {
        if (!activeRideId) return;
        setIsOptingOut(true);
        try {
            // compute solo fare from current pool fare
            const soloFare = currentFare ? Math.round(currentFare / 0.67) : undefined;
            const res = await fetch(`${API_BASE_URL}/api/rides/${activeRideId}/opt-out-pool`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ soloFare }),
            });
            if (!res.ok) throw new Error('Failed to opt out');
            const data = await res.json();
            setOptedOutToSolo(true);
            setSoloOptOutFare(data.soloFare);
            setCurrentFare(data.soloFare);
            setRideMode('Solo');
            setIsNoDriversFound(false);
        } catch {
            alert('Could not switch to solo ride. Please try again.');
        } finally {
            setIsOptingOut(false);
        }
    };

    // ─── RENDER ───
    return (
        <div className="relative w-full h-screen overflow-hidden bg-white dark:bg-zinc-950">
            {/* ── Congestion Delay Alert Toast (User Story 2.6) ── */}
            {delayAlert && (
                <div className="absolute top-16 left-4 right-4 z-[90] animate-in slide-in-from-top duration-500">
                    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-2xl p-4 shadow-xl backdrop-blur-sm">
                        <div className="flex items-start gap-3">
                            <div className="size-10 bg-amber-100 dark:bg-amber-800/50 rounded-xl flex items-center justify-center shrink-0">
                                <span className="material-icons-outlined text-amber-600 dark:text-amber-400">traffic</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h4 className="text-sm font-black text-amber-800 dark:text-amber-300">Traffic Delay Detected</h4>
                                    <span className="bg-amber-200 dark:bg-amber-700 text-amber-800 dark:text-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">+{delayAlert.delayMinutes} min</span>
                                </div>
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    {delayAlert.message}. New ETA: <span className="font-bold">{delayAlert.etaText}</span>
                                    {delayAlert.etaLabel === 'pickup' ? ' to pickup' : ' to destination'}
                                </p>
                            </div>
                            <button
                                onClick={() => setDelayAlert(null)}
                                className="p-1 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors shrink-0"
                            >
                                <span className="material-icons-outlined text-amber-500 text-sm">close</span>
                            </button>
                        </div>
                        {/* Progress bar for auto-dismiss */}
                        <div className="mt-3 h-1 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 dark:bg-amber-400 rounded-full animate-[shrink_10s_linear_forwards]" style={{ animation: 'shrink 10s linear forwards' }} />
                        </div>
                    </div>
                </div>
            )}

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
                                    onChange={(e) => { setPickup(e.target.value); pickupManuallyEditedRef.current = true; }}
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
                            onClick={async () => {
                                if (destination && dropoffCoords) {
                                    let startCoords = pickupCoords;
                                    if (pickupManuallyEditedRef.current && pickup && pickup.length > 2) {
                                        try {
                                            const results = await searchPlaces(pickup);
                                            if (results.length > 0 && results[0].latitude && results[0].longitude) {
                                                startCoords = { lat: results[0].latitude, lng: results[0].longitude };
                                                setPickupCoords(startCoords);
                                                resolvedPickupCoordsRef.current = startCoords;
                                                pickupManuallyEditedRef.current = false;
                                                pickupSelectedByUserRef.current = true;
                                                if (pickupMarkerRef.current) {
                                                    pickupMarkerRef.current.setLngLat([startCoords.lng, startCoords.lat]);
                                                }
                                            }
                                        } catch { }
                                    }
                                    if (startCoords) {
                                        resolvedPickupCoordsRef.current = startCoords;
                                        calculateRoute(startCoords, dropoffCoords);
                                        setShowOptions(true);
                                    }
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
                <div className="absolute bottom-0 left-0 right-0 z-40 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl max-h-[75vh] overflow-y-auto">
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
                                                className={`flex-shrink-0 w-28 p-2 rounded-lg border-2 transition-all ${idx === selectedRouteIndex
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

                        {/* ── Multi-Stop Management ── */}
                        <div className="mt-3 mb-2">
                            {stops.length > 0 && (
                                <div className="mb-2">
                                    <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                                        <span className="material-icons-outlined text-amber-500" style={{ fontSize: '14px' }}>pin_drop</span>
                                        {stops.length} Stop{stops.length > 1 ? 's' : ''}
                                    </p>
                                    <div className="space-y-1.5">
                                        {stops.map((stop, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2"
                                            >
                                                <div className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                                                    {idx + 1}
                                                </div>
                                                <span className="flex-1 text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">
                                                    {stop.address}
                                                </span>
                                                <button
                                                    onClick={() => handleRemoveStop(idx)}
                                                    className="p-1 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors shrink-0"
                                                >
                                                    <span className="material-icons-outlined text-amber-500" style={{ fontSize: '16px' }}>close</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {stops.length < 3 && (
                                <button
                                    onClick={() => setShowStopSearch(true)}
                                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-zinc-600 hover:border-amber-400 dark:hover:border-amber-500 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 transition-all"
                                >
                                    <span className="material-icons-outlined" style={{ fontSize: '18px' }}>add_location</span>
                                    <span className="text-xs font-bold">Add a Stop</span>
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">{3 - stops.length} remaining</span>
                                </button>
                            )}
                        </div>

                        {/* Mode Toggle with Savings — US 1.4 */}
                        {(() => {
                            const route = availableRoutes[selectedRouteIndex];
                            const cat = VEHICLE_CATEGORIES.find(c => c.id === selectedCategory);
                            const soloPrice = route && cat ? Math.round(cat.baseRate + (route.distance / 1000) * cat.perKmRate) : 0;
                            const poolPrice = route && cat ? Math.round(soloPrice * 0.67) : 0;
                            const fareSaved = soloPrice - poolPrice;
                            const savingsPct = soloPrice > 0 ? Math.round((fareSaved / soloPrice) * 100) : 0;
                            const co2Solo = route ? calculateCO2(route.distance, selectedCategory) : 0;
                            const co2Pool = route ? calculateCO2(route.distance, 'pool') : 0;
                            const co2Saved = co2Solo - co2Pool;
                            const canPool = selectedCategory === 'CAR' || selectedCategory === 'BIG_CAR';
                            return (
                                <>
                                    {/* Mode toggle buttons */}
                                    <div className="flex gap-2 mt-3">
                                        <button
                                            onClick={() => setRideMode('Solo')}
                                            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border-2 ${rideMode === 'Solo'
                                                ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-transparent'
                                                }`}
                                        >
                                            Private
                                        </button>
                                        {canPool && (
                                            <button
                                                onClick={() => setRideMode('Pooled')}
                                                className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border-2 ${rideMode === 'Pooled'
                                                    ? 'bg-green-500 text-white border-green-500'
                                                    : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 border-transparent'
                                                    }`}
                                            >
                                                🌱 Pool
                                            </button>
                                        )}
                                    </div>

                                    {/* 1.4.1 + 1.4.2 + 1.4.3 — Price comparison card */}
                                    {route && canPool && soloPrice > 0 && (
                                        <div className="mt-3 rounded-2xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
                                            {/* Header row */}
                                            <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-zinc-700">
                                                {/* Private column — 1.4.1 + 3.2.1 */}
                                                <div className={`p-3 transition-colors ${rideMode === 'Solo' ? 'bg-zinc-900 dark:bg-zinc-100' : 'bg-gray-50 dark:bg-zinc-800'}`}>
                                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${rideMode === 'Solo' ? 'text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                                        Private Ride
                                                    </p>
                                                    <p className={`text-xl font-black ${rideMode === 'Solo' ? 'text-white dark:text-zinc-900' : 'text-gray-700 dark:text-gray-300'}`}>
                                                        ₹{soloPrice}
                                                    </p>
                                                    <p className={`text-[10px] mt-0.5 ${rideMode === 'Solo' ? 'text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                                        Just you
                                                    </p>
                                                    {co2Solo > 0 && (
                                                        <p className={`text-[9px] mt-1 font-semibold ${rideMode === 'Solo' ? 'text-gray-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                                            ☁️ {co2Solo}g CO₂
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Pool column — 1.4.1 + 3.2.1 */}
                                                <div className={`p-3 transition-colors ${rideMode === 'Pooled' ? 'bg-green-500' : 'bg-gray-50 dark:bg-zinc-800'}`}>
                                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-0.5 ${rideMode === 'Pooled' ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>
                                                        Pool Ride
                                                    </p>
                                                    <p className={`text-xl font-black ${rideMode === 'Pooled' ? 'text-white' : 'text-green-600 dark:text-green-400'}`}>
                                                        ₹{poolPrice}
                                                    </p>
                                                    <p className={`text-[10px] mt-0.5 ${rideMode === 'Pooled' ? 'text-green-100' : 'text-gray-400 dark:text-gray-500'}`}>
                                                        Shared ride
                                                    </p>
                                                    {co2Pool > 0 && (
                                                        <p className={`text-[9px] mt-1 font-semibold ${rideMode === 'Pooled' ? 'text-green-100' : 'text-green-600 dark:text-green-400'}`}>
                                                            🌱 {co2Pool}g CO₂
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 1.4.2 — Cost difference row */}
                                            <div className="border-t border-gray-200 dark:border-zinc-700 px-3 py-2 flex items-center justify-between bg-white dark:bg-zinc-900">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="material-icons text-gray-400 dark:text-gray-500" style={{ fontSize: '14px' }}>compare_arrows</span>
                                                    <span className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold">Difference</span>
                                                </div>
                                                <span className="text-[13px] font-black text-green-600 dark:text-green-400">
                                                    ₹{fareSaved} cheaper with Pool
                                                </span>
                                            </div>

                                            {/* 1.4.3 + 3.2.2 + 3.2.3 — Savings banner with CO₂ bar */}
                                            <div className={`px-3 pt-2.5 pb-2 transition-colors ${rideMode === 'Pooled' ? 'bg-green-500' : 'bg-green-50 dark:bg-green-900/20'}`}>
                                                {/* Fare + badge row */}
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-base">🎉</span>
                                                        <div>
                                                            <p className={`text-[10px] font-black uppercase tracking-wider ${rideMode === 'Pooled' ? 'text-green-100' : 'text-green-700 dark:text-green-300'}`}>
                                                                Total Savings
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className={`text-xl font-black ${rideMode === 'Pooled' ? 'text-white' : 'text-green-600 dark:text-green-400'}`}>
                                                            ₹{fareSaved}
                                                        </span>
                                                        <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-black ${rideMode === 'Pooled' ? 'bg-white/20 text-white' : 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'}`}>
                                                            {savingsPct}% off
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* 3.2.3 — CO₂ comparison bar */}
                                                {co2Solo > 0 && (
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] w-8 shrink-0 font-bold ${rideMode === 'Pooled' ? 'text-green-100' : 'text-gray-500'}`}>Solo</span>
                                                            <div className={`flex-1 h-1.5 rounded-full ${rideMode === 'Pooled' ? 'bg-green-300/40' : 'bg-gray-300 dark:bg-zinc-600'}`} />
                                                            <span className={`text-[9px] font-bold w-14 text-right shrink-0 ${rideMode === 'Pooled' ? 'text-green-100' : 'text-gray-500'}`}>{co2Solo}g</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[9px] w-8 shrink-0 font-bold ${rideMode === 'Pooled' ? 'text-white' : 'text-green-600 dark:text-green-400'}`}>Pool</span>
                                                            <div className="flex-1 relative h-1.5">
                                                                <div className={`absolute inset-y-0 left-0 w-full rounded-full ${rideMode === 'Pooled' ? 'bg-green-300/40' : 'bg-gray-100 dark:bg-zinc-700'}`} />
                                                                <div
                                                                    className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${rideMode === 'Pooled' ? 'bg-white/70' : 'bg-green-400'}`}
                                                                    style={{ width: `${co2Solo > 0 ? Math.round((co2Pool / co2Solo) * 100) : 0}%` }}
                                                                />
                                                            </div>
                                                            <span className={`text-[9px] font-bold w-14 text-right shrink-0 ${rideMode === 'Pooled' ? 'text-white' : 'text-green-600 dark:text-green-400'}`}>{co2Pool}g</span>
                                                        </div>
                                                        {/* 3.2.2 — CO₂ difference */}
                                                        <p className={`text-[9px] mt-0.5 text-right font-semibold ${rideMode === 'Pooled' ? 'text-green-100' : 'text-green-600 dark:text-green-400'}`}>
                                                            🌿 Pool saves {co2Saved}g CO₂ ({co2Solo > 0 ? Math.round((co2Saved / co2Solo) * 100) : 0}% less)
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    {/* Scrollable content area */}
                    <div className="flex-1 overflow-y-auto hide-scrollbar">
                        {/* Passengers (Pooled only) */}
                        {rideMode === 'Pooled' && (
                            <div className="px-4 mt-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Passengers:</span>
                                    {[1, 2, 3, 4].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setPassengers(n)}
                                            className={`w-8 h-8 rounded-full text-xs font-bold ${passengers === n
                                                ? 'bg-black dark:bg-white text-white dark:text-black'
                                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                                }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 italic">
                                    💡 Select your group size. One OTP for entire group.
                                </p>
                            </div>
                        )}

                        {/* Max Passengers for Pooled Rides (CAR/BIG_CAR only) */}
                        {rideMode === 'Pooled' && (selectedCategory === 'CAR' || selectedCategory === 'BIG_CAR') && (
                            <div className="flex items-center gap-3 px-4 mt-2">
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">Max Pool:</span>
                                {[2, 3, 4, selectedCategory === 'BIG_CAR' ? 6 : null].filter(Boolean).map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setMaxPassengers(n!)}
                                        className={`w-8 h-8 rounded-full text-xs font-bold ${maxPassengers === n
                                            ? 'bg-green-500 text-white'
                                            : 'bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300'
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Safety Preferences (Pooled only) */}
                        {rideMode === 'Pooled' && (
                            <div className="px-4 mt-3">
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 block">Safety Preferences:</span>

                                {/* Gender Preference Selector */}
                                <div className="mb-2">
                                    <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block mb-1.5">Gender Preference:</label>
                                    <div className="flex gap-2">
                                        {[
                                            { value: 'any' as const, label: 'Any', icon: 'groups' },
                                            { value: 'male' as const, label: 'Male', icon: 'male' },
                                            { value: 'female' as const, label: 'Female', icon: 'female' }
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setSafetyPrefs(prev => ({ ...prev, genderPreference: opt.value, womenOnly: opt.value === 'female' }))}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border-2 transition-all ${
                                                    safetyPrefs.genderPreference === opt.value
                                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                                        : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50'
                                                }`}
                                            >
                                                <span className={`material-icons-outlined text-sm ${safetyPrefs.genderPreference === opt.value
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : 'text-gray-500 dark:text-gray-400'
                                                    }`}>{opt.icon}</span>
                                                <span className={`text-xs font-bold ${safetyPrefs.genderPreference === opt.value
                                                    ? 'text-green-600 dark:text-green-400'
                                                    : 'text-gray-600 dark:text-gray-400'
                                                    }`}>{opt.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    {/* Women Only — convenience shortcut for Female gender preference */}
                                    <label
                                        className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                            safetyPrefs.womenOnly
                                                ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/20 dark:border-pink-700'
                                                : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={safetyPrefs.womenOnly}
                                            onChange={() => setSafetyPrefs(prev => {
                                                const next = !prev.womenOnly;
                                                return { ...prev, womenOnly: next, genderPreference: next ? 'female' : 'any' };
                                            })}
                                            className="sr-only"
                                        />
                                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                            safetyPrefs.womenOnly ? 'bg-pink-500 border-pink-500' : 'border-gray-300 dark:border-zinc-600'
                                        }`}>
                                            {safetyPrefs.womenOnly && (
                                                <span className="material-icons-outlined text-white" style={{ fontSize: '14px' }}>check</span>
                                            )}
                                        </div>
                                        <span className={`material-icons-outlined text-sm ${
                                            safetyPrefs.womenOnly ? 'text-pink-500' : 'text-gray-500 dark:text-gray-400'
                                        }`}>female</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-bold dark:text-white">Women Only</div>
                                            <div className="text-[10px] text-gray-400 dark:text-gray-500">Match only with women riders</div>
                                        </div>
                                    </label>
                                    {[
                                        { key: 'verifiedOnly' as const, label: 'Verified Riders', icon: 'verified_user', desc: 'Only verified profiles' },
                                        { key: 'noSmoking' as const, label: 'No Smoking', icon: 'smoke_free', desc: 'Smoke-free ride' },
                                        { key: 'wheelchairFriendly' as const, label: 'Wheelchair Buddy', icon: 'favorite', desc: 'Wheelchair-friendly rider' },
                                    ].map(pref => (
                                        <label
                                            key={pref.key}
                                            className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${safetyPrefs[pref.key]
                                                ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-700'
                                                : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={safetyPrefs[pref.key]}
                                                onChange={() => setSafetyPrefs(prev => ({ ...prev, [pref.key]: !prev[pref.key] }))}
                                                className="sr-only"
                                            />
                                            <div className={`w-4 h-4 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${safetyPrefs[pref.key]
                                                ? 'bg-green-500 border-green-500'
                                                : 'border-gray-300 dark:border-zinc-600'
                                                }`}>
                                                {safetyPrefs[pref.key] && (
                                                    <span className="material-icons-outlined text-white" style={{ fontSize: '12px' }}>check</span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-[11px] font-bold dark:text-white leading-tight">{pref.label}</div>
                                                <div className="text-[9px] text-gray-400 dark:text-gray-500 leading-tight">{pref.desc}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Accessibility Options */}
                        <div className="px-4 mt-3">
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 block">Accessibility Needs:</span>
                            <div className="grid grid-cols-1 gap-2">
                                {[
                                    { key: 'Wheelchair', icon: 'accessible' },
                                    { key: 'Hearing Assistance', icon: 'hearing' },
                                    { key: 'Elderly Assistance', icon: 'elderly' },
                                ].map(opt => {
                                    const selected = accessibilityOptions.includes(opt.key);
                                    return (
                                        <label
                                            key={opt.key}
                                            className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${selected
                                                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700'
                                                : 'border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => {
                                                    setAccessibilityOptions(prev =>
                                                        prev.includes(opt.key)
                                                            ? prev.filter(v => v !== opt.key)
                                                            : [...prev, opt.key]
                                                    );
                                                }}
                                                className="sr-only"
                                            />
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected
                                                ? 'bg-blue-500 border-blue-500'
                                                : 'border-gray-300 dark:border-zinc-600'
                                                }`}>
                                                {selected && (
                                                    <span className="material-icons-outlined text-white" style={{ fontSize: '14px' }}>check</span>
                                                )}
                                            </div>
                                            <span className="material-icons-outlined text-sm text-gray-500 dark:text-gray-400">{opt.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-bold dark:text-white">{opt.key}</div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── Wheelchair Access Requirement (Primary) ── */}
                        <div className="px-4 mt-3">
                            <label
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${safetyPrefs.needsWheelchair
                                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 shadow-sm'
                                    : 'border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50'
                                    }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={safetyPrefs.needsWheelchair}
                                    onChange={() => setSafetyPrefs(prev => ({ ...prev, needsWheelchair: !prev.needsWheelchair }))}
                                    className="sr-only"
                                />
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${safetyPrefs.needsWheelchair
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 dark:bg-zinc-700 text-gray-400'
                                    }`}>
                                    <span className="material-icons-outlined text-2xl">accessible</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-black dark:text-white">I need Wheelchair Access</div>
                                    <div className="text-[10px] text-gray-400 dark:text-gray-500">Requires a vehicle with a fold/ramp or extra trunk space</div>
                                </div>
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${safetyPrefs.needsWheelchair ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
                                    {safetyPrefs.needsWheelchair && <span className="material-icons-outlined text-white" style={{ fontSize: '16px' }}>check</span>}
                                </div>
                            </label>
                            {safetyPrefs.needsWheelchair && (
                                <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1.5 px-1 animate-in fade-in slide-in-from-left-2 duration-300">
                                    ⚡ Mandatory for your match. We'll only connect you with accessible vehicles.
                                </p>
                            )}
                        </div>

                        {/* Vehicle Categories — US 3.5 eco highlights */}
                        <div className="px-4 py-3">
                            <h3 className="text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Available Vehicles</h3>
                            <div className="space-y-2">
                            {VEHICLE_CATEGORIES.map(cat => {
                                const price = categoryPrices.get(cat.id) || 0;
                                const route = availableRoutes[selectedRouteIndex];
                                const soloPrice = route ? Math.round(cat.baseRate + (route.distance / 1000) * cat.perKmRate) : 0;
                                const co2 = route ? calculateCO2(route.distance, cat.id) : 0;
                                const co2Pool = route ? calculateCO2(route.distance, 'pool') : 0;
                                const etaMin = route ? Math.round(route.duration / 60) : 0;

                                // 3.5.2 — determine eco tier for this vehicle + mode
                                const isPoolMode = rideMode === 'Pooled';
                                const effectiveRate = isPoolMode && (cat.id === 'CAR' || cat.id === 'BIG_CAR')
                                    ? 40   // POOL_CO2_RATE_G_PER_KM (matches server)
                                    : cat.emissionRateGPerKm;
                                const ecoTier = getEcoTier(effectiveRate);
                                const isEcoStar     = ecoTier === 'eco_star';
                                const isEcoFriendly = ecoTier === 'eco_friendly';
                                const isAnyEco      = isEcoStar || isEcoFriendly;

                                // 3.5.1 — badge config
                                const badgeLabel = isEcoStar     ? '🌟 Eco Star'
                                                 : isEcoFriendly ? '🌱 Eco Friendly'
                                                 : isPoolMode && (cat.id === 'CAR' || cat.id === 'BIG_CAR') ? '🤝 Pool Eco'
                                                 : null;
                                const poolEco = isPoolMode && (cat.id === 'CAR' || cat.id === 'BIG_CAR');

                                const isSelected = selectedCategory === cat.id;

                                return (
                                    <button
                                        key={cat.id}
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 mb-3 transition-all relative overflow-hidden ${
                                            isSelected
                                                ? isAnyEco || poolEco
                                                    ? 'border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20'
                                                    : 'border-black dark:border-white bg-gray-50 dark:bg-zinc-800'
                                                : isAnyEco || poolEco
                                                    ? 'border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/10'
                                                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-zinc-800'
                                        }`}
                                    >
                                        {/* 3.5.3 — green left-edge accent for eco vehicles */}
                                        {(isAnyEco || poolEco) && (
                                            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${
                                                isEcoStar ? 'bg-emerald-500' : 'bg-green-400'
                                            }`} />
                                        )}

                                        {/* Vehicle icon — green tint for eco */}
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                                            isEcoStar     ? 'bg-emerald-100 dark:bg-emerald-900/40'
                                            : isEcoFriendly? 'bg-green-100 dark:bg-green-900/30'
                                            : poolEco     ? 'bg-teal-100 dark:bg-teal-900/30'
                                            : 'bg-gray-100 dark:bg-zinc-700'
                                        }`}>
                                            <span className={`material-icons-outlined text-2xl ${
                                                isEcoStar      ? 'text-emerald-600 dark:text-emerald-300'
                                                : isEcoFriendly ? 'text-green-600 dark:text-green-300'
                                                : poolEco      ? 'text-teal-600 dark:text-teal-300'
                                                : 'text-gray-700 dark:text-white'
                                            }`}>
                                                {cat.icon}
                                            </span>
                                        </div>

                                        <div className="flex-1 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-base dark:text-white">{cat.label}</span>
                                                {/* 3.5.1 — green badge (3.5.3 — clearly shown on ride list) */}
                                                {badgeLabel && (
                                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${
                                                        isEcoStar      ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-200'
                                                        : isEcoFriendly ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
                                                        : 'bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-200'
                                                    }`}>
                                                        {badgeLabel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {etaMin} min • {cat.capacity} seats • {effectiveRate}g/km
                                            </div>
                                            {isPoolMode ? (
                                                <div className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                    poolEco || isAnyEco
                                                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200'
                                                        : 'bg-gray-100 dark:bg-zinc-700 text-gray-500'
                                                }`}>
                                                    🌱 Save {co2 - co2Pool}g CO₂ vs solo
                                                </div>
                                            ) : (
                                                <div className={`mt-1 text-xs font-medium ${
                                                    isEcoStar ? 'text-emerald-600 dark:text-emerald-400'
                                                    : isEcoFriendly ? 'text-green-600 dark:text-green-400'
                                                    : 'text-gray-400'
                                                }`}>~{co2}g CO₂</div>
                                            )}
                                        </div>

                                        <div className="text-right">
                                            <div className="font-bold text-lg dark:text-white">₹{price}</div>
                                            {isPoolMode && soloPrice > price && (
                                                <div className="text-xs text-gray-400 line-through">₹{soloPrice}</div>
                                            )}
                                            {isSelected && (
                                                <div className={`text-xs mt-1 font-bold ${
                                                    isAnyEco || poolEco ? 'text-green-500' : 'text-green-500'
                                                }`}>✓</div>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                            </div>
                        </div>
                    </div>{/* end scrollable area */}

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
                        {rideMode === 'Pooled' && (
                            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800 rounded-xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="material-icons-outlined text-amber-600 dark:text-amber-400 text-sm">schedule</span>
                                    <span className="text-xs font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest">Pickup Window</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest">Start</label>
                                        <input
                                            type="datetime-local"
                                            value={pickupWindowStart}
                                            onChange={(e) => setPickupWindowStart(e.target.value)}
                                            className="mt-1 w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-2 text-xs font-bold dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 dark:text-zinc-400 uppercase tracking-widest">End</label>
                                        <input
                                            type="datetime-local"
                                            value={pickupWindowEnd}
                                            onChange={(e) => setPickupWindowEnd(e.target.value)}
                                            className="mt-1 w-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-2 text-xs font-bold dark:text-white"
                                        />
                                    </div>
                                </div>
                                <p className="mt-2 text-[10px] font-bold text-amber-700 dark:text-amber-300">Used for pool matching and confirmed pickup slot.</p>
                            </div>
                        )}
                        {scheduleInfo && (
                            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl flex items-center gap-2">
                                <span className="material-icons-outlined text-blue-500 text-lg">schedule</span>
                                <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                                    Scheduled: {new Date(scheduleInfo.scheduledFor).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                                </span>
                            </div>
                        )}
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
                            className={`w-full text-white font-bold py-4 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg ${scheduleInfo ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-500 hover:bg-green-600'}`}
                        >
                            {isRequesting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                                    {scheduleInfo ? 'Scheduling...' : 'Booking...'}
                                </span>
                            ) : scheduleInfo ? (
                                `Schedule ${VEHICLE_CATEGORIES.find(c => c.id === selectedCategory)?.label} - ₹${categoryPrices.get(selectedCategory) || 0}`
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
                    <div className="w-full bg-white dark:bg-zinc-900 rounded-t-[40px] shadow-2xl p-8 animate-in slide-in-from-bottom duration-500">
                        <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-8"></div>
                        {!isNoDriversFound ? (
                            <div className="flex flex-col items-center text-center pb-8">
                                {/* Pool Proposal State — Accept/Reject */}
                                {poolProposal ? (
                                    <>
                                        <div className="relative mb-5">
                                            <div className="size-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                                                <span className="material-icons-outlined text-3xl text-blue-600 dark:text-blue-400">group_add</span>
                                            </div>
                                            <div className="absolute inset-0 border-4 border-blue-400/30 rounded-full animate-ping"></div>
                                        </div>
                                        <h3 className="text-xl font-black mb-1 dark:text-white">Pool Match Found!</h3>
                                        <p className="text-sm text-blue-600 dark:text-blue-400 font-bold mb-4">
                                            Would you like to share this ride?
                                        </p>

                                        {/* Matched Rider Card */}
                                        <div className="w-full bg-[#fbfbfb] dark:bg-zinc-900/50 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4 mb-4">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="size-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                                                    <span className="material-icons-outlined text-blue-600 dark:text-blue-400">person</span>
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <div className="text-sm font-black text-gray-900 dark:text-white">{poolProposal.matchedRider.name}</div>
                                                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 capitalize">{poolProposal.matchedRider.gender}</span>
                                                        {poolProposal.matchedRider.isVerified && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-full">
                                                                <span className="material-icons-outlined text-blue-600 dark:text-blue-400" style={{ fontSize: '10px' }}>verified_user</span>
                                                                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">Verified</span>
                                                            </span>
                                                        )}
                                                        {poolProposal.matchedRider.safetyTags?.includes('noSmoking') && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full">
                                                                <span className="material-icons-outlined text-green-600 dark:text-green-400" style={{ fontSize: '10px' }}>smoke_free</span>
                                                                <span className="text-[9px] font-bold text-green-600 dark:text-green-400">No Smoking</span>
                                                            </span>
                                                        )}
                                                        {(poolProposal.matchedRider.gender?.toLowerCase() === 'female' || poolProposal.matchedRider.safetyTags?.includes('womenOnly')) && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded-full">
                                                                <span className="material-icons-outlined text-pink-500 dark:text-pink-400" style={{ fontSize: '10px' }}>female</span>
                                                                <span className="text-[9px] font-bold text-pink-500 dark:text-pink-400">Women</span>
                                                            </span>
                                                        )}
                                                        {poolProposal.matchedRider.wheelchairFriendly && (
                                                            <div className="flex items-center gap-0.5 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                                                <span className="material-icons-outlined text-[10px]">favorite</span>
                                                                BUDDY
                                                            </div>
                                                        )}
                                                        {poolProposal.matchedRider.needsWheelchair && (
                                                            <div className="flex items-center gap-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                                                                <span className="material-icons-outlined text-[10px]">accessible</span>
                                                                WHEELCHAIR
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2.5 ml-1">
                                                <div className="flex flex-col items-center gap-0.5 shrink-0">
                                                    <div className="size-1.5 bg-leaf-500 rounded-full"></div>
                                                    <div className="w-0.5 h-3 bg-gray-200 dark:bg-zinc-700"></div>
                                                    <div className="size-1.5 bg-red-500 rounded-full"></div>
                                                </div>
                                                <div className="flex-1 min-w-0 text-left">
                                                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{poolProposal.matchedRider.pickup?.address || 'Nearby'}</p>
                                                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{poolProposal.matchedRider.dropoff?.address || 'Same direction'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pool Fare Savings */}
                                        {poolProposal.poolFare > 0 && (
                                            <div className="flex items-center gap-2 bg-leaf-50 dark:bg-leaf-900/15 border border-leaf-200 dark:border-leaf-800 rounded-xl px-4 py-2.5 mb-4 w-full justify-center">
                                                <span className="material-icons-outlined text-leaf-600 dark:text-leaf-400 text-sm">savings</span>
                                                <span className="text-xs font-black text-gray-400 dark:text-gray-500 line-through">₹{poolProposal.originalFare}</span>
                                                <span className="text-lg font-black text-leaf-600 dark:text-leaf-400">₹{poolProposal.poolFare}</span>
                                                <span className="text-[10px] font-black text-leaf-600 dark:text-leaf-400 uppercase tracking-widest">per person</span>
                                            </div>
                                        )}

                                        {/* Accept / Reject Buttons */}
                                        <div className="flex gap-3 w-full">
                                            <button
                                                onClick={() => {
                                                    const socket = socketRef.current;
                                                    if (socket && poolProposal) {
                                                        socket.emit('pool:reject', { proposalId: poolProposal.proposalId, riderId: user?._id });
                                                    }
                                                }}
                                                className="flex-1 py-3.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                                            >
                                                Decline
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const socket = socketRef.current;
                                                    if (socket && poolProposal) {
                                                        socket.emit('pool:accept', { proposalId: poolProposal.proposalId, riderId: user?._id });
                                                        setPoolProposal(prev => prev ? { ...prev, proposalId: prev.proposalId + ':accepted' } : null);
                                                    }
                                                }}
                                                disabled={poolProposal.proposalId.endsWith(':accepted')}
                                                className={`flex-1 py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg transition-all active:scale-95 ${poolProposal.proposalId.endsWith(':accepted')
                                                    ? 'bg-blue-400 text-white cursor-not-allowed opacity-70'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                                                    }`}
                                            >
                                                {poolProposal.proposalId.endsWith(':accepted') ? 'Waiting for rider...' : 'Accept Pool'}
                                            </button>
                                        </div>

                                        {/* Timer hint */}
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">
                                            This offer expires in 60 seconds
                                        </p>
                                    </>
                                ) : poolMatchInfo ? (
                                    /* Pool Confirmed — waiting for driver */
                                    <>
                                        <div className="relative mb-6">
                                            <div className="size-20 bg-leaf-50 dark:bg-leaf-900/20 rounded-full flex items-center justify-center">
                                                <span className="material-icons-outlined text-3xl text-leaf-600 dark:text-leaf-400">group</span>
                                            </div>
                                            <div className="absolute inset-0 border-4 border-leaf-400/30 rounded-full animate-ping"></div>
                                            <div className="absolute -bottom-1 -right-1 bg-leaf-500 size-6 flex items-center justify-center rounded-full border-2 border-white dark:border-zinc-900">
                                                <span className="material-icons-outlined text-white text-xs">check</span>
                                            </div>
                                        </div>
                                        <h3 className="text-2xl font-black mb-1 dark:text-white">Pool Matched!</h3>
                                        <p className="text-sm text-leaf-600 dark:text-leaf-400 font-bold mb-4">
                                            Waiting for a driver to accept your pool ride...
                                        </p>

                                        {/* Matched Rider Card */}
                                        <div className="w-full bg-[#fbfbfb] dark:bg-zinc-900/50 border border-gray-100 dark:border-zinc-800 rounded-2xl p-4 mb-4">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="size-10 bg-leaf-100 dark:bg-leaf-900/30 rounded-xl flex items-center justify-center">
                                                    <span className="material-icons-outlined text-leaf-600 dark:text-leaf-400">person</span>
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <div className="text-sm font-black text-gray-900 dark:text-white">{poolMatchInfo.matchedRider.name}</div>
                                                    <div className="text-[10px] font-black text-leaf-600 dark:text-leaf-400 uppercase tracking-widest mb-1">Pool Partner</div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {poolMatchInfo.matchedRider.isVerified && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-full">
                                                                <span className="material-icons-outlined text-blue-600 dark:text-blue-400" style={{ fontSize: '10px' }}>verified_user</span>
                                                                <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400">Verified</span>
                                                            </span>
                                                        )}
                                                        {poolMatchInfo.matchedRider.safetyTags?.includes('noSmoking') && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-full">
                                                                <span className="material-icons-outlined text-green-600 dark:text-green-400" style={{ fontSize: '10px' }}>smoke_free</span>
                                                                <span className="text-[9px] font-bold text-green-600 dark:text-green-400">No Smoking</span>
                                                            </span>
                                                        )}
                                                        {poolMatchInfo.matchedRider.safetyTags?.includes('womenOnly') && (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded-full">
                                                                <span className="material-icons-outlined text-pink-500 dark:text-pink-400" style={{ fontSize: '10px' }}>female</span>
                                                                <span className="text-[9px] font-bold text-pink-500 dark:text-pink-400">Women Only</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2.5 ml-1">
                                                <div className="flex flex-col items-center gap-0.5 shrink-0">
                                                    <div className="size-1.5 bg-leaf-500 rounded-full"></div>
                                                    <div className="w-0.5 h-3 bg-gray-200 dark:bg-zinc-700"></div>
                                                    <div className="size-1.5 bg-red-500 rounded-full"></div>
                                                </div>
                                                <div className="flex-1 min-w-0 text-left">
                                                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{poolMatchInfo.matchedRider.pickup?.address || 'Nearby'}</p>
                                                    <p className="text-[11px] font-bold text-gray-700 dark:text-gray-300 truncate">{poolMatchInfo.matchedRider.dropoff?.address || 'Same direction'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pool Fare */}
                                        {poolMatchInfo.poolFare > 0 && (
                                            <div className="flex items-center gap-2 bg-leaf-50 dark:bg-leaf-900/15 border border-leaf-200 dark:border-leaf-800 rounded-xl px-4 py-2.5 mb-2">
                                                <span className="material-icons-outlined text-leaf-600 dark:text-leaf-400 text-sm">savings</span>
                                                <span className="text-xs font-black text-gray-400 dark:text-gray-500 line-through">₹{poolMatchInfo.originalFare}</span>
                                                <span className="text-lg font-black text-leaf-600 dark:text-leaf-400">₹{poolMatchInfo.poolFare}</span>
                                                <span className="text-[10px] font-black text-leaf-600 dark:text-leaf-400 uppercase tracking-widest">per person</span>
                                            </div>
                                        )}

                                        {poolMatchInfo.confirmedPickupSlot && (
                                            <div className="w-full bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 mb-2 text-left">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="material-icons-outlined text-blue-600 dark:text-blue-400 text-sm">event_available</span>
                                                    <span className="text-[10px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest">Confirmed Pickup Slot</span>
                                                </div>
                                                <p className="text-sm font-black text-blue-700 dark:text-blue-300">
                                                    {formatDateTimeLabel(poolMatchInfo.confirmedPickupSlot)}
                                                </p>
                                                {poolMatchInfo.confirmedWindowStart && poolMatchInfo.confirmedWindowEnd && (
                                                    <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                                                        Within window: {formatDateTimeLabel(poolMatchInfo.confirmedWindowStart)} – {formatDateTimeLabel(poolMatchInfo.confirmedWindowEnd)}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* Animated waiting indicator */}
                                        <div className="flex items-center gap-2 mt-3 text-leaf-600 dark:text-leaf-400">
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 bg-leaf-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                <div className="w-2 h-2 bg-leaf-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                <div className="w-2 h-2 bg-leaf-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                            </div>
                                            <span className="text-xs font-bold">Connecting to drivers</span>
                                        </div>
                                    </>
                                ) : (
                                    /* Normal Searching State */
                                    <>
                                        {optedOutToSolo ? (
                                            /* US 1.5.3 — Solo confirmation after opt-out */
                                            <>
                                                <div className="relative mb-6">
                                                    <div className="size-24 bg-green-50 dark:bg-green-900/10 rounded-full flex items-center justify-center">
                                                        <span className="material-icons-outlined text-4xl text-green-500">check_circle</span>
                                                    </div>
                                                    <div className="absolute inset-0 border-4 border-green-500/20 rounded-full animate-ping"></div>
                                                </div>
                                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-2xl px-5 py-3 mb-2 text-center">
                                                    <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest mb-0.5">Switched to Solo Ride</p>
                                                    <p className="text-2xl font-black text-green-700 dark:text-green-300">₹{soloOptOutFare ?? currentFare}</p>
                                                    <p className="text-[11px] text-green-500 dark:text-green-500 mt-0.5">Updated fare — searching drivers now</p>
                                                </div>
                                                <h3 className="text-lg font-black mt-2 dark:text-white">Finding your private ride</h3>
                                                <div className="flex items-center gap-2 mt-3 text-green-600 dark:text-green-400">
                                                    <div className="flex gap-1">
                                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                                    </div>
                                                    <span className="text-xs font-bold">Connecting to drivers</span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
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
                                                {/* US 1.5.1 — Opt-out button during pool search */}
                                                {rideMode === 'Pooled' && (
                                                    <button
                                                        onClick={handleOptOutPool}
                                                        disabled={isOptingOut}
                                                        className="mt-4 py-2.5 px-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-2xl font-bold text-xs hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                                                    >
                                                        {isOptingOut ? 'Switching…' : '⚡ Proceed as Solo Ride'}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}
                                <button
                                    onClick={handleResetRide}
                                    className="mt-6 py-3 px-8 border-2 border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 rounded-2xl font-bold text-sm hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                                >
                                    Cancel Search
                                </button>
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
                                <div className="flex flex-col gap-3 w-full mt-10">
                                    {/* US 1.5.1 — Opt-out button in no-drivers-found state */}
                                    {rideMode === 'Pooled' && (
                                        <button
                                            onClick={handleOptOutPool}
                                            disabled={isOptingOut}
                                            className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-amber-500/30 hover:bg-amber-600 transition-colors disabled:opacity-50"
                                        >
                                            {isOptingOut ? 'Switching…' : '⚡ Switch to Solo Ride'}
                                        </button>
                                    )}
                                    <div className="flex gap-3 w-full">
                                        <button
                                            onClick={() => setRideStatus('IDLE')}
                                            className="flex-1 py-4 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-2xl font-black text-sm uppercase tracking-widest"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => {
                                                setIsNoDriversFound(false);
                                                setRideStatus('IDLE');
                                                setTimeout(() => setRideStatus('SEARCHING'), 100);
                                            }}
                                            className="flex-[2] py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl"
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Driver Canceled + Auto Re-Search Overlay ── */}
            {canceledByDriver && rideStatus === 'CANCELED' && (
                <div className="absolute inset-0 z-[55] flex items-end">
                    <div className="w-full bg-white dark:bg-zinc-900 rounded-t-[40px] shadow-2xl p-8 animate-in slide-in-from-bottom duration-500">
                        <div className="w-12 h-1.5 bg-gray-100 dark:bg-zinc-800 rounded-full mx-auto mb-6"></div>
                        <div className="flex flex-col items-center text-center pb-6">
                            <div className="relative mb-6">
                                <div className="size-20 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center">
                                    <span className="material-icons-outlined text-4xl text-red-500">cancel</span>
                                </div>
                            </div>
                            <h3 className="text-2xl font-black mb-2 dark:text-white">Driver Canceled</h3>
                            {driverCancelInfo?.cancelReason && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-1">
                                    Reason: {driverCancelInfo.cancelReason}
                                </p>
                            )}
                            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
                                Don't worry — we're automatically searching for another driver nearby.
                            </p>

                            {/* Auto-searching animation */}
                            <div className="w-full p-4 bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-100 dark:border-green-800 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <div className="size-10 bg-green-100 dark:bg-green-800/30 rounded-full flex items-center justify-center">
                                            <span className="material-icons-outlined text-green-500">radar</span>
                                        </div>
                                        <div className="absolute inset-0 border-2 border-green-500/30 rounded-full animate-ping"></div>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-bold text-green-700 dark:text-green-400">
                                            Searching within 5 km...
                                        </p>
                                        <p className="text-xs text-green-600 dark:text-green-500">
                                            Looking for drivers on your route
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={handleResetRide}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-2xl font-black text-sm uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setCanceledByDriver(false);
                                        setDriverCancelInfo(null);
                                        setRideStatus('IDLE');
                                        setShowOptions(true);
                                    }}
                                    className="flex-[2] py-4 bg-black dark:bg-white text-white dark:text-black rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl"
                                >
                                    Rebook Manually
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Active Ride Panel ── */}
            {rideStatus !== 'IDLE' && rideStatus !== 'SEARCHING' && rideStatus !== 'CANCELED' && (
                <div className="absolute bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-xs uppercase tracking-widest text-gray-400 font-bold">Ride Status</p>
                            <h3 className="text-xl font-black dark:text-white">
                                {rideStatus.replace('_', ' ')}
                            </h3>
                        </div>
                        {/* Live ETA Badge */}
                        {(liveEtaText || etaToPickup) && rideStatus !== 'COMPLETED' && (
                            <div className="flex flex-col items-end gap-1">
                                <div className="flex items-center gap-1.5 bg-black dark:bg-white text-white dark:text-black px-3 py-1.5 rounded-full text-xs font-bold">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                    {rideStatus === 'IN_PROGRESS'
                                        ? `ETA ${liveEtaText || 'Computing...'}`
                                        : `ETA ${liveEtaText || etaToPickup}`
                                    }
                                </div>
                                <span className="text-[9px] text-gray-400 dark:text-zinc-500 font-medium">
                                    {liveEtaSource === 'ola-traffic' ? 'Live traffic' : 'Estimated'}
                                    {liveEtaLabel === 'pickup' ? ' to pickup' : liveEtaLabel === 'dropoff' ? ' to drop' : ''}
                                </span>
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

                    {/* ── Pool Ride Progress Tracker ── */}
                    {poolStopUpdates.length > 0 && (() => {
                        const latestUpdate = poolStopUpdates[poolStopUpdates.length - 1];
                        const stops = latestUpdate?.stops || [];
                        const currentIdx = latestUpdate?.currentStopIndex || 0;
                        if (stops.length === 0) return null;
                        return (
                            <div className="mb-5">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="size-7 bg-leaf-100 dark:bg-leaf-900/30 rounded-lg flex items-center justify-center">
                                            <span className="material-icons-outlined text-leaf-600 dark:text-leaf-400" style={{ fontSize: '14px' }}>route</span>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">Pool Progress</p>
                                            <p className="text-xs font-black dark:text-white">{stops.filter((s: any) => s.status === 'COMPLETED').length}/{stops.length} stops</p>
                                        </div>
                                    </div>
                                    <div className="bg-leaf-50 dark:bg-leaf-900/20 text-leaf-700 dark:text-leaf-400 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                                        Step {Math.min(currentIdx + 1, stops.length)}/{stops.length}
                                    </div>
                                </div>
                                {latestUpdate?.message && (
                                    <div className="mb-3 px-3 py-2 bg-leaf-50 dark:bg-leaf-900/15 rounded-xl text-xs font-black text-leaf-700 dark:text-leaf-400 border border-leaf-200 dark:border-leaf-800/50">
                                        {latestUpdate.message}
                                    </div>
                                )}
                                <div className="space-y-2">
                                    {stops.map((stop: any, idx: number) => {
                                        const isDone = stop.status === 'COMPLETED';
                                        const isActive = idx === currentIdx && !isDone;
                                        return (
                                            <div key={idx} className={`flex items-center gap-3 p-3 rounded-[16px] transition-all ${isDone ? 'bg-gray-50 dark:bg-zinc-800/40 opacity-60' :
                                                isActive ? 'bg-white dark:bg-zinc-900 ring-2 ring-leaf-500 shadow-md shadow-leaf-500/10' :
                                                    'bg-[#fbfbfb] dark:bg-zinc-900/50 border border-gray-100 dark:border-zinc-800'
                                                }`}>
                                                <div className={`size-7 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 ${isDone ? 'bg-leaf-500 text-white' :
                                                    isActive ? 'bg-black dark:bg-white text-white dark:text-black' :
                                                        'bg-gray-200 dark:bg-zinc-700 text-gray-400 dark:text-gray-500'
                                                    }`}>
                                                    {isDone ? '✓' : idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isDone ? 'text-leaf-600 dark:text-leaf-400' :
                                                        stop.type === 'PICKUP' ? 'text-leaf-600 dark:text-leaf-400' : 'text-orange-500 dark:text-orange-400'
                                                        }`}>
                                                        {stop.type === 'PICKUP' ? 'Pickup' : 'Dropoff'}
                                                    </span>
                                                    <span className={`text-xs font-black ml-1.5 ${isDone ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                                                        {stop.riderName}
                                                    </span>
                                                </div>
                                                {isDone && <span className="text-[10px] text-leaf-500 font-black">Done</span>}
                                                {isActive && <span className="flex items-center gap-1"><span className="size-1.5 bg-leaf-500 rounded-full animate-pulse"></span><span className="text-[10px] text-leaf-600 dark:text-leaf-400 font-black">Now</span></span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── Multi-Stop Progress Tracker ── */}
                    {activeRideStops.length > 0 && rideStatus === 'IN_PROGRESS' && (
                        <div className="mb-4 p-3 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl">
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <span className="material-icons-outlined text-amber-500" style={{ fontSize: '14px' }}>pin_drop</span>
                                Stops Progress
                            </p>
                            <div className="space-y-2">
                                {activeRideStops.map((stop, idx) => (
                                    <div key={idx} className="flex items-center gap-2.5">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${stop.status === 'REACHED' ? 'bg-green-500 text-white' :
                                            stop.status === 'SKIPPED' ? 'bg-gray-300 dark:bg-zinc-600 text-gray-500 dark:text-zinc-400 line-through' :
                                                idx === currentStopIndex ? 'bg-amber-500 text-white animate-pulse' :
                                                    'bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400'
                                            }`}>
                                            {stop.status === 'REACHED' ? '✓' : stop.status === 'SKIPPED' ? '—' : idx + 1}
                                        </div>
                                        <span className={`text-xs font-semibold flex-1 truncate ${stop.status === 'REACHED' ? 'text-green-600 dark:text-green-400' :
                                            stop.status === 'SKIPPED' ? 'text-gray-400 dark:text-zinc-500 line-through' :
                                                idx === currentStopIndex ? 'text-amber-600 dark:text-amber-400' :
                                                    'text-gray-500 dark:text-gray-400'
                                            }`}>
                                            {stop.address}
                                        </span>
                                        {stop.status === 'REACHED' && (
                                            <span className="text-[10px] text-green-500 font-bold">Done</span>
                                        )}
                                        {stop.status === 'SKIPPED' && (
                                            <span className="text-[10px] text-gray-400 font-bold">Skipped</span>
                                        )}
                                        {idx === currentStopIndex && stop.status === 'PENDING' && (
                                            <span className="text-[10px] text-amber-500 font-bold">Next</span>
                                        )}
                                    </div>
                                ))}
                                <div className="flex items-center gap-2.5 mt-1 pt-1.5 border-t border-gray-200 dark:border-zinc-700">
                                    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                                        <span className="material-icons-outlined text-white" style={{ fontSize: '12px' }}>flag</span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">{destination || 'Final Destination'}</span>
                                </div>
                            </div>
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

                    {/* ── Rider Cancel Button (ACCEPTED / ARRIVED) ── */}
                    {(rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED') && (
                        <button
                            onClick={() => setShowCancelModal(true)}
                            className="w-full py-3 border-2 border-red-200 dark:border-red-800 text-red-500 font-bold rounded-xl mb-3 flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                        >
                            <span className="material-icons-outlined" style={{ fontSize: '18px' }}>close</span>
                            Cancel Ride
                        </button>
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
                    <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[32px] p-6 shadow-2xl relative overflow-hidden">
                        {/* Decorative Background for Premium Feel */}
                        <div className="absolute -top-12 -right-12 size-32 bg-green-500/10 rounded-full blur-2xl"></div>
                        <div className="absolute -bottom-12 -left-12 size-32 bg-blue-500/10 rounded-full blur-2xl"></div>

                        <div className="relative z-10">
                            <h3 className="text-xl font-black dark:text-white mb-2">Ride Complete! 🎉</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Your journey has ended safely.
                            </p>

                            <div className="bg-gray-50 dark:bg-zinc-800/50 rounded-2xl p-4 mb-5 border border-gray-100 dark:border-zinc-800">
                                {confirmCompleteData.actualDistanceKm && (
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Distance</span>
                                        <span className="text-sm font-black dark:text-white">{confirmCompleteData.actualDistanceKm} km</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Fare</span>
                                    <span className="text-xl font-black text-green-600 dark:text-green-400">₹{confirmCompleteData.completedFare}</span>
                                </div>
                            </div>

                            {/* CO2 preview */}
                            {(confirmCompleteData.co2EmittedG > 0) && (
                                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2 mb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="material-icons-outlined text-gray-400 text-sm">cloud</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-300">CO₂ emitted</span>
                                    </div>
                                    <span className="text-xs font-bold dark:text-white">
                                        {confirmCompleteData.co2EmittedKg >= 0.1 ? `${confirmCompleteData.co2EmittedKg} kg` : `${confirmCompleteData.co2EmittedG} g`}
                                    </span>
                                </div>
                            )}
                            {confirmCompleteData.co2SavedG > 0 && (
                                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <span className="material-icons-outlined text-green-500 text-sm">eco</span>
                                        <span className="text-xs text-gray-600 dark:text-gray-300">CO₂ saved (pool)</span>
                                    </div>
                                    <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                        -{confirmCompleteData.co2SavedKg >= 0.01 ? `${confirmCompleteData.co2SavedKg} kg` : `${confirmCompleteData.co2SavedG} g`}
                                    </span>
                                </div>
                            )}
                            {/* Payment Method Specific UI */}
                            {paymentMethod === 'Cash' ? (
                                <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 rounded-2xl p-4 mb-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="size-10 bg-amber-500 text-white rounded-xl flex items-center justify-center">
                                            <span className="material-icons-outlined">payments</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-amber-700 dark:text-amber-400">Pay by Cash</p>
                                            <p className="text-[10px] font-bold text-amber-600/70">Please hand over the amount to the driver</p>
                                        </div>
                                    </div>
                                    <div className="text-center py-2 border-2 border-dashed border-amber-200 dark:border-amber-800 rounded-xl">
                                        <span className="text-2xl font-black text-amber-700 dark:text-amber-300">₹{confirmCompleteData.completedFare}</span>
                                    </div>
                                </div>
                            ) : paymentMethod === 'UPI' ? (
                                <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800 rounded-2xl p-4 mb-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="size-10 bg-purple-600 text-white rounded-xl flex items-center justify-center">
                                            <span className="material-icons-outlined">qr_code_2</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-purple-700 dark:text-purple-400">Pay by UPI</p>
                                            <p className="text-[10px] font-bold text-purple-600/70">Scan QR or pay to UPI ID below</p>
                                        </div>
                                    </div>

                                    {driverDetails?.upiQrCodeUrl ? (
                                        <div className="flex flex-col items-center mb-4">
                                            <div className="bg-white p-2 rounded-2xl shadow-sm border border-purple-100">
                                                <img
                                                    src={driverDetails.upiQrCodeUrl}
                                                    alt="UPI QR Code"
                                                    className="size-32 object-contain"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center mb-4 py-4 bg-white/50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-purple-200 dark:border-purple-800">
                                            <span className="material-icons-outlined text-purple-300 dark:text-purple-700 text-4xl mb-1">no_photography</span>
                                            <span className="text-[10px] font-bold text-purple-400">QR Code not provided</span>
                                        </div>
                                    )}

                                    {driverDetails?.upiId ? (
                                        <div className="bg-white dark:bg-zinc-900 p-3 rounded-xl border border-purple-100 dark:border-purple-800 flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] uppercase font-black text-purple-400 mb-0.5">UPI ID</p>
                                                <p className="text-sm font-black text-gray-900 dark:text-white truncate">{driverDetails.upiId}</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(driverDetails.upiId);
                                                    alert('UPI ID copied!');
                                                }}
                                                className="size-8 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg flex items-center justify-center active:scale-95 transition-transform"
                                            >
                                                <span className="material-icons-outlined text-sm">content_copy</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-center text-purple-600 dark:text-purple-400 font-bold italic">Ask driver for UPI details</p>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-2xl p-4 mb-6">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 bg-blue-500 text-white rounded-xl flex items-center justify-center">
                                            <span className="material-icons-outlined">account_balance_wallet</span>
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-blue-700 dark:text-blue-400">Payment Processed</p>
                                            <p className="text-[10px] font-bold text-blue-600/70">Amount deducted from your {paymentMethod}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleConfirmComplete(true)}
                                    className="flex-1 bg-green-500 hover:bg-green-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-500/20 active:scale-95 transition-all"
                                >
                                    Confirm Payment
                                </button>
                                <button
                                    onClick={() => handleConfirmComplete(false)}
                                    className="px-6 bg-gray-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-900/10 text-gray-500 dark:text-zinc-400 hover:text-red-500 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
                                >
                                    Dispute
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Ride Summary Modal (shown after rider confirms completion) ── */}
            {rideSummary && (
                <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                        {/* Header */}
                        <div className="text-center mb-5">
                            <div className="text-5xl mb-2">🌿</div>
                            <h3 className="text-xl font-bold dark:text-white">Ride Complete!</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Here's your ride summary</p>
                        </div>

                        {/* 3.6.1 — CO₂ Saved Hero Banner (shown when rider pooled and saved CO₂) */}
                        {(rideSummary.co2SavedG ?? 0) > 0 && (
                            <div className="bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-2xl px-4 py-4 mb-4 flex items-center gap-3 shadow-lg">
                                <div className="text-4xl shrink-0">🌱</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80">You saved</p>
                                    <p className="text-2xl font-black leading-tight">
                                        {(rideSummary.co2SavedKg ?? 0) >= 0.01
                                            ? `${rideSummary.co2SavedKg} kg CO\u2082`
                                            : `${rideSummary.co2SavedG} g CO\u2082`}
                                    </p>
                                    <p className="text-[10px] opacity-80 mt-0.5">by choosing a pooled ride 🌍</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[11px] font-bold opacity-90">≈{((rideSummary.co2SavedG ?? 0) / 21000).toFixed(4)}</p>
                                    <p className="text-[10px] opacity-70">trees/yr</p>
                                </div>
                            </div>
                        )}

                        {/* Fare + Distance */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div className="bg-gray-50 dark:bg-zinc-800 rounded-2xl p-3 text-center">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Fare Paid</p>
                                <p className="text-2xl font-black dark:text-white">₹{rideSummary.completedFare}</p>
                            </div>
                            <div className="bg-gray-50 dark:bg-zinc-800 rounded-2xl p-3 text-center">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Distance</p>
                                <p className="text-2xl font-black dark:text-white">{rideSummary.actualDistanceKm}<span className="text-sm font-normal"> km</span></p>
                            </div>
                        </div>
                        {/* Carbon Footprint card */}
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-4 mb-4">
                            <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-3">Carbon Footprint</p>
                            {/* CO2 Emitted */}
                            <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="material-icons-outlined text-gray-400 text-[18px]">cloud</span>
                                    <span className="text-sm text-gray-600 dark:text-gray-300">CO₂ emitted</span>
                                </div>
                                <span className="text-sm font-bold dark:text-white">
                                    {rideSummary.co2EmittedG > 0
                                        ? rideSummary.co2EmittedKg >= 0.1
                                            ? `${rideSummary.co2EmittedKg} kg`
                                            : `${rideSummary.co2EmittedG} g`
                                        : '—'}
                                </span>
                            </div>
                            {/* CO2 Saved (pooled only) */}
                            {rideSummary.co2SavedG > 0 && (
                                <div className="flex items-center justify-between mb-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="material-icons-outlined text-green-500 text-[18px]">eco</span>
                                        <span className="text-sm text-gray-600 dark:text-gray-300">CO₂ saved (pool)</span>
                                    </div>
                                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                                        -{rideSummary.co2SavedKg >= 0.01 ? `${rideSummary.co2SavedKg} kg` : `${rideSummary.co2SavedG} g`}
                                    </span>
                                </div>
                            )}
                            {/* Tree Equivalent */}
                            <div className="flex items-center justify-between mb-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[18px]">🌳</span>
                                    <span className="text-sm text-gray-600 dark:text-gray-300">Tree equivalent</span>
                                </div>
                                <span className="text-sm font-bold dark:text-white">
                                    {rideSummary.treeEquivalent > 0
                                        ? rideSummary.treeEquivalent < 0.001 ? '<0.001' : rideSummary.treeEquivalent
                                        : '—'} trees/yr
                                </span>
                            </div>
                            {/* Net impact (pooled) */}
                            {rideSummary.co2SavedG > 0 && rideSummary.co2EmittedG > 0 && (
                                <div className="mt-2 pt-2.5 border-t border-green-200 dark:border-green-800 flex items-center justify-between">
                                    <span className="text-xs font-semibold text-green-700 dark:text-green-400">Net CO₂ impact</span>
                                    <span className="text-xs font-bold text-green-600 dark:text-green-400">
                                        {((rideSummary.co2EmittedG - rideSummary.co2SavedG) / 1000).toFixed(3)} kg net
                                    </span>
                                </div>
                            )}
                        </div>
                        {/* Pool badge */}
                        {rideSummary.isPooled && (
                            <div className="bg-green-500 text-white rounded-xl py-2 px-3 text-xs font-semibold text-center mb-4">
                                🌍 You pooled this ride — great for the planet!
                            </div>
                        )}
                        <button
                            onClick={() => { setRideSummary(null); handleResetRide(); }}
                            className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-3 rounded-xl"
                        >
                            Done
                        </button>
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

            {/* ── Stop Search Modal ── */}
            {showStopSearch && (
                <div
                    className="fixed inset-0 z-[65] bg-black/60 flex items-end justify-center"
                    onClick={() => { setShowStopSearch(false); setStopSearchQuery(''); setStopSuggestions([]); }}
                >
                    <div
                        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-t-3xl p-5 max-h-[70vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold dark:text-white">Add a Stop</h3>
                            <button
                                onClick={() => { setShowStopSearch(false); setStopSearchQuery(''); setStopSuggestions([]); }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <span className="material-icons-outlined text-gray-500">close</span>
                            </button>
                        </div>
                        <div className="flex items-center gap-2 bg-gray-100 dark:bg-zinc-800 rounded-xl px-3 mb-3">
                            <span className="material-icons-outlined text-amber-500">add_location</span>
                            <input
                                type="text"
                                value={stopSearchQuery}
                                onChange={(e) => setStopSearchQuery(e.target.value)}
                                autoFocus
                                className="flex-1 bg-transparent border-none p-3 text-sm font-bold focus:ring-0 focus:outline-none dark:text-white"
                                placeholder="Search for a stop location..."
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {isStopSearching && (
                                <div className="text-center py-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto"></div>
                                </div>
                            )}
                            {stopSuggestions.map((place, idx) => (
                                <button
                                    key={`${place.placeId}-${idx}`}
                                    onClick={() => handleAddStop(place)}
                                    className="w-full flex items-center gap-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded-lg px-2 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                                        <span className="material-icons-outlined text-amber-500" style={{ fontSize: '16px' }}>location_on</span>
                                    </div>
                                    <div className="flex-1 text-left min-w-0">
                                        <div className="font-semibold text-sm dark:text-white truncate">{place.structuredFormatting.mainText}</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{place.structuredFormatting.secondaryText}</div>
                                    </div>
                                </button>
                            ))}
                            {!isStopSearching && stopSearchQuery.length > 2 && stopSuggestions.length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-4">No results found</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Rider Cancel Reason Modal ── */}
            {showCancelModal && (
                <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4">
                    <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold dark:text-white flex items-center gap-2">
                                <span className="material-icons-outlined text-red-500">warning</span>
                                Cancel Ride
                            </h3>
                            <button
                                onClick={() => { setShowCancelModal(false); setRiderCancelReason(''); }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <span className="material-icons-outlined text-gray-500">close</span>
                            </button>
                        </div>

                        {rideStatus === 'ACCEPTED' || rideStatus === 'ARRIVED' ? (
                            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-3 rounded-xl mb-4">
                                <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                                    <span className="material-icons-outlined" style={{ fontSize: '14px' }}>info</span>
                                    A cancellation fee of ₹25 will be charged as the driver has already accepted.
                                </p>
                            </div>
                        ) : null}

                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 font-medium">
                            Why are you canceling?
                        </p>
                        <div className="space-y-2 mb-4">
                            {[
                                'Changed plans',
                                'Found alternative transport',
                                'Wrong pickup/destination',
                                'Taking too long',
                                'Price too high',
                            ].map((reason) => (
                                <button
                                    key={reason}
                                    onClick={() => setRiderCancelReason(reason)}
                                    className={`w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${riderCancelReason === reason
                                        ? 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400'
                                        : 'border-gray-100 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800'
                                        }`}
                                >
                                    {reason}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowCancelModal(false); setRiderCancelReason(''); }}
                                className="flex-1 py-3 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-xl font-bold"
                            >
                                Go Back
                            </button>
                            <button
                                onClick={() => {
                                    if (!riderCancelReason) return;
                                    handleRiderCancelRide();
                                }}
                                disabled={!riderCancelReason || isCanceling}
                                className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 ${riderCancelReason && !isCanceling
                                    ? 'bg-red-500 text-white shadow-lg'
                                    : 'bg-gray-200 dark:bg-zinc-700 text-gray-400 dark:text-zinc-500 cursor-not-allowed'
                                    }`}
                            >
                                {isCanceling ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Canceling...
                                    </>
                                ) : (
                                    'Cancel Ride'
                                )}
                            </button>
                        </div>
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
        </div>
    );
};

export default PlanRideScreen;

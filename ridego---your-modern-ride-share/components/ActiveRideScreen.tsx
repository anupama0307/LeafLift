import React, { useEffect, useState, useRef } from 'react';
import { registerSocket } from '../src/services/realtime';

interface ActiveRideScreenProps {
    user: any;
    rideData: any;
    onBack: () => void;
}

interface RideChatMessage {
    senderId?: string;
    senderRole?: string;
    message: string;
    createdAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const ActiveRideScreen: React.FC<ActiveRideScreenProps> = ({ user, rideData, onBack }) => {
    const [ride, setRide] = useState(rideData);
    const [rideStatus, setRideStatus] = useState(rideData?.status || 'ACCEPTED');
    const [currentFare, setCurrentFare] = useState(rideData?.currentFare || rideData?.fare || 0);
    const [pooledRiders, setPooledRiders] = useState(rideData?.pooledRiders || []);
    const [otpCode, setOtpCode] = useState<string | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<RideChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [showSOS, setShowSOS] = useState(false);
    const socketRef = useRef<any>(null);
    const isDriver = user?.role === 'DRIVER';

    useEffect(() => {
        const socket = registerSocket(user._id || user.id, user.role || 'RIDER');
        socketRef.current = socket;

        socket.on('ride:status', (payload: any) => {
            if (payload?.status) {
                setRideStatus(payload.status);
                if (payload.status === 'COMPLETED') {
                    setTimeout(() => onBack(), 2000);
                }
            }
        });

        socket.on('ride:otp', (payload: any) => {
            if (payload?.otp) {
                setOtpCode(payload.otp);
                setRideStatus('ARRIVED');
            }
        });

        socket.on('ride:fare-update', (payload: any) => {
            if (payload?.currentFare) setCurrentFare(payload.currentFare);
        });

        socket.on('ride:pooled-rider-added', (payload: any) => {
            if (payload.pooledRiders) setPooledRiders(payload.pooledRiders);
            if (payload.currentFare) setCurrentFare(payload.currentFare);
        });

        socket.on('chat:message', (msg: any) => {
            if (!msg?.message) return;
            setChatMessages(prev => [...prev, { ...msg, createdAt: msg.createdAt || new Date().toISOString() }]);
        });

        // Load existing chat messages
        fetch(`${API_BASE_URL}/api/rides/${ride._id}/messages`)
            .then(r => r.ok ? r.json() : [])
            .then(d => setChatMessages(d || []))
            .catch(() => { });

        return () => {
            socket.removeAllListeners();
        };
    }, []);

    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !ride?._id) return;
        await fetch(`${API_BASE_URL}/api/rides/${ride._id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                senderId: user._id || user.id,
                senderRole: user.role || 'RIDER',
                message: chatInput.trim()
            })
        });
        setChatInput('');
    };

    const handleSOS = async () => {
        // Trigger SOS alert
        alert('🚨 SOS Alert Sent! Emergency services have been notified.');
        try {
            await fetch(`${API_BASE_URL}/api/rides/${ride._id}/sos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user._id || user.id,
                    userRole: user.role || 'RIDER',
                    location: ride.driverLocation || ride.pickup
                })
            });
        } catch (error) {
            console.error('SOS error:', error);
        }
    };

    const getStatusColor = () => {
        switch (rideStatus) {
            case 'ACCEPTED': return 'bg-blue-500';
            case 'ARRIVED': return 'bg-yellow-500';
            case 'IN_PROGRESS': return 'bg-green-500';
            case 'COMPLETED': return 'bg-gray-500';
            default: return 'bg-gray-400';
        }
    };

    const getStatusText = () => {
        switch (rideStatus) {
            case 'ACCEPTED': return isDriver ? 'Heading to Pickup' : 'Driver on the way';
            case 'ARRIVED': return isDriver ? 'Waiting for Rider' : 'Driver has arrived';
            case 'IN_PROGRESS': return 'Trip in Progress';
            case 'COMPLETED': return 'Trip Completed';
            default: return rideStatus;
        }
    };

    const otherPerson = isDriver ? ride.rider : ride.driver;
    const totalPassengers = 1 + (pooledRiders?.filter((r: any) => r.status === 'JOINED').length || 0);
    const fareReduction = ride.isPooled && pooledRiders?.length > 0
        ? Math.abs(pooledRiders.reduce((sum: number, r: any) => sum + (r.fareAdjustment || 0), 0))
        : 0;

    return (
        <div className="relative w-full h-screen bg-gradient-to-br from-leaf-50 to-white dark:from-zinc-950 dark:to-zinc-900 overflow-hidden">
            {/* Header */}
            <div className="absolute top-0 inset-x-0 z-50 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-zinc-800">
                <div className="flex items-center justify-between p-4">
                    <button
                        onClick={onBack}
                        className="size-12 bg-gray-100 dark:bg-zinc-800 rounded-2xl flex items-center justify-center"
                    >
                        <span className="material-icons-outlined dark:text-white">arrow_back</span>
                    </button>
                    <div className="flex-1 text-center">
                        <div className={`inline-flex items-center gap-2 px-4 py-2 ${getStatusColor()} text-white rounded-full text-sm font-black uppercase tracking-widest`}>
                            <div className="size-2 bg-white rounded-full animate-pulse"></div>
                            {getStatusText()}
                        </div>
                    </div>
                    <button
                        onClick={() => setShowSOS(true)}
                        className="size-12 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/20"
                    >
                        <span className="material-icons-outlined text-white">emergency</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="pt-20 pb-6 px-6 h-full overflow-y-auto">
                {/* Who's in the Car */}
                <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-6 mb-6 shadow-xl border border-gray-100 dark:border-zinc-800">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="size-14 bg-leaf-100 dark:bg-leaf-900/20 rounded-2xl flex items-center justify-center">
                            <span className="material-icons-outlined text-2xl text-leaf-600 dark:text-leaf-400">groups</span>
                        </div>
                        <div>
                            <h2 className="text-xl font-black dark:text-white">Who's in the Car?</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{totalPassengers} {totalPassengers === 1 ? 'Passenger' : 'Passengers'}</p>
                        </div>
                    </div>

                    {/* Primary Person (Driver or Rider) */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-zinc-800/50 rounded-2xl">
                            <img
                                src={otherPerson?.photoUrl || `https://i.pravatar.cc/150?u=${otherPerson?.id}`}
                                className="size-16 rounded-2xl object-cover border-2 border-leaf-500"
                                alt=""
                            />
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-lg font-black dark:text-white">{otherPerson?.name}</p>
                                    <span className="px-2 py-0.5 bg-leaf-500 text-white text-[10px] font-black rounded-full uppercase">
                                        {isDriver ? 'Rider' : 'Driver'}
                                    </span>
                                </div>
                                {!isDriver && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {otherPerson?.vehicle} • {otherPerson?.vehicleNumber}
                                    </p>
                                )}
                                <div className="flex items-center gap-1 mt-1">
                                    <span className="material-icons text-yellow-500 text-sm">star</span>
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{otherPerson?.rating?.toFixed(1) || '5.0'}</span>
                                </div>
                            </div>
                            <button
                                onClick={() => setChatOpen(true)}
                                className="size-12 bg-leaf-500 rounded-xl flex items-center justify-center shadow-lg shadow-leaf-500/20"
                            >
                                <span className="material-icons-outlined text-white">chat</span>
                            </button>
                        </div>

                        {/* Pooled Riders */}
                        {ride.isPooled && pooledRiders?.filter((r: any) => r.status === 'JOINED').map((rider: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/10 rounded-2xl border border-green-200 dark:border-green-800">
                                <div className="size-16 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center">
                                    <span className="material-icons-outlined text-2xl text-green-600 dark:text-green-400">person</span>
                                </div>
                                <div className="flex-1">
                                    <p className="text-lg font-black dark:text-white">{rider.firstName} {rider.lastName}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {rider.pickup?.address?.split(',')[0]} → {rider.dropoff?.address?.split(',')[0]}
                                    </p>
                                </div>
                                <span className="px-3 py-1 bg-green-500 text-white text-[10px] font-black rounded-full uppercase">Pooled</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Fare Information */}
                <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-6 mb-6 shadow-xl border border-gray-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="size-12 bg-green-100 dark:bg-green-900/20 rounded-xl flex items-center justify-center">
                                <span className="material-icons-outlined text-xl text-green-600 dark:text-green-400">payments</span>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Current Fare</p>
                                <p className="text-3xl font-black text-green-600 dark:text-green-400">₹{currentFare}</p>
                            </div>
                        </div>
                        {ride.isPooled && fareReduction > 0 && (
                            <div className="text-right">
                                <p className="text-xs text-gray-500 dark:text-gray-400">You Saved</p>
                                <p className="text-2xl font-black text-leaf-600 dark:text-leaf-400">₹{fareReduction}</p>
                            </div>
                        )}
                    </div>

                    {ride.isPooled && (
                        <div className="flex items-center gap-2 p-3 bg-leaf-50 dark:bg-leaf-900/10 rounded-xl border border-leaf-200 dark:border-leaf-800">
                            <span className="material-icons-outlined text-leaf-600 dark:text-leaf-400">eco</span>
                            <p className="text-xs font-bold text-leaf-700 dark:text-leaf-300">
                                Pooling saves money & reduces CO₂ emissions!
                            </p>
                        </div>
                    )}
                </div>

                {/* OTP Display (for riders when driver arrives) */}
                {!isDriver && rideStatus === 'ARRIVED' && otpCode && (
                    <div className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-[32px] p-6 mb-6 shadow-xl">
                        <div className="text-center">
                            <p className="text-sm font-black text-white/80 uppercase tracking-widest mb-2">Share OTP with Driver</p>
                            <div className="text-6xl font-black text-white tracking-wider">{otpCode}</div>
                            <p className="text-xs text-white/60 mt-2">Driver needs this to start the trip</p>
                        </div>
                    </div>
                )}

                {/* Trip Details */}
                <div className="bg-white dark:bg-zinc-900 rounded-[32px] p-6 shadow-xl border border-gray-100 dark:border-zinc-800">
                    <h3 className="text-lg font-black dark:text-white mb-4">Trip Details</h3>
                    <div className="space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="size-10 bg-blue-100 dark:bg-blue-900/20 rounded-xl flex items-center justify-center shrink-0">
                                <span className="material-icons-outlined text-blue-600 dark:text-blue-400">trip_origin</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pickup</p>
                                <p className="text-sm font-bold dark:text-white">{ride.pickup?.address}</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="size-10 bg-red-100 dark:bg-red-900/20 rounded-xl flex items-center justify-center shrink-0">
                                <span className="material-icons-outlined text-red-600 dark:text-red-400">location_on</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Dropoff</p>
                                <p className="text-sm font-bold dark:text-white">{ride.dropoff?.address}</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-zinc-800">
                            <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Distance</p>
                                <p className="text-lg font-black dark:text-white">{(ride.distance / 1000).toFixed(1)} km</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Duration</p>
                                <p className="text-lg font-black dark:text-white">{Math.round(ride.duration / 60)} min</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SOS Modal */}
            {showSOS && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[32px] p-8 shadow-2xl">
                        <div className="text-center">
                            <div className="size-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <span className="material-icons-outlined text-4xl text-white">emergency</span>
                            </div>
                            <h3 className="text-2xl font-black mb-2 dark:text-white">Emergency SOS</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
                                This will alert emergency services and share your live location. Use only in case of emergency.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowSOS(false)}
                                    className="flex-1 py-4 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-2xl font-black text-sm uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        handleSOS();
                                        setShowSOS(false);
                                    }}
                                    className="flex-[2] py-4 bg-red-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-red-500/20"
                                >
                                    Send SOS Alert
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Modal */}
            {chatOpen && (
                <div className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-xl flex flex-col h-full">
                    <div className="h-12 w-full flex items-center justify-between px-6 pt-10 mb-4 shrink-0">
                        <button onClick={() => setChatOpen(false)} className="size-12 bg-white/10 rounded-2xl flex items-center justify-center">
                            <span className="material-icons-outlined text-white">close</span>
                        </button>
                        <div className="text-center">
                            <p className="text-[10px] font-bold text-white/50 uppercase tracking-[.2em]">Live Chat</p>
                            <p className="text-xl font-black text-white">{otherPerson?.name}</p>
                        </div>
                        <div className="size-12"></div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                        {chatMessages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center opacity-30 text-white">
                                <span className="material-icons-outlined text-5xl mb-4">chat</span>
                                <p className="font-bold">Start the conversation...</p>
                            </div>
                        )}
                        {chatMessages.map((msg, idx) => (
                            <div key={`${msg.createdAt}-${idx}`} className={`flex ${msg.senderRole === user.role ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-[24px] px-6 py-4 text-sm shadow-xl ${msg.senderRole === user.role
                                    ? 'bg-leaf-600 text-white rounded-br-none'
                                    : 'bg-white text-black rounded-bl-none'
                                    }`}>
                                    <p className="font-medium leading-relaxed">{msg.message}</p>
                                    <p className={`text-[9px] mt-2 font-black uppercase tracking-widest ${msg.senderRole === user.role ? 'text-white/40' : 'text-black/30'}`}>
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

export default ActiveRideScreen;

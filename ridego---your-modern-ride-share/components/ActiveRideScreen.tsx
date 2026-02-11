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
                    setTimeout(() => onBack(), 3000);
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
        const msg = {
            senderId: user._id || user.id,
            senderRole: user.role || 'RIDER',
            message: chatInput.trim(),
            createdAt: new Date().toISOString()
        };

        // Optimistic update
        setChatMessages(prev => [...prev, msg]);
        setChatInput('');

        try {
            await fetch(`${API_BASE_URL}/api/rides/${ride._id}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msg)
            });
        } catch (error) {
            console.error('Chat error:', error);
        }
    };

    const handleSOS = async () => {
        alert('🚨 SOS Alert Sent! Emergency services and our safety team have been notified.');
        setShowSOS(false);
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

    const handleCompleteRide = async () => {
        if (!isDriver) return;
        try {
            const resp = await fetch(`${API_BASE_URL}/api/rides/${ride._id}/complete`, { method: 'POST' });
            if (resp.ok) setRideStatus('COMPLETED');
        } catch (e) { console.error(e); }
    };

    const getStatusTheme = () => {
        switch (rideStatus) {
            case 'ACCEPTED': return { color: 'bg-blue-600', text: isDriver ? 'Route to Pickup' : 'Driver Heading Over' };
            case 'ARRIVED': return { color: 'bg-amber-500', text: isDriver ? 'At Pickup Location' : 'Driver Arrived' };
            case 'IN_PROGRESS': return { color: 'bg-emerald-600', text: 'On Your Way' };
            case 'COMPLETED': return { color: 'bg-slate-700', text: 'Arrived at Destination' };
            default: return { color: 'bg-slate-400', text: rideStatus };
        }
    };

    const theme = getStatusTheme();
    const otherPerson = isDriver ? ride.rider : ride.driver;
    const totalPassengers = 1 + (pooledRiders?.filter((r: any) => r.status === 'APPROVED' || r.status === 'JOINED').length || 0);
    const fareReduction = (ride.isPooled && currentFare < (ride.fare || currentFare))
        ? (ride.fare - currentFare)
        : 0;

    return (
        <div className="fixed inset-0 z-[100] bg-white dark:bg-zinc-950 flex flex-col font-sans select-none">
            {/* --- Sticky Glass Header --- */}
            <div className="absolute top-0 inset-x-0 z-[110] bg-white/70 dark:bg-zinc-950/70 backdrop-blur-2xl border-b border-zinc-100 dark:border-zinc-800/50">
                <div className="h-20 px-6 flex items-center justify-between">
                    <button onClick={onBack} className="group p-2 -ml-2 rounded-full active:bg-zinc-100 dark:active:bg-zinc-800 transition-colors">
                        <span className="material-icons-outlined text-2xl dark:text-white">ios_share</span>
                    </button>

                    <div className="flex flex-col items-center">
                        <div className={`flex items-center gap-1.5 px-3 py-1 ${theme.color} rounded-full`}>
                            <div className="size-1.5 bg-white rounded-full animate-pulse shadow-[0_0_8px_white]" />
                            <span className="text-[10px] font-black text-white uppercase tracking-wider">{theme.text}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowSOS(true)}
                        className="size-10 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30 active:scale-90 transition-transform"
                    >
                        <span className="material-icons text-white text-xl">gpp_maybe</span>
                    </button>
                </div>
            </div>

            {/* --- Scrollable Content --- */}
            <div className="flex-1 overflow-y-auto px-6 pt-24 pb-32 space-y-6">

                {/* 1. People Section */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-black dark:text-white flex items-center gap-2">
                            Passengers
                            <span className="text-xs px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-md">{totalPassengers}</span>
                        </h2>
                    </div>

                    <div className="space-y-3">
                        {/* Primary Contact Card */}
                        <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-[24px] flex items-center gap-4">
                            <div className="relative group">
                                <img
                                    src={otherPerson?.photoUrl || `https://i.pravatar.cc/150?u=${otherPerson?.id}`}
                                    className="size-14 rounded-2xl object-cover ring-2 ring-emerald-500/20"
                                    alt=""
                                />
                                {otherPerson?.isVerified && (
                                    <div className="absolute -bottom-1 -right-1 size-5 bg-emerald-500 border-2 border-white dark:border-zinc-900 rounded-full flex items-center justify-center shadow-md">
                                        <span className="material-icons text-[10px] text-white">verified</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <h3 className="font-black text-lg dark:text-white truncate leading-tight">{otherPerson?.name}</h3>
                                <p className="text-xs font-bold text-zinc-400 mt-0.5">
                                    {isDriver ? 'Primary Rider' : `${otherPerson?.vehicle} • ${otherPerson?.vehicleNumber}`}
                                </p>
                                <div className="flex items-center gap-1 mt-1">
                                    <span className="material-icons text-amber-500 text-[14px]">star</span>
                                    <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{otherPerson?.rating?.toFixed(1) || '4.9'}</span>
                                </div>
                                {ride.accessibilityOptions && ride.accessibilityOptions.length > 0 && (
                                    <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md w-fit">
                                        <span className="material-icons text-[12px] text-blue-600 dark:text-blue-400">accessible</span>
                                        <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                                            {ride.accessibilityOptions[0]} Required
                                        </span>
                                    </div>
                                )}
                            </div>

                            <button onClick={() => setChatOpen(true)} className="size-12 bg-white dark:bg-zinc-800 rounded-2xl flex items-center justify-center shadow-sm border border-zinc-100 dark:border-zinc-700 active:scale-90 transition-all">
                                <span className="material-icons-outlined text-zinc-600 dark:text-white">chat</span>
                            </button>
                        </div>

                        {/* Pooled Riders Cells */}
                        {ride.isPooled && pooledRiders?.filter((r: any) => r.status === 'APPROVED' || r.status === 'JOINED').map((pr, i) => (
                            <div key={i} className="px-4 py-3 bg-white dark:bg-zinc-900 border border-emerald-500/10 dark:border-emerald-500/5 rounded-2xl flex items-center gap-3">
                                <div className="size-10 bg-emerald-100 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center">
                                    <span className="material-icons text-emerald-600 dark:text-emerald-400 text-lg">person</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <p className="font-black text-sm dark:text-white truncate">{pr.firstName} {pr.lastName}</p>
                                        {pr.isVerified && <span className="material-icons text-emerald-500 text-[14px]">verified</span>}
                                    </div>
                                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Pooled Rider</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-zinc-400 uppercase">Status</p>
                                    <p className="text-[10px] font-black text-emerald-600">{pr.status}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* 2. Fare & Savings Information */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-5 bg-emerald-600 rounded-[32px] text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden group">
                        <div className="absolute -right-2 -bottom-2 size-20 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                        <p className="text-[10px] font-black uppercase tracking-[.2em] opacity-60 mb-1">Current Fare</p>
                        <p className="text-3xl font-black">₹{currentFare}</p>
                        <div className="mt-3 flex items-center gap-1 opacity-80">
                            <span className="material-icons text-xs">payments</span>
                            <span className="text-[10px] font-bold">Cash/Online</span>
                        </div>
                    </div>

                    <div className="p-5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-[32px] shadow-sm flex flex-col justify-between">
                        <div>
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[.2em] mb-1">Your Savings</p>
                            <p className="text-2xl font-black text-emerald-600">₹{fareReduction || Math.round(currentFare * 0.2)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                            <span className="material-icons text-emerald-500 text-[14px]">eco</span>
                            <span className="text-[10px] font-black text-emerald-600 uppercase">Eco Choice</span>
                        </div>
                    </div>
                </div>

                {/* 3. OTP Section for Ride Start */}
                {rideStatus === 'ARRIVED' && !isDriver && otpCode && (
                    <div className="p-6 bg-gradient-to-br from-amber-400 to-orange-500 rounded-[32px] shadow-2xl shadow-orange-500/30 text-white text-center animate-in zoom-in duration-500">
                        <p className="text-[10px] font-black uppercase tracking-[.3em] opacity-80 mb-3">Share OTP with Driver</p>
                        <div className="flex justify-center gap-3">
                            {otpCode.split('').map((char, i) => (
                                <div key={i} className="size-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl font-black border border-white/20">
                                    {char}
                                </div>
                            ))}
                        </div>
                        <p className="text-[10px] font-bold mt-4 px-4 opacity-70 italic">Ensure your ride matches the vehicle number before boarding.</p>
                    </div>
                )}

                {/* 4. Journey Details */}
                <section className="p-6 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-[32px] space-y-5 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center gap-1.5">
                            <div className="size-3 rounded-full border-2 border-emerald-500 p-0.5"><div className="size-full bg-emerald-500 rounded-full" /></div>
                            <div className="w-0.5 h-10 border-r-2 border-dotted border-zinc-200 dark:border-zinc-800" />
                            <span className="material-icons text-lg text-red-500">location_on</span>
                        </div>
                        <div className="flex-1 space-y-4">
                            <div>
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Pickup</p>
                                <p className="text-sm font-black dark:text-white leading-snug">{ride.pickup?.address || 'Current Location'}</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Destination</p>
                                <p className="text-sm font-black dark:text-white leading-snug">{ride.dropoff?.address || 'Point of Interest'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-4 border-t border-zinc-50 dark:border-zinc-800">
                        <div className="text-center p-2 rounded-2xl bg-zinc-50 dark:bg-zinc-800/20">
                            <p className="text-[9px] font-black text-zinc-400 uppercase mb-1">Dist</p>
                            <p className="font-black text-sm dark:text-white">{(ride.distance / 1000).toFixed(1)}km</p>
                        </div>
                        <div className="text-center p-2 rounded-2xl bg-emerald-50 dark:bg-emerald-900/10">
                            <p className="text-[9px] font-black text-emerald-400 uppercase mb-1">Time</p>
                            <p className="font-black text-sm text-emerald-600 dark:text-emerald-400">{Math.round(ride.duration / 60)}min</p>
                        </div>
                        <div className="text-center p-2 rounded-2xl bg-zinc-50 dark:bg-zinc-800/20">
                            <p className="text-[9px] font-black text-zinc-400 uppercase mb-1">CO₂</p>
                            <p className="font-black text-sm dark:text-white">-{((ride.distance / 1000) * 0.12).toFixed(1)}kg</p>
                        </div>
                    </div>
                </section>
            </div>

            {/* --- Premium Bottom Action Bar --- */}
            <div className="absolute bottom-0 inset-x-0 p-6 z-[110] bg-gradient-to-t from-white via-white/90 to-transparent dark:from-zinc-950 dark:via-zinc-950/90 pointer-events-none">
                <div className="max-w-[430px] mx-auto pointer-events-auto">
                    {rideStatus === 'COMPLETED' ? (
                        <button onClick={onBack} className="w-full h-16 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-[24px] font-black text-sm uppercase tracking-[.2em] shadow-2xl active:scale-95 transition-all">
                            Done
                        </button>
                    ) : (
                        <div className="flex gap-4">
                            {!isDriver ? (
                                <button className="flex-1 h-16 bg-amber-500 text-white rounded-[24px] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 active:scale-95 transition-all">
                                    <span className="material-icons text-xl">share_location</span>
                                    Live Map
                                </button>
                            ) : (
                                <button onClick={handleCompleteRide} className="flex-1 h-16 bg-emerald-600 text-white rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all">
                                    Complete Trip
                                </button>
                            )}

                            <button onClick={() => setChatOpen(true)} className="size-16 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-[24px] flex items-center justify-center shadow-lg active:scale-90 transition-all relative">
                                <span className="material-icons-outlined text-zinc-600 dark:text-zinc-400">forum</span>
                                {chatMessages.length > 0 && <div className="absolute top-4 right-4 size-2.5 bg-red-500 rounded-full border-2 border-white dark:border-zinc-900" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* --- Modals (Chat, SOS) --- */}
            {chatOpen && (
                <div className="fixed inset-0 z-[200] bg-zinc-100 dark:bg-zinc-950 flex flex-col animate-in slide-in-from-bottom duration-500">
                    <div className="h-24 px-6 pt-10 flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                        <button onClick={() => setChatOpen(false)} className="size-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                            <span className="material-icons text-zinc-600 dark:text-zinc-400">close</span>
                        </button>
                        <div className="text-center">
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Live Chat</p>
                            <p className="font-black dark:text-white uppercase text-xs">{otherPerson?.name}</p>
                        </div>
                        <div className="size-10" />
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                        {chatMessages.map((msg, i) => {
                            const isMe = msg.senderRole === user.role;
                            return (
                                <div key={i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] px-5 py-3 rounded-[24px] ${isMe ? 'bg-emerald-600 text-white rounded-br-none' : 'bg-white dark:bg-zinc-800 dark:text-white rounded-bl-none border border-zinc-100 dark:border-zinc-700'} shadow-sm`}>
                                        <p className="text-sm font-bold leading-relaxed">{msg.message}</p>
                                        <p className={`text-[8px] mt-1.5 font-black uppercase tracking-tighter ${isMe ? 'text-white/50' : 'text-zinc-400'}`}>
                                            {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <form onSubmit={handleSendChat} className="p-6 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 pb-10">
                        <div className="bg-zinc-100 dark:bg-zinc-800 rounded-2xl p-2 flex gap-2">
                            <input
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Message your safe driver..."
                                className="flex-1 bg-transparent px-4 py-2 font-black text-sm dark:text-white outline-none placeholder:text-zinc-400"
                            />
                            <button type="submit" className="size-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white active:scale-95 transition-all">
                                <span className="material-icons text-xl">north</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {showSOS && (
                <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-center justify-center p-8 animate-in fade-in duration-300">
                    <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] p-8 text-center shadow-2xl scale-in-center">
                        <div className="size-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span className="material-icons text-4xl text-red-500">emergency_share</span>
                        </div>
                        <h3 className="text-2xl font-black mb-2 dark:text-white uppercase tracking-tight">Emergency Protocol</h3>
                        <p className="text-sm text-zinc-500 leading-relaxed mb-8">
                            Tapping 'Alert' will share your live trip telemetry with local emergency backup and our 24/7 safety response team.
                        </p>
                        <div className="space-y-3">
                            <button onClick={handleSOS} className="w-full py-4 bg-red-500 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-red-500/20 active:scale-95 transition-all">
                                ALERT SAFETY TEAM
                            </button>
                            <button onClick={() => setShowSOS(false)} className="w-full py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-2xl font-black text-xs uppercase tracking-widest">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ActiveRideScreen;


import React, { useEffect, useState } from 'react';

interface InboxScreenProps {
  onSelectChat: (chatId: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const formatTime = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const statusColor = (status: string) => {
  switch (status) {
    case 'IN_PROGRESS': return 'bg-leaf-500';
    case 'ACCEPTED': case 'ARRIVED': return 'bg-blue-500';
    case 'COMPLETED': return 'bg-gray-400';
    default: return 'bg-amber-400';
  }
};

const InboxScreen: React.FC<InboxScreenProps> = ({ onSelectChat }) => {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const userStr = localStorage.getItem('leaflift_user');
      if (!userStr) { setLoading(false); return; }
      const user = JSON.parse(userStr);
      const endpoint = user.role === 'DRIVER'
        ? `${API_BASE_URL}/api/rides/driver/${user._id}`
        : `${API_BASE_URL}/api/rides/user/${user._id}`;

      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data: any[] = await response.json();
          // Only show rides that have a driver-rider pairing (chat-eligible)
          const chatEligible = (data || []).filter((r: any) =>
            ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(r.status) &&
            r.driverId && r.userId
          );
          setThreads(chatEligible);
        }
      } catch (error) {
        console.error('Failed to load chats', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const userStr = localStorage.getItem('leaflift_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isDriver = user?.role === 'DRIVER';

  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mt-6 mb-6">
        <h1 className="text-4xl font-bold tracking-tight">Inbox</h1>
        <button className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
           <span className="material-icons-outlined text-xl">filter_list</span>
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <span className="material-icons-outlined text-3xl text-gray-300 dark:text-zinc-600 animate-spin">sync</span>
          <p className="text-xs text-gray-400 mt-2 font-semibold">Loading conversations...</p>
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-icons-outlined text-5xl text-gray-200 dark:text-zinc-700 mb-3">chat_bubble_outline</span>
          <p className="text-sm font-bold text-gray-400 dark:text-gray-500">No ride chats yet</p>
          <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">{isDriver ? 'Accept a ride to start chatting' : 'Book a ride to start chatting'}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {threads.map((ride) => {
            const lastMessage = ride.chat?.[ride.chat.length - 1];
            const hasUnread = lastMessage && lastMessage.senderRole !== user?.role;
            const partnerLabel = isDriver
              ? (ride.contact?.riderMasked || 'Rider')
              : (ride.contact?.driverMasked || 'Driver');
            const routeLabel = `${(ride.pickup?.address || 'Pickup').split(',')[0]} → ${(ride.dropoff?.address || 'Drop').split(',')[0]}`;

            return (
              <button
                key={ride._id}
                onClick={() => onSelectChat(ride._id)}
                className="w-full flex gap-3.5 p-3 -mx-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-2xl transition-all text-left group"
              >
                <div className="relative">
                  <div className="w-13 h-13 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                    <span className="material-icons-outlined text-xl text-gray-500 dark:text-gray-400">
                      {isDriver ? 'person' : 'directions_car'}
                    </span>
                  </div>
                  {/* Status dot */}
                  <div className={`absolute -bottom-0.5 -right-0.5 size-3.5 ${statusColor(ride.status)} rounded-full border-2 border-white dark:border-zinc-950`}></div>
                </div>
                <div className="flex-1 flex flex-col justify-center overflow-hidden border-b border-gray-100 dark:border-gray-800 pb-3.5 group-last:border-none">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className={`font-bold text-sm text-black dark:text-white ${hasUnread ? '' : 'font-semibold'}`}>
                      {partnerLabel}
                    </span>
                    <span className="text-[10px] text-gray-400 font-semibold">
                      {lastMessage ? formatTime(lastMessage.createdAt) : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 truncate">{routeLabel}</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-xs truncate flex-1 ${hasUnread ? 'text-gray-900 dark:text-white font-semibold' : 'text-gray-400 dark:text-zinc-500'}`}>
                      {lastMessage?.message || 'Tap to send a message'}
                    </p>
                    {hasUnread && (
                      <div className="size-2 rounded-full bg-leaf-500 flex-shrink-0"></div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default InboxScreen;

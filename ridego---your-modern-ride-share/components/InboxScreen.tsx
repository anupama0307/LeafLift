
import React, { useEffect, useState } from 'react';

interface InboxScreenProps {
  onSelectChat: (chatId: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const InboxScreen: React.FC<InboxScreenProps> = ({ onSelectChat }) => {
  const [threads, setThreads] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const userStr = localStorage.getItem('leaflift_user');
      if (!userStr) return;
      const user = JSON.parse(userStr);
      const endpoint = user.role === 'DRIVER'
        ? `${API_BASE_URL}/api/rides/driver/${user._id}`
        : `${API_BASE_URL}/api/rides/user/${user._id}`;

      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          const data = await response.json();
          setThreads(data || []);
        }
      } catch (error) {
        console.error('Failed to load chats', error);
      }
    };
    load();
  }, []);

  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mt-6 mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Inbox</h1>
        <button className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
           <span className="material-icons-outlined text-xl">filter_list</span>
        </button>
      </div>

      <div className="space-y-2">
        {threads.length === 0 && (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            No ride chats yet.
          </div>
        )}
        {threads.map((ride) => {
          const lastMessage = ride.chat?.[ride.chat.length - 1];
          return (
          <button 
            key={ride._id}
            onClick={() => onSelectChat(ride._id)}
            className="w-full flex gap-4 p-3 -mx-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-2xl transition-all text-left group"
          >
            <div className="relative">
              <div className="w-14 h-14 rounded-full bg-gray-200 dark:bg-zinc-800 flex items-center justify-center">
                <span className="material-icons-outlined text-xl text-gray-500">directions_car</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center overflow-hidden border-b border-gray-100 dark:border-gray-800 pb-4 group-last:border-none">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-lg text-black dark:text-white">
                  {ride.pickup?.address || 'Pickup'} → {ride.dropoff?.address || 'Drop'}
                </span>
                <span className="text-xs text-gray-400">{ride.status}</span>
              </div>
              <p className="text-sm truncate text-gray-500 dark:text-zinc-500">
                {lastMessage?.message || 'No messages yet'}
              </p>
            </div>
          </button>
        )})}
      </div>
    </div>
  );
};

export default InboxScreen;

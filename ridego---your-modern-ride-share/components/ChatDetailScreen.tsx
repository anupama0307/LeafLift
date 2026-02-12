
import React, { useEffect, useRef, useState } from 'react';
import { getSocket, joinRideRoom, leaveRideRoom } from '../src/services/realtime';

interface ChatDetailScreenProps {
  chatId: string;
  onBack: () => void;
}

interface ChatMessage {
  senderId?: string;
  senderRole?: string;
  message: string;
  createdAt: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

const ChatDetailScreen: React.FC<ChatDetailScreenProps> = ({ chatId, onBack }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [ride, setRide] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const userStr = localStorage.getItem('leaflift_user');
  const user = userStr ? JSON.parse(userStr) : null;
  const isRider = user?.role !== 'DRIVER';

  useEffect(() => {
    joinRideRoom(chatId);
    const socket = getSocket();
    const handleMessage = (msg: any) => {
      if (!msg?.message) return;
      setMessages((prev) => {
        const isDupe = prev.some(m => m.message === msg.message && m.senderRole === msg.senderRole && Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt || Date.now()).getTime()) < 3000);
        if (isDupe) return prev;
        return [...prev, { ...msg, createdAt: msg.createdAt || new Date().toISOString() }];
      });
    };
    socket.on('chat:message', handleMessage);
    return () => {
      socket.off('chat:message', handleMessage);
      leaveRideRoom(chatId);
    };
  }, [chatId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [rideRes, msgRes] = await Promise.all([
          fetch(`${API_BASE_URL}/api/rides/${chatId}`),
          fetch(`${API_BASE_URL}/api/rides/${chatId}/messages`)
        ]);
        if (rideRes.ok) {
          const rideData = await rideRes.json();
          setRide(rideData);
        }
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          setMessages(msgData || []);
        }
      } catch (error) {
        console.error('Failed to load chat', error);
      }
    };
    load();
  }, [chatId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const msgText = inputText.trim();
    const optimisticMsg = {
      senderId: user?._id,
      senderRole: user?.role || 'RIDER',
      message: msgText,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setInputText('');
    try {
      await fetch(`${API_BASE_URL}/api/rides/${chatId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: user?._id,
          senderRole: user?.role || 'RIDER',
          message: msgText
        })
      });
    } catch (err) {
      console.error('Failed to send message', err);
    }
  };

  const maskedPhone = isRider ? ride?.contact?.driverMasked : ride?.contact?.riderMasked;

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#121212] h-full overflow-hidden">
      <div className="flex items-center p-4 border-b border-gray-100 dark:border-gray-800">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800">
          <span className="material-icons-outlined">arrow_back</span>
        </button>
        <div className="size-10 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center ml-2">
          <span className="material-icons-outlined text-lg text-gray-500">{isRider ? 'directions_car' : 'person'}</span>
        </div>
        <div className="flex-1 ml-3">
          <h3 className="font-bold text-sm dark:text-white">{maskedPhone || (isRider ? 'Driver' : 'Rider')}</h3>
          <div className="flex items-center gap-2">
            <div className={`size-1.5 rounded-full ${ride?.status === 'IN_PROGRESS' ? 'bg-leaf-500' : ride?.status === 'COMPLETED' ? 'bg-gray-400' : 'bg-blue-500'}`}></div>
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{ride?.status || 'Active'}</span>
          </div>
        </div>
        {maskedPhone && (
          <button onClick={() => alert(`Call via masked number: ${maskedPhone}`)} className="size-10 rounded-full bg-leaf-50 dark:bg-leaf-900/20 flex items-center justify-center hover:scale-105 transition-transform">
            <span className="material-icons text-lg text-leaf-600 dark:text-leaf-400">phone</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-gray-400 text-center mt-12">No messages yet.</p>
        )}
        {messages.map((m, idx) => {
          const isMine = m.senderRole === user?.role;
          return (
            <div key={`${m.createdAt}-${idx}`} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                isMine
                  ? 'bg-black text-white dark:bg-white dark:text-black'
                  : 'bg-gray-100 dark:bg-zinc-800 dark:text-white'
              }`}>
                {m.message}
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </div>

      <div className="p-3 bg-white dark:bg-[#121212] border-t border-gray-100 dark:border-gray-800">
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full px-4 text-sm dark:text-white py-2.5"
          />
          <button
            type="submit"
            className="bg-black dark:bg-white text-white dark:text-black rounded-full px-4 font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatDetailScreen;

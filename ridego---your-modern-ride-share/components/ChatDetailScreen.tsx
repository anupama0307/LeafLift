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
      setMessages((prev) => [...prev, { ...msg, createdAt: msg.createdAt || new Date().toISOString() }]);
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
    await fetch(`${API_BASE_URL}/api/rides/${chatId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: user?._id,
        senderRole: user?.role || 'RIDER',
        message: inputText.trim()
      })
    });
    setInputText('');
  };

  const maskedPhone = isRider ? ride?.contact?.driverMasked : ride?.contact?.riderMasked;

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#121212] h-full overflow-hidden">
      <div className="flex items-center p-4 border-b border-gray-100 dark:border-gray-800">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800">
          <span className="material-icons-outlined">arrow_back</span>
        </button>
        <div className="flex-1 ml-2">
          <h3 className="font-bold text-sm">Ride Chat</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{ride?.status || 'Active'}</span>
            {maskedPhone && <span className="text-[10px] text-gray-400">• {maskedPhone}</span>}
          </div>
        </div>
        {maskedPhone && (
          <button onClick={() => alert(`Call via masked number: ${maskedPhone}`)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800">
            <span className="material-icons-outlined text-xl">phone</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => (
          <div key={`${m.createdAt}-${idx}`} className={`flex ${m.senderRole === user?.role ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              m.senderRole === user?.role
                ? 'bg-black text-white dark:bg-white dark:text-black rounded-tr-none'
                : 'bg-gray-100 dark:bg-zinc-800 rounded-tl-none'
            }`}>
              <p className="text-sm font-medium">{m.message}</p>
              <p className={`text-[10px] mt-1 ${m.senderRole === user?.role ? 'opacity-50' : 'text-gray-400'}`}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="p-4 bg-white dark:bg-[#121212] border-t border-gray-100 dark:border-gray-800">
        <form onSubmit={handleSend} className="flex gap-2 bg-gray-100 dark:bg-zinc-800 rounded-full p-1 pl-4 items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2"
          />
          <button
            type="submit"
            className="w-10 h-10 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"
          >
            <span className="material-icons-outlined text-lg">send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatDetailScreen;

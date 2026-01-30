
import React, { useState, useEffect, useRef } from 'react';
import { MESSAGES } from '../constants';

interface ChatDetailScreenProps {
  chatId: string;
  onBack: () => void;
}

const ChatDetailScreen: React.FC<ChatDetailScreenProps> = ({ chatId, onBack }) => {
  const driver = MESSAGES.find(m => m.id === chatId) || MESSAGES[0];
  const [messages, setMessages] = useState([
    { id: '1', text: driver.lastMessage, sender: 'driver', time: '2:45 PM' }
  ]);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newMsg = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages([...messages, newMsg]);
    setInputText('');

    // Fake reply
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        text: "Understood, I'm on my way!",
        sender: 'driver',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    }, 1500);
  };

  return (
    <div className="flex-1 flex flex-col bg-white dark:bg-[#121212] h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center p-4 border-b border-gray-100 dark:border-gray-800">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800">
          <span className="material-icons-outlined">arrow_back</span>
        </button>
        <div className="flex items-center gap-3 flex-1 ml-2">
          <img src={driver.driverPhoto} className="w-10 h-10 rounded-full" alt="" />
          <div>
            <h3 className="font-bold text-sm">{driver.driverName}</h3>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Active now</span>
            </div>
          </div>
        </div>
        <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800">
          <span className="material-icons-outlined text-xl">phone</span>
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              m.sender === 'user' 
                ? 'bg-black text-white dark:bg-white dark:text-black rounded-tr-none' 
                : 'bg-gray-100 dark:bg-zinc-800 rounded-tl-none'
            }`}>
              <p className="text-sm font-medium">{m.text}</p>
              <p className={`text-[10px] mt-1 ${m.sender === 'user' ? 'opacity-50' : 'text-gray-400'}`}>{m.time}</p>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
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


import React from 'react';
import { MESSAGES } from '../constants';
import { AppScreen } from '../types';

interface InboxScreenProps {
  onSelectChat: (chatId: string) => void;
}

const InboxScreen: React.FC<InboxScreenProps> = ({ onSelectChat }) => {
  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mt-6 mb-8">
        <h1 className="text-4xl font-bold tracking-tight">Inbox</h1>
        <button className="p-2 bg-gray-100 dark:bg-zinc-800 rounded-full">
           <span className="material-icons-outlined text-xl">filter_list</span>
        </button>
      </div>

      <div className="space-y-2">
        {MESSAGES.map((msg) => (
          <button 
            key={msg.id}
            onClick={() => onSelectChat(msg.id)}
            className="w-full flex gap-4 p-3 -mx-3 hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-2xl transition-all text-left group"
          >
            <div className="relative">
              <img src={msg.driverPhoto} alt={msg.driverName} className="w-14 h-14 rounded-full object-cover" />
              {msg.unread && (
                <div className="absolute top-0 right-0 w-3.5 h-3.5 bg-blue-600 border-2 border-white dark:border-black rounded-full"></div>
              )}
            </div>
            <div className="flex-1 flex flex-col justify-center overflow-hidden border-b border-gray-100 dark:border-gray-800 pb-4 group-last:border-none">
              <div className="flex justify-between items-center mb-1">
                <span className={`font-bold text-lg ${msg.unread ? 'text-black dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                  {msg.driverName}
                </span>
                <span className="text-xs text-gray-400">{msg.time}</span>
              </div>
              <p className={`text-sm truncate ${msg.unread ? 'font-bold text-black dark:text-white' : 'text-gray-500 dark:text-zinc-500'}`}>
                {msg.lastMessage}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default InboxScreen;

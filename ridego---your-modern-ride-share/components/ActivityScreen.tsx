
import React, { useState } from 'react';
import { ACTIVITY_HISTORY } from '../constants';

const ActivityScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Upcoming' | 'Past'>('Past');

  return (
    <div className="px-5 pb-24 pt-4 animate-in fade-in duration-500">
      <h1 className="text-4xl font-bold tracking-tight mt-6 mb-8">Activity</h1>

      {/* Tabs */}
      <div className="flex gap-4 mb-8">
        <button
          onClick={() => setActiveTab('Upcoming')}
          className={`px-6 py-2 rounded-full text-sm font-black transition-all ${activeTab === 'Upcoming' ? 'bg-leaf-600 text-white dark:bg-leaf-500 shadow-lg shadow-leaf-500/20' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400'}`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setActiveTab('Past')}
          className={`px-6 py-2 rounded-full text-sm font-black transition-all ${activeTab === 'Past' ? 'bg-leaf-600 text-white dark:bg-leaf-500 shadow-lg shadow-leaf-500/20' : 'bg-gray-100 dark:bg-zinc-800 text-gray-400'}`}
        >
          Past
        </button>
      </div>

      {activeTab === 'Upcoming' ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4">
            <span className="material-icons-outlined text-4xl opacity-30">event_busy</span>
          </div>
          <h2 className="text-xl font-bold">No upcoming trips</h2>
          <p className="text-sm text-gray-500 mt-2">Book a ride and it will show up here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ACTIVITY_HISTORY.map((item) => (
            <div key={item.id} className="flex gap-4 p-2 -mx-2 hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-2xl transition-colors cursor-pointer group">
              <div className="w-16 h-16 bg-gray-100 dark:bg-zinc-800 rounded-xl flex items-center justify-center">
                <span className="material-icons-outlined text-3xl opacity-60">directions_car</span>
              </div>
              <div className="flex-1 flex flex-col justify-center border-b border-gray-100 dark:border-gray-800 pb-4 group-last:border-none">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-lg leading-tight">{item.destination}</h3>
                  <span className="font-bold text-sm">{item.price !== '₹0.00' ? item.price : ''}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{item.date} • {item.carType}</p>
                <div className="flex gap-2">
                  <button className="bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Rebook</button>
                  <button className="bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Receipt</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityScreen;

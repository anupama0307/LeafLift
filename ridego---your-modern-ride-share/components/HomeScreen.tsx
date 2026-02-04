
import React from 'react';
import { MAIN_SUGGESTIONS, RECENT_LOCATIONS } from '../constants';

interface HomeScreenProps {
  onOpenPlan: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ onOpenPlan }) => {
  return (
    <div className="pb-20 pt-4 bg-white dark:bg-black">
      {/* Search Bar */}
      <div className="px-4 py-4">
        <div
          onClick={onOpenPlan}
          className="bg-white dark:bg-zinc-900 rounded-2xl flex items-center p-1.5 shadow-md shadow-black/5 dark:shadow-none border border-gray-100 dark:border-zinc-800 cursor-pointer hover:border-leaf-500/50 transition-all"
        >
          <div className="flex items-center flex-1 pl-4 gap-3">
            <span className="material-icons-outlined text-leaf-600 dark:text-leaf-500">search</span>
            <span className="text-lg font-bold text-gray-400 dark:text-zinc-500">Where to?</span>
          </div>
          <button className="bg-leaf-50 dark:bg-zinc-800 flex items-center gap-2 px-5 py-2.5 rounded-xl shadow-sm text-sm font-black text-leaf-700 dark:text-leaf-400">
            <span className="material-icons-outlined text-sm">schedule</span>
            Now
            <span className="material-icons-outlined text-xs">expand_more</span>
          </button>
        </div>
      </div>

      {/* Suggestions Grid */}
      <div className="px-4 mt-2">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-black dark:text-white">Suggestions</h2>
          <span className="text-sm font-bold text-gray-500 dark:text-zinc-400 cursor-pointer">See all</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {MAIN_SUGGESTIONS.map((item) => (
            <div
              key={item.id}
              onClick={onOpenPlan}
              className="flex flex-col items-center gap-1 cursor-pointer hover:scale-105 transition-transform"
            >
              <div className="relative bg-gray-50 dark:bg-zinc-900 w-full aspect-square rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100 dark:border-zinc-800 group-hover:bg-leaf-50 dark:group-hover:bg-leaf-900/20 transition-colors">
                {item.isCustomIcon ? (
                  <span className="material-icons-outlined text-3xl opacity-60 text-black dark:text-white group-hover:text-leaf-600 transition-colors">{item.iconUrl}</span>
                ) : (
                  <img alt={item.label} className="w-12 h-12 object-contain dark:brightness-110 group-hover:scale-110 transition-transform" src={item.iconUrl} />
                )}
                {item.promo && (
                  <div className="absolute top-1 left-1 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                    {item.promo}
                  </div>
                )}
              </div>
              <span className="text-xs font-bold text-black dark:text-white">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Promo Banner */}
      <div className="px-4 mt-8">
        <div className="bg-gradient-to-br from-black to-zinc-800 dark:from-leaf-500 dark:to-leaf-600 rounded-3xl p-6 flex justify-between items-center relative overflow-hidden h-44 shadow-2xl shadow-leaf-500/10">
          <div className="z-10 max-w-[65%]">
            <h3 className="text-2xl font-black text-white dark:text-white leading-tight">Go bigger with RideXL</h3>
            <p className="text-zinc-400 dark:text-leaf-100 text-xs mt-1 font-bold">Premium comfort for the whole group</p>
            <button
              onClick={onOpenPlan}
              className="mt-5 bg-leaf-500 dark:bg-white text-white dark:text-leaf-700 px-6 py-3 rounded-xl text-sm font-black flex items-center gap-2 hover:scale-105 transition-all shadow-lg active:scale-95"
            >
              Request XL
              <span className="material-icons-outlined text-sm">arrow_forward</span>
            </button>
          </div>
          <div className="absolute top-0 right-0 w-32 h-32 bg-leaf-400/20 rounded-full -mr-16 -mt-16 blur-3xl"></div>
          <img alt="Banner illustration" className="absolute -right-4 -bottom-4 w-48 h-48 object-cover opacity-80 mix-blend-overlay dark:mix-blend-normal" src="https://lh3.googleusercontent.com/aida-public/AB6AXuC5VZq8ozBWKxdIXheBuRjFjPN28AcpjDAVyw7sefwkXvZ9QvN_MzlRcuuBTr81dRjCJ6hojIBSYoDPWAdCJgwd06dqFRbxHg03W9sGlqtQMvredUVSYHgid9gFGB-DvnNErIibWSmt3YdvHOWl56aXwlOJaA3m5jRagvZpJKk4_GU6iw9pSqpTWD-NNsgbGZmmmOfFQrUBVxgVZcLxFfoXTZ34kF1-LBw1dzk0O1UMzg3fFDdBUNdKEUsPvMwImYlUqloR0-ZsYrc" />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="mt-8 px-4">
        {RECENT_LOCATIONS.map((loc) => (
          <div
            key={loc.id}
            onClick={onOpenPlan}
            className="flex items-center gap-4 py-4 border-b border-gray-100 dark:border-zinc-900 last:border-none cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-900/50 px-2 -mx-2 rounded-lg transition-colors"
          >
            <div className="w-10 h-10 bg-[#f3f3f3] dark:bg-zinc-800 rounded-full flex items-center justify-center">
              <span className="material-icons-outlined text-gray-600 dark:text-zinc-400">{loc.icon}</span>
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-black dark:text-white">{loc.name}</h4>
              <p className="text-xs text-gray-500 dark:text-zinc-500">{loc.address}</p>
            </div>
            <span className="material-icons-outlined text-gray-400 dark:text-zinc-600 text-sm">chevron_right</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HomeScreen;

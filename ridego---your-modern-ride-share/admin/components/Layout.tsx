import React from 'react';
import { AdminScreen } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: AdminScreen;
  setCurrentScreen: (s: AdminScreen) => void;
  toggleDarkMode: () => void;
  isDark: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, currentScreen, setCurrentScreen, toggleDarkMode, isDark }) => {
  const tabs: { screen: AdminScreen; icon: string; label: string }[] = [
    { screen: AdminScreen.DASHBOARD, icon: 'dashboard', label: 'Home' },
    { screen: AdminScreen.DEMAND, icon: 'trending_up', label: 'Demand' },
    { screen: AdminScreen.FLEET, icon: 'local_shipping', label: 'Fleet' },
    { screen: AdminScreen.POOLING, icon: 'groups', label: 'Pooling' },
    { screen: AdminScreen.ECO, icon: 'eco', label: 'Eco' },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Top Bar */}
      <div className="flex justify-between items-center px-6 pt-4 pb-2 bg-white dark:bg-zinc-950 z-10">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-xl bg-leaf-500 flex items-center justify-center shadow-lg shadow-leaf-500/20">
            <span className="material-icons text-white text-lg">admin_panel_settings</span>
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-tight text-gray-900 dark:text-white">LeafLift</span>
            <span className="text-[10px] font-bold text-leaf-600 dark:text-leaf-400 block -mt-0.5 tracking-widest uppercase">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleDarkMode} className="size-9 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center hover:scale-105 transition-transform">
            <span className="material-icons-outlined text-sm text-leaf-600 dark:text-leaf-400">
              {isDark ? 'light_mode' : 'dark_mode'}
            </span>
          </button>
          <button className="size-9 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center hover:scale-105 transition-transform relative">
            <span className="material-icons-outlined text-sm">notifications</span>
            <div className="absolute -top-0.5 -right-0.5 size-3 bg-red-500 rounded-full border-2 border-white dark:border-zinc-950"></div>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar relative">
        {children}
      </div>

      {/* Bottom Navigation */}
      <div className="bg-white dark:bg-zinc-950 border-t border-gray-100 dark:border-gray-800 flex justify-around items-center pt-3 pb-8 px-2 z-50">
        {tabs.map((tab) => {
          const isActive = currentScreen === tab.screen;
          return (
            <button
              key={tab.screen}
              onClick={() => setCurrentScreen(tab.screen)}
              className={`flex flex-col items-center gap-1 transition-all flex-1 ${isActive ? 'opacity-100 text-leaf-600 dark:text-leaf-400' : 'opacity-40 hover:opacity-70 dark:text-white'}`}
            >
              <div className={`size-10 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-leaf-50 dark:bg-leaf-900/20 mb-0.5' : ''}`}>
                <span className="material-icons-outlined text-2xl">{tab.icon}</span>
              </div>
              <span className="text-[10px] font-black tracking-tight">{tab.label}</span>
            </button>
          );
        })}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-gray-100 dark:bg-zinc-800 rounded-full"></div>
      </div>
    </div>
  );
};

export default Layout;

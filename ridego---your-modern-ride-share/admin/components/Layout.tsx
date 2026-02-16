import React, { useState } from 'react';
import { AdminScreen } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: AdminScreen;
  setCurrentScreen: (screen: AdminScreen) => void;
  isDark: boolean;
  toggleDarkMode: () => void;
}

const navItems: { screen: AdminScreen; label: string; icon: string; }[] = [
  { screen: AdminScreen.DASHBOARD, label: 'Dashboard', icon: 'dashboard' },
  { screen: AdminScreen.DEMAND, label: 'Demand', icon: 'analytics' },
  { screen: AdminScreen.FLEET, label: 'Fleet', icon: 'directions_car' },
  { screen: AdminScreen.POOLING, label: 'Pooling', icon: 'group' },
  { screen: AdminScreen.ECO, label: 'Sustainability', icon: 'eco' },
  { screen: AdminScreen.NOTIFICATIONS, label: 'Notifications', icon: 'notifications' },
];

const Layout: React.FC<LayoutProps> = ({ children, currentScreen, setCurrentScreen, isDark, toggleDarkMode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-black">
      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-56 bg-white dark:bg-black border-r border-gray-200 dark:border-zinc-900 flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Brand */}
        <div className="p-4 border-b border-gray-100 dark:border-zinc-900">
          <div className="flex items-center gap-2.5">
            <div className="size-8 bg-green-600 rounded-lg flex items-center justify-center">
              <span className="material-icons text-white text-base">eco</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 dark:text-white leading-none">LeafLift</h1>
              <p className="text-[9px] font-semibold text-gray-400 mt-0.5">Admin Console</p>
            </div>
          </div>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          <div className="space-y-0.5">
            {navItems.map(item => {
              const active = currentScreen === item.screen;
              return (
                <button key={item.screen} onClick={() => { setCurrentScreen(item.screen); setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${active ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900'}`}>
                  <span className={`material-icons text-base ${active ? 'text-blue-500' : 'text-gray-400 dark:text-gray-500'}`}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Dark Mode + Info */}
        <div className="p-3 border-t border-gray-100 dark:border-zinc-900">
          <button onClick={toggleDarkMode}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900 transition-colors">
            <span className="material-icons text-base">{isDark ? 'light_mode' : 'dark_mode'}</span>
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="bg-white dark:bg-black border-b border-gray-200 dark:border-zinc-900 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden size-8 rounded-lg bg-gray-100 dark:bg-zinc-900 flex items-center justify-center">
              <span className="material-icons text-base text-gray-500">{sidebarOpen ? 'close' : 'menu'}</span>
            </button>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">
              {navItems.find(n => n.screen === currentScreen)?.label || 'Dashboard'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-400 hidden sm:inline">
              {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
            <div className="size-7 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="material-icons text-white" style={{ fontSize: '14px' }}>person</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-black border-t border-gray-200 dark:border-zinc-900 px-2 py-1.5 lg:hidden z-30">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 5).map(item => {
            const active = currentScreen === item.screen;
            return (
              <button key={item.screen} onClick={() => setCurrentScreen(item.screen)}
                className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg ${active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'}`}>
                <span className="material-icons" style={{ fontSize: '18px' }}>{item.icon}</span>
                <span className="text-[8px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default Layout;

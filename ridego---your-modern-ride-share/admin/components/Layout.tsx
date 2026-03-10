import React, { useState } from 'react';
import { AdminScreen } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: AdminScreen;
  setCurrentScreen: (screen: AdminScreen) => void;
}

const navItems: { screen: AdminScreen; label: string }[] = [
  { screen: AdminScreen.DASHBOARD, label: 'Overview' },
  { screen: AdminScreen.DEMAND, label: 'Demand' },
  { screen: AdminScreen.FLEET, label: 'Fleet' },
  { screen: AdminScreen.POOLING, label: 'Pooling' },
  { screen: AdminScreen.ECO, label: 'Sustainability' },
  { screen: AdminScreen.NOTIFICATIONS, label: 'Alerts' },
];

const Layout: React.FC<LayoutProps> = ({ children, currentScreen, setCurrentScreen }) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-black">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 md:px-8 py-4 mb-2">
        <div className="flex items-center gap-6 lg:gap-12">
          <h1 className="text-xl font-bold tracking-tight text-white">leaflift</h1>
          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center bg-zinc-900 rounded-full p-1 border border-zinc-800">
            {navItems.map(item => (
              <button
                key={item.screen}
                onClick={() => setCurrentScreen(item.screen)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  currentScreen === item.screen
                    ? 'bg-white text-black'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2 bg-zinc-900 rounded-full border border-zinc-800 text-zinc-400 hover:text-white transition-colors">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          </button>
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full pl-1 pr-3 py-1">
            <div className="w-8 h-8 rounded-full bg-accent-purple flex items-center justify-center">
              <span className="material-icons text-white" style={{ fontSize: '16px' }}>person</span>
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold leading-none text-white">Admin</p>
              <p className="text-[10px] text-zinc-500 leading-none">console</p>
            </div>
          </div>
          {/* Mobile menu button */}
          <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="md:hidden p-2 bg-zinc-900 rounded-full border border-zinc-800 text-zinc-400 hover:text-white">
            <span className="material-icons text-lg">{mobileNavOpen ? 'close' : 'menu'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Nav Dropdown */}
      {mobileNavOpen && (
        <div className="md:hidden mx-4 mb-4 bg-zinc-900 rounded-2xl border border-zinc-800 p-2 animate-fade-in">
          {navItems.map(item => (
            <button
              key={item.screen}
              onClick={() => { setCurrentScreen(item.screen); setMobileNavOpen(false); }}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                currentScreen === item.screen
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <main className="flex-1 px-4 md:px-8 pb-8 overflow-y-auto">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-lg border-t border-zinc-800 px-2 py-1.5 md:hidden z-30">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 5).map(item => (
            <button
              key={item.screen}
              onClick={() => setCurrentScreen(item.screen)}
              className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg transition-colors ${
                currentScreen === item.screen ? 'text-accent-purple' : 'text-zinc-500'
              }`}
            >
              <span className="text-[9px] font-semibold">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default Layout;


import React from 'react';
import { AppScreen } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentScreen: AppScreen;
  setCurrentScreen: (screen: AppScreen) => void;
  toggleDarkMode: () => void;
  isAuthenticated: boolean;
  user?: any;
}

const Layout: React.FC<LayoutProps> = ({ children, currentScreen, setCurrentScreen, toggleDarkMode, isAuthenticated, user }) => {
  const isDriver = user?.role === 'DRIVER';
  const isSpecialScreen = currentScreen === AppScreen.PLAN_RIDE ||
    currentScreen === AppScreen.CHAT_DETAIL ||
    currentScreen === AppScreen.DRIVER_DASHBOARD ||
    !isAuthenticated;

  const NavItem: React.FC<{ screen: AppScreen; icon: string; label: string }> = ({ screen, icon, label }) => {
    const isActive = currentScreen === screen;
    return (
      <button
        onClick={() => setCurrentScreen(screen)}
        className={`flex flex-col items-center gap-1 transition-all flex-1 ${isActive ? 'opacity-100 text-leaf-600 dark:text-leaf-400' : 'opacity-40 hover:opacity-70 dark:text-white'}`}
      >
        <div className={`size-10 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-leaf-50 dark:bg-leaf-900/20 mb-0.5' : ''}`}>
          <span className="material-icons-outlined text-2xl">{icon}</span>
        </div>
        <span className="text-[10px] font-black tracking-tight">{label}</span>
      </button>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Top Bar / Status Bar (Simulated) */}
      {!isSpecialScreen && (
        <div className="flex justify-between items-center px-8 pt-4 pb-2">
          <span className="text-sm font-semibold">9:41</span>
          <div className="flex gap-1.5 items-center">
            <button onClick={toggleDarkMode} className="material-icons-outlined text-sm text-leaf-600 dark:text-leaf-400 hover:opacity-60 transition-opacity">
              {document.documentElement.classList.contains('dark') ? 'light_mode' : 'dark_mode'}
            </button>
            <span className="material-icons-outlined text-sm opacity-50">signal_cellular_alt</span>
            <span className="material-icons-outlined text-sm opacity-50">wifi</span>
            <span className="material-icons-outlined text-sm rotate-90 opacity-50">battery_full</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto hide-scrollbar relative">
        {children}
      </div>

      {/* Premium Navigation Bar (Sticky at bottom) */}
      {!isSpecialScreen && (
        <div className="fixed bottom-0 inset-x-0 z-[100] p-6 pointer-events-none">
          <div className="max-w-[430px] mx-auto bg-white/70 dark:bg-zinc-950/70 backdrop-blur-2xl border border-zinc-100 dark:border-zinc-800/50 rounded-[32px] flex justify-around items-center py-4 px-2 shadow-2xl pointer-events-auto">
            {isDriver ? (
              <>
                <NavItem screen={AppScreen.DRIVER_DASHBOARD} icon="dashboard" label="Home" />
                <NavItem screen={AppScreen.INBOX} icon="chat_bubble_outline" label="Inbox" />
                <NavItem screen={AppScreen.ACCOUNT} icon="person" label="Account" />
              </>
            ) : (
              <>
                <NavItem screen={AppScreen.HOME} icon="home" label="Home" />
                <NavItem screen={AppScreen.ACTIVITY} icon="receipt_long" label="History" />
                <NavItem screen={AppScreen.INBOX} icon="chat_bubble_outline" label="Inbox" />
                <NavItem screen={AppScreen.ACCOUNT} icon="person" label="Account" />
              </>
            )}
          </div>
        </div>
      )}


      {/* Special Floating Navigation for Driver Dashboard Mode */}
      {currentScreen === AppScreen.DRIVER_DASHBOARD && (
        <div className="absolute bottom-8 left-0 right-0 z-50 px-8 flex justify-between pointer-events-none">
          <button
            onClick={() => setCurrentScreen(AppScreen.ACCOUNT)}
            className="size-14 bg-white dark:bg-zinc-900 rounded-full shadow-2xl flex items-center justify-center pointer-events-auto border border-gray-100 dark:border-zinc-700 hover:scale-105 transition-transform"
          >
            <span className="material-icons-outlined">person</span>
          </button>
          <button
            onClick={() => setCurrentScreen(AppScreen.INBOX)}
            className="size-14 bg-white dark:bg-zinc-900 rounded-full shadow-2xl flex items-center justify-center pointer-events-auto border border-gray-100 dark:border-zinc-700 hover:scale-105 transition-transform"
          >
            <span className="material-icons-outlined">chat_bubble</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default Layout;

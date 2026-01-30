
import React, { useState, useEffect } from 'react';
import { AppScreen } from './types';
import Layout from './components/Layout';
import HomeScreen from './components/HomeScreen';
import PlanRideScreen from './components/PlanRideScreen';
import AccountScreen from './components/AccountScreen';
import ServicesScreen from './components/ServicesScreen';
import AuthScreen from './components/AuthScreen';
import ActivityScreen from './components/ActivityScreen';
import InboxScreen from './components/InboxScreen';
import ChatDetailScreen from './components/ChatDetailScreen';
import DriverDashboard from './components/DriverDashboard';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.AUTH);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const handleAuthSuccess = (userData: any) => {
    setUser(userData);
    setIsAuthenticated(true);
    if (userData.role === 'DRIVER') {
      setCurrentScreen(AppScreen.DRIVER_DASHBOARD);
    } else {
      setCurrentScreen(AppScreen.HOME);
    }
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    setUser(null);
    setCurrentScreen(AppScreen.AUTH);
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    setCurrentScreen(AppScreen.CHAT_DETAIL);
  };

  const renderScreen = () => {
    if (!isAuthenticated) return (
      <AuthScreen 
        onAuthSuccess={handleAuthSuccess} 
        toggleTheme={() => setIsDarkMode(!isDarkMode)} 
        isDark={isDarkMode}
      />
    );

    switch (currentScreen) {
      case AppScreen.DRIVER_DASHBOARD:
        return <DriverDashboard user={user} />;
      case AppScreen.HOME:
        return <HomeScreen onOpenPlan={() => setCurrentScreen(AppScreen.PLAN_RIDE)} />;
      case AppScreen.SERVICES:
        return <ServicesScreen />;
      case AppScreen.ACTIVITY:
        return <ActivityScreen />;
      case AppScreen.INBOX:
        return <InboxScreen onSelectChat={handleSelectChat} />;
      case AppScreen.CHAT_DETAIL:
        return <ChatDetailScreen chatId={activeChatId!} onBack={() => setCurrentScreen(AppScreen.INBOX)} />;
      case AppScreen.PLAN_RIDE:
        return <PlanRideScreen onBack={() => setCurrentScreen(AppScreen.HOME)} />;
      case AppScreen.ACCOUNT:
        return <AccountScreen user={user} onSignOut={handleSignOut} />;
      default:
        return user?.role === 'DRIVER' ? <DriverDashboard user={user} /> : <HomeScreen onOpenPlan={() => setCurrentScreen(AppScreen.PLAN_RIDE)} />;
    }
  };

  return (
    <div className="flex justify-center min-h-screen bg-[#f3f3f3] dark:bg-zinc-950 transition-colors duration-300">
      <div className="w-full max-w-[430px] min-h-screen bg-white dark:bg-black flex flex-col relative shadow-2xl overflow-hidden">
        <Layout 
          currentScreen={currentScreen} 
          setCurrentScreen={setCurrentScreen}
          toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          isAuthenticated={isAuthenticated}
          user={user}
        >
          {renderScreen()}
        </Layout>
      </div>
    </div>
  );
};

export default App;

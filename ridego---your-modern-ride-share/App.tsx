
import React, { useState, useEffect } from 'react';
import { AppScreen } from './types';
import Layout from './components/Layout';
import HomeScreen from './components/HomeScreen';
import PlanRideScreen from './components/PlanRideScreen';
import AccountScreen from './components/AccountScreen';
import AuthScreen from './components/AuthScreen';
import ActivityScreen from './components/ActivityScreen';
import InboxScreen from './components/InboxScreen';
import ChatDetailScreen from './components/ChatDetailScreen';
import DriverDashboard from './components/DriverDashboard';
import { auth } from './src/firebase';
import { signOut } from 'firebase/auth';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.AUTH);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [selectedVehicleCategory, setSelectedVehicleCategory] = useState<string | undefined>(undefined);

  useEffect(() => {
    const savedUser = localStorage.getItem('leaflift_user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData);
      setIsAuthenticated(true);
      if (userData.role === 'DRIVER') {
        setCurrentScreen(AppScreen.DRIVER_DASHBOARD);
      } else {
        setCurrentScreen(AppScreen.HOME);
      }
    }
  }, []);

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
    localStorage.setItem('leaflift_user', JSON.stringify(userData));
    if (userData.role === 'DRIVER') {
      setCurrentScreen(AppScreen.DRIVER_DASHBOARD);
    } else {
      setCurrentScreen(AppScreen.HOME);
    }
  };

  const handleSignOut = async () => {
    try {
      // Sign out from Firebase if user was authenticated via Google
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (error) {
      console.error('Error signing out from Firebase:', error);
    }

    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem('leaflift_user');
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
        return <HomeScreen onOpenPlan={(vehicleCategory?: string) => {
          setSelectedVehicleCategory(vehicleCategory);
          setCurrentScreen(AppScreen.PLAN_RIDE);
        }} />;
      case AppScreen.ACTIVITY:
        return <ActivityScreen />;
      case AppScreen.INBOX:
        return <InboxScreen onSelectChat={handleSelectChat} />;
      case AppScreen.CHAT_DETAIL:
        return <ChatDetailScreen chatId={activeChatId!} onBack={() => setCurrentScreen(AppScreen.INBOX)} />;
      case AppScreen.PLAN_RIDE:
        return <PlanRideScreen onBack={() => setCurrentScreen(AppScreen.HOME)} initialVehicleCategory={selectedVehicleCategory} />;
      case AppScreen.ACCOUNT:
        return <AccountScreen user={user} onSignOut={handleSignOut} />;
      default:
        return user?.role === 'DRIVER' ? <DriverDashboard user={user} /> : <HomeScreen onOpenPlan={(vehicleCategory?: string) => {
          setSelectedVehicleCategory(vehicleCategory);
          setCurrentScreen(AppScreen.PLAN_RIDE);
        }} />;
    }
  };

  return (
    <div className="flex justify-center min-h-screen bg-[#f3f3f3] dark:bg-zinc-950 transition-colors duration-300">
      <div className="w-full max-w-[430px] min-h-screen bg-white dark:bg-zinc-950 flex flex-col relative shadow-2xl overflow-hidden">
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

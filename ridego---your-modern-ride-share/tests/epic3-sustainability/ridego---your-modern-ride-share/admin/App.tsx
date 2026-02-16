import React, { useState, useEffect } from 'react';
import { AdminScreen } from './types';
import Layout from './components/Layout';
import DashboardHome from './components/DashboardHome';
import DemandScreen from './components/DemandScreen';
import FleetScreen from './components/FleetScreen';
import PoolingAnalytics from './components/PoolingAnalytics';
import SustainabilityDashboard from './components/SustainabilityDashboard';
import NotificationsScreen from './components/NotificationsScreen';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AdminScreen>(AdminScreen.DASHBOARD);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  const renderScreen = () => {
    switch (currentScreen) {
      case AdminScreen.DASHBOARD:
        return <DashboardHome />;
      case AdminScreen.DEMAND:
        return <DemandScreen />;
      case AdminScreen.FLEET:
        return <FleetScreen />;
      case AdminScreen.POOLING:
        return <PoolingAnalytics />;
      case AdminScreen.ECO:
        return <SustainabilityDashboard />;
      case AdminScreen.NOTIFICATIONS:
        return <NotificationsScreen />;
      default:
        return <DashboardHome />;
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f3f3f3] dark:bg-black transition-colors duration-300">
      {/* Responsive container: full-width on desktop, centered phone on small viewports */}
      <div className="w-full min-h-screen bg-white dark:bg-black flex flex-col relative overflow-hidden">
        <Layout
          currentScreen={currentScreen}
          setCurrentScreen={setCurrentScreen}
          toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
          isDark={isDarkMode}
        >
          {renderScreen()}
        </Layout>
      </div>
    </div>
  );
};

export default App;

import React, { useState } from 'react';
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

  const renderScreen = () => {
    switch (currentScreen) {
      case AdminScreen.DASHBOARD:
        return <DashboardHome onNavigate={setCurrentScreen} />;
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
    <div className="min-h-screen bg-black text-white">
      <Layout currentScreen={currentScreen} setCurrentScreen={setCurrentScreen}>
        {renderScreen()}
      </Layout>
    </div>
  );
};

export default App;

import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import EmergencyModal from './components/EmergencyModal';
import EmergencyLiveTracker from './components/EmergencyLiveTracker';
import AuthModal from './components/AuthModal';
import Dashboard from './components/Dashboard';
import { api } from './services/api';
import { HeartPulse, ShieldCheck, PhoneCall, AlertCircle } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  
  // Initialize view from URL hash if valid, otherwise fallback to 'home'
  const getInitialView = () => {
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    if (['home', 'dashboard', 'emergency-tracker'].includes(hash)) {
      return hash;
    }
    return 'home';
  };
  const [currentView, setCurrentView] = useState(getInitialView);
  
  // Modals state
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('login');

  // Active emergency tracking state
  const [activeEmergencyData, setActiveEmergencyData] = useState(null);

  // Centralized navigation handler: always closes any blocking modals and updates view
  const handleNavigate = (view) => {
    if (view === 'dashboard' && (!user || user.emailVerified === false || user.phoneVerified === false)) {
      handleOpenAuth('login');
      return;
    }
    setIsEmergencyModalOpen(false);
    setIsAuthModalOpen(false);
    setCurrentView(view);
    if (window.location.hash !== `#${view}`) {
      window.history.pushState(null, '', `#${view}`);
    }
  };

  // Sync state with browser hash navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (['home', 'dashboard', 'emergency-tracker'].includes(hash)) {
        if (hash === 'dashboard' && (!user || user.emailVerified === false || user.phoneVerified === false)) {
          handleOpenAuth('login');
          return;
        }
        setIsEmergencyModalOpen(false);
        setIsAuthModalOpen(false);
        setCurrentView(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user]);

  // Check existing session
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('vital_token');
      if (token) {
        try {
          const res = await api.getMe();
          if (res.success && res.user) {
            if (res.user.emailVerified === false || res.user.phoneVerified === false) {
              localStorage.removeItem('vital_token');
              setUser(null);
              handleOpenAuth('login');
            } else {
              setUser(res.user);
              const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
              if (hash === 'dashboard') {
                setCurrentView('dashboard');
              }
            }
          } else {
            localStorage.removeItem('vital_token');
            setUser(null);
          }
        } catch (e) {
          console.log('Session check error:', e);
        }
      }
    };
    checkAuth();
  }, []);

  const handleOpenAuth = (tab = 'login') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const handleAuthSuccess = (userData) => {
    setUser(userData);
    handleNavigate('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('vital_token');
    setUser(null);
    handleNavigate('home');
  };

  const handleEmergencySubmitted = (emergencyPayload) => {
    setActiveEmergencyData(emergencyPayload);
    setIsEmergencyModalOpen(false);
    handleNavigate('emergency-tracker');
  };

  const handleTrackEmergencyFromDashboard = async (token) => {
    try {
      const res = await api.getEmergencyStatus(token);
      if (res.success) {
        setActiveEmergencyData({
          trackingToken: token,
          statusData: res.statusData,
        });
        handleNavigate('emergency-tracker');
      }
    } catch (e) {
      alert('Could not fetch emergency tracker.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col selection:bg-vital-500 selection:text-white">
      {/* Header / Navbar */}
      <Navbar
        user={user}
        onOpenAuth={handleOpenAuth}
        onOpenEmergency={() => setIsEmergencyModalOpen(true)}
        onLogout={handleLogout}
        currentView={currentView}
        setCurrentView={handleNavigate}
        onNavigate={handleNavigate}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {currentView === 'home' && (
          <HeroSection
            onOpenEmergency={() => setIsEmergencyModalOpen(true)}
            onOpenAuth={handleOpenAuth}
            user={user}
            onGoDashboard={() => handleNavigate('dashboard')}
          />
        )}

        {currentView === 'dashboard' && (
          <Dashboard
            user={user}
            onOpenEmergency={() => setIsEmergencyModalOpen(true)}
            onTrackEmergency={handleTrackEmergencyFromDashboard}
            onUpdateUser={(updatedUser) => setUser(updatedUser)}
          />
        )}

        {currentView === 'emergency-tracker' && (
          <EmergencyLiveTracker
            emergencyData={activeEmergencyData}
            onClose={() => handleNavigate(user ? 'dashboard' : 'home')}
            isUserRegistered={Boolean(user)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-10 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <HeartPulse className="w-5 h-5 text-vital-500" />
            <span className="font-bold text-white text-sm">Vital Connect</span>
            <span className="text-slate-600">|</span>
            <span>Blood Emergency Assistance Platform</span>
          </div>

          <div className="text-center sm:text-right text-slate-400 max-w-xl">
            Vital Connect connects voluntary blood donors with patients in urgent need. 
            Does not replace emergency medical facilities or professional medical advice.
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EmergencyModal
        isOpen={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
        onEmergencySubmitted={handleEmergencySubmitted}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        initialTab={authModalTab}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={handleAuthSuccess}
      />
    </div>
  );
}


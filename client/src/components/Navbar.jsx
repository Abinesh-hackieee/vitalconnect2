import React from 'react';
import { HeartPulse, AlertCircle, User, LogOut, ShieldAlert, Activity } from 'lucide-react';

export default function Navbar({
  user,
  onOpenAuth,
  onOpenEmergency,
  onLogout,
  currentView,
  setCurrentView,
  onNavigate,
}) {
  const navigate = onNavigate || setCurrentView;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div
          onClick={() => navigate('home')}
          className="flex items-center space-x-3 cursor-pointer select-none group"
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-vital-600 to-vital-500 flex items-center justify-center text-white shadow-md shadow-vital-500/20 group-hover:scale-105 transition-transform duration-200">
            <HeartPulse className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                Vital<span className="text-vital-600">Connect</span>
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
              Emergency Blood Assistance
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Emergency Help Button - Highly Visible, Distinctive */}
          <button
            onClick={onOpenEmergency}
            className="relative inline-flex items-center space-x-1.5 sm:space-x-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full bg-vital-600 hover:bg-vital-700 text-white font-bold text-xs sm:text-base shadow-lg shadow-vital-600/30 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 pulse-emergency"
            title="Immediate Blood Assistance - No Registration Required"
          >
            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 animate-bounce" />
            <span>Emergency Help</span>
          </button>

          {/* User Auth or Profile */}
          {user ? (
            <div className="flex items-center space-x-2 sm:space-x-3">
              {/* Dashboard Navigation Button */}
              <button
                id="navbar-dashboard-btn"
                aria-label="Dashboard"
                onClick={() => navigate('dashboard')}
                className={`inline-flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-sm ${
                  currentView === 'dashboard'
                    ? 'bg-slate-900 text-white ring-2 ring-vital-500/50 shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95'
                }`}
                title="Go to Donor Dashboard"
              >
                <Activity className={`w-4 h-4 ${currentView === 'dashboard' ? 'text-vital-400' : 'text-slate-500'}`} />
                <span className="font-bold">Dashboard</span>
              </button>

              {/* Donor Profile Chip - Clickable to Dashboard */}
              <div
                onClick={() => navigate('dashboard')}
                className="flex items-center space-x-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 px-2.5 sm:px-3 py-1.5 rounded-xl cursor-pointer transition-all group select-none hover:border-vital-200"
                title="View Profile on Dashboard"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate('dashboard');
                  }
                }}
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-vital-100 group-hover:bg-vital-200 text-vital-700 flex items-center justify-center font-bold text-xs transition-colors">
                  {user.bloodGroup || 'VC'}
                </div>
                <div className="hidden sm:block text-left text-xs">
                  <div className="font-bold text-slate-800 group-hover:text-vital-700 leading-tight truncate max-w-[110px] transition-colors">
                    {user.fullName}
                  </div>
                  <div className="text-slate-500 text-[10px]">
                    {user.userType} • {user.city}
                  </div>
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={onLogout}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="Log Out"
                aria-label="Log Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2 sm:space-x-3">
              <button
                onClick={() => onOpenAuth('login')}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
              >
                Login
              </button>
              <button
                onClick={() => onOpenAuth('register')}
                className="px-4 py-2 text-sm font-semibold bg-trust-600 hover:bg-trust-700 text-white rounded-xl shadow-sm transition-all"
              >
                Register
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}


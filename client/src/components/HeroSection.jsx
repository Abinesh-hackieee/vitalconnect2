import React from 'react';
import { AlertCircle, UserPlus, LogIn, ShieldCheck, Heart, Clock, PhoneCall } from 'lucide-react';
import heroImage from '../assets/hero-blood-donation.jpg';

export default function HeroSection({ onOpenEmergency, onOpenAuth, user, onGoDashboard }) {
  return (
    <div className="relative min-h-[calc(100vh-5rem)] flex items-center justify-center overflow-hidden">
      {/* Background Image with Realistic Medical Blood Donation Scene */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt="Professional and compassionate blood donation medical setup"
          className="w-full h-full object-cover object-center transform scale-105 filter brightness-95"
        />
        {/* Soft Medical Gradient Overlay for Maximum Text Contrast and Readability */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-900/75 to-slate-900/50 backdrop-blur-[1px]"></div>
      </div>

      {/* Hero Content Container */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-white">
        <div className="max-w-3xl space-y-8">
          {/* Medical Platform Trust Tag */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-vital-500/20 border border-vital-400/40 text-vital-200 text-xs sm:text-sm font-semibold tracking-wide backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-vital-500 animate-ping"></span>
            <span>24/7 Rapid Response Blood Assistance</span>
          </div>

          {/* Main Hero Heading */}
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight sm:leading-none">
              Connecting Hope <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-vital-400 via-vital-300 to-rose-200">
                In Life’s Critical Moments.
              </span>
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-slate-200 font-normal leading-relaxed max-w-2xl">
              Vital Connect bridges urgent blood requests with willing volunteer donors in real-time. 
              Non-registered users receive immediate emergency assistance with zero sign-up friction, 
              backed by rigorous donor privacy and safety safeguards.
            </p>
          </div>

          {/* Primary Action Call-to-Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {/* Highly Visible Emergency Button */}
            <button
              onClick={onOpenEmergency}
              className="flex items-center justify-center space-x-3 px-8 py-4 rounded-2xl bg-vital-600 hover:bg-vital-700 text-white font-bold text-lg shadow-xl shadow-vital-700/40 transform hover:-translate-y-1 transition-all duration-200 pulse-emergency"
            >
              <AlertCircle className="w-6 h-6" />
              <span>Urgent Blood Assistance</span>
            </button>

            {/* If logged in vs Guest buttons */}
            {user ? (
              <button
                onClick={onGoDashboard}
                className="flex items-center justify-center space-x-2 px-7 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-semibold text-base border border-white/20 backdrop-blur-md transition-all duration-200"
              >
                <span>Go to Your Dashboard</span>
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onOpenAuth('register')}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-6 py-4 rounded-2xl bg-trust-600 hover:bg-trust-700 text-white font-semibold text-base shadow-lg shadow-trust-700/30 transition-all duration-200"
                >
                  <UserPlus className="w-5 h-5" />
                  <span>Join as Donor</span>
                </button>
                <button
                  onClick={() => onOpenAuth('login')}
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-6 py-4 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-semibold text-base border border-white/20 backdrop-blur-sm transition-all duration-200"
                >
                  <LogIn className="w-5 h-5" />
                  <span>Login</span>
                </button>
              </div>
            )}
          </div>

          {/* Non-Registered Clarification Banner */}
          <div className="p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md text-xs sm:text-sm text-slate-200 flex items-start space-x-3 max-w-2xl">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white font-semibold">Immediate Emergency Access: </strong>
              If you or a loved one need blood urgently, you do <span className="underline decoration-vital-400 decoration-2 font-bold text-white">not</span> need to create an account. Click "Urgent Blood Assistance" to notify nearby compatible donors immediately.
            </div>
          </div>

          {/* Feature Highlight Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-white/15">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-vital-400">
                <Heart className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Donors</div>
                <div className="text-sm font-bold text-white">100% Volunteer</div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Response</div>
                <div className="text-sm font-bold text-white">Instant Alerts</div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-400">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Connection</div>
                <div className="text-sm font-bold text-white">Auto Call Action</div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Privacy</div>
                <div className="text-sm font-bold text-white">Strict Shielding</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

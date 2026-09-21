import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  Phone,
  User,
  Droplet,
  Calendar,
  MapPin,
  Heart,
  ShieldCheck,
  AlertCircle,
  Activity,
} from 'lucide-react';
import { api } from '../services/api';
import BloodGroupSelector, { ALL_BLOOD_GROUPS } from './BloodGroupSelector';

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export default function AuthModal({
  isOpen,
  initialTab = 'login',
  onClose,
  onAuthSuccess,
}) {
  const [tab, setTab] = useState(initialTab); // 'login' | 'register' | 'otp'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OTP state
  const [otpData, setOtpData] = useState({
    userId: '',
    otp: '',
    email: '',
    mobileNumber: '',
  });
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);

  // Login form state
  const [loginData, setLoginData] = useState({
    identifier: '',
    password: '',
  });

  // Registration form state
  const [registerData, setRegisterData] = useState({
    fullName: '',
    mobileNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    bloodGroup: 'O+',
    dateOfBirth: '',
    gender: 'Male',
    age: '',
    city: '',
    userType: 'Donor', // Donor or Requester
    lastDonationDate: '',
    hasNeverDonated: false,
  });

  // Cooldown countdown timer
  React.useEffect(() => {
    let timer;
    if (otpCooldown > 0) {
      timer = setInterval(() => {
        setOtpCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [otpCooldown]);

  if (!isOpen) return null;

  // Auto-calculate age from DOB
  const handleDobChange = (e) => {
    const dob = e.target.value;
    let computedAge = '';
    if (dob) {
      const birthDate = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      computedAge = age > 0 ? age : 0;
    }
    setRegisterData((prev) => ({
      ...prev,
      dateOfBirth: dob,
      age: computedAge,
    }));
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.login(loginData);
      if (res.success) {
        localStorage.setItem('vital_token', res.token);
        onAuthSuccess(res.user);
        onClose();
      } else if (res.requiresOtp) {
        setOtpData({
          userId: res.userId,
          otp: '',
          email: res.email || '',
          mobileNumber: res.mobileNumber || '',
        });
        setTab('otp');
        setOtpCooldown(60);
      } else {
        setError(res.message || 'Login failed.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (registerData.password !== registerData.confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    if (Number(registerData.age) < 18) {
      setError('You must be at least 18 years old to register.');
      setLoading(false);
      return;
    }

    if (!ALL_BLOOD_GROUPS.includes(registerData.bloodGroup)) {
      setError('Please select a valid blood group.');
      setLoading(false);
      return;
    }

    // Future date validation for last donation date
    if (
      registerData.userType === 'Donor' &&
      !registerData.hasNeverDonated &&
      registerData.lastDonationDate &&
      new Date(registerData.lastDonationDate) > new Date()
    ) {
      setError('Last donation date cannot be in the future.');
      setLoading(false);
      return;
    }

    try {
      const { confirmPassword, ...payload } = registerData;
      const res = await api.register({
        ...payload,
        age: Number(payload.age),
        lastDonationDate: registerData.hasNeverDonated ? null : registerData.lastDonationDate,
        hasNeverDonated: Boolean(registerData.hasNeverDonated),
      });

      if (res.requiresOtp) {
        setOtpData({
          userId: res.userId,
          otp: '',
          email: res.email || registerData.email,
          mobileNumber: res.mobileNumber || registerData.mobileNumber,
        });
        setTab('otp');
        setOtpCooldown(60);
      } else if (res.success) {
        localStorage.setItem('vital_token', res.token);
        onAuthSuccess(res.user);
        onClose();
      } else {
        setError(res.message || 'Registration failed.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!otpData.otp || otpData.otp.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      setLoading(false);
      return;
    }

    try {
      const res = await api.verifyOtp(otpData.userId, otpData.otp.trim());
      if (res.success) {
        localStorage.setItem('vital_token', res.token);
        onAuthSuccess(res.user);
        onClose();
      } else {
        setError(res.message || 'Invalid or expired OTP.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || resendLoading) return;
    setResendLoading(true);
    setError('');

    try {
      const res = await api.resendOtp(otpData.userId);
      if (res.success) {
        setOtpCooldown(60);
      } else {
        setError(res.message || 'Failed to resend code.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header Tabs */}
        <div className="bg-slate-900 text-white p-6 sm:p-7 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-vital-600 flex items-center justify-center text-white shadow-md">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                Vital Connect Access
              </h2>
              <p className="text-xs text-slate-400">
                Secure authentication for donors and requesters
              </p>
            </div>
          </div>

          <div className="flex rounded-2xl bg-white/10 p-1">
            <button
              onClick={() => {
                setTab('login');
                setError('');
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                tab === 'login'
                  ? 'bg-vital-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setTab('register');
                setError('');
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                tab === 'register'
                  ? 'bg-trust-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Create Account
            </button>
            {tab === 'otp' && (
              <button
                type="button"
                className="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all bg-emerald-600 text-white shadow-md cursor-default"
              >
                Verify OTP
              </button>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="m-6 mb-0 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6 sm:p-7">
          {tab === 'login' ? (
            /* Login Form */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                  <Mail className="w-3.5 h-3.5 text-vital-600" />
                  <span>Email or Mobile Number *</span>
                </label>
                <input
                  type="text"
                  value={loginData.identifier}
                  onChange={(e) =>
                    setLoginData({ ...loginData, identifier: e.target.value })
                  }
                  placeholder="e.g. yourname@email.com or +91 9876543210"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 text-sm bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                  <Lock className="w-3.5 h-3.5 text-vital-600" />
                  <span>Password *</span>
                </label>
                <input
                  type="password"
                  value={loginData.password}
                  onChange={(e) =>
                    setLoginData({ ...loginData, password: e.target.value })
                  }
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 text-sm bg-slate-50/50"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-vital-600 hover:bg-vital-700 text-white font-bold text-sm shadow-md shadow-vital-600/30 transition-all flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>Sign In to Dashboard</span>
                  )}
                </button>
              </div>

              <div className="text-center pt-2">
                <span className="text-xs text-slate-500">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => setTab('register')}
                  className="text-xs font-bold text-vital-600 hover:underline"
                >
                  Register here
                </button>
              </div>
            </form>
          ) : tab === 'register' ? (
            /* Register Form with all requested fields */
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              {/* User Type Selection: Donor / Requester */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  I Want to Register As: *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setRegisterData((prev) => ({ ...prev, userType: 'Donor' }))
                    }
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                      registerData.userType === 'Donor'
                        ? 'bg-rose-50 border-vital-500 text-vital-700 ring-2 ring-vital-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Heart className="w-4 h-4 text-vital-600" />
                    <span>Volunteer Donor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRegisterData((prev) => ({ ...prev, userType: 'Requester' }))
                    }
                    className={`py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
                      registerData.userType === 'Requester'
                        ? 'bg-trust-50 border-trust-500 text-trust-700 ring-2 ring-trust-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <User className="w-4 h-4 text-trust-600" />
                    <span>Requester / Patient</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={registerData.fullName}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, fullName: e.target.value })
                    }
                    placeholder="e.g. John Doe"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  />
                </div>

                {/* Mobile Number */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    value={registerData.mobileNumber}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, mobileNumber: e.target.value })
                    }
                    placeholder="e.g. 9876543210"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={registerData.email}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, email: e.target.value })
                    }
                    placeholder="e.g. john@example.com"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  />
                </div>

                {/* Blood Group */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center space-x-1">
                    <Droplet className="w-3.5 h-3.5 text-vital-600" />
                    <span>Blood Group *</span>
                  </label>
                  <BloodGroupSelector
                    id="register-blood-group"
                    name="bloodGroup"
                    value={registerData.bloodGroup}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, bloodGroup: e.target.value })
                    }
                  />
                </div>

                {/* Date of Birth */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    value={registerData.dateOfBirth}
                    onChange={handleDobChange}
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  />
                </div>

                {/* Age (Auto-calculated) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Age (Years) *
                  </label>
                  <input
                    type="number"
                    min="18"
                    max="100"
                    value={registerData.age}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, age: e.target.value })
                    }
                    placeholder="Age (Min 18)"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 font-bold"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Gender *
                  </label>
                  <select
                    value={registerData.gender}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, gender: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  >
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                {/* City/Location */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    City / Location *
                  </label>
                  <input
                    type="text"
                    value={registerData.city}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, city: e.target.value })
                    }
                    placeholder="e.g. Chennai"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  />
                </div>

                {/* Last Donation Date (Optional for Donors) */}
                {registerData.userType === 'Donor' && (
                  <div className="sm:col-span-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Last Blood Donation Date
                      </label>
                      <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-800">
                        <input
                          type="checkbox"
                          checked={registerData.hasNeverDonated}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRegisterData((prev) => ({
                              ...prev,
                              hasNeverDonated: checked,
                              lastDonationDate: checked ? '' : prev.lastDonationDate,
                            }));
                          }}
                          className="w-4 h-4 rounded text-vital-600 border-slate-300 focus:ring-vital-500 cursor-pointer"
                        />
                        <span className="font-semibold text-vital-700">Never Donated Before</span>
                      </label>
                    </div>
                    <input
                      type="date"
                      disabled={registerData.hasNeverDonated}
                      max={new Date().toISOString().split('T')[0]}
                      value={registerData.lastDonationDate}
                      onChange={(e) =>
                        setRegisterData({
                          ...registerData,
                          lastDonationDate: e.target.value,
                        })
                      }
                      className={`w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm transition-all ${
                        registerData.hasNeverDonated
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-slate-50/50 text-slate-800'
                      }`}
                    />
                    {registerData.hasNeverDonated ? (
                      <p className="text-[11px] text-emerald-600 font-medium">
                        ✓ Registered as a first-time donor. You will be immediately available to help!
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400">
                        Donors have a standard 90-day recovery cooldown period after each donation.
                      </p>
                    )}
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Password *
                  </label>
                  <input
                    type="password"
                    value={registerData.password}
                    onChange={(e) =>
                      setRegisterData({ ...registerData, password: e.target.value })
                    }
                    placeholder="Min 6 characters"
                    required
                    minLength={6}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  />
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={registerData.confirmPassword}
                    onChange={(e) =>
                      setRegisterData({
                        ...registerData,
                        confirmPassword: e.target.value,
                      })
                    }
                    placeholder="Re-enter password"
                    required
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50"
                  />
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-start space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Your personal contact information is protected and will never be shown publicly.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-trust-600 hover:bg-trust-700 text-white font-bold text-sm shadow-md shadow-trust-600/30 transition-all flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>Register & Verify Account</span>
                  )}
                </button>
              </div>

              <div className="text-center pt-1">
                <span className="text-xs text-slate-500">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => setTab('login')}
                  className="text-xs font-bold text-vital-600 hover:underline"
                >
                  Sign in
                </button>
              </div>
            </form>
          ) : (
            /* OTP Verification Screen */
            <form onSubmit={handleOtpSubmit} className="space-y-5">
              <div className="text-center py-2">
                <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Verify Your Account</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  A single 6-digit verification code has been dispatched to both your registered email and mobile number.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                  {otpData.email && (
                    <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      <Mail className="w-3 h-3 text-vital-600" />
                      <span>{otpData.email}</span>
                    </span>
                  )}
                  {otpData.mobileNumber && (
                    <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>{otpData.mobileNumber}</span>
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 text-center mb-2">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  autoFocus
                  value={otpData.otp}
                  onChange={(e) =>
                    setOtpData({ ...otpData, otp: e.target.value.replace(/\D/g, '') })
                  }
                  placeholder="• • • • • •"
                  className="w-full text-center tracking-[0.6em] text-2xl font-black py-3 rounded-2xl border-2 border-slate-200 focus:border-vital-500 focus:ring-4 focus:ring-vital-100 outline-none transition-all bg-slate-50/50 text-slate-800"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || otpData.otp.length !== 6}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <span>Verify & Enter Dashboard</span>
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <button
                  type="button"
                  onClick={() => {
                    setTab('login');
                    setError('');
                  }}
                  className="text-slate-500 hover:text-slate-700 font-medium"
                >
                  ← Back to Sign In
                </button>
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={otpCooldown > 0 || resendLoading}
                  className={`font-bold ${
                    otpCooldown > 0 || resendLoading
                      ? 'text-slate-400 cursor-not-allowed'
                      : 'text-vital-600 hover:underline'
                  }`}
                >
                  {otpCooldown > 0 ? `Resend Code (${otpCooldown}s)` : 'Resend OTP'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

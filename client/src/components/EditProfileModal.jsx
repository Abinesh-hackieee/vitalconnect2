import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Mail,
  Phone,
  Droplet,
  Calendar,
  MapPin,
  Heart,
  ShieldCheck,
  AlertCircle,
  Save,
  CheckCircle2,
  Clock,
  Power,
} from 'lucide-react';
import { api } from '../services/api';
import BloodGroupSelector, { ALL_BLOOD_GROUPS } from './BloodGroupSelector';

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

// Helper to format Date object or ISO string to YYYY-MM-DD for date inputs
const formatDateForInput = (dateVal) => {
  if (!dateVal) return '';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

export default function EditProfileModal({
  isOpen,
  user,
  onClose,
  onProfileUpdated,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [formData, setFormData] = useState({
    fullName: '',
    mobileNumber: '',
    email: '',
    bloodGroup: 'O+',
    dateOfBirth: '',
    gender: 'Male',
    age: '',
    city: '',
    lastDonationDate: '',
    hasNeverDonated: false,
    isAvailable: true,
  });

  // Populate form with current user values whenever modal opens or user updates
  useEffect(() => {
    if (user && isOpen) {
      setFormData({
        fullName: user.fullName || '',
        mobileNumber: user.mobileNumber || '',
        email: user.email || '',
        bloodGroup: user.bloodGroup || 'O+',
        dateOfBirth: formatDateForInput(user.dateOfBirth),
        gender: user.gender || 'Male',
        age: user.age !== undefined && user.age !== null ? String(user.age) : '',
        city: user.city || '',
        lastDonationDate: formatDateForInput(user.lastDonationDate),
        hasNeverDonated: Boolean(user.hasNeverDonated),
        isAvailable: user.isAvailable ?? true,
      });
      setError('');
      setSuccessMsg('');
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  // Auto-calculate age whenever DOB changes
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
    setFormData((prev) => ({
      ...prev,
      dateOfBirth: dob,
      age: computedAge,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    if (Number(formData.age) < 18) {
      setError('You must be at least 18 years old to be a registered donor.');
      setLoading(false);
      return;
    }

    if (!ALL_BLOOD_GROUPS.includes(formData.bloodGroup)) {
      setError('Please select a valid blood group.');
      setLoading(false);
      return;
    }

    // Future date validation
    if (
      !formData.hasNeverDonated &&
      formData.lastDonationDate &&
      new Date(formData.lastDonationDate) > new Date()
    ) {
      setError('Last donation date cannot be in the future.');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...formData,
        age: Number(formData.age),
        hasNeverDonated: Boolean(formData.hasNeverDonated),
        lastDonationDate: formData.hasNeverDonated
          ? null
          : formData.lastDonationDate
          ? formData.lastDonationDate
          : null,
      };

      const res = await api.updateProfile(payload);

      if (res.success && res.user) {
        setSuccessMsg('Profile updated successfully!');
        if (onProfileUpdated) {
          onProfileUpdated(res.user);
        }
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        setError(res.message || 'Failed to update profile.');
      }
    } catch (err) {
      console.error('Profile update error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-6">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 sm:p-7 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-vital-600 flex items-center justify-center text-white shadow-md shadow-vital-600/30">
              <User className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                  Edit Donor Profile
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-vital-500/20 text-vital-300 text-[11px] font-bold uppercase tracking-wider">
                  {user?.userType || 'Donor'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Keep your donor credentials and emergency contact information up to date
              </p>
            </div>
          </div>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div className="mx-6 mt-6 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-6 mt-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs sm:text-sm flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-semibold">{successMsg}</span>
          </div>
        )}

        {/* Profile Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          {/* Quick Availability Switch within Profile */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  formData.isAvailable
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                <Power className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">
                  Donation Availability Status
                </div>
                <div className="text-[11px] text-slate-500">
                  {formData.isAvailable
                    ? 'Active: You will receive real-time emergency blood requests in your city'
                    : 'Paused: You will not receive emergency broadcast alerts temporarily'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({ ...prev, isAvailable: !prev.isAvailable }))
              }
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                formData.isAvailable
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              {formData.isAvailable ? 'Ready to Donate' : 'Set as Unavailable'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-vital-600" />
                <span>Full Name *</span>
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                placeholder="e.g. John Doe"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-vital-500 bg-slate-50/50"
              />
            </div>

            {/* Mobile Number */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <Phone className="w-3.5 h-3.5 text-vital-600" />
                <span>Mobile Number (Emergency Contact) *</span>
              </label>
              <input
                type="tel"
                value={formData.mobileNumber}
                onChange={(e) =>
                  setFormData({ ...formData, mobileNumber: e.target.value })
                }
                placeholder="e.g. 9876543210"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-vital-500 bg-slate-50/50"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <Mail className="w-3.5 h-3.5 text-vital-600" />
                <span>Email Address *</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="e.g. john@example.com"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-vital-500 bg-slate-50/50"
              />
            </div>

            {/* Blood Group */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <Droplet className="w-3.5 h-3.5 text-vital-600" />
                <span>Blood Group *</span>
              </label>
              <BloodGroupSelector
                id="edit-profile-blood-group"
                name="bloodGroup"
                value={formData.bloodGroup}
                onChange={(e) =>
                  setFormData({ ...formData, bloodGroup: e.target.value })
                }
              />
            </div>

            {/* Date of Birth */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5 text-vital-600" />
                <span>Date of Birth *</span>
              </label>
              <input
                type="date"
                value={formData.dateOfBirth}
                onChange={handleDobChange}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-vital-500 bg-slate-50/50"
              />
            </div>

            {/* Age (Auto-calculated) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-vital-600" />
                <span>Age (Computed: Min 18) *</span>
              </label>
              <input
                type="number"
                min="18"
                max="100"
                value={formData.age}
                readOnly
                placeholder="Age (Years)"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold bg-slate-100 text-slate-700 cursor-not-allowed"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Gender *
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-vital-500 bg-slate-50/50"
              >
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            {/* City / Location */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-vital-600" />
                <span>City / Location *</span>
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="e.g. Chennai, Bangalore"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-vital-500 bg-slate-50/50"
              />
            </div>

            {/* Last Donation Date with Never Donated Checkbox */}
            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                  <Heart className="w-3.5 h-3.5 text-vital-600" />
                  <span>Last Blood Donation Date</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer text-xs font-semibold text-vital-700 hover:text-vital-900">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.hasNeverDonated)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormData((prev) => ({
                        ...prev,
                        hasNeverDonated: checked,
                        lastDonationDate: checked ? '' : prev.lastDonationDate,
                      }));
                    }}
                    className="w-4 h-4 rounded text-vital-600 border-slate-300 focus:ring-vital-500 cursor-pointer"
                  />
                  <span>Never Donated Blood</span>
                </label>
              </div>
              <input
                type="date"
                disabled={Boolean(formData.hasNeverDonated)}
                max={new Date().toISOString().split('T')[0]}
                value={formData.lastDonationDate}
                onChange={(e) =>
                  setFormData({ ...formData, lastDonationDate: e.target.value })
                }
                className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-vital-500 transition-all ${
                  formData.hasNeverDonated
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-50/50 text-slate-800'
                }`}
              />
              {formData.hasNeverDonated ? (
                <p className="text-[11px] text-emerald-600 font-medium">
                  ✓ Marked as first-time / never donated. You are immediately eligible to donate!
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Standard 90-day recovery cooldown period applies after each whole blood donation.
                </p>
              )}
            </div>
          </div>

          {/* Privacy Safeguard Note */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Your personal information is securely shielded. Non-registered requesters only receive contact connectivity upon explicit emergency acceptance.
            </span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-xl bg-vital-600 hover:bg-vital-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-vital-600/30 transition-all flex items-center space-x-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Profile Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

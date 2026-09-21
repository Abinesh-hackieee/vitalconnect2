import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Search,
  MapPin,
  Phone,
  Droplet,
  CheckCircle2,
  Clock,
  AlertCircle,
  Users,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';

/**
 * Helper to calculate 90-day donation cooldown eligibility
 */
const getDonationCooldownStatus = (lastDateStr) => {
  if (!lastDateStr) return { isReady: true, label: 'Ready to Donate' };
  const last = new Date(lastDateStr);
  if (isNaN(last.getTime())) return { isReady: true, label: 'Ready to Donate' };
  const next = new Date(last);
  next.setDate(next.getDate() + 90);
  const now = new Date();
  if (now >= next) {
    return { isReady: true, label: 'Eligible to Donate' };
  }
  const days = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
  return {
    isReady: false,
    label: `Cooldown (${days}d left)`,
    nextDate: next.toLocaleDateString(),
  };
};

export default function BloodGroupDonorsModal({
  isOpen,
  bloodGroup,
  onClose,
  currentUser = null,
}) {
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [availableCount, setAvailableCount] = useState(0);

  const modalRef = useRef(null);
  const searchInputRef = useRef(null);

  // Fetch donors whenever modal opens or blood group changes
  const fetchDonors = async () => {
    if (!bloodGroup) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDonorsByBloodGroup(bloodGroup);
      if (res && res.success) {
        setDonors(res.donors || []);
        setTotalCount(res.total ?? (res.donors || []).length);
        setAvailableCount(res.availableCount ?? (res.donors || []).filter((d) => d.isAvailable).length);
      } else {
        setError(res?.message || 'Failed to load donors for this blood group.');
        setDonors([]);
      }
    } catch (err) {
      setError('Network connection error while fetching donor details. Please try again.');
      setDonors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && bloodGroup) {
      fetchDonors();
      setSearchQuery('');
      setAvailableOnly(false);
      // Auto-focus search after open
      setTimeout(() => searchInputRef.current?.focus(), 150);
    }
  }, [isOpen, bloodGroup]);

  // Handle Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Client-side search and filtering for instant responsiveness
  const filteredDonors = useMemo(() => {
    let list = donors;

    if (availableOnly) {
      list = list.filter((d) => d.isAvailable !== false);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.fullName?.toLowerCase().includes(q) ||
          d.city?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [donors, searchQuery, availableOnly]);

  if (!isOpen || !bloodGroup) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
      onClick={(e) => {
        // Close if backdrop clicked
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="donor-modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-vital-700 via-vital-600 to-rose-600 text-white p-5 sm:p-6 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 sm:top-5 right-4 sm:right-5 w-9 h-9 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-white/80 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3.5 pr-8">
            <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white font-black text-xl shadow-inner shrink-0">
              {bloodGroup}
            </div>
            <div>
              <h2 id="donor-modal-title" className="text-xl sm:text-2xl font-extrabold tracking-tight">
                {bloodGroup} Donors —{' '}
                <span className="text-emerald-200">
                  {loading ? '...' : `${availableCount} Available`}
                </span>
              </h2>
              <p className="mt-1 text-rose-100 text-xs sm:text-sm font-medium">
                {loading
                  ? 'Fetching volunteer donor network...'
                  : `${totalCount} Registered Volunteer Donor${totalCount !== 1 ? 's' : ''} in the network`}
              </p>
            </div>
          </div>
        </div>

        {/* Filter / Search Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search donor by name or registered city..."
                className="w-full pl-10 pr-9 py-2 rounded-xl bg-white border border-slate-200 focus:border-vital-500 focus:ring-2 focus:ring-vital-500/20 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Availability Filter Toggle */}
            <div className="flex items-center bg-white rounded-xl p-1 border border-slate-200 self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setAvailableOnly(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  !availableOnly
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setAvailableOnly(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  availableOnly
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Available ({availableCount})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body / Donors List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 divide-y divide-slate-100">
          {loading ? (
            /* Loading skeletons */
            <div className="space-y-3.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-4 rounded-2xl border border-slate-100 bg-slate-50/60 animate-pulse flex items-center justify-between gap-4"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-11 h-11 rounded-full bg-slate-200 shrink-0"></div>
                    <div className="space-y-2">
                      <div className="w-32 h-4 rounded bg-slate-200"></div>
                      <div className="w-24 h-3 rounded bg-slate-200"></div>
                    </div>
                  </div>
                  <div className="w-24 h-8 rounded-xl bg-slate-200"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            /* Error State */
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-sm">{error}</h3>
              <button
                onClick={fetchDonors}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : filteredDonors.length === 0 ? (
            /* Empty State */
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 border border-rose-200 flex items-center justify-center mx-auto shadow-xs">
                <Droplet className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  {donors.length === 0
                    ? 'No donors available for this blood group.'
                    : `No donors match "${searchQuery}"`}
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {donors.length === 0
                    ? `Currently there are no registered volunteer donors with blood group ${bloodGroup}. Volunteers are encouraged to register and support the network.`
                    : 'Try modifying your search query or clear the filter to see all donors.'}
                </p>
              </div>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                >
                  Clear Search Filter
                </button>
              )}
            </div>
          ) : (
            /* Donors List */
            <div className="space-y-3">
              {filteredDonors.map((donor, idx) => {
                const isReadyObj = getDonationCooldownStatus(donor.lastDonationDate);
                const isOnlineOrReady = donor.isAvailable !== false;
                const isCurrentUser = currentUser && (currentUser._id === donor._id || currentUser.id === donor._id);

                return (
                  <div
                    key={donor._id || idx}
                    className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5"
                  >
                    {/* Left details */}
                    <div className="flex items-start space-x-3.5">
                      {/* Avatar initial badge */}
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-vital-100 via-vital-50 to-rose-50 border border-vital-200 text-vital-700 font-extrabold text-base flex items-center justify-center shrink-0 shadow-2xs">
                        {donor.fullName?.charAt(0)?.toUpperCase() || 'D'}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="font-extrabold text-slate-900 text-sm sm:text-base">
                            {donor.fullName || 'Anonymous Donor'}
                          </span>
                          {isCurrentUser && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                              You
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-vital-50 text-vital-700 border border-vital-200 text-xs font-black">
                            {donor.bloodGroup}
                          </span>
                        </div>

                        {/* City & Location info */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center space-x-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium">{donor.city || 'Registered City'}</span>
                          </span>

                          {/* Cooldown/Donation status */}
                          <span className="flex items-center space-x-1 text-[11px]">
                            <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className={isReadyObj.isReady ? 'text-emerald-700 font-medium' : 'text-amber-700'}>
                              {isReadyObj.label}
                            </span>
                          </span>
                        </div>

                        {/* Availability Pill */}
                        <div className="pt-0.5">
                          <span
                            className={`inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isOnlineOrReady
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isOnlineOrReady ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                              }`}
                            />
                            <span>{isOnlineOrReady ? 'Available for Emergency' : 'Temporarily Offline'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right action button: Emergency Contact Option */}
                    <div className="flex items-center space-x-2 pt-2 sm:pt-0 shrink-0">
                      {donor.mobileNumber ? (
                        <a
                          href={`tel:${donor.mobileNumber}`}
                          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm hover:shadow transition-all active:scale-95"
                          title={`Emergency call to ${donor.fullName || 'Donor'}`}
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Contact Donor</span>
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Contact protected</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-1.5 text-xs text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="hidden sm:inline">Volunteer Network Verified under Vital Connect Emergency Policy</span>
            <span className="sm:hidden">Verified Volunteer Donors</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

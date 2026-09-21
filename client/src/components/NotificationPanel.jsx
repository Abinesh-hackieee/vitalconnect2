import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  MapPin,
  Hospital,
  Droplet,
  AlertCircle,
  X,
  Heart,
  Check,
  Eye,
  ShieldCheck,
} from 'lucide-react';

const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const date = new Date(dateStr);
  const diffSecs = Math.floor((now - date) / 1000);

  if (diffSecs < 60) return 'Just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function NotificationPanel({
  notifications = [],
  unreadCount = 0,
  currentUser = null,
  donorBloodGroup = null,
  onAccept,
  onDecline,
  onViewRequest,
  onMarkRead,
  onMarkAllRead,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const activeDonorBloodGroup = currentUser?.bloodGroup || donorBloodGroup;

  return (
    <div className="relative inline-block text-left" ref={panelRef}>
      {/* Notification Bell Button */}
      <button
        onClick={handleToggle}
        className={`relative p-2.5 rounded-2xl transition-all border ${
          isOpen
            ? 'bg-vital-50 text-vital-600 border-vital-300 ring-2 ring-vital-500/20'
            : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200/80 shadow-sm'
        }`}
        title="Emergency Alerts"
        aria-label="Emergency Notifications"
      >
        <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'text-vital-600 animate-wiggle' : ''}`} />

        {/* Unread Counter Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white font-black text-[11px] shadow-md shadow-rose-600/40 border-2 border-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 sm:w-96 max-w-[95vw] bg-white rounded-3xl shadow-2xl border border-slate-100/90 z-50 overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-vital-600 flex items-center justify-center text-white shadow-sm">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-black text-sm tracking-tight">Emergency Alerts</h3>
                <p className="text-[11px] text-slate-400">
                  {unreadCount > 0 ? `${unreadCount} unread request${unreadCount !== 1 ? 's' : ''}` : 'All caught up'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => {
                    if (onMarkAllRead) onMarkAllRead();
                  }}
                  className="text-[11px] text-vital-300 hover:text-white font-bold transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List Body */}
          <div className="max-h-[440px] overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2.5 text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                </div>
                <div className="font-bold text-xs text-slate-700">No active emergency alerts</div>
                <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                  You will receive instant alerts when a blood emergency arises in your coverage area.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const isAccepted = notif.hasAccepted || notif.status === 'accepted';
                const isDeclined = notif.status === 'declined';
                const isFull = notif.isFull;
                const isAcceptedByOther = !isAccepted && (notif.hasAcceptedByOther || notif.requestStatus === 'Donor Accepted' || (notif.acceptedDonorsCount && notif.acceptedDonorsCount > 0));
                const myGroup = activeDonorBloodGroup || notif.donorBloodGroup;
                const isBloodGroupDifferent = myGroup && myGroup !== notif.bloodGroup;

                return (
                  <div
                    key={notif.id || notif._id}
                    onClick={() => {
                      if (!notif.isRead && onMarkRead) {
                        onMarkRead(notif.id || notif._id);
                      }
                    }}
                    className={`p-4 transition-all hover:bg-slate-50/80 space-y-2.5 ${
                      !notif.isRead ? 'bg-rose-50/40' : 'bg-white'
                    }`}
                  >
                    {/* Notification Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="w-9 h-9 rounded-xl bg-vital-50 text-vital-700 border border-vital-200 font-black text-xs flex items-center justify-center shadow-xs shrink-0">
                          {notif.bloodGroup}
                        </span>
                        <div>
                          <div className="text-xs font-black text-slate-900 leading-tight">
                            {notif.unitsRequired} Unit(s) {notif.bloodGroup} Needed
                          </div>
                          <div className="text-[11px] font-semibold text-slate-700 mt-0.5">
                            Patient: <strong className="text-slate-900">{notif.patientName || 'Emergency Patient'}</strong>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-100 text-rose-700">
                              {notif.urgencyLevel || 'Critical / Immediate'}
                            </span>
                            {(notif.deliveryChannel === 'sms' || notif.isOffline) && (
                              <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                                SMS Alert
                              </span>
                            )}
                            {notif.deliveryStatus && notif.deliveryStatus !== 'pending' && (
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase border ${
                                notif.deliveryStatus === 'accepted'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : notif.deliveryStatus === 'delivered'
                                  ? 'bg-blue-100 text-blue-800 border-blue-200'
                                  : notif.deliveryStatus === 'sent'
                                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}>
                                {notif.deliveryStatus}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 text-[10px] text-slate-400 shrink-0">
                        <Clock className="w-3 h-3" />
                        <span title={notif.createdAt ? new Date(notif.createdAt).toLocaleString() : ''}>
                          {formatTimeAgo(notif.createdAt)}
                        </span>
                        {!notif.isRead && (
                          <span className="w-2 h-2 rounded-full bg-vital-600 animate-pulse"></span>
                        )}
                      </div>
                    </div>

                    {/* Donor Blood Group & Compatibility Context */}
                    {myGroup && (
                      <div className={`p-2 rounded-xl text-[11px] flex items-center space-x-1.5 border ${
                        isBloodGroupDifferent
                          ? 'bg-amber-50/90 border-amber-200 text-amber-900'
                          : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                      }`}>
                        {isBloodGroupDifferent ? (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span className="truncate">
                          Your Group: <strong className="font-extrabold">{myGroup}</strong> • Needed:{' '}
                          <strong className="font-extrabold">{notif.bloodGroup}</strong>{' '}
                          {isBloodGroupDifferent ? (
                            <span className="font-bold text-amber-700">(Different Blood Group)</span>
                          ) : (
                            <span className="font-bold text-emerald-700">(Exact Match)</span>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Hospital & Location */}
                    <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                        <Hospital className="w-3.5 h-3.5 text-vital-600 shrink-0" />
                        <span className="truncate">{notif.hospitalName}</span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 pl-5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{notif.hospitalLocation}</span>
                      </div>
                    </div>

                    {/* Status Pill or Action Buttons */}
                    {isAccepted ? (
                      <div className="w-full py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-[11px] text-center flex items-center justify-center space-x-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>You Accepted This Emergency</span>
                      </div>
                    ) : isDeclined ? (
                      <div className="w-full py-1.5 rounded-xl bg-slate-100 text-slate-500 font-semibold text-[11px] text-center">
                        Request Declined
                      </div>
                    ) : isFull ? (
                      <div className="w-full py-1.5 rounded-xl bg-slate-100 text-slate-500 font-semibold text-[11px] text-center">
                        Donor Quota Reached (10/10)
                      </div>
                    ) : isAcceptedByOther ? (
                      <div className="space-y-1.5">
                        <div className="w-full py-1.5 px-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-semibold text-[11px] text-center flex items-center justify-center space-x-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Request already accepted by a donor ({notif.acceptedDonorsCount || 1} connected)</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onAccept) onAccept(notif.internalToken);
                              setIsOpen(false);
                            }}
                            className="flex-1 py-1.5 px-2.5 rounded-xl bg-vital-600 hover:bg-vital-700 text-white font-bold text-xs shadow-xs transition-all flex items-center justify-center space-x-1"
                          >
                            <Heart className="w-3 h-3" />
                            <span>Also Connect</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onViewRequest) onViewRequest(notif.internalToken);
                              setIsOpen(false);
                            }}
                            className="py-1.5 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 pt-1">
                        {/* Accept Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onAccept) onAccept(notif.internalToken);
                            setIsOpen(false);
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-vital-600 hover:bg-vital-700 text-white font-bold text-xs shadow-sm shadow-vital-600/30 transition-all flex items-center justify-center space-x-1.5"
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>

                        {/* Decline Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDecline) onDecline(notif.internalToken, notif.id || notif._id);
                          }}
                          className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold text-xs transition-colors"
                          title="Decline this alert"
                        >
                          Decline
                        </button>

                        {/* View Request Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onViewRequest) onViewRequest(notif.internalToken);
                            setIsOpen(false);
                          }}
                          className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

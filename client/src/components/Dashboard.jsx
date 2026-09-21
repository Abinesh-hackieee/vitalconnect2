import React, { useState, useEffect } from 'react';
import {
  Heart,
  Activity,
  AlertCircle,
  PhoneCall,
  CheckCircle2,
  Clock,
  MapPin,
  Hospital,
  Droplet,
  ShieldCheck,
  User,
  Power,
  RefreshCw,
  Phone,
  Sparkles,
  Info,
  Edit3,
  Mail,
  Calendar,
  Eye,
  X,
  MessageSquare,
  Users,
  FileCheck,
} from 'lucide-react';
import { api, socket } from '../services/api';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import EditProfileModal from './EditProfileModal';
import NotificationPanel from './NotificationPanel';
import ChatModal from './ChatModal';
import BloodGroupDonorsModal from './BloodGroupDonorsModal';
import PrescriptionReviewModal from './PrescriptionReviewModal';

const getBloodCompatibility = (group) => {
  const map = {
    'O-': 'All blood groups (Universal RBC Donor)',
    'O+': 'O+, A+, B+, AB+',
    'A-': 'A-, A+, AB-, AB+',
    'A+': 'A+, AB+',
    'B-': 'B-, B+, AB-, AB+',
    'B+': 'B+, AB+',
    'AB-': 'AB-, AB+',
    'AB+': 'AB+ (Universal Recipient)',
  };
  return map[group] || 'Compatible patients in your area';
};

const getDonationEligibility = (lastDateStr, hasNeverDonated) => {
  if (hasNeverDonated) {
    return {
      isReady: true,
      label: '🌟 First-Time Donor (Never Donated)',
      badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
    };
  }
  if (!lastDateStr) return { isReady: true, label: '✅ Ready for Donation', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  const last = new Date(lastDateStr);
  if (isNaN(last.getTime())) return { isReady: true, label: '✅ Ready for Donation', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  const next = new Date(last);
  next.setDate(next.getDate() + 90);
  const now = new Date();
  if (now >= next) {
    return { isReady: true, label: '✅ Eligible to Donate (Cooldown Complete)', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  }
  const days = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
  return {
    isReady: false,
    label: `⏳ In 90-Day Cooldown (${days} day${days !== 1 ? 's' : ''} left)`,
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
    nextDate: next.toLocaleDateString(),
  };
};

export default function Dashboard({ user, onOpenEmergency, onTrackEmergency, onUpdateUser }) {
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(user?.isAvailable ?? true);
  const [actionMessage, setActionMessage] = useState(null);
  const [capacityNotice, setCapacityNotice] = useState(null);
  const [connectedPatientCall, setConnectedPatientCall] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [profileToast, setProfileToast] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeChat, setActiveChat] = useState(null);
  const [donorAvailability, setDonorAvailability] = useState(null);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(null);
  const [highlightedToken, setHighlightedToken] = useState(null);
  const [selectedBloodGroupForModal, setSelectedBloodGroupForModal] = useState(null);

  // Fetch dynamic blood group donor availability statistics from backend
  const fetchDonorAvailability = async () => {
    setLoadingAvailability(true);
    setAvailabilityError(null);
    try {
      const res = await api.getDonorAvailability();
      if (res && res.success && res.stats) {
        setDonorAvailability(res.stats);
      } else if (res && typeof res === 'object' && res.stats) {
        setDonorAvailability(res.stats);
      } else if (res && typeof res === 'object' && !res.message && !res.error && res['O+']) {
        setDonorAvailability(res);
      } else {
        setAvailabilityError(res?.message || 'Donor network statistics are temporarily unavailable.');
        const fallback = {};
        ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].forEach((bg) => {
          fallback[bg] = { total: 0, available: 0 };
        });
        setDonorAvailability(fallback);
      }
    } catch (err) {
      console.error('Fetch donor availability error:', err);
      setAvailabilityError('Live network statistics could not be loaded. Showing default indicators.');
      const fallback = {};
      ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].forEach((bg) => {
        fallback[bg] = { total: 0, available: 0 };
      });
      setDonorAvailability(fallback);
    } finally {
      setLoadingAvailability(false);
    }
  };

  const handleOpenChat = (emergencyId, emergencyData = null) => {
    setActiveChat({
      emergencyId,
      donorId: (user?._id || user?.id)?.toString(),
      emergencySummary: {
        emergencyId,
        patientName: emergencyData?.patientName,
        bloodGroup: emergencyData?.bloodGroup,
        hospitalName: emergencyData?.hospitalName,
        hospitalLocation: emergencyData?.hospitalLocation,
      },
    });
  };

  useEffect(() => {
    if (user?.isAvailable !== undefined) {
      setIsAvailable(user.isAvailable);
    }
  }, [user?.isAvailable]);

  // Load relevant emergencies
  const fetchEmergencies = async () => {
    setLoading(true);
    try {
      const res = await api.getMyEmergencies();
      if (res.success) {
        setEmergencies(res.requests || []);
      }
    } catch (err) {
      console.error('Fetch emergencies error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load persistent donor notifications
  const fetchNotifications = async () => {
    if (user?.userType !== 'Donor') return;
    try {
      const res = await api.getNotifications();
      if (res.success && res.notifications) {
        setNotifications(res.notifications);
        const unread = res.notifications.filter(
          (n) => !n.isRead && n.status !== 'declined' && n.status !== 'accepted'
        ).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('Fetch notifications error:', err);
    }
  };

  useEffect(() => {
    fetchEmergencies();
    fetchNotifications();
    fetchDonorAvailability();

    // Join personal donor room for instant live emergency alerts
    if (user?.id || user?._id) {
      const userId = user.id || user._id;
      const token = localStorage.getItem('vital_token');
      socket.emit('join_donor_room', { donorId: userId, token });
    }

    // Real-time emergency alert listener for donors
    const handleNewAlert = (alertData) => {
      // Immediate push alert banner
      setActionMessage({
        type: 'urgent_alert',
        title: '🚨 Urgent Blood Need in Your City!',
        body: alertData.message,
        token: alertData.internalToken,
        bloodGroup: alertData.bloodGroup,
        units: alertData.unitsRequired,
        hospital: alertData.hospitalName,
        location: alertData.hospitalLocation,
        urgencyLevel: alertData.urgencyLevel,
        createdAt: alertData.createdAt,
      });

      // Update local notification state immediately without refresh
      setNotifications((prev) => [
        {
          id: 'notif_live_' + Date.now(),
          _id: 'notif_live_' + Date.now(),
          internalToken: alertData.internalToken,
          patientName: alertData.patientName,
          bloodGroup: alertData.bloodGroup,
          unitsRequired: alertData.unitsRequired,
          hospitalName: alertData.hospitalName,
          hospitalLocation: alertData.hospitalLocation,
          urgencyLevel: alertData.urgencyLevel,
          description: alertData.description,
          message: alertData.message,
          status: 'unread',
          isRead: false,
          createdAt: alertData.createdAt || new Date(),
        },
        ...prev.filter((n) => n.internalToken !== alertData.internalToken),
      ]);
      setUnreadCount((prev) => prev + 1);

      fetchEmergencies();
    };

    // Real-time emergency update listener (status updates, donor acceptance, capacity reached)
    const handleEmergencyUpdated = (updateData) => {
      const targetToken = updateData.token || updateData.internalToken;

      setEmergencies((prev) =>
        prev.map((req) => {
          if (req.token === targetToken) {
            return {
              ...req,
              status: updateData.status,
              acceptedDonorsCount: updateData.acceptedDonorsCount,
              isFull: updateData.isFull,
            };
          }
          return req;
        })
      );

      setNotifications((prev) =>
        prev.map((n) => {
          if (n.internalToken === targetToken) {
            return {
              ...n,
              requestStatus: updateData.status,
              acceptedDonorsCount: updateData.acceptedDonorsCount,
              isFull: updateData.isFull,
            };
          }
          return n;
        })
      );
    };

    socket.on('emergency_alert', handleNewAlert);
    socket.on('emergency_updated', handleEmergencyUpdated);

    // Firebase Firestore Realtime In-App Notification Listener
    let unsubscribeFirestore = null;
    if (db && user?._id) {
      try {
        const notifsRef = collection(db, 'notifications');
        const q = query(notifsRef, where('donorId', '==', (user._id || user.id).toString()));
        unsubscribeFirestore = onSnapshot(
          q,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                const d = change.doc.data();
                handleNewAlert({
                  internalToken: d.internalToken,
                  patientName: d.patientName,
                  bloodGroup: d.bloodGroup,
                  unitsRequired: d.unitsRequired,
                  hospitalName: d.hospitalName,
                  hospitalLocation: d.hospitalLocation,
                  urgencyLevel: d.urgencyLevel,
                  message: d.message,
                  deliveryChannel: d.deliveryChannel || 'in-app',
                  deliveryStatus: d.deliveryStatus || 'delivered',
                  createdAt: d.createdAt?.toDate?.() || new Date(),
                });
              }
            });
          },
          () => {
            // Silently fallback if Firestore client rules require auth token
          }
        );
      } catch (e) {
        // Safe non-blocking fallback
      }
    }

    return () => {
      socket.off('emergency_alert', handleNewAlert);
      socket.off('emergency_updated', handleEmergencyUpdated);
      if (unsubscribeFirestore) {
        try {
          unsubscribeFirestore();
        } catch (e) {}
      }
    };
  }, [user]);

  // Toggle availability for donors
  const handleToggleAvailability = async () => {
    try {
      const res = await api.toggleAvailability();
      if (res.success) {
        setIsAvailable(res.isAvailable);
        if (onUpdateUser && user) {
          onUpdateUser({ ...user, isAvailable: res.isAvailable });
        }
        fetchDonorAvailability();
      }
    } catch (err) {
      console.error('Availability toggle failed:', err);
    }
  };

  // Donor accepts emergency request
  const handleAcceptRequest = async (token) => {
    try {
      const res = await api.acceptEmergency(token);

      if (res.success) {
        // Successfully connected as one of the donors
        setConnectedPatientCall({
          token,
          patientName: res.patientName,
          patientContact: res.patientEmergencyContact,
          hospital: `${res.hospitalName}, ${res.hospitalLocation}`,
        });

        // Update local notification state
        setNotifications((prev) =>
          prev.map((n) =>
            n.internalToken === token
              ? { ...n, status: 'accepted', isRead: true, hasAccepted: true }
              : n
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        // Dismiss action banner if it matches this token
        if (actionMessage?.token === token) {
          setActionMessage(null);
        }

        // Trigger phone dialer to patient contact via backend call action
        if (res.patientEmergencyContact) {
          try {
            api.initiateCallAction({ token, targetType: 'patient' })
              .then((callRes) => {
                if (callRes?.telUrl) {
                  window.location.href = callRes.telUrl;
                } else {
                  window.location.href = `tel:${res.patientEmergencyContact}`;
                }
              })
              .catch(() => {
                window.location.href = `tel:${res.patientEmergencyContact}`;
              });
          } catch (e) {
            window.location.href = `tel:${res.patientEmergencyContact}`;
          }
        }

        fetchEmergencies();
        fetchNotifications();
      } else if (res.isCapacityReached) {
        setCapacityNotice(res.message);
        fetchEmergencies();
      } else {
        alert(res.message || 'Could not accept emergency request.');
      }
    } catch (err) {
      alert('Error accepting emergency request. Please check connection.');
    }
  };

  // Donor declines emergency request
  const handleDeclineRequest = async (token, notificationId) => {
    try {
      await api.declineEmergency(token);
      setNotifications((prev) =>
        prev.map((n) =>
          n.internalToken === token || (notificationId && (n.id === notificationId || n._id === notificationId))
            ? { ...n, status: 'declined', isRead: true }
            : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      if (actionMessage?.token === token) {
        setActionMessage(null);
      }
    } catch (err) {
      console.error('Decline error:', err);
    }
  };

  // Donor clicks View Request to smoothly focus and highlight the emergency card
  const handleViewRequest = (token) => {
    setHighlightedToken(token);
    const targetElement = document.getElementById(`emergency-${token}`);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
      setHighlightedToken(null);
    }, 4000);
  };

  // Mark notification as read
  const handleMarkRead = async (notificationId) => {
    try {
      await api.markNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          (n.id || n._id) === notificationId ? { ...n, isRead: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Mark all read error:', err);
    }
  };

  const donationStatus = getDonationEligibility(user?.lastDonationDate, user?.hasNeverDonated);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Toast Alert on Profile Update */}
      {profileToast && (
        <div className="bg-emerald-50 border border-emerald-400 text-emerald-900 px-5 py-4 rounded-2xl flex items-center justify-between shadow-sm animate-fadeIn">
          <div className="flex items-center space-x-3 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{profileToast}</span>
          </div>
          <button
            onClick={() => setProfileToast(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Welcome Header & Main Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-vital-600 to-rose-700 flex items-center justify-center text-white font-black text-2xl shadow-md shadow-vital-600/30">
            {user?.bloodGroup || 'VC'}
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider text-vital-600 bg-vital-50 px-2.5 py-0.5 rounded-full border border-vital-200/60">
                {user?.userType === 'Donor' ? 'Volunteer Life Saver' : 'Medical Requester'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-semibold">{user?.city || 'Tamil Nadu'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-0.5">
              Welcome, {user?.fullName || 'User'}
            </h1>
          </div>
        </div>

        {/* Action Buttons: Notifications, Prescriptions, Edit, Availability, Emergency */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Notifications Panel Trigger */}
          {user?.userType === 'Donor' && (
            <NotificationPanel
              notifications={notifications}
              unreadCount={unreadCount}
              onAccept={handleAcceptRequest}
              onDecline={handleDeclineRequest}
              onViewRequest={handleViewRequest}
              onMarkRead={handleMarkRead}
              onMarkAllRead={handleMarkAllRead}
            />
          )}

          {/* Prescription Review Queue Button */}
          <button
            onClick={() => setIsPrescriptionModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-50 to-blue-50 hover:from-indigo-100 hover:to-blue-100 text-indigo-800 font-bold text-sm transition-all border border-indigo-200/90 shadow-xs active:scale-95"
            title="Inspect Doctor Prescription Queue"
          >
            <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <FileCheck className="w-3.5 h-3.5" />
            </div>
            <span>Prescription Queue</span>
          </button>

          {/* Edit Profile Button */}
          {user?.userType === 'Donor' && (
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm transition-all border border-slate-200/80 shadow-sm"
              title="Edit Profile"
            >
              <Edit3 className="w-4 h-4 text-vital-600" />
              <span>Edit Profile</span>
            </button>
          )}

          {/* Donor Availability or Requester Action */}
          {user?.userType === 'Donor' ? (
            <button
              onClick={handleToggleAvailability}
              className={`flex items-center space-x-2.5 px-5 py-2.5 rounded-2xl font-bold text-sm transition-all shadow-sm ${
                isAvailable
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>{isAvailable ? 'Status: Ready to Donate' : 'Status: Unavailable'}</span>
            </button>
          ) : (
            <button
              onClick={onOpenEmergency}
              className="flex items-center space-x-2 px-6 py-2.5 rounded-2xl bg-vital-600 hover:bg-vital-700 text-white font-bold text-sm shadow-md shadow-vital-600/30"
            >
              <AlertCircle className="w-4 h-4" />
              <span>New Emergency Blood Request</span>
            </button>
          )}

          <button
            onClick={() => {
              fetchEmergencies();
              fetchNotifications();
              fetchDonorAvailability();
            }}
            className="p-2.5 rounded-2xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Registered Donor Profile Details Card with Healthcare-Themed Visual Hierarchy */}
      {user?.userType === 'Donor' && (
        <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-rose-500 to-vital-600 text-white flex items-center justify-center font-bold shadow-md shadow-rose-500/20">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">
                  Donor Profile & Blood Donation Status
                </h3>
                <p className="text-xs text-slate-400">
                  Your profile determines compatibility and emergency alert broadcast eligibility
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <span
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold shadow-2xs ${donationStatus.badgeClass}`}
              >
                {donationStatus.label}
              </span>

              <button
                onClick={() => setIsEditModalOpen(true)}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-vital-50 text-slate-700 hover:text-vital-700 text-xs font-bold border border-slate-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-vital-600" />
                <span>Edit Profile</span>
              </button>
            </div>
          </div>

          {/* 4 Rich Healthcare-Themed Information Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Blood Group & Compatibility (Crimson/Rose Theme) */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-rose-50/90 via-red-50/30 to-white border-2 border-rose-200/80 shadow-xs hover:border-rose-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-rose-800 uppercase tracking-wider">
                  Blood Group
                </span>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 to-vital-500 text-white flex items-center justify-center shadow-xs">
                  <Droplet className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-black text-rose-700 tracking-tight">{user?.bloodGroup || 'N/A'}</div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Can donate to: <strong className="text-rose-900">{getBloodCompatibility(user?.bloodGroup)}</strong>
              </p>
            </div>

            {/* Card 2: City & Coverage (Sky Blue/Indigo Theme) */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-sky-50/90 via-blue-50/30 to-white border-2 border-sky-200/80 shadow-xs hover:border-sky-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-800 uppercase tracking-wider">
                  Coverage City
                </span>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-500 text-white flex items-center justify-center shadow-xs">
                  <MapPin className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-sky-950 tracking-tight">{user?.city || 'N/A'}</div>
              <p className="text-[11px] text-slate-600 leading-snug">
                Direct matching for emergency hospitals across <strong className="text-sky-900">{user?.city}</strong>
              </p>
            </div>

            {/* Card 3: Contact Reach (Emerald/Teal Theme) */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-50/90 via-teal-50/30 to-white border-2 border-emerald-200/80 shadow-xs hover:border-emerald-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                  Emergency Reach
                </span>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-xs">
                  <Phone className="w-4 h-4" />
                </div>
              </div>
              <div className="text-base font-black text-emerald-950 truncate tracking-tight">{user?.mobileNumber || 'N/A'}</div>
              <p className="text-[11px] text-slate-600 truncate">
                {user?.email || 'N/A'}
              </p>
            </div>

            {/* Card 4: Last Donation & Readiness (Amber/Gold Theme) */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-50/90 via-orange-50/30 to-white border-2 border-amber-200/80 shadow-xs hover:border-amber-300 transition-all space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                  Donation History
                </span>
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-xs">
                  <Heart className="w-4 h-4" />
                </div>
              </div>
              <div className="text-base font-black text-amber-950 tracking-tight">
                {user?.hasNeverDonated
                  ? 'First-Time Donor'
                  : user?.lastDonationDate
                  ? new Date(user.lastDonationDate).toLocaleDateString()
                  : 'No prior donation recorded'}
              </div>
              <p className="text-[11px] text-slate-600">
                Age: <strong className="text-amber-900">{user?.age} yrs</strong> • Gender: <strong className="text-amber-900">{user?.gender}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Push Alert Banner */}
      {actionMessage && (
        <div className="bg-rose-600 text-white p-5 rounded-3xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-bounce">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="font-black text-base">{actionMessage.title}</div>
              <div className="text-xs text-rose-100 mt-0.5">
                {actionMessage.units} Unit(s) of {actionMessage.bloodGroup} needed at {actionMessage.hospital}, {actionMessage.location}
              </div>
              {user?.bloodGroup && (
                <div className="mt-1 text-[11px] font-bold text-white/95 bg-black/20 px-2 py-0.5 rounded-md inline-block border border-white/20">
                  {user.bloodGroup !== actionMessage.bloodGroup ? (
                    <span>⚠️ Requested: {actionMessage.bloodGroup} • Your Group: {user.bloodGroup} (Different Blood Group)</span>
                  ) : (
                    <span>✅ Matching Blood Group ({user.bloodGroup})</span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => handleAcceptRequest(actionMessage.token)}
              className="px-5 py-2.5 rounded-xl bg-white text-rose-700 hover:bg-rose-50 font-black text-xs sm:text-sm shadow-md transition-transform active:scale-95"
            >
              Accept Request Now
            </button>
            <button
              onClick={() => handleViewRequest(actionMessage.token)}
              className="px-3 py-2 rounded-xl bg-rose-700/80 hover:bg-rose-700 text-white font-bold text-xs transition-colors flex items-center space-x-1"
              title="Focus request card"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>View</span>
            </button>
            <button
              onClick={() => handleDeclineRequest(actionMessage.token)}
              className="px-3 py-2 rounded-xl border border-rose-400/60 hover:bg-rose-700 text-rose-100 font-semibold text-xs transition-colors"
              title="Decline this request"
            >
              Decline
            </button>
            <button
              onClick={() => setActionMessage(null)}
              className="p-2 text-rose-200 hover:text-white text-xs font-semibold"
              title="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Connected Patient Call Modal/Notice */}
      {connectedPatientCall && (
        <div className="bg-emerald-50 border-2 border-emerald-500 p-6 rounded-3xl shadow-lg space-y-4">
          <div className="flex items-center space-x-3 text-emerald-900">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md">
              <PhoneCall className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black">
                Connected with Requester! Automatic Call Action Triggered.
              </h3>
              <p className="text-xs text-emerald-700">
                You have been marked as an accepted donor. Please communicate with the hospital or patient contact below:
              </p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-emerald-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm">
            <div>
              <span className="text-slate-400 block text-xs">Patient</span>
              <strong className="text-slate-900">{connectedPatientCall.patientName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs">Hospital / Location</span>
              <strong className="text-slate-900">{connectedPatientCall.hospital}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs">Emergency Phone</span>
              <strong className="text-emerald-700 font-bold">{connectedPatientCall.patientContact}</strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.location.href = `tel:${connectedPatientCall.patientContact}`}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
              >
                <Phone className="w-4 h-4" />
                <span>Call Patient: {connectedPatientCall.patientContact}</span>
              </button>

              {connectedPatientCall.token && (
                <button
                  onClick={() => handleOpenChat(connectedPatientCall.token, {
                    patientName: connectedPatientCall.patientName,
                    hospitalName: connectedPatientCall.hospital,
                  })}
                  className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-vital-600 hover:bg-vital-700 text-white font-bold text-sm shadow-md transition-all active:scale-95"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Chat with Requester</span>
                </button>
              )}
            </div>
            <button
              onClick={() => setConnectedPatientCall(null)}
              className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-2 py-1"
            >
              Done / Close
            </button>
          </div>
        </div>
      )}

      {/* 10-Donor Quota Exceeded Appreciation Notice */}
      {capacityNotice && (
        <div className="bg-blue-50 border-2 border-blue-400 p-6 rounded-3xl shadow-md space-y-3">
          <div className="flex items-center space-x-3 text-blue-900">
            <Heart className="w-7 h-7 text-blue-600 shrink-0" />
            <div>
              <h3 className="font-extrabold text-base">Donor Support Capacity Reached</h3>
              <p className="text-xs sm:text-sm text-blue-800 mt-1">
                {capacityNotice}
              </p>
            </div>
          </div>
          <div className="text-right">
            <button
              onClick={() => setCapacityNotice(null)}
              className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* Blood Group Donor Availability Section */}
      <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80 space-y-6">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-vital-50 text-vital-600 border border-vital-200 flex items-center justify-center font-bold shadow-xs">
              <Droplet className="w-5 h-5 text-vital-600" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
                <span>Blood Group Donor Availability</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time registered donors and active volunteer availability across all major blood groups. Click any card to inspect donors.
              </p>
            </div>
          </div>

          {/* Live Network Summary Pill */}
          {donorAvailability && (
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-600 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200/80">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span>
                Total Network Donors:{' '}
                <strong className="text-slate-900">
                  {Object.values(donorAvailability).reduce((sum, g) => sum + (g?.total || 0), 0)}
                </strong>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                Available Now:{' '}
                <strong className="text-emerald-700">
                  {Object.values(donorAvailability).reduce((sum, g) => sum + (g?.available || 0), 0)}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Blood Group Cards Grid */}
        {loadingAvailability ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
              <div
                key={bg}
                className="p-5 rounded-2xl bg-slate-50 border border-slate-100 animate-pulse space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-slate-200"></div>
                  <div className="w-16 h-5 rounded-full bg-slate-200"></div>
                </div>
                <div className="w-24 h-6 rounded bg-slate-200"></div>
                <div className="w-full h-2 rounded-full bg-slate-200"></div>
                <div className="w-32 h-4 rounded bg-slate-200"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => {
              const groupData = donorAvailability?.[bg] || { total: 0, available: 0 };
              const total = groupData.total || 0;
              const available = groupData.available || 0;
              const isMyGroup = user?.bloodGroup === bg;
              const availabilityPercent = total > 0 ? Math.round((available / total) * 100) : 0;

              return (
                <div
                  key={bg}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBloodGroupForModal(bg)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedBloodGroupForModal(bg);
                    }
                  }}
                  aria-label={`View ${bg} registered donors (${available} available)`}
                  title={`Click to view ${bg} registered donors`}
                  className={`p-5 rounded-2xl border transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 flex flex-col justify-between space-y-3 relative overflow-hidden group focus:outline-none focus:ring-2 focus:ring-vital-500/40 ${
                    isMyGroup
                      ? 'bg-gradient-to-br from-vital-50/40 via-white to-white border-vital-300 ring-2 ring-vital-500/20 shadow-sm hover:border-vital-400'
                      : 'bg-white border-slate-200/90 hover:border-vital-300'
                  }`}
                >
                  {/* Top row: Blood Group Badge & Active Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-11 h-11 rounded-xl bg-vital-50 border border-vital-200 text-vital-700 flex items-center justify-center font-black text-lg shadow-xs group-hover:scale-105 transition-transform">
                        {bg}
                      </div>
                      {isMyGroup && (
                        <span className="px-2 py-0.5 rounded-md bg-vital-100 text-vital-800 text-[10px] font-extrabold uppercase tracking-wider">
                          Your Group
                        </span>
                      )}
                    </div>

                    <div
                      className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center space-x-1.5 border ${
                        available > 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          available > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                        }`}
                      />
                      <span>{available > 0 ? `${available} Available` : '0 Available'}</span>
                    </div>
                  </div>

                  {/* Counts Display */}
                  <div className="space-y-1">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-black text-slate-900 tracking-tight">
                        {total} <span className="text-xs font-semibold text-slate-500 font-sans">Donor{total !== 1 ? 's' : ''}</span>
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        <strong className="text-emerald-700">{available}</strong> available
                      </span>
                    </div>

                    {/* Visual Availability Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          available > 0
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                            : 'bg-slate-300'
                        }`}
                        style={{ width: `${Math.max(availabilityPercent, total > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>

                  {/* Status / Friendly Guidance Message */}
                  <div className="pt-1">
                    {available === 0 ? (
                      <div className="p-2 rounded-xl bg-rose-50/80 border border-rose-200 text-rose-800 text-[11px] leading-tight flex items-start space-x-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                        <span>
                          {total === 0
                            ? 'No registered donors yet. Be the first hero to register!'
                            : 'All donors currently unavailable. Volunteers urgently welcomed!'}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 flex items-center justify-between">
                        <span>Ready for emergency alerts</span>
                        <span className="font-bold text-slate-700">{availabilityPercent}% ready</span>
                      </div>
                    )}
                  </div>

                  {/* Interactive View Donors Footer */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-vital-600 group-hover:text-vital-700 transition-colors">
                    <span className="flex items-center space-x-1.5">
                      <Users className="w-3.5 h-3.5 text-vital-500" />
                      <span>View {bg} Donors</span>
                    </span>
                    <span className="text-vital-500 group-hover:translate-x-1 transition-transform font-black">
                      →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-slate-900 flex items-center space-x-2">
            <Activity className="w-5 h-5 text-vital-600" />
            <span>
              {user?.userType === 'Donor'
                ? 'Matching Emergency Blood Requests'
                : 'Your Active Blood Requests'}
            </span>
          </h2>
          <span className="text-xs font-semibold text-slate-500">
            {emergencies.length} Request{emergencies.length !== 1 ? 's' : ''} found
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-3 border-vital-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs font-semibold">Scanning emergency network...</p>
          </div>
        ) : emergencies.length === 0 ? (
          <div className="p-12 rounded-3xl bg-white border border-dashed border-slate-300 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-700 text-base">No active emergencies</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {user?.userType === 'Donor'
                ? `Currently no matching emergencies in ${user.city} for blood group ${user.bloodGroup}. You will receive an instant push notification when one arises.`
                : 'You have not submitted any active emergency blood requests yet.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {emergencies.map((req, idx) => (
              <div
                key={idx}
                id={`emergency-${req.token}`}
                className={`bg-white rounded-3xl p-6 shadow-sm border transition-all duration-300 space-y-5 ${
                  highlightedToken === req.token
                    ? 'border-vital-500 ring-4 ring-vital-500/30 shadow-xl scale-[1.01]'
                    : 'border-slate-200/90 hover:shadow-md'
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-2xl bg-vital-50 text-vital-700 border border-vital-200 flex items-center justify-center font-black text-lg">
                      {req.bloodGroup}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-black text-slate-900 text-base">
                          {req.patientName || 'Emergency Patient'}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-extrabold uppercase">
                          {req.urgencyLevel}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {req.unitsRequired} Unit(s) required
                      </div>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">
                    {req.status}
                  </span>
                </div>

                {/* Hospital Info */}
                <div className="p-3.5 rounded-2xl bg-slate-50 space-y-1 text-xs text-slate-600">
                  <div className="flex items-center space-x-2 font-semibold text-slate-800">
                    <Hospital className="w-4 h-4 text-vital-600 shrink-0" />
                    <span>{req.hospitalName}</span>
                  </div>
                  <div className="flex items-center space-x-2 pl-6">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{req.hospitalLocation}</span>
                  </div>
                </div>

                {/* Donor Blood Group Match vs Different Callout */}
                {user?.userType === 'Donor' && user?.bloodGroup && (
                  <div className={`p-2 rounded-xl text-[11px] flex items-center space-x-1.5 border ${
                    user.bloodGroup !== req.bloodGroup
                      ? 'bg-amber-50/90 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                  }`}>
                    {user.bloodGroup !== req.bloodGroup ? (
                      <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span className="truncate">
                      Your Group: <strong className="font-extrabold">{user.bloodGroup}</strong> • Needed:{' '}
                      <strong className="font-extrabold">{req.bloodGroup}</strong>{' '}
                      {user.bloodGroup !== req.bloodGroup ? (
                        <span className="font-bold text-amber-700">(Different Blood Group)</span>
                      ) : (
                        <span className="font-bold text-emerald-700">(Matching Blood Group)</span>
                      )}
                    </span>
                  </div>
                )}

                {/* Connected Donors Count Pill */}
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>
                    Connected Donors: <strong>{req.acceptedDonorsCount || 0} / 10</strong>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Action for Donor */}
                {user?.userType === 'Donor' ? (
                  <div>
                    {req.hasAccepted ? (
                      <div className="space-y-2">
                        <div className="w-full py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold text-center flex items-center justify-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>You Have Accepted This Emergency</span>
                        </div>
                        <button
                          onClick={() => handleOpenChat(req.token, req)}
                          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-vital-600 to-rose-600 hover:from-vital-700 hover:to-rose-700 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 shadow-md shadow-vital-600/20 active:scale-95 transition-all"
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span>Chat with Requester</span>
                        </button>
                      </div>
                    ) : req.isFull ? (
                      <div className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold text-center">
                        Quota Reached (10 Donors Connected)
                      </div>
                    ) : (req.hasAcceptedByOther || (req.acceptedDonorsCount > 0 && req.status === 'Donor Accepted')) ? (
                      <div className="space-y-2">
                        <div className="w-full py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold text-center flex items-center justify-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-blue-600" />
                          <span>Request already accepted by a donor ({req.acceptedDonorsCount} connected)</span>
                        </div>
                        <button
                          onClick={() => handleAcceptRequest(req.token)}
                          className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center justify-center space-x-2"
                        >
                          <Heart className="w-4 h-4 text-rose-400" />
                          <span>Also Connect as Donor</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAcceptRequest(req.token)}
                        className="w-full py-3 rounded-xl bg-vital-600 hover:bg-vital-700 text-white text-xs font-bold uppercase tracking-wider shadow-md shadow-vital-600/30 transition-all flex items-center justify-center space-x-2"
                      >
                        <Heart className="w-4 h-4" />
                        <span>Accept Emergency & Connect</span>
                      </button>
                    )}
                  </div>
                ) : (
                  /* Action for Requester: Track Live Status */
                  <button
                    onClick={() => onTrackEmergency(req.token)}
                    className="w-full py-2.5 rounded-xl bg-trust-600 hover:bg-trust-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-all"
                  >
                    View Live Tracker & Connected Donors
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={isEditModalOpen}
        user={user}
        onClose={() => setIsEditModalOpen(false)}
        onProfileUpdated={(updatedUser) => {
          if (onUpdateUser) {
            onUpdateUser(updatedUser);
          }
          setIsAvailable(updatedUser.isAvailable);
          setProfileToast('Your donor profile has been updated successfully.');
          setTimeout(() => setProfileToast(null), 4500);
          fetchEmergencies();
          fetchDonorAvailability();
        }}
      />

      {/* Private Chat Modal with Requester */}
      {activeChat && (
        <ChatModal
          isOpen={Boolean(activeChat)}
          onClose={() => setActiveChat(null)}
          emergencyId={activeChat.emergencyId}
          donorId={activeChat.donorId}
          currentUserRole="donor"
          currentUserId={(user?._id || user?.id)?.toString()}
          emergencySummary={activeChat.emergencySummary}
        />
      )}

      {/* Interactive Blood Group Donors Modal */}
      {selectedBloodGroupForModal && (
        <BloodGroupDonorsModal
          isOpen={Boolean(selectedBloodGroupForModal)}
          bloodGroup={selectedBloodGroupForModal}
          onClose={() => setSelectedBloodGroupForModal(null)}
          currentUser={user}
        />
      )}

      {/* Doctor Prescription Verification Queue Modal */}
      {isPrescriptionModalOpen && (
        <PrescriptionReviewModal
          isOpen={isPrescriptionModalOpen}
          onClose={() => setIsPrescriptionModalOpen(false)}
          onVerified={() => {
            fetchEmergencies();
            fetchNotifications();
            fetchDonorAvailability();
          }}
        />
      )}
    </div>
  );
}

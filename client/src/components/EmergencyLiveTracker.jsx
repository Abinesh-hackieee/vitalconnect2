import React, { useEffect, useState } from 'react';
import {
  HeartPulse,
  PhoneCall,
  Share2,
  CheckCircle2,
  Clock,
  MapPin,
  Hospital,
  Droplet,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Users,
  Sparkles,
  Phone,
  ChevronLeft,
  MessageSquare,
} from 'lucide-react';
import { socket, api } from '../services/api';
import ChatModal from './ChatModal';

export default function EmergencyLiveTracker({
  emergencyData,
  onClose,
  isUserRegistered = false,
}) {
  const [status, setStatus] = useState(emergencyData?.statusData?.status || 'Searching Donors');
  const [acceptedDonors, setAcceptedDonors] = useState(
    emergencyData?.statusData?.acceptedDonors || []
  );
  const [copiedShare, setCopiedShare] = useState(false);
  const [callAlertBanner, setCallAlertBanner] = useState(null);
  const [activeChatDonor, setActiveChatDonor] = useState(null);

  const trackingToken = emergencyData?.trackingToken;
  const statusData = emergencyData?.statusData;
  const triageAdvice = emergencyData?.triageAdvice;

  // Listen to real-time events for this emergency request
  useEffect(() => {
    if (!trackingToken) return;

    // Join emergency socket room
    socket.emit('join_emergency_room', trackingToken);

    const handleDonorAccepted = (payload) => {
      setStatus('Donor Accepted');

      // Determine which sanitized view to present based on requester registration
      const donorDetail = isUserRegistered ? payload.registeredView : payload.guestView;

      setAcceptedDonors((prev) => {
        // Prevent duplicate entries
        const exists = prev.some((d) => d.mobileNumber === donorDetail.mobileNumber);
        if (exists) return prev;
        return [...prev, donorDetail];
      });

      // Automatic Call Action: Promptly trigger tel: action
      const phoneToCall = payload.autoCallNumber;
      if (phoneToCall) {
        setCallAlertBanner(phoneToCall);
        // On mobile devices, window.location.href opens phone dialer directly
        try {
          window.location.href = `tel:${phoneToCall}`;
        } catch (e) {
          console.log('Direct dialer trigger handled:', e);
        }
      }
    };

    socket.on('donor_accepted', handleDonorAccepted);

    // Periodic poll as safety fallback
    const interval = setInterval(async () => {
      try {
        const res = await api.getEmergencyStatus(trackingToken);
        if (res.success && res.statusData) {
          setStatus(res.statusData.status);
          setAcceptedDonors(res.statusData.acceptedDonors || []);
        }
      } catch (err) {
        console.error('Status poll error:', err);
      }
    }, 5000);

    return () => {
      socket.off('donor_accepted', handleDonorAccepted);
      clearInterval(interval);
    };
  }, [trackingToken, isUserRegistered]);

  // Share emergency request
  const handleShare = async () => {
    const shareText = `🚨 URGENT BLOOD NEED: ${statusData?.unitsRequired || 1} Unit(s) of ${
      statusData?.bloodGroup
    } required urgently at ${statusData?.hospitalName}, ${
      statusData?.hospitalLocation
    }. Urgency: ${statusData?.urgencyLevel}. Connect now on Vital Connect!`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Vital Connect Urgent Blood Request',
          text: shareText,
          url: window.location.origin,
        });
      } catch (err) {
        // user cancelled or failed, fallback to copy
        copyToClipboard(shareText);
      }
    } else {
      copyToClipboard(shareText);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedShare(true);
    setTimeout(() => setCopiedShare(false), 3000);
  };

  const triggerCall = async (mobileNumber, donorId = null) => {
    try {
      const res = await api.initiateCallAction({
        token: trackingToken,
        targetType: 'donor',
        donorId,
      });
      if (res?.telUrl) {
        window.location.href = res.telUrl;
        return;
      }
    } catch (e) {
      console.log('Call action fallback handled:', e);
    }
    if (mobileNumber) {
      window.location.href = `tel:${mobileNumber}`;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-fadeIn">
      {/* Back to Dashboard Navigation if Registered */}
      {isUserRegistered && (
        <div className="mb-4">
          <button
            onClick={onClose}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95"
            title="Return to Dashboard"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>
        </div>
      )}

      {/* Top Banner with Pulse Alert */}
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mb-8">
        {/* Status Ribbon */}
        <div className="bg-gradient-to-r from-vital-700 via-vital-600 to-rose-600 text-white p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-md shadow-inner">
                <HeartPulse className="w-8 h-8 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold uppercase tracking-wider">
                    Live Emergency Status
                  </span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
                  {status === 'Donor Accepted'
                    ? '🎉 Donor Connected!'
                    : status === 'Donors Notified'
                    ? 'Matching Donors Alerted'
                    : 'Searching for Donors...'}
                </h1>
              </div>
            </div>

            {/* Share Request Button */}
            <button
              onClick={handleShare}
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-bold text-sm shadow-md transition-all active:scale-95"
            >
              <Share2 className="w-4 h-4 text-vital-600" />
              <span>{copiedShare ? 'Copied to Clipboard!' : 'Share Emergency'}</span>
            </button>
          </div>
        </div>

        {/* Medical Platform Disclaimer Banner */}
        <div className="bg-amber-50 border-b border-amber-200/80 px-6 py-3 text-xs text-amber-900 flex items-center space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Medical Disclaimer:</strong> Vital Connect is a platform for connecting people and does not replace professional emergency medical services.
          </span>
        </div>

        {/* Automatic Call Notification Toast/Banner if Donor Accepted */}
        {callAlertBanner && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 animate-bounce">
            <div className="flex items-center space-x-3 text-emerald-900">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
                <PhoneCall className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="font-extrabold text-sm sm:text-base">
                  A volunteer donor has just accepted your request!
                </div>
                <div className="text-xs text-emerald-700">
                  Connecting requester with donor via telephone dialer action now.
                </div>
              </div>
            </div>
            <button
              onClick={() => triggerCall(callAlertBanner)}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md"
            >
              <Phone className="w-4 h-4" />
              <span>Call Donor: {callAlertBanner}</span>
            </button>
          </div>
        )}

        {/* Main Details Grid */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Patient, Hospital & Comprehensive Emergency Verification Details (All 12 Attributes) */}
          <div className="rounded-3xl bg-slate-50 border border-slate-200/80 p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4">
              <div className="flex items-center space-x-3">
                <span className="w-12 h-12 rounded-2xl bg-vital-600 text-white font-black text-xl flex items-center justify-center shadow-md shadow-vital-600/30">
                  {statusData?.bloodGroup}
                </span>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-black text-slate-900">{statusData?.patientName || 'Emergency Patient'}</h2>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-vital-100 text-vital-700 font-extrabold">
                      {statusData?.unitsRequired || 1} Unit{statusData?.unitsRequired > 1 ? 's' : ''} Needed
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center space-x-2 mt-0.5">
                    <span>{statusData?.hospitalName}</span>
                    <span>•</span>
                    <span>{statusData?.hospitalLocation}</span>
                  </p>
                </div>
              </div>

              {/* Verification Status Badge */}
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Prescription Status
                </span>
                {statusData?.verificationStatus === 'Verified' ? (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-xs shadow-xs border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Verified by Medical Coordinator</span>
                  </span>
                ) : statusData?.verificationStatus === 'Rejected' ? (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-rose-100 text-rose-800 font-extrabold text-xs shadow-xs border border-rose-200">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Prescription Rejected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 font-extrabold text-xs shadow-xs border border-amber-200">
                    <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                    <span>Pending Doctor Verification</span>
                  </span>
                )}
              </div>
            </div>

            {/* Rejection Alert if rejected */}
            {statusData?.verificationStatus === 'Rejected' && statusData?.rejectionReason && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>Reason for Rejection:</strong> {statusData.rejectionReason}
                </span>
              </div>
            )}

            {/* 12 Attributes Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Required Blood Date
                </span>
                <span className="font-bold text-slate-900 text-sm flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-vital-600" />
                  <span>
                    {statusData?.requiredBloodDate
                      ? new Date(statusData.requiredBloodDate).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Immediate'}
                  </span>
                </span>
              </div>

              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Urgency Level
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 font-extrabold text-xs inline-block">
                  {statusData?.urgencyLevel || 'Critical'}
                </span>
              </div>

              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Primary Contact
                </span>
                <span className="font-bold text-slate-800 text-sm flex items-center space-x-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{statusData?.emergencyContactNumber || 'Protected'}</span>
                </span>
              </div>

              <div>
                <span className="font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Guardian Contact
                </span>
                {statusData?.guardianContactNumber ? (
                  <span className="font-semibold text-slate-700 text-xs flex items-center space-x-1">
                    <span>🔒 {statusData.guardianContactNumber}</span>
                    <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Confidential</span>
                  </span>
                ) : (
                  <span className="text-slate-400 italic">None specified</span>
                )}
              </div>
            </div>

            {/* Notes / Description */}
            {statusData?.description && (
              <div className="pt-3 border-t border-slate-200/70 text-xs text-slate-600">
                <span className="font-bold text-slate-700">Medical Notes:</span> {statusData.description}
              </div>
            )}
          </div>

          {/* Real-time Status Tracker Stepper */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center space-x-2">
              <Clock className="w-4 h-4 text-vital-600" />
              <span>Assistance Workflow Progress</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Step 1 */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start space-x-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-xs uppercase tracking-wide text-emerald-900">
                    Step 1: Request Broadcasted
                  </div>
                  <div className="text-xs text-emerald-700 mt-0.5">
                    Nearby donors in {statusData?.hospitalLocation} notified in real time.
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div
                className={`p-4 rounded-2xl border flex items-start space-x-3 ${
                  acceptedDonors.length > 0
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-vital-50/70 border-vital-200'
                }`}
              >
                {acceptedDonors.length > 0 ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-vital-600 border-t-transparent animate-spin shrink-0 mt-0.5"></div>
                )}
                <div>
                  <div
                    className={`font-bold text-xs uppercase tracking-wide ${
                      acceptedDonors.length > 0 ? 'text-emerald-900' : 'text-vital-900'
                    }`}
                  >
                    Step 2: Volunteer Matching
                  </div>
                  <div
                    className={`text-xs mt-0.5 ${
                      acceptedDonors.length > 0 ? 'text-emerald-700' : 'text-vital-700'
                    }`}
                  >
                    {acceptedDonors.length > 0
                      ? `${acceptedDonors.length} volunteer donor(s) responded!`
                      : 'Awaiting first donor acceptance response...'}
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              <div
                className={`p-4 rounded-2xl border flex items-start space-x-3 ${
                  acceptedDonors.length > 0
                    ? 'bg-trust-50 border-trust-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <PhoneCall
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    acceptedDonors.length > 0 ? 'text-trust-600 animate-pulse' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div
                    className={`font-bold text-xs uppercase tracking-wide ${
                      acceptedDonors.length > 0 ? 'text-trust-900' : 'text-slate-500'
                    }`}
                  >
                    Step 3: Direct Call Connection
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {acceptedDonors.length > 0
                      ? 'Immediate tel: call connection initiated.'
                      : 'Call enabled immediately once donor accepts.'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Connected Donors Section - Strict Privacy Rules Enforced */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold text-slate-900 flex items-center space-x-2">
                <Users className="w-5 h-5 text-vital-600" />
                <span>Connected Volunteer Donors ({acceptedDonors.length} / 10 Max)</span>
              </h3>
              <span className="text-xs text-slate-500 font-semibold">
                {isUserRegistered ? 'Registered Requester Mode' : 'Non-Registered Emergency Mode'}
              </span>
            </div>

            {/* Note on initial contact secrecy */}
            {acceptedDonors.length === 0 ? (
              <div className="p-6 rounded-2xl bg-slate-50 border border-dashed border-slate-300 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-slate-200 text-slate-500 mx-auto flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto">
                  <p className="text-sm font-bold text-slate-700">
                    Donor contact information is protected.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    To maintain safety and privacy, donor contact information will appear here only after an eligible registered donor reviews the emergency alert and clicks "Accept Request".
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {acceptedDonors.map((donor, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-white border-2 border-emerald-500 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      {isUserRegistered ? (
                        /* Registered Requester View:
                           Shows: Donor Name, Age, Blood Group, City/Location, Contact Number, Last Blood Donation Date
                           Does NOT show: Date of Birth, Email, Exact Home Address */
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-extrabold text-slate-900 text-base">
                              {donor.fullName}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-vital-100 text-vital-800 text-xs font-bold">
                              {donor.bloodGroup}
                            </span>
                            {donor.age && (
                              <span className="text-xs text-slate-500 font-medium">
                                • {donor.age} yrs
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                            <span className="flex items-center space-x-1">
                              <MapPin className="w-3.5 h-3.5 text-slate-400" />
                              <span>{donor.city}</span>
                            </span>
                            {donor.lastDonationDate && (
                              <span className="flex items-center space-x-1">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>
                                  Last Donated:{' '}
                                  {new Date(donor.lastDonationDate).toLocaleDateString()}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        /* Non-Registered Emergency User View:
                           Displays ONLY the accepted donor's Contact Number!
                           Does NOT display: DOB, email, exact location, last donation date, or other personal info */
                        <div>
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 block">
                            Accepted Volunteer Donor #{idx + 1}
                          </span>
                          <div className="text-lg font-black text-slate-900 mt-0.5">
                            {donor.mobileNumber}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            Donor identity shielded under Vital Connect privacy policy.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Instant Call Action & Private Chat Action */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => triggerCall(donor.mobileNumber, donor.donorId)}
                        className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
                      >
                        <PhoneCall className="w-3.5 h-3.5" />
                        <span>Call Donor</span>
                      </button>

                      <button
                        onClick={() => setActiveChatDonor(donor)}
                        className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-vital-600 to-rose-600 hover:from-vital-700 hover:to-rose-700 text-white font-bold text-xs shadow-md shadow-vital-600/20 transition-all active:scale-95"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Chat with Donor</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Gemini AI Triage Guidance Card */}
          {triageAdvice && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-trust-50 to-indigo-50/50 border border-trust-200/80 space-y-3">
              <div className="flex items-center space-x-2 text-trust-800">
                <Sparkles className="w-4 h-4 text-trust-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  AI Emergency Guidance
                </h4>
              </div>
              <p className="text-sm font-semibold text-slate-800">
                {triageAdvice.urgencySummary}
              </p>
              {triageAdvice.immediateSteps && (
                <ul className="space-y-1 text-xs text-slate-600">
                  {triageAdvice.immediateSteps.map((step, i) => (
                    <li key={i} className="flex items-start space-x-2">
                      <span className="font-bold text-trust-600">•</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              )}
              {triageAdvice.compatibilityNote && (
                <div className="text-xs text-trust-900 bg-white/70 p-2.5 rounded-xl border border-trust-100">
                  <strong>Compatibility Note:</strong> {triageAdvice.compatibilityNote}
                </div>
              )}
            </div>
          )}

          {/* Return Home / Dashboard Action */}
          <div className="pt-4 flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold uppercase tracking-wider transition-colors"
            >
              {isUserRegistered ? 'Return to Dashboard' : 'Return to Main Screen'}
            </button>
          </div>
        </div>
      </div>

      {/* Private Chat Modal with Accepted Donor */}
      {activeChatDonor && (
        <ChatModal
          isOpen={Boolean(activeChatDonor)}
          onClose={() => setActiveChatDonor(null)}
          emergencyId={trackingToken}
          donorId={activeChatDonor.donorId}
          currentUserRole="requester"
          trackingToken={trackingToken}
          emergencySummary={{
            emergencyId: trackingToken,
            patientName: statusData?.patientName,
            bloodGroup: statusData?.bloodGroup,
            hospitalName: statusData?.hospitalName,
            hospitalLocation: statusData?.hospitalLocation,
          }}
          partnerInfo={{
            donorId: activeChatDonor.donorId,
            fullName: activeChatDonor.fullName,
            mobileNumber: activeChatDonor.mobileNumber,
            bloodGroup: activeChatDonor.bloodGroup,
            city: activeChatDonor.city,
          }}
        />
      )}
    </div>
  );
}

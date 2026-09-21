import React, { useState, useEffect } from 'react';
import {
  X,
  FileCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Hospital,
  Droplet,
  Calendar,
  Clock,
  Phone,
  ShieldCheck,
  RefreshCw,
  FileText,
  Lock,
} from 'lucide-react';
import { api } from '../services/api';

export default function PrescriptionReviewModal({ isOpen, onClose, onVerified }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Rejection modal state
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Document inspection modal state
  const [previewDoc, setPreviewDoc] = useState(null);
  const [loadingDoc, setLoadingDoc] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPending();
    }
  }, [isOpen]);

  const fetchPending = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getPendingEmergencyVerifications();
      if (res.success) {
        setRequests(res.requests || []);
      } else {
        setError(res.message || 'Failed to load verification queue.');
      }
    } catch (err) {
      setError('Connection error while fetching verification queue.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (id) => {
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.verifyEmergencyRequest(id);
      if (res.success) {
        setSuccessMsg(
          `Request verified! Alerts broadcasted to ${res.notifiedDonorsCount || 0} registered available donors (${res.onlineAlertsCount || 0} live in-app, ${res.offlineSmsCount || 0} SMS).`
        );
        fetchPending();
        if (onVerified) onVerified();
      } else {
        setError(res.message || 'Failed to verify request.');
      }
    } catch (err) {
      setError('Verification network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenReject = (id) => {
    setRejectingId(id);
    setRejectionReason('');
  };

  const handleConfirmReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Please provide a specific rejection reason.');
      return;
    }
    setActionLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.rejectEmergencyRequest(rejectingId, rejectionReason.trim());
      if (res.success) {
        setSuccessMsg('Emergency request prescription marked as rejected.');
        setRejectingId(null);
        setRejectionReason('');
        fetchPending();
      } else {
        setError(res.message || 'Failed to reject request.');
      }
    } catch (err) {
      setError('Rejection network error.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleInspectPrescription = async (id, filename) => {
    setLoadingDoc(true);
    try {
      const res = await api.getPrescriptionDocument(id);
      if (res.success) {
        setPreviewDoc({
          filename: res.filename || filename || 'prescription',
          mimeType: res.mimeType,
          data: res.data,
        });
      } else {
        alert('Prescription file could not be loaded.');
      }
    } catch (err) {
      alert('Failed to fetch prescription document.');
    } finally {
      setLoadingDoc(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-7 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">
                    Prescription Verification Queue
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {requests.length} Pending
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  Verify doctor prescriptions before emergency broadcast alerts are dispatched to donors.
                </p>
              </div>
            </div>

            <button
              onClick={fetchPending}
              disabled={loading}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {error && (
          <div className="m-5 mb-0 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-center space-x-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="m-5 mb-0 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center space-x-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Requests List */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500">Loading pending verification requests...</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-slate-800">Verification Queue is Clear</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                There are no emergency requests awaiting prescription verification right now. All requests are verified or fulfilled.
              </p>
            </div>
          ) : (
            requests.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 bg-white shadow-sm transition-all space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-3">
                    <span className="w-9 h-9 rounded-xl bg-rose-50 text-vital-600 font-extrabold flex items-center justify-center text-sm border border-rose-200 shrink-0">
                      {req.bloodGroup}
                    </span>
                    <div>
                      <h4 className="text-base font-bold text-slate-900">{req.patientName}</h4>
                      <p className="text-xs text-slate-500 flex items-center space-x-2">
                        <span>{req.unitsRequired} Unit(s) Required</span>
                        <span>•</span>
                        <span className="text-rose-600 font-semibold">{req.urgencyLevel}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-bold border border-amber-200">
                      ⏳ Pending Verification
                    </span>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 bg-slate-50/70 p-3.5 rounded-xl border border-slate-100">
                  <div className="flex items-start space-x-2">
                    <Hospital className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800 block">{req.hospitalName}</span>
                      <span className="text-slate-500">{req.hospitalLocation}</span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Calendar className="w-4 h-4 text-vital-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800 block">Required Date</span>
                      <span className="text-slate-500">
                        {req.requiredBloodDate ? new Date(req.requiredBloodDate).toLocaleDateString() : 'Immediate'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start space-x-2">
                    <Phone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800 block">Contact: {req.emergencyContactNumber}</span>
                      {req.guardianContactNumber ? (
                        <span className="text-[11px] text-indigo-700 font-medium block">
                          🔒 Guardian: {req.guardianContactNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No guardian number</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prescription Document Section */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">Prescription File:</span>
                    {req.hasPrescription ? (
                      <>
                        <span className="text-xs px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium">
                          📎 {req.prescriptionFileName || 'Prescription Document'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleInspectPrescription(req.id, req.prescriptionFileName)}
                          disabled={loadingDoc}
                          className="inline-flex items-center space-x-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline ml-2"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Document</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                        Not uploaded (Optional for {req.urgencyLevel})
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => handleOpenReject(req.id)}
                      disabled={actionLoading}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold transition-all"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Reject</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleVerify(req.id)}
                      disabled={actionLoading}
                      className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/30 transition-all"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verify & Broadcast</span>
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Prescription verification protects donors from invalid or duplicate emergency calls.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors"
          >
            Close Queue
          </button>
        </div>
      </div>

      {/* Rejection Reason Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-rose-600 font-bold">
                <XCircle className="w-5 h-5" />
                <span>Reject Prescription</span>
              </div>
              <button
                onClick={() => setRejectingId(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Please state why this doctor prescription cannot be verified. This reason will be recorded on the request status.
            </p>

            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Doctor signature missing, date is expired, hospital seal illegible"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs bg-slate-50/50"
            />

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectingId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={actionLoading || !rejectionReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/30 transition-all disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Preview Lightbox */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <FileCheck className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-bold text-slate-900 truncate">
                  {previewDoc.filename}
                </span>
              </div>
              <button
                onClick={() => setPreviewDoc(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center bg-slate-100/60 rounded-xl p-3 min-h-[300px]">
              {previewDoc.data && previewDoc.data.startsWith('data:image/') ? (
                <img
                  src={previewDoc.data}
                  alt="Doctor Prescription"
                  className="max-h-[60vh] max-w-full rounded-lg shadow-sm object-contain"
                />
              ) : previewDoc.data && previewDoc.data.startsWith('data:application/pdf') ? (
                <iframe
                  src={previewDoc.data}
                  title="PDF Prescription"
                  className="w-full h-[55vh] rounded-lg border border-slate-200"
                />
              ) : (
                <div className="text-center p-6 space-y-2">
                  <FileText className="w-12 h-12 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-600 font-medium">Document attached: {previewDoc.filename}</p>
                  <a
                    href={previewDoc.data}
                    download={previewDoc.filename}
                    className="inline-block px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

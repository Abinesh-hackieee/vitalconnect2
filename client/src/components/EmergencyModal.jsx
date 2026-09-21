import React, { useState } from 'react';
import {
  X,
  AlertCircle,
  ShieldAlert,
  CheckCircle2,
  Hospital,
  Droplet,
  User,
  Phone,
  MapPin,
  FileText,
  ChevronRight,
  Calendar,
  Upload,
  FileCheck,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import BloodGroupSelector, { ALL_BLOOD_GROUPS } from './BloodGroupSelector';

const URGENCY_LEVELS = [
  'Critical / Immediate',
  'High (Within 2 hrs)',
  'Urgent (Within 6 hrs)',
  'Scheduled',
];

/**
 * Check if Doctor Prescription / Hospital Requisition is mandatory:
 * 1. Immediate -> OPTIONAL
 * 2. Within 2 Hours -> OPTIONAL
 * 3. Urgent -> MANDATORY
 * 4. Scheduled/Planned -> MANDATORY
 */
export const isPrescriptionMandatory = (urgencyLevel) => {
  if (!urgencyLevel) return false;
  const level = String(urgencyLevel).toLowerCase();
  if (
    level.includes('immediate') ||
    level.includes('within 2') ||
    level.includes('2 hr') ||
    level.includes('2 hour')
  ) {
    return false;
  }
  if (
    level.includes('urgent') ||
    level.includes('scheduled') ||
    level.includes('planned') ||
    level.includes('plan')
  ) {
    return true;
  }
  return false;
};

export default function EmergencyModal({ isOpen, onClose, onEmergencySubmitted }) {
  const todayString = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    patientName: '',
    bloodGroup: 'O+',
    unitsRequired: 1,
    hospitalName: '',
    hospitalLocation: '',
    emergencyContactNumber: '',
    guardianContactNumber: '',
    requiredBloodDate: todayString,
    description: '',
    urgencyLevel: 'Critical / Immediate',
  });

  const [prescriptionFile, setPrescriptionFile] = useState(null);
  const [step, setStep] = useState(1); // 1 = Form, 2 = Confirmation Modal
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isPrescriptionRequired = isPrescriptionMandatory(formData.urgencyLevel);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (error) setError('');
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedExts = ['pdf', 'jpg', 'jpeg', 'png'];
    const ext = file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
      setError('Invalid file type. Please upload a PDF, JPG, JPEG, or PNG document.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('Prescription file size exceeds the 10MB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPrescriptionFile({
        filename: file.name,
        originalName: file.name,
        mimeType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'),
        size: file.size,
        data: reader.result,
      });
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const handleInitialValidation = (e) => {
    e.preventDefault();
    setError('');

    if (
      !formData.patientName.trim() ||
      !formData.hospitalName.trim() ||
      !formData.hospitalLocation.trim() ||
      !formData.emergencyContactNumber.trim()
    ) {
      setError('Please fill in all required medical details.');
      return;
    }

    const phoneRegex = /^[0-9+\-\s()]{7,15}$/;
    if (!phoneRegex.test(formData.emergencyContactNumber.trim())) {
      setError('Please enter a valid emergency contact telephone number.');
      return;
    }

    // Validate optional guardian contact number
    if (formData.guardianContactNumber && formData.guardianContactNumber.trim()) {
      if (!phoneRegex.test(formData.guardianContactNumber.trim())) {
        setError('Please enter a valid guardian contact phone number.');
        return;
      }
    }

    // Validate required blood date (cannot be in the past)
    if (!formData.requiredBloodDate) {
      setError('Please select the required blood date.');
      return;
    }
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const reqDateMidnight = new Date(formData.requiredBloodDate);
    reqDateMidnight.setHours(0, 0, 0, 0);
    if (reqDateMidnight < todayMidnight) {
      setError('Required blood date cannot be in the past.');
      return;
    }

    // Conditionally validate doctor prescription file upload based on Urgency Level
    if (isPrescriptionRequired && !prescriptionFile) {
      setError('Doctor prescription / hospital requisition file upload is mandatory for the selected urgency level.');
      return;
    }

    if (Number(formData.unitsRequired) < 1) {
      setError('Units required must be at least 1.');
      return;
    }

    if (!ALL_BLOOD_GROUPS.includes(formData.bloodGroup)) {
      setError('Please select a valid blood group.');
      return;
    }

    // Move to confirmation step
    setStep(2);
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.createEmergency({
        ...formData,
        unitsRequired: Number(formData.unitsRequired),
        prescriptionFile,
        requirePrescription: isPrescriptionRequired,
      });

      if (res.success) {
        onEmergencySubmitted({
          trackingToken: res.trackingToken,
          statusData: res.statusData,
          triageAdvice: res.triageAdvice,
          matchingDonorsCount: res.matchingDonorsCount,
        });
        onClose();
      } else {
        setError(res.message || 'Failed to submit emergency request.');
        setStep(1);
      }
    } catch (err) {
      setError('Network or server connection error. Please try again.');
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-vital-700 via-vital-600 to-rose-600 text-white p-6 sm:p-8 relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-black/20 hover:bg-black/30 flex items-center justify-center text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white backdrop-blur-sm shadow-inner">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-rose-200">
                Immediate Urgent Assistance
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Emergency Blood Request
              </h2>
            </div>
          </div>
          <p className="mt-2 text-rose-100 text-xs sm:text-sm">
            Fill in the details below. Verified emergency requests will broadcast alerts to ALL currently available volunteer donors.
          </p>
        </div>

        {/* Medical Disclaimer Banner */}
        <div className="bg-amber-50 border-b border-amber-200/80 px-6 py-3 text-xs text-amber-900 flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Verification Policy:</strong>{' '}
            {isPrescriptionRequired
              ? 'Doctor prescription verification is mandatory.'
              : 'Doctor prescription is optional for this urgency level.'}{' '}
            Once verified, alerts reach all eligible registered donors.
          </span>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleInitialValidation} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Patient Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                    <User className="w-3.5 h-3.5 text-vital-600" />
                    <span>Patient Name *</span>
                  </label>
                  <input
                    type="text"
                    name="patientName"
                    value={formData.patientName}
                    onChange={handleChange}
                    placeholder="Full name of patient"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50"
                  />
                </div>

                {/* Emergency Contact */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                    <Phone className="w-3.5 h-3.5 text-vital-600" />
                    <span>Emergency Contact Number *</span>
                  </label>
                  <input
                    type="tel"
                    name="emergencyContactNumber"
                    value={formData.emergencyContactNumber}
                    onChange={handleChange}
                    placeholder="Primary contact number"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50"
                  />
                </div>

                {/* Blood Group */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                    <Droplet className="w-3.5 h-3.5 text-vital-600" />
                    <span>Required Blood Group *</span>
                  </label>
                  <BloodGroupSelector
                    id="emergency-blood-group"
                    name="bloodGroup"
                    value={formData.bloodGroup}
                    onChange={handleChange}
                  />
                </div>

                {/* Units Required */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Units Required *
                  </label>
                  <input
                    type="number"
                    name="unitsRequired"
                    min="1"
                    max="20"
                    value={formData.unitsRequired}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50 font-bold"
                  />
                </div>

                {/* Hospital Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                    <Hospital className="w-3.5 h-3.5 text-vital-600" />
                    <span>Hospital Name *</span>
                  </label>
                  <input
                    type="text"
                    name="hospitalName"
                    value={formData.hospitalName}
                    onChange={handleChange}
                    placeholder="e.g. Apollo Speciality Hospital"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50"
                  />
                </div>

                {/* Hospital Location (City / Area) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                    <MapPin className="w-3.5 h-3.5 text-vital-600" />
                    <span>Hospital Location / City *</span>
                  </label>
                  <input
                    type="text"
                    name="hospitalLocation"
                    value={formData.hospitalLocation}
                    onChange={handleChange}
                    placeholder="e.g. Chennai Central"
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50"
                  />
                </div>

                {/* Guardian Contact (Optional & Confidential) */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                    <span className="flex items-center space-x-1">
                      <Phone className="w-3.5 h-3.5 text-trust-600" />
                      <span>Guardian Contact Number (Optional)</span>
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-600">🔒 Confidential</span>
                  </label>
                  <input
                    type="tel"
                    name="guardianContactNumber"
                    value={formData.guardianContactNumber}
                    onChange={handleChange}
                    placeholder="e.g. +91 98765 00000 (Optional secondary contact)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Guardian contact is confidential. It will NOT be revealed to donors or shown publicly.
                  </p>
                </div>

                {/* Required Blood Date & Urgency Level (Adjacent) */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5 text-vital-600" />
                    <span>Required Blood Date *</span>
                  </label>
                  <input
                    type="date"
                    name="requiredBloodDate"
                    min={todayString}
                    value={formData.requiredBloodDate}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50 font-medium"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Date when the blood is required (cannot be in the past).</p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Urgency Level *
                  </label>
                  <select
                    name="urgencyLevel"
                    value={formData.urgencyLevel}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50 font-bold text-slate-800"
                  >
                    {URGENCY_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">Select the operational urgency for hospital staff.</p>
                </div>

                {/* Doctor Prescription File Upload (Conditionally Mandatory / Optional) */}
                <div className="sm:col-span-2 space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span className="flex items-center space-x-1">
                      <FileCheck className="w-3.5 h-3.5 text-vital-600" />
                      <span>
                        {isPrescriptionRequired
                          ? 'Doctor Prescription / Hospital Requisition *'
                          : 'Doctor Prescription / Hospital Requisition (Optional)'}
                      </span>
                    </span>
                    <span className="text-[11px] font-normal text-slate-500">PDF, JPG, JPEG, PNG (Max 10MB)</span>
                  </label>

                  {prescriptionFile ? (
                    <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center space-x-3 truncate">
                        <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0 uppercase">
                          {prescriptionFile.filename.split('.').pop()}
                        </div>
                        <div className="truncate">
                          <p className="font-bold text-slate-800 truncate">{prescriptionFile.filename}</p>
                          <p className="text-slate-500 text-[11px]">
                            {(prescriptionFile.size / 1024).toFixed(1)} KB • Attached for medical verification
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPrescriptionFile(null)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 transition-colors"
                        title="Remove file"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-slate-300 hover:border-vital-500 rounded-2xl p-5 text-center transition-colors bg-slate-50/60 cursor-pointer">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                        <div className="w-10 h-10 rounded-xl bg-vital-50 text-vital-600 flex items-center justify-center shadow-sm">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-vital-700">Click to upload doctor prescription</span>
                          <p className="text-[11px] text-slate-500">
                            {isPrescriptionRequired
                              ? 'Mandatory medical document to verify request authenticity'
                              : 'Optional document to support request verification'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Patient/Request Description */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1">
                    <FileText className="w-3.5 h-3.5 text-vital-600" />
                    <span>Medical Notes / Diagnosis Details (Optional)</span>
                  </label>
                  <textarea
                    name="description"
                    rows="2"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="e.g. Emergency surgery scheduled, ICU Room 302, patient requires immediate crossmatch"
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-vital-500 focus:border-transparent text-sm bg-slate-50/50 resize-none"
                  ></textarea>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-vital-600 hover:bg-vital-700 text-white text-sm font-bold shadow-md shadow-vital-600/30 transition-all"
                >
                  <span>Review & Confirm</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          ) : (
            /* Step 2: Confirmation Modal with Safety Verification */
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <span>Confirm Emergency Blood Details:</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                    Pending Verification
                  </span>
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div>
                    <span className="text-slate-500">Patient:</span>{' '}
                    <strong className="text-slate-900">{formData.patientName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Blood Required:</span>{' '}
                    <strong className="text-vital-600 font-extrabold">{formData.bloodGroup}</strong> ({formData.unitsRequired} Units)
                  </div>
                  <div>
                    <span className="text-slate-500">Required Date:</span>{' '}
                    <strong className="text-slate-900">{formData.requiredBloodDate}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Urgency:</span>{' '}
                    <span className="font-bold text-rose-600">{formData.urgencyLevel}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Hospital:</span>{' '}
                    <strong className="text-slate-900">{formData.hospitalName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Location:</span>{' '}
                    <strong className="text-slate-900">{formData.hospitalLocation}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Contact:</span>{' '}
                    <strong className="text-slate-900">{formData.emergencyContactNumber}</strong>
                  </div>
                  {formData.guardianContactNumber ? (
                    <div>
                      <span className="text-slate-500">Guardian:</span>{' '}
                      <span className="font-semibold text-slate-700">{formData.guardianContactNumber} (Confidential)</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-slate-500">Guardian:</span>{' '}
                      <span className="text-slate-400 italic">None specified</span>
                    </div>
                  )}
                  {prescriptionFile ? (
                    <div className="col-span-2 flex items-center space-x-2 pt-1">
                      <span className="text-slate-500">Prescription:</span>{' '}
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-medium text-xs">
                        📎 {prescriptionFile.filename} ({(prescriptionFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ) : (
                    <div className="col-span-2 flex items-center space-x-2 pt-1">
                      <span className="text-slate-500">Prescription:</span>{' '}
                      <span className="text-slate-500 italic text-xs">Not uploaded (Optional for {formData.urgencyLevel})</span>
                    </div>
                  )}
                </div>
                {formData.description && (
                  <div className="text-xs text-slate-600 pt-2 border-t border-slate-200/80">
                    <span className="font-semibold">Notes:</span> {formData.description}
                  </div>
                )}
              </div>

              {/* Legal and Privacy Affirmation */}
              <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 text-xs text-rose-900 space-y-2">
                <div className="font-bold flex items-center space-x-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>Verification & Donor Notification Process</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li>This request will enter the <strong>Prescription Verification Queue</strong>.</li>
                  <li>Once verified by an authorized coordinator, emergency broadcast alerts will be dispatched to <strong>ALL currently available registered donors</strong> regardless of blood group.</li>
                  <li>Donors in cooldown waiting periods and unavailable donors will not be disturbed.</li>
                  <li>To protect donor privacy, donor details will <strong>not</strong> be revealed until a suitable donor accepts.</li>
                </ul>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-semibold transition-colors"
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={loading}
                  className="flex items-center space-x-2 px-7 py-3 rounded-xl bg-vital-600 hover:bg-vital-700 text-white text-sm font-bold shadow-lg shadow-vital-600/30 transition-all"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting for Verification...</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span>Submit Emergency Request</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

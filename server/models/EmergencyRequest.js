const mongoose = require('mongoose');

const emergencyRequestSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      required: [true, 'Patient name is required'],
      trim: true,
    },
    bloodGroup: {
      type: String,
      required: [true, 'Blood group is required'],
      enum: [
        'A+',
        'A-',
        'B+',
        'B-',
        'AB+',
        'AB-',
        'O+',
        'O-',
        'A1+',
        'A1-',
        'A2+',
        'A2-',
        'A1B+',
        'A1B-',
        'A2B+',
        'A2B-',
        'Bombay Blood Group (Oh / hh)',
      ],
    },
    unitsRequired: {
      type: Number,
      required: [true, 'Units required is required'],
      min: [1, 'At least 1 unit is required'],
    },
    hospitalName: {
      type: String,
      required: [true, 'Hospital name is required'],
      trim: true,
    },
    hospitalLocation: {
      type: String,
      required: [true, 'Hospital location is required'],
      trim: true,
    },
    emergencyContactNumber: {
      type: String,
      required: [true, 'Emergency contact number is required'],
      trim: true,
    },
    guardianContactNumber: {
      type: String,
      default: '',
      trim: true,
    },
    requiredBloodDate: {
      type: Date,
      required: [true, 'Required blood date is required'],
      default: Date.now,
    },
    prescriptionFile: {
      filename: String,
      originalName: String,
      mimeType: String,
      size: Number,
      data: String,
    },
    verificationStatus: {
      type: String,
      enum: ['Pending Verification', 'Verified', 'Rejected'],
      default: 'Pending Verification',
      index: true,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    urgencyLevel: {
      type: String,
      required: [true, 'Urgency level is required'],
      enum: ['Critical / Immediate', 'High (Within 2 hrs)', 'Urgent (Within 6 hrs)', 'Scheduled'],
      default: 'Critical / Immediate',
    },
    isRegisteredRequester: {
      type: Boolean,
      default: false,
    },
    requesterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['Pending Verification', 'Searching Donors', 'Donors Notified', 'Donor Accepted', 'Fulfilled', 'Closed'],
      default: 'Searching Donors',
    },
    acceptedDonors: [
      {
        donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fullName: String,
        mobileNumber: String,
        age: Number,
        bloodGroup: String,
        city: String,
        lastDonationDate: Date,
        acceptedAt: { type: Date, default: Date.now },
        callInitiated: { type: Boolean, default: false },
      },
    ],
    waitlistDonors: [
      {
        donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        respondedAt: { type: Date, default: Date.now },
      },
    ],
    notifiedDonors: [
      {
        donorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fullName: String,
        bloodGroup: String,
        deliveryChannel: { type: String, enum: ['in-app', 'sms', 'both'], default: 'in-app' },
        notifiedAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const inMemoryEmergencyRequests = [];

module.exports = {
  EmergencyRequest: mongoose.models.EmergencyRequest || mongoose.model('EmergencyRequest', emergencyRequestSchema),
  inMemoryEmergencyRequests,
};

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Donor ID is required'],
      index: true,
    },
    emergencyRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmergencyRequest',
      required: [true, 'Emergency Request ID is required'],
    },
    internalToken: {
      type: String,
      required: [true, 'Internal tracking token is required'],
      index: true,
    },
    patientName: {
      type: String,
      default: 'Emergency Patient',
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
    urgencyLevel: {
      type: String,
      required: [true, 'Urgency level is required'],
      default: 'Critical / Immediate',
    },
    description: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['unread', 'read', 'accepted', 'declined'],
      default: 'unread',
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    deliveryChannel: {
      type: String,
      enum: ['in-app', 'sms', 'both'],
      default: 'in-app',
    },
    isOffline: {
      type: Boolean,
      default: false,
    },
    smsStatus: {
      type: String,
      enum: ['none', 'pending', 'sent', 'failed', 'mock_delivered', 'duplicate_prevented'],
      default: 'none',
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed', 'accepted'],
      default: 'pending',
    },
    callActionStatus: {
      type: String,
      enum: ['none', 'manual_tel', 'initiated', 'completed', 'failed'],
      default: 'none',
    },
  },
  {
    timestamps: true,
  }
);

// Fallback in-memory notification collection
const inMemoryNotifications = [];

module.exports = {
  Notification: mongoose.models.Notification || mongoose.model('Notification', notificationSchema),
  inMemoryNotifications,
};

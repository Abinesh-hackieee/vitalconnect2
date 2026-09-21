const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: [true, 'Mobile number is required'],
      trim: true,
      unique: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
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
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: ['Male', 'Female', 'Other', 'Prefer not to say'],
    },
    age: {
      type: Number,
      required: [true, 'Age is required'],
      min: [18, 'Must be at least 18 to donate or register'],
      max: [100, 'Invalid age'],
    },
    city: {
      type: String,
      required: [true, 'City/Location is required'],
      trim: true,
    },
    userType: {
      type: String,
      required: [true, 'User type is required'],
      enum: ['Donor', 'Requester'],
      default: 'Donor',
    },
    lastDonationDate: {
      type: Date,
      default: null,
    },
    hasNeverDonated: {
      type: Boolean,
      default: false,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    otpHash: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    otpAttempts: {
      type: Number,
      default: 0,
    },
    otpResendCooldown: {
      type: Date,
      default: null,
    },
    role: {
      type: String,
      enum: ['User', 'Doctor', 'Admin'],
      default: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Resilient fallback storage array when MongoDB is not running
const inMemoryUsers = [];

module.exports = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  inMemoryUsers,
};

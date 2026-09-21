const mongoose = require('mongoose');

/**
 * Message Subdocument Schema
 * Represents an individual message within a Conversation
 */
const messageSchema = new mongoose.Schema(
  {
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Message senderId is required'],
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Message receiverId is required'],
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    text: {
      type: String,
      required: [true, 'Message text is required'],
      trim: true,
      maxlength: [2000, 'Message text cannot exceed 2000 characters'],
    },
    status: {
      type: String,
      enum: {
        values: ['sent', 'delivered', 'read'],
        message: '{VALUE} is not a supported message status',
      },
      default: 'sent',
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true, // messageId
  }
);

/**
 * Conversation Schema
 * Represents direct communication between an Emergency Requester and an Accepted Donor
 */
const conversationSchema = new mongoose.Schema(
  {
    emergencyRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmergencyRequest',
      required: [true, 'Associated emergencyRequestId is required'],
      index: true,
    },
    participants: {
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Participant senderId is required'],
        index: true,
      },
      receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Participant receiverId is required'],
        index: true,
      },
    },
    messages: [messageSchema],
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying conversations between two participants
conversationSchema.index({ 'participants.senderId': 1, 'participants.receiverId': 1 });
conversationSchema.index({ emergencyRequestId: 1, 'participants.senderId': 1, 'participants.receiverId': 1 });

/**
 * Static Privacy Guard:
 * Check if communication is permitted between requester and donor for this emergency.
 * Strictly verifies that the donor is present in the emergency's acceptedDonors list.
 */
conversationSchema.statics.canCommunicate = async function (emergencyId, donorId) {
  if (!emergencyId || !donorId) return false;

  const { EmergencyRequest, inMemoryEmergencyRequests } = require('./EmergencyRequest');
  const { getDBStatus } = require('../config/db');

  const donorIdStr = donorId.toString();

  if (getDBStatus()) {
    const emergency = await EmergencyRequest.findById(emergencyId).select('acceptedDonors status').lean();
    if (!emergency) return false;

    return (emergency.acceptedDonors || []).some(
      (d) => (d.donorId ? d.donorId.toString() : '') === donorIdStr
    );
  } else {
    const emergency = inMemoryEmergencyRequests.find(
      (e) => (e._id || e.id).toString() === emergencyId.toString()
    );
    if (!emergency) return false;

    return (emergency.acceptedDonors || []).some(
      (d) => (d.donorId ? d.donorId.toString() : '') === donorIdStr
    );
  }
};

// Resilient fallback storage array when MongoDB is offline
const inMemoryConversations = [];

module.exports = {
  Conversation: mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema),
  inMemoryConversations,
};

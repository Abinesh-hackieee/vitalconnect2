const mongoose = require('mongoose');
const { Conversation, inMemoryConversations } = require('../models/Conversation');
const { EmergencyRequest, inMemoryEmergencyRequests } = require('../models/EmergencyRequest');
const { getDBStatus } = require('../config/db');

/**
 * Helper to resolve Emergency Request from DB or In-Memory
 */
const findEmergency = async (emergencyId) => {
  const isConnected = getDBStatus();
  if (isConnected) {
    if (mongoose.Types.ObjectId.isValid(emergencyId)) {
      return await EmergencyRequest.findById(emergencyId);
    }
    return null;
  } else {
    return inMemoryEmergencyRequests.find(
      (e) => (e._id || e.id).toString() === emergencyId.toString()
    );
  }
};

/**
 * Helper to identify participant IDs
 */
const resolveParticipants = (emergency, donorId, user, trackingToken) => {
  const donorIdStr = donorId.toString();
  const emergencyIdStr = (emergency._id || emergency.id).toString();

  // Donor ObjectId
  const donorObjectId = mongoose.Types.ObjectId.isValid(donorIdStr)
    ? new mongoose.Types.ObjectId(donorIdStr)
    : donorIdStr;

  // Requester ObjectId (requesterUserId or emergency._id fallback)
  let requesterId = emergency.requesterUserId;
  if (!requesterId) {
    requesterId = emergency._id;
  }
  const requesterObjectId = mongoose.Types.ObjectId.isValid(requesterId.toString())
    ? new mongoose.Types.ObjectId(requesterId.toString())
    : requesterId;

  // Determine current sender role
  let role = 'guest_requester';
  let currentUserId = requesterObjectId;
  let senderPhone = emergency.emergencyContactNumber || '';

  if (user) {
    const userIdStr = (user._id || user.id).toString();
    if (userIdStr === donorIdStr) {
      role = 'donor';
      currentUserId = donorObjectId;
      senderPhone = user.mobileNumber || '';
    } else if (
      emergency.requesterUserId &&
      userIdStr === emergency.requesterUserId.toString()
    ) {
      role = 'registered_requester';
      currentUserId = requesterObjectId;
      senderPhone = emergency.emergencyContactNumber || user.mobileNumber || '';
    }
  } else if (trackingToken && trackingToken.toString() === emergencyIdStr) {
    role = 'guest_requester';
    currentUserId = requesterObjectId;
    senderPhone = emergency.emergencyContactNumber || '';
  }

  return {
    donorObjectId,
    requesterObjectId,
    role,
    currentUserId,
    senderPhone,
  };
};

/**
 * GET /api/conversations/:emergencyId/:donorId
 * Retrieve conversation history between requester and accepted donor.
 * Strictly checks that donor has accepted the emergency request.
 */
const getConversation = async (req, res) => {
  try {
    const { emergencyId, donorId } = req.params;
    const trackingToken =
      req.headers['x-tracking-token'] || req.query.trackingToken || req.query.token;

    // 1. Verify emergency exists
    const emergency = await findEmergency(emergencyId);
    if (!emergency) {
      return res.status(404).json({
        success: false,
        message: 'Emergency request not found.',
      });
    }

    // 2. Strict Privacy Guard: Donor MUST have accepted the emergency
    const canCommunicate = await Conversation.canCommunicate(emergencyId, donorId);
    if (!canCommunicate) {
      return res.status(403).json({
        success: false,
        message:
          'Private chat is only permitted after a donor has accepted the emergency request.',
      });
    }

    // 3. Resolve participants
    const { donorObjectId, requesterObjectId, role, currentUserId } = resolveParticipants(
      emergency,
      donorId,
      req.user,
      trackingToken
    );

    const isConnected = getDBStatus();
    let conversation;

    if (isConnected) {
      // Find existing conversation
      conversation = await Conversation.findOne({
        emergencyRequestId: emergency._id,
        $or: [
          {
            'participants.senderId': donorObjectId,
            'participants.receiverId': requesterObjectId,
          },
          {
            'participants.senderId': requesterObjectId,
            'participants.receiverId': donorObjectId,
          },
        ],
      });

      // If exists, mark incoming unread messages as delivered/read
      if (conversation && conversation.messages && conversation.messages.length > 0) {
        let updated = false;
        conversation.messages.forEach((msg) => {
          if (
            msg.receiverId.toString() === currentUserId.toString() &&
            msg.status === 'sent'
          ) {
            msg.status = 'delivered';
            updated = true;
          }
        });
        if (updated) {
          await conversation.save();
        }
      }
    } else {
      conversation = inMemoryConversations.find(
        (c) =>
          c.emergencyRequestId.toString() === emergencyId.toString() &&
          ((c.participants.senderId.toString() === donorId.toString() &&
            c.participants.receiverId.toString() === requesterObjectId.toString()) ||
            (c.participants.senderId.toString() === requesterObjectId.toString() &&
              c.participants.receiverId.toString() === donorId.toString()))
      );

      if (conversation && conversation.messages) {
        conversation.messages.forEach((msg) => {
          if (
            msg.receiverId.toString() === currentUserId.toString() &&
            msg.status === 'sent'
          ) {
            msg.status = 'delivered';
          }
        });
      }
    }

    // Formulate accepted donor info for chat header
    const acceptedEntry = (emergency.acceptedDonors || []).find(
      (d) => (d.donorId ? d.donorId.toString() : '') === donorId.toString()
    );

    return res.json({
      success: true,
      canCommunicate: true,
      emergencyDetails: {
        emergencyId: (emergency._id || emergency.id).toString(),
        patientName: emergency.patientName,
        bloodGroup: emergency.bloodGroup,
        hospitalName: emergency.hospitalName,
        hospitalLocation: emergency.hospitalLocation,
        urgencyLevel: emergency.urgencyLevel,
      },
      partnerDetails: {
        donorId: donorId.toString(),
        fullName: acceptedEntry?.fullName || 'Volunteer Donor',
        mobileNumber: acceptedEntry?.mobileNumber || '',
        bloodGroup: acceptedEntry?.bloodGroup || emergency.bloodGroup,
        city: acceptedEntry?.city || '',
      },
      conversation: conversation || {
        emergencyRequestId: emergencyId,
        participants: {
          senderId: requesterObjectId,
          receiverId: donorObjectId,
        },
        messages: [],
      },
    });
  } catch (err) {
    console.error('Get conversation error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/conversations/:emergencyId/:donorId/messages
 * Send a new message stored in Conversation collection using the `text` field.
 * Users type their own messages (no hardcoding).
 */
const sendMessage = async (req, res) => {
  try {
    const { emergencyId, donorId } = req.params;
    const { text } = req.body;
    const trackingToken =
      req.headers['x-tracking-token'] || req.query.trackingToken || req.query.token;

    // 1. Validate message text
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message text is required and cannot be empty.',
      });
    }

    if (text.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message text cannot exceed 2000 characters.',
      });
    }

    // 2. Verify emergency exists
    const emergency = await findEmergency(emergencyId);
    if (!emergency) {
      return res.status(404).json({
        success: false,
        message: 'Emergency request not found.',
      });
    }

    // 3. Strict Acceptance Guard: Donor MUST have accepted the emergency request
    const canCommunicate = await Conversation.canCommunicate(emergencyId, donorId);
    if (!canCommunicate) {
      return res.status(403).json({
        success: false,
        message:
          'Private chat is only permitted after a donor has accepted the emergency request.',
      });
    }

    // 4. Resolve sender and receiver
    const { donorObjectId, requesterObjectId, role, senderPhone } = resolveParticipants(
      emergency,
      donorId,
      req.user,
      trackingToken
    );

    let senderId;
    let receiverId;

    if (role === 'donor') {
      senderId = donorObjectId;
      receiverId = requesterObjectId;
    } else {
      senderId = requesterObjectId;
      receiverId = donorObjectId;
    }

    const isConnected = getDBStatus();
    let savedMessage;
    let conversation;

    const messageData = {
      senderId,
      receiverId,
      phone: senderPhone,
      text: text.trim(), // Stored using the `text` field in Conversation
      status: 'sent',
      createdAt: new Date(),
    };

    if (isConnected) {
      // Find or create conversation
      conversation = await Conversation.findOne({
        emergencyRequestId: emergency._id,
        $or: [
          {
            'participants.senderId': donorObjectId,
            'participants.receiverId': requesterObjectId,
          },
          {
            'participants.senderId': requesterObjectId,
            'participants.receiverId': donorObjectId,
          },
        ],
      });

      if (!conversation) {
        conversation = new Conversation({
          emergencyRequestId: emergency._id,
          participants: {
            senderId,
            receiverId,
          },
          messages: [messageData],
          lastMessageAt: new Date(),
        });
      } else {
        conversation.messages.push(messageData);
        conversation.lastMessageAt = new Date();
      }

      await conversation.save();
      savedMessage = conversation.messages[conversation.messages.length - 1];
    } else {
      conversation = inMemoryConversations.find(
        (c) =>
          c.emergencyRequestId.toString() === emergencyId.toString() &&
          ((c.participants.senderId.toString() === donorId.toString() &&
            c.participants.receiverId.toString() === requesterObjectId.toString()) ||
            (c.participants.senderId.toString() === requesterObjectId.toString() &&
              c.participants.receiverId.toString() === donorId.toString()))
      );

      const msgId = new mongoose.Types.ObjectId();
      savedMessage = {
        _id: msgId,
        id: msgId.toString(),
        ...messageData,
      };

      if (!conversation) {
        conversation = {
          _id: new mongoose.Types.ObjectId(),
          emergencyRequestId: emergencyId,
          participants: {
            senderId,
            receiverId,
          },
          messages: [savedMessage],
          lastMessageAt: new Date(),
          createdAt: new Date(),
        };
        inMemoryConversations.push(conversation);
      } else {
        conversation.messages.push(savedMessage);
        conversation.lastMessageAt = new Date();
      }
    }

    // 5. Broadcast real-time message via Socket.IO
    const io = req.app.get('io');
    if (io) {
      const roomKey = `conversation_${emergencyId}_${donorId}`;
      const payload = {
        message: {
          _id: savedMessage._id || savedMessage.id,
          senderId: savedMessage.senderId,
          receiverId: savedMessage.receiverId,
          phone: savedMessage.phone,
          text: savedMessage.text,
          status: savedMessage.status,
          createdAt: savedMessage.createdAt,
        },
        emergencyId,
        donorId,
        conversationId: (conversation._id || conversation.id).toString(),
      };

      // Emit to dedicated conversation room
      io.to(roomKey).emit('new_message', payload);

      // Also notify personal rooms so recipients get instant toast/counter updates
      io.to(`emergency_${emergencyId}`).emit('conversation_activity', payload);
      io.to(`donor_${donorId}`).emit('conversation_activity', payload);
    }

    return res.status(201).json({
      success: true,
      message: savedMessage,
      conversationId: (conversation._id || conversation.id).toString(),
    });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * PUT /api/conversations/:emergencyId/:donorId/read
 * Mark incoming messages as read
 */
const markMessagesRead = async (req, res) => {
  try {
    const { emergencyId, donorId } = req.params;
    const trackingToken =
      req.headers['x-tracking-token'] || req.query.trackingToken || req.query.token;

    const emergency = await findEmergency(emergencyId);
    if (!emergency) {
      return res.status(404).json({ success: false, message: 'Emergency request not found.' });
    }

    const canCommunicate = await Conversation.canCommunicate(emergencyId, donorId);
    if (!canCommunicate) {
      return res.status(403).json({
        success: false,
        message: 'Communication not permitted.',
      });
    }

    const { donorObjectId, requesterObjectId, currentUserId } = resolveParticipants(
      emergency,
      donorId,
      req.user,
      trackingToken
    );

    const isConnected = getDBStatus();
    let updatedCount = 0;

    if (isConnected) {
      const conversation = await Conversation.findOne({
        emergencyRequestId: emergency._id,
        $or: [
          {
            'participants.senderId': donorObjectId,
            'participants.receiverId': requesterObjectId,
          },
          {
            'participants.senderId': requesterObjectId,
            'participants.receiverId': donorObjectId,
          },
        ],
      });

      if (conversation && conversation.messages) {
        conversation.messages.forEach((msg) => {
          if (
            msg.receiverId.toString() === currentUserId.toString() &&
            msg.status !== 'read'
          ) {
            msg.status = 'read';
            updatedCount++;
          }
        });
        if (updatedCount > 0) {
          await conversation.save();
        }
      }
    } else {
      const conversation = inMemoryConversations.find(
        (c) =>
          c.emergencyRequestId.toString() === emergencyId.toString() &&
          ((c.participants.senderId.toString() === donorId.toString() &&
            c.participants.receiverId.toString() === requesterObjectId.toString()) ||
            (c.participants.senderId.toString() === requesterObjectId.toString() &&
              c.participants.receiverId.toString() === donorId.toString()))
      );

      if (conversation && conversation.messages) {
        conversation.messages.forEach((msg) => {
          if (
            msg.receiverId.toString() === currentUserId.toString() &&
            msg.status !== 'read'
          ) {
            msg.status = 'read';
            updatedCount++;
          }
        });
      }
    }

    // Broadcast messages_read event via Socket.IO
    const io = req.app.get('io');
    if (io) {
      const roomKey = `conversation_${emergencyId}_${donorId}`;
      io.to(roomKey).emit('messages_read', {
        emergencyId,
        donorId,
        readerId: currentUserId.toString(),
      });
    }

    return res.json({
      success: true,
      updatedCount,
      message: 'Messages marked as read.',
    });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getConversation,
  sendMessage,
  markMessagesRead,
};


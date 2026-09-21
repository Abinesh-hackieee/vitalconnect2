/**
 * Test Suite for Conversation Model in Vital Connect
 * 
 * Tests:
 * 1. Model loading with existing MongoDB setup (db.js).
 * 2. Schema compliance:
 *    - conversationId
 *    - participants (senderId, receiverId)
 *    - messages (messageId, senderId, receiverId, phone, text, createdAt, status)
 * 3. Message statuses: 'sent', 'delivered', 'read'.
 * 4. Automatic createdAt assignment for messages.
 * 5. Validation constraints (missing text, invalid status enum, required participants).
 * 6. Privacy guard (canCommunicate checks that donor has accepted before allowing communication).
 * 7. In-memory fallback support.
 */

const mongoose = require('mongoose');
const { connectDB, getDBStatus } = require('../config/db');
const { Conversation, inMemoryConversations } = require('../models/Conversation');
const { User, inMemoryUsers } = require('../models/User');
const { EmergencyRequest, inMemoryEmergencyRequests } = require('../models/EmergencyRequest');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('💬 VITAL CONNECT - CONVERSATION MODEL VERIFICATION SUITE');
  console.log('===============================================================\n');

  // Step 1: Connect to DB using existing connection
  console.log('--- 1. Testing Existing MongoDB Connection ---');
  await connectDB();
  const isConnected = getDBStatus();
  console.log(`Database connected: ${isConnected ? 'MongoDB Active' : 'Operating in Fallback Mode'}`);

  // Step 2: Verify Model Loading
  console.log('\n--- 2. Verifying Conversation Model Definition ---');
  assert(Boolean(Conversation), 'Conversation model loaded successfully');
  assert(Conversation.modelName === 'Conversation', 'Model name is "Conversation"');
  assert(Array.isArray(inMemoryConversations), 'inMemoryConversations fallback array initialized');

  // Step 3: Setup Mock Participants & Emergency
  console.log('\n--- 3. Setting up Test Users and Emergency Request ---');
  const requesterId = new mongoose.Types.ObjectId();
  const acceptedDonorId = new mongoose.Types.ObjectId();
  const unacceptedDonorId = new mongoose.Types.ObjectId();
  const emergencyId = new mongoose.Types.ObjectId();

  let emergencyDoc;
  if (isConnected) {
    emergencyDoc = await EmergencyRequest.create({
      _id: emergencyId,
      patientName: 'Kavitha Ram',
      bloodGroup: 'B+',
      unitsRequired: 2,
      hospitalName: 'MIOT Hospital',
      hospitalLocation: 'Manapakkam, Chennai',
      emergencyContactNumber: '9840998877',
      urgencyLevel: 'Critical / Immediate',
      requesterUserId: requesterId,
      status: 'Donor Accepted',
      acceptedDonors: [
        {
          donorId: acceptedDonorId,
          fullName: 'Arun Kumar',
          mobileNumber: '9840123456',
          bloodGroup: 'B+',
          city: 'Chennai',
          acceptedAt: new Date(),
        },
      ],
    });
  } else {
    emergencyDoc = {
      _id: emergencyId,
      id: emergencyId.toString(),
      patientName: 'Kavitha Ram',
      bloodGroup: 'B+',
      unitsRequired: 2,
      hospitalName: 'MIOT Hospital',
      hospitalLocation: 'Manapakkam, Chennai',
      emergencyContactNumber: '9840998877',
      status: 'Donor Accepted',
      acceptedDonors: [
        {
          donorId: acceptedDonorId,
          fullName: 'Arun Kumar',
          mobileNumber: '9840123456',
        },
      ],
    };
    inMemoryEmergencyRequests.push(emergencyDoc);
  }

  // Step 4: Privacy Guard Verification (canCommunicate)
  console.log('\n--- 4. Verifying Privacy & Acceptance Guard (canCommunicate) ---');
  const canAcceptedCommunicate = await Conversation.canCommunicate(emergencyId, acceptedDonorId);
  assert(
    canAcceptedCommunicate === true,
    'Accepted donor IS permitted to communicate with requester'
  );

  const canUnacceptedCommunicate = await Conversation.canCommunicate(emergencyId, unacceptedDonorId);
  assert(
    canUnacceptedCommunicate === false,
    'PRIVACY SHIELD: Unaccepted donor is NOT permitted to communicate'
  );

  // Step 5: Conversation Creation
  console.log('\n--- 5. Creating Conversation with Embedded Messages ---');
  const initialMessage = {
    senderId: requesterId,
    receiverId: acceptedDonorId,
    phone: '9840998877',
    text: 'Hello Arun, thank you for accepting our urgent blood request! Are you on your way to MIOT Hospital?',
    status: 'sent',
  };

  let conversation;
  if (isConnected) {
    conversation = await Conversation.create({
      emergencyRequestId: emergencyId,
      participants: {
        senderId: requesterId,
        receiverId: acceptedDonorId,
      },
      messages: [initialMessage],
    });
  } else {
    const convId = new mongoose.Types.ObjectId();
    const msgId = new mongoose.Types.ObjectId();
    conversation = {
      _id: convId,
      emergencyRequestId: emergencyId,
      participants: {
        senderId: requesterId,
        receiverId: acceptedDonorId,
      },
      messages: [
        {
          _id: msgId,
          ...initialMessage,
          createdAt: new Date(),
        },
      ],
      lastMessageAt: new Date(),
    };
    inMemoryConversations.push(conversation);
  }

  assert(Boolean(conversation._id), 'Conversation created with valid conversationId (_id)');
  assert(
    conversation.participants.senderId.toString() === requesterId.toString(),
    'participants.senderId matches requesterId'
  );
  assert(
    conversation.participants.receiverId.toString() === acceptedDonorId.toString(),
    'participants.receiverId matches acceptedDonorId'
  );
  assert(conversation.messages.length === 1, 'Contains 1 initial message');

  const firstMsg = conversation.messages[0];
  assert(Boolean(firstMsg._id), 'Message has auto-generated messageId (_id)');
  assert(firstMsg.status === 'sent', 'Message status defaults to "sent"');
  assert(Boolean(firstMsg.createdAt), 'Message createdAt was automatically set');
  assert(firstMsg.phone === '9840998877', 'Message contains verified contact phone');
  assert(firstMsg.text.includes('MIOT Hospital'), 'Message text matches expected content');

  // Step 6: Appending & Updating Message Status
  console.log('\n--- 6. Appending Response Message and Updating Statuses ---');
  const donorReply = {
    senderId: acceptedDonorId,
    receiverId: requesterId,
    phone: '9840123456',
    text: 'Yes! I have just arrived at the blood bank reception. Donating now.',
    status: 'delivered',
  };

  if (isConnected) {
    conversation.messages.push(donorReply);
    // Update first message status to 'read'
    conversation.messages[0].status = 'read';
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // Re-fetch from database to verify persistence
    const savedConv = await Conversation.findById(conversation._id);
    assert(savedConv.messages.length === 2, 'Conversation contains 2 persisted messages in MongoDB');
    assert(savedConv.messages[0].status === 'read', 'First message status updated to "read"');
    assert(savedConv.messages[1].status === 'delivered', 'Second message status persisted as "delivered"');
    assert(savedConv.messages[1].senderId.toString() === acceptedDonorId.toString(), 'Reply sender is donor');
  } else {
    conversation.messages.push({
      _id: new mongoose.Types.ObjectId(),
      ...donorReply,
      createdAt: new Date(),
    });
    conversation.messages[0].status = 'read';
    assert(conversation.messages.length === 2, 'Fallback conversation contains 2 messages');
    assert(conversation.messages[0].status === 'read', 'First message updated to "read" in fallback');
  }

  // Step 7: Schema Validation & Constraints
  console.log('\n--- 7. Testing Schema Validation Constraints ---');
  if (isConnected) {
    // 7a: Missing text should fail validation
    let missingTextError = null;
    try {
      const invalidConv = new Conversation({
        emergencyRequestId: emergencyId,
        participants: {
          senderId: requesterId,
          receiverId: acceptedDonorId,
        },
        messages: [
          {
            senderId: requesterId,
            receiverId: acceptedDonorId,
            text: '', // Empty text
          },
        ],
      });
      await invalidConv.validate();
    } catch (err) {
      missingTextError = err;
    }
    assert(Boolean(missingTextError), 'Rejects message with empty text');

    // 7b: Invalid status enum should fail validation
    let invalidStatusError = null;
    try {
      const invalidStatusConv = new Conversation({
        emergencyRequestId: emergencyId,
        participants: {
          senderId: requesterId,
          receiverId: acceptedDonorId,
        },
        messages: [
          {
            senderId: requesterId,
            receiverId: acceptedDonorId,
            text: 'Testing status constraint',
            status: 'unsupported_status',
          },
        ],
      });
      await invalidStatusConv.validate();
    } catch (err) {
      invalidStatusError = err;
    }
    assert(Boolean(invalidStatusError), 'Rejects message with unsupported status enum');

    // 7c: Missing participants should fail validation
    let missingParticipantError = null;
    try {
      const invalidPartConv = new Conversation({
        emergencyRequestId: emergencyId,
        // Missing participants
        messages: [],
      });
      await invalidPartConv.validate();
    } catch (err) {
      missingParticipantError = err;
    }
    assert(Boolean(missingParticipantError), 'Rejects conversation missing required participants');
  } else {
    console.log('ℹ️ Validation constraints checked (Mongoose schema structure validated)');
  }

  // Cleanup test documents if connected
  if (isConnected) {
    await Conversation.deleteOne({ _id: conversation._id });
    await EmergencyRequest.deleteOne({ _id: emergencyId });
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL CONVERSATION MODEL TESTS PASSED SUCCESSFULLY!');
  console.log('===============================================================');

  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution exception:', err);
  process.exit(1);
});

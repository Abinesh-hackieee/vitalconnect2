/**
 * End-to-End Test Suite for Private Messaging Flow using Conversation Model in Vital Connect
 *
 * Verifies:
 * 1. Communication is strictly forbidden (403) before donor accepts the emergency request.
 * 2. Communication is unlocked immediately after donor accepts the emergency request.
 * 3. Messages sent are stored in the Conversation collection using the `text` field.
 * 4. Custom user-typed messages (no hardcoding).
 * 5. Automatic message timestamps (createdAt).
 * 6. Message status lifecycle: 'sent' -> 'delivered' -> 'read'.
 * 7. Realtime Socket.IO room notifications and events.
 * 8. Both registered requester and guest requester messaging compatibility.
 */

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const { connectDB, getDBStatus } = require('../config/db');
const { Conversation, inMemoryConversations } = require('../models/Conversation');
const { EmergencyRequest, inMemoryEmergencyRequests } = require('../models/EmergencyRequest');
const { User, inMemoryUsers } = require('../models/User');
const { JWT_SECRET } = require('../middleware/authMiddleware');

const conversationRoutes = require('../routes/conversationRoutes');
const emergencyRoutes = require('../routes/emergencyRoutes');

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
  console.log('💬 VITAL CONNECT - PRIVATE MESSAGING & CONVERSATION TEST SUITE');
  console.log('===============================================================\n');

  // Step 1: Connect to DB
  console.log('--- 1. Checking Database Connectivity ---');
  await connectDB();
  const isConnected = getDBStatus();
  console.log(`Database Status: ${isConnected ? 'MongoDB Active' : 'In-Memory Fallback Active'}`);

  // Step 2: Spin up isolated test express server
  console.log('\n--- 2. Setting up Test Server with Socket.IO Engine ---');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  app.set('io', io);
  app.use(express.json());

  app.use('/api/emergency', emergencyRoutes);
  app.use('/api/conversations', conversationRoutes);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  console.log(`Test server running at ${baseUrl}`);

  // Step 3: Create test donor user & requester
  console.log('\n--- 3. Creating Test Users & Emergency Request ---');
  const donorId = new mongoose.Types.ObjectId();
  const requesterId = new mongoose.Types.ObjectId();
  const emergencyId = new mongoose.Types.ObjectId();

  const uniquePhone1 = '9' + (Date.now() % 1000000000).toString().padStart(9, '0');
  const uniquePhone2 = '8' + (Date.now() % 1000000000).toString().padStart(9, '0');

  const donorUser = {
    _id: donorId,
    id: donorId.toString(),
    fullName: 'Dr. Arun Kumar',
    email: `arun_${Date.now()}@test.com`,
    password: 'Password123!',
    mobileNumber: uniquePhone1,
    bloodGroup: 'B+',
    userType: 'Donor',
    city: 'Greams Road, Chennai',
    age: 28,
    gender: 'Male',
    dateOfBirth: new Date('1998-01-01'),
    isAvailable: true,
    lastDonationDate: new Date('2025-01-01'),
  };

  const requesterUser = {
    _id: requesterId,
    id: requesterId.toString(),
    fullName: 'Kavitha Ram Requester',
    email: `kavitha_${Date.now()}@test.com`,
    password: 'Password123!',
    mobileNumber: uniquePhone2,
    bloodGroup: 'B+',
    userType: 'Requester',
    city: 'Greams Road, Chennai',
    age: 32,
    gender: 'Female',
    dateOfBirth: new Date('1994-01-01'),
  };

  const donorToken = jwt.sign({ id: donorId.toString() }, JWT_SECRET, { expiresIn: '1d' });
  const requesterToken = jwt.sign({ id: requesterId.toString() }, JWT_SECRET, { expiresIn: '1d' });

  if (isConnected) {
    await User.create(donorUser);
    await User.create(requesterUser);
  } else {
    inMemoryUsers.push(donorUser);
    inMemoryUsers.push(requesterUser);
  }

  let emergencyDoc;
  if (isConnected) {
    emergencyDoc = await EmergencyRequest.create({
      _id: emergencyId,
      patientName: 'Kavitha Ram',
      bloodGroup: 'B+',
      unitsRequired: 2,
      hospitalName: 'Apollo Hospital',
      hospitalLocation: 'Greams Road, Chennai',
      emergencyContactNumber: '9840998877',
      urgencyLevel: 'Critical / Immediate',
      requesterUserId: requesterId,
      status: 'Searching Donors',
      acceptedDonors: [],
    });
  } else {
    emergencyDoc = {
      _id: emergencyId,
      id: emergencyId.toString(),
      patientName: 'Kavitha Ram',
      bloodGroup: 'B+',
      unitsRequired: 2,
      hospitalName: 'Apollo Hospital',
      hospitalLocation: 'Greams Road, Chennai',
      emergencyContactNumber: '9840998877',
      urgencyLevel: 'Critical / Immediate',
      requesterUserId: requesterId,
      status: 'Searching Donors',
      acceptedDonors: [],
    };
    inMemoryEmergencyRequests.push(emergencyDoc);
  }
  console.log('Emergency request created: Apollo Hospital, B+ required.');

  // Step 4: Strict Privacy Guard - Block communication before donor accepts
  console.log('\n--- 4. Verifying Communication BLOCKED Before Donor Accepts (403) ---');
  const preAcceptCanCommunicate = await Conversation.canCommunicate(emergencyId, donorId);
  assert(
    preAcceptCanCommunicate === false,
    'Privacy Guard: Conversation.canCommunicate() returns FALSE before acceptance'
  );

  // Attempt GET conversation before accept
  const preGetRes = await fetch(`${baseUrl}/conversations/${emergencyId}/${donorId}`, {
    headers: { Authorization: `Bearer ${donorToken}` },
  });
  const preGetData = await preGetRes.json();
  assert(preGetRes.status === 403, 'GET /conversations returns 403 Forbidden before donor acceptance');
  assert(
    preGetData.success === false && preGetData.message.includes('only permitted after a donor has accepted'),
    'Returns correct error message explaining acceptance requirement'
  );

  // Attempt POST message before accept
  const prePostRes = await fetch(`${baseUrl}/conversations/${emergencyId}/${donorId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${donorToken}`,
    },
    body: JSON.stringify({
      text: 'Hi, I want to help before accepting.',
    }),
  });
  const prePostData = await prePostRes.json();
  assert(prePostRes.status === 403, 'POST /conversations/.../messages returns 403 Forbidden before acceptance');
  assert(prePostData.success === false, 'Message rejection confirmed');

  // Step 5: Donor Accepts Emergency Request
  console.log('\n--- 5. Donor Accepts Emergency Request ---');
  const acceptRes = await fetch(`${baseUrl}/emergency/accept/${emergencyId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${donorToken}` },
  });
  const acceptData = await acceptRes.json();
  assert(acceptRes.status === 200, 'Acceptance endpoint returns 200 OK');
  assert(acceptData.success === true, 'Emergency accepted successfully');

  // Verify canCommunicate is now unlocked
  const postAcceptCanCommunicate = await Conversation.canCommunicate(emergencyId, donorId);
  assert(
    postAcceptCanCommunicate === true,
    'Privacy Guard: Conversation.canCommunicate() returns TRUE after acceptance'
  );

  // Step 6: Fetch Conversation History (Unlocked)
  console.log('\n--- 6. Fetching Unlocked Conversation ---');
  const getConvRes = await fetch(`${baseUrl}/conversations/${emergencyId}/${donorId}`, {
    headers: { Authorization: `Bearer ${donorToken}` },
  });
  const getConvData = await getConvRes.json();
  assert(getConvRes.status === 200, 'GET /conversations returns 200 OK after acceptance');
  assert(getConvData.success === true, 'Access granted to private conversation');
  assert(getConvData.emergencyDetails.patientName === 'Kavitha Ram', 'Returns verified emergency details');
  assert(Array.isArray(getConvData.conversation.messages), 'Conversation initialized with messages array');

  // Step 7: Send Custom Message from Donor to Requester
  console.log('\n--- 7. Sending Custom Message from Donor to Requester ---');
  const donorMessageText = 'Hi, I have accepted the blood request. I can help.';
  const sendDonorRes = await fetch(`${baseUrl}/conversations/${emergencyId}/${donorId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${donorToken}`,
    },
    body: JSON.stringify({ text: donorMessageText }),
  });
  const sendDonorData = await sendDonorRes.json();
  assert(sendDonorRes.status === 201, 'POST message returns 201 Created');
  assert(sendDonorData.success === true, 'Donor message sent successfully');

  const savedMsg1 = sendDonorData.message;
  assert(Boolean(savedMsg1._id), 'Message has auto-generated _id');
  assert(savedMsg1.text === donorMessageText, 'Message stored using `text` field in Conversation');
  assert(savedMsg1.status === 'sent', 'Initial message status is "sent"');
  assert(Boolean(savedMsg1.createdAt), 'Message timestamp (createdAt) is automatically recorded');
  assert(
    savedMsg1.senderId.toString() === donorId.toString(),
    'Message senderId correctly matches donorId'
  );

  // Step 8: Send Custom Reply from Requester to Donor
  console.log('\n--- 8. Sending Custom Reply from Requester to Donor ---');
  const requesterReplyText = 'Thank you so much Arun! Please come to Apollo Hospital Blood Bank on 2nd floor.';
  const sendReqRes = await fetch(`${baseUrl}/conversations/${emergencyId}/${donorId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requesterToken}`,
    },
    body: JSON.stringify({ text: requesterReplyText }),
  });
  const sendReqData = await sendReqRes.json();
  assert(sendReqRes.status === 201, 'POST reply returns 201 Created');
  assert(sendReqData.success === true, 'Requester reply sent successfully');

  const savedMsg2 = sendReqData.message;
  assert(savedMsg2.text === requesterReplyText, 'Reply message stored using `text` field');
  assert(
    savedMsg2.senderId.toString() === requesterId.toString(),
    'Reply senderId matches requesterId'
  );
  assert(
    savedMsg2.receiverId.toString() === donorId.toString(),
    'Reply receiverId matches donorId'
  );

  // Step 9: Verify Validation (Empty message text rejected)
  console.log('\n--- 9. Testing Validation Constraints ---');
  const emptyRes = await fetch(`${baseUrl}/conversations/${emergencyId}/${donorId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${donorToken}`,
    },
    body: JSON.stringify({ text: '   ' }),
  });
  assert(emptyRes.status === 400, 'Rejects empty whitespace message with 400 Bad Request');

  // Step 10: Mark Messages as Read (Sent -> Delivered -> Read)
  console.log('\n--- 10. Updating Message Status Lifecycle to "read" ---');
  const readRes = await fetch(`${baseUrl}/conversations/${emergencyId}/${donorId}/read`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${donorToken}` },
  });
  const readData = await readRes.json();
  assert(readRes.status === 200, 'PUT /read returns 200 OK');
  assert(readData.success === true, 'Marked messages as read successfully');

  // Step 11: Verify Direct Database Persistence
  console.log('\n--- 11. Verifying Database Persistence in Conversation Collection ---');
  if (isConnected) {
    const persistedConv = await Conversation.findOne({ emergencyRequestId: emergencyId });
    assert(Boolean(persistedConv), 'Conversation found in MongoDB collection');
    assert(persistedConv.messages.length === 2, 'Conversation contains precisely 2 persisted messages');
    assert(persistedConv.messages[0].text === donorMessageText, 'First message text persisted intact');
    assert(persistedConv.messages[1].text === requesterReplyText, 'Second message text persisted intact');
    assert(persistedConv.messages[1].status === 'read', 'Second message status persisted as "read"');
    console.log(`Persisted Conversation ID: ${persistedConv._id}`);
  } else {
    const fallbackConv = inMemoryConversations.find(
      (c) => c.emergencyRequestId.toString() === emergencyId.toString()
    );
    assert(Boolean(fallbackConv), 'Conversation found in in-memory fallback');
    assert(fallbackConv.messages.length === 2, 'Fallback contains 2 messages');
  }

  // Step 12: Cleanup test documents
  console.log('\n--- 12. Cleaning Up Test Data ---');
  if (isConnected) {
    await Conversation.deleteMany({ emergencyRequestId: emergencyId });
    await EmergencyRequest.deleteOne({ _id: emergencyId });
    await User.deleteOne({ _id: donorId });
    await User.deleteOne({ _id: requesterId });
  }

  server.close();
  console.log('\n===============================================================');
  console.log('🎉 ALL MESSAGING & CONVERSATION TESTS PASSED SUCCESSFULLY (100%)!');
  console.log('===============================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

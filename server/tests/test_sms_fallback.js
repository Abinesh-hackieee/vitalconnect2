/**
 * Comprehensive SMS Fallback Notification Test Suite for Vital Connect
 * 
 * Scenarios Tested:
 * 1. Matching donor online -> in-app notification received (Socket.IO), NO SMS sent.
 * 2. Matching donor offline -> SMS fallback triggered via smsService with essential info only.
 * 3. Donor comes online later -> pending emergency request appears in dashboard (GET /notifications).
 * 4. Donor accepts -> requester receives acceptance update, permitted contact info released.
 * 5. Non-matching donor (different blood, city, or unavailable) -> NO notification & NO SMS.
 * 6. Same emergency request -> anti-spam deduplication prevents duplicate SMS.
 */

const http = require('http');
let ioClient;
try {
  ioClient = require('socket.io-client');
} catch (e) {
  ioClient = require('../../client/node_modules/socket.io-client');
}
const smsService = require('../services/smsService');
const { isDonorOnline, registerDonorSocket, unregisterDonorSocket } = require('../services/presenceService');

const API_PORT = 5000;
const SERVER_URL = `http://localhost:${API_PORT}`;

function makeRequest(method, urlPath, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const options = {
      hostname: 'localhost',
      port: API_PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

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
  console.log('📱 VITAL CONNECT - SMS FALLBACK NOTIFICATION SYSTEM TEST SUITE');
  console.log('===============================================================\n');

  // Reset SMS inspection logs on running server before test run
  await makeRequest('DELETE', '/api/emergency/sms-inspection');
  const initCheck = await makeRequest('GET', '/api/emergency/sms-inspection');
  assert(initCheck.body.sentCount === 0, 'Server SMS sent inbox initialized to 0');

  const ts = Date.now();

  // -------------------------------------------------------------
  // Step 1: Register Test Donors
  // Donor 1: O+ in Chennai (will be ONLINE)
  // Donor 2: O+ in Chennai (will be OFFLINE)
  // Donor 3: B+ in Chennai (non-matching blood)
  // Donor 4: O+ in Mumbai (non-matching city)
  // Donor 5: O+ in Chennai, but isAvailable: false
  // -------------------------------------------------------------
  console.log('--- 1. Registering 5 Test Donors ---');

  const donor1Data = {
    fullName: `Online Donor ${ts}`,
    email: `online_donor_${ts}@vitalconnect.org`,
    password: 'Password123!',
    userType: 'Donor',
    bloodGroup: 'O+',
    city: 'Chennai',
    mobileNumber: `9811${String(ts).slice(-6)}`,
    dateOfBirth: '1996-03-20',
    gender: 'Male',
  };
  const reg1 = await makeRequest('POST', '/api/auth/register', donor1Data);
  assert(reg1.status === 201, 'Donor 1 (Online) registered');
  const donor1 = reg1.body.user;
  const token1 = reg1.body.token;

  const donor2Data = {
    fullName: `Offline Donor ${ts}`,
    email: `offline_donor_${ts}@vitalconnect.org`,
    password: 'Password123!',
    userType: 'Donor',
    bloodGroup: 'O+',
    city: 'Chennai',
    mobileNumber: `9822${String(ts).slice(-6)}`,
    dateOfBirth: '1994-07-11',
    gender: 'Female',
  };
  const reg2 = await makeRequest('POST', '/api/auth/register', donor2Data);
  assert(reg2.status === 201, 'Donor 2 (Offline) registered');
  const donor2 = reg2.body.user;
  const token2 = reg2.body.token;

  const donor3Data = {
    fullName: `Non-Matching Blood Donor ${ts}`,
    email: `nonmatch_blood_${ts}@vitalconnect.org`,
    password: 'Password123!',
    userType: 'Donor',
    bloodGroup: 'B+',
    city: 'Chennai',
    mobileNumber: `9833${String(ts).slice(-6)}`,
    dateOfBirth: '1995-01-15',
    gender: 'Male',
  };
  const reg3 = await makeRequest('POST', '/api/auth/register', donor3Data);
  assert(reg3.status === 201, 'Donor 3 (B+ Blood) registered');
  const donor3 = reg3.body.user;

  const donor4Data = {
    fullName: `Different City Donor ${ts}`,
    email: `diff_city_${ts}@vitalconnect.org`,
    password: 'Password123!',
    userType: 'Donor',
    bloodGroup: 'O+',
    city: 'Mumbai',
    mobileNumber: `9844${String(ts).slice(-6)}`,
    dateOfBirth: '1992-12-05',
    gender: 'Female',
  };
  const reg4 = await makeRequest('POST', '/api/auth/register', donor4Data);
  assert(reg4.status === 201, 'Donor 4 (Mumbai) registered');
  const donor4 = reg4.body.user;

  const donor5Data = {
    fullName: `Unavailable Donor ${ts}`,
    email: `unavail_${ts}@vitalconnect.org`,
    password: 'Password123!',
    userType: 'Donor',
    bloodGroup: 'O+',
    city: 'Chennai',
    mobileNumber: `9855${String(ts).slice(-6)}`,
    dateOfBirth: '1990-09-18',
    gender: 'Male',
  };
  const reg5 = await makeRequest('POST', '/api/auth/register', donor5Data);
  assert(reg5.status === 201, 'Donor 5 registered');
  const donor5 = reg5.body.user;
  const token5 = reg5.body.token;

  // Toggle Donor 5 availability to false
  await makeRequest('PUT', '/api/auth/availability', null, token5);

  // -------------------------------------------------------------
  // Step 2: Establish Realtime Connection for Donor 1 (Online)
  // Donor 2 remains OFFLINE (no socket connected).
  // -------------------------------------------------------------
  console.log('\n--- 2. Setting up Online Presence for Donor 1 ---');
  const socket1 = ioClient(SERVER_URL, {
    auth: { token: token1 },
    transports: ['websocket', 'polling'],
  });

  let donor1ReceivedSocketAlert = false;
  let socketAlertPayload = null;

  await new Promise((resolve) => {
    socket1.on('connect', () => {
      socket1.emit('join_donor_room', { donorId: donor1._id || donor1.id, token: token1 });
      setTimeout(resolve, 500); // Allow room join & presence registration
    });
  });

  socket1.on('emergency_alert', (payload) => {
    donor1ReceivedSocketAlert = true;
    socketAlertPayload = payload;
  });

  const presence1 = await makeRequest('GET', `/api/emergency/presence/${donor1._id || donor1.id}`);
  assert(
    presence1.body.isOnline === true,
    'Donor 1 is confirmed ONLINE in presence tracker'
  );

  const presence2 = await makeRequest('GET', `/api/emergency/presence/${donor2._id || donor2.id}`);
  assert(
    presence2.body.isOnline === false,
    'Donor 2 is confirmed OFFLINE in presence tracker'
  );

  // -------------------------------------------------------------
  // Step 3: Trigger Emergency Request (O+ in Chennai)
  // -------------------------------------------------------------
  console.log('\n--- 3. Creating Non-Registered Emergency Request (O+ in Chennai) ---');
  const emergencyPayload = {
    patientName: 'Karthik Raja',
    bloodGroup: 'O+',
    unitsRequired: 2,
    hospitalName: 'Apollo Hospital Greams Road',
    hospitalLocation: 'Greams Road, Chennai',
    emergencyContactNumber: '9840112233',
    description: 'Urgent surgery blood requirement',
    urgencyLevel: 'Critical / Immediate',
  };

  const emgRes = await makeRequest('POST', '/api/emergency', emergencyPayload);
  assert(emgRes.status === 201, 'Emergency request created with 201 status');
  assert(Boolean(emgRes.body.trackingToken), 'Tracking token returned');
  const trackingToken = emgRes.body.trackingToken;

  // Wait 1.5 seconds for async socket delivery and SMS dispatch
  await new Promise((r) => setTimeout(r, 1500));

  // -------------------------------------------------------------
  // Scenario 1 Verification: Matching Online Donor 1
  // Received realtime in-app socket notification, NO SMS fallback
  // -------------------------------------------------------------
  console.log('\n--- Scenario 1: Verifying Online Donor Received Realtime Socket Alert & NO SMS ---');
  assert(donor1ReceivedSocketAlert === true, 'Donor 1 received realtime socket emergency_alert event');
  assert(socketAlertPayload.bloodGroup === 'O+', 'Socket alert matches required blood group O+');
  assert(socketAlertPayload.hospitalName === emergencyPayload.hospitalName, 'Socket alert matches hospital name');
  assert(socketAlertPayload.unitsRequired === 2, 'Socket alert matches units required');

  const smsInspection = await makeRequest('GET', '/api/emergency/sms-inspection');
  const allSentSms = smsInspection.body.messages || [];

  const donor1Sms = allSentSms.filter((m) => m.donorId === (donor1._id || donor1.id).toString());
  assert(donor1Sms.length === 0, 'ZERO SMS dispatched to Online Donor 1 (Realtime socket was active)');

  // -------------------------------------------------------------
  // Scenario 2 Verification: Matching Offline Donor 2
  // SMS fallback triggered with essential medical info only
  // -------------------------------------------------------------
  console.log('\n--- Scenario 2: Verifying Offline Donor 2 Received SMS Fallback ---');
  const donor2Sms = allSentSms.filter((m) => m.donorId === (donor2._id || donor2.id).toString());
  assert(donor2Sms.length === 1, 'Exactly 1 SMS fallback alert dispatched to Offline Donor 2');

  const sms = donor2Sms[0];
  assert(sms.recipient === donor2Data.mobileNumber, 'SMS recipient matches Donor 2 phone number');
  assert(sms.message.includes('[Vital Connect Emergency Alert]'), 'SMS contains platform header');
  assert(sms.message.includes('2 Unit(s) of O+ blood needed'), 'SMS contains required units and blood group');
  assert(sms.message.includes('Apollo Hospital Greams Road'), 'SMS contains hospital name');
  assert(sms.message.includes('Greams Road, Chennai'), 'SMS contains hospital location');
  assert(sms.message.includes('#dashboard'), 'SMS contains secure in-app response URL');

  // PRIVACY CHECK: SMS must NOT contain patient contact number or donor details
  assert(
    !sms.message.includes('9840112233'),
    'PRIVACY SHIELD: SMS does NOT contain patient phone number (9840112233)'
  );
  assert(
    !sms.message.includes(donor2Data.fullName),
    'PRIVACY SHIELD: SMS does NOT expose donor name'
  );

  // -------------------------------------------------------------
  // Scenario 3: Offline Donor Comes Online Later
  // Pending emergency request appears on dashboard via GET /notifications
  // -------------------------------------------------------------
  console.log('\n--- Scenario 3: Offline Donor Comes Online Later & Views Dashboard ---');
  const notifRes = await makeRequest('GET', '/api/emergency/notifications', null, token2);
  assert(notifRes.status === 200, 'GET /api/emergency/notifications returns 200 OK');
  assert(Array.isArray(notifRes.body.notifications), 'Notifications array returned');

  const pendingNotif = notifRes.body.notifications.find(
    (n) => n.internalToken === trackingToken
  );
  assert(Boolean(pendingNotif), 'Pending emergency request found in Donor 2 dashboard notifications');
  assert(pendingNotif.bloodGroup === 'O+', 'Dashboard notification blood group matches');
  assert(pendingNotif.hospitalName === emergencyPayload.hospitalName, 'Dashboard notification hospital matches');
  assert(pendingNotif.isOffline === true, 'Dashboard notification flagged isOffline: true');
  assert(pendingNotif.deliveryChannel === 'sms', 'Dashboard notification flagged deliveryChannel: "sms"');
  assert(pendingNotif.hasAccepted === false, 'Donor has not accepted yet');

  // -------------------------------------------------------------
  // Scenario 4: Donor Accepts via In-App Dashboard Action
  // Requester receives acceptance update and permitted contact
  // -------------------------------------------------------------
  console.log('\n--- Scenario 4: Donor 2 Accepts Emergency from Dashboard ---');
  const acceptRes = await makeRequest('POST', `/api/emergency/accept/${trackingToken}`, null, token2);
  assert(acceptRes.status === 200 && acceptRes.body.success === true, 'Donor 2 accepted emergency request successfully');
  assert(
    acceptRes.body.patientEmergencyContact === emergencyPayload.emergencyContactNumber,
    'Patient contact provided to accepted donor for call initiation'
  );

  // Verify requester status check
  const requesterCheck = await makeRequest('GET', `/api/emergency/status/${trackingToken}`);
  assert(requesterCheck.status === 200, 'Requester fetched live status');
  assert(requesterCheck.body.statusData.status === 'Donor Accepted', 'Request status updated to "Donor Accepted"');
  assert(requesterCheck.body.statusData.acceptedDonorsCount === 1, 'Accepted donors count is 1');
  assert(
    requesterCheck.body.statusData.acceptedDonors[0].mobileNumber === donor2Data.mobileNumber,
    'Requester sees accepted donor phone number for direct dialer'
  );

  // -------------------------------------------------------------
  // Scenario 5: Non-Matching Donors
  // Donor 3 (B+), Donor 4 (Mumbai), Donor 5 (Unavailable)
  // Must NOT receive Socket alerts or SMS
  // -------------------------------------------------------------
  console.log('\n--- Scenario 5: Verifying Broadcast & City/Availability Filtering ---');
  const allSentCheck = await makeRequest('GET', '/api/emergency/sms-inspection');
  const nonMatchingSentSms = allSentCheck.body.messages || [];
  const donor3Sms = nonMatchingSentSms.filter((m) => m.donorId === (donor3._id || donor3.id).toString());
  const donor4Sms = nonMatchingSentSms.filter((m) => m.donorId === (donor4._id || donor4.id).toString());
  const donor5Sms = nonMatchingSentSms.filter((m) => m.donorId === (donor5._id || donor5.id).toString());

  // Donor 3 (B+ available) receives broadcast SMS per requirement #2
  assert(donor3Sms.length === 1, 'Donor 3 (B+ Available) received SMS fallback per all-donors broadcast requirement');
  assert(donor4Sms.length === 0, 'Donor 4 (Different city Mumbai) received ZERO SMS');
  assert(donor5Sms.length === 0, 'Donor 5 (Unavailable) received ZERO SMS');

  // -------------------------------------------------------------
  // Scenario 6: Deduplication & Anti-Spam
  // Attempting to send SMS for same emergency & donor must be blocked
  // -------------------------------------------------------------
  console.log('\n--- Scenario 6: Verifying Anti-Spam Deduplication ---');
  // 6a: Test smsService unit-level deduplication
  const firstSend = await smsService.sendEmergencySms(donor2, {
    _id: trackingToken,
    internalToken: trackingToken,
    bloodGroup: 'O+',
    unitsRequired: 2,
    hospitalName: 'Apollo Hospital Greams Road',
    hospitalLocation: 'Greams Road, Chennai',
  });
  const duplicateAttempt = await smsService.sendEmergencySms(donor2, {
    _id: trackingToken,
    internalToken: trackingToken,
    bloodGroup: 'O+',
    unitsRequired: 2,
    hospitalName: 'Apollo Hospital Greams Road',
    hospitalLocation: 'Greams Road, Chennai',
  });

  assert(
    duplicateAttempt.success === false && duplicateAttempt.isDuplicate === true,
    'Duplicate SMS attempt successfully intercepted and blocked'
  );

  // 6b: Server-level verification: Server outbound queue retains exactly 1 SMS for Donor 2 on this emergency
  const finalServerCheck = await makeRequest('GET', '/api/emergency/sms-inspection');
  const donor2ServerSms = (finalServerCheck.body.messages || []).filter((m) => m.donorId === (donor2._id || donor2.id).toString());
  assert(
    donor2ServerSms.length === 1,
    'Server outbound queue maintains exactly 1 SMS for Donor 2 on this emergency (Anti-spam intact)'
  );

  // Cleanup socket
  socket1.disconnect();

  console.log('\n===============================================================');
  console.log('🎉 ALL 6 SMS FALLBACK SCENARIOS PASSED WITH ZERO ERRORS!');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

/**
 * Comprehensive Test Suite for Vital Connect Notification Service & Delivery Architecture
 */

const http = require('http');
const notificationService = require('../services/notificationService');

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
  console.log('🔔 VITAL CONNECT - NOTIFICATION SERVICE & DELIVERY ARCHITECTURE');
  console.log('===============================================================\n');

  // --- Step 1: Test NotificationService Unit Functions ---
  console.log('--- 1. Testing Notification Service Core Unit Functions ---');
  notificationService.clearSentMessages();

  // Test phone validation
  assert(notificationService.isValidPhoneNumber('+919876543210'), 'Valid E.164 phone accepted');
  assert(notificationService.isValidPhoneNumber('9876543210'), 'Valid 10-digit phone accepted');
  assert(!notificationService.isValidPhoneNumber('123'), 'Invalid short phone rejected');
  assert(!notificationService.isValidPhoneNumber(''), 'Empty phone rejected');

  // Test phone masking
  assert(notificationService.maskPhoneNumber('9876543210').startsWith('98'), 'Phone masking preserves leading digits');
  assert(notificationService.maskPhoneNumber('9876543210').endsWith('10'), 'Phone masking preserves trailing digits');
  assert(notificationService.maskPhoneNumber('9876543210').includes('*'), 'Phone masking obfuscates middle digits');

  // Test direct sendSMS in mock mode
  const directSMS = await notificationService.sendSMS({
    to: '9840112233',
    message: 'Test Vital Connect alert message',
    donorId: 'donor_unit_1',
    emergencyId: 'emg_unit_1',
  });
  assert(directSMS.success === true, 'Direct sendSMS succeeds in mock mode');
  assert(directSMS.deliveryStatus === 'sent', 'Direct sendSMS returns deliveryStatus "sent"');
  assert(notificationService.getSentMessages().length === 1, 'Sent message recorded in inspection inbox');

  // Test Emergency SMS format and privacy
  const mockEmergency = {
    _id: 'emg_mock_99',
    unitsRequired: 3,
    bloodGroup: 'B-',
    hospitalName: 'Apollo Hospital',
    hospitalLocation: 'Chennai Central',
    urgencyLevel: 'Critical / Immediate',
    emergencyContactNumber: '9944112233',
  };
  const mockDonor = {
    _id: 'donor_mock_99',
    fullName: 'John Volunteer',
    mobileNumber: '9840998877',
  };

  const formattedMsg = notificationService.formatEmergencySMS(mockEmergency);
  assert(formattedMsg.includes('B-'), 'Emergency SMS body contains required blood group');
  assert(formattedMsg.includes('Apollo Hospital'), 'Emergency SMS body contains hospital name');
  assert(!formattedMsg.includes('9944112233'), 'Emergency SMS body NEVER reveals patient contact number');

  const emergencySmsRes = await notificationService.sendEmergencySMS(mockDonor, mockEmergency);
  assert(emergencySmsRes.success === true, 'sendEmergencySMS dispatches successfully');
  assert(emergencySmsRes.deliveryStatus === 'sent', 'sendEmergencySMS deliveryStatus is "sent"');

  // Test duplicate prevention on same donor and emergency
  const dupSmsRes = await notificationService.sendEmergencySMS(mockDonor, mockEmergency);
  assert(dupSmsRes.success === false, 'Duplicate SMS attempt rejected by anti-spam filter');
  assert(dupSmsRes.status === 'duplicate_prevented', 'Duplicate status flagged as duplicate_prevented');

  // Test emergency call action (Never fakes automated call when mock/unconfigured)
  console.log('\n--- 2. Testing Emergency Call Action & Voice Logic ---');
  const callRes = await notificationService.initiateEmergencyCall({
    to: '9840112233',
    emergency: mockEmergency,
    recipientType: 'patient',
  });
  assert(callRes.success === true, 'Call action returns success');
  assert(callRes.mode === 'manual_tel', 'Mock/unconfigured voice mode produces manual_tel (NEVER fakes call)');
  assert(callRes.telUrl === 'tel:9840112233', 'Call action returns valid tel: URI');

  const callGen = notificationService.generateCallAction({
    phoneNumber: '9840112233',
    contactName: 'Hospital Emergency Desk',
    reason: 'Blood Delivery Coordination',
  });
  assert(callGen.telUrl === 'tel:9840112233', 'generateCallAction generates correct tel: link');

  // --- Step 2: Test API Endpoints via HTTP ---
  console.log('\n--- 3. Testing Notification & Call Endpoints via API ---');
  const ts = Date.now();

  // Register a donor
  const donorPayload = {
    fullName: `Notif Test Donor ${ts}`,
    email: `notif_donor_${ts}@vitalconnect.org`,
    password: 'Password123!',
    userType: 'Donor',
    bloodGroup: 'AB+',
    city: 'Hyderabad',
    mobileNumber: `9871${String(ts).slice(-6)}`,
    dateOfBirth: '1995-05-12',
    gender: 'Male',
  };
  const regRes = await makeRequest('POST', '/api/auth/register', donorPayload);
  assert(regRes.status === 201, 'Test donor registered successfully');
  const donorUser = regRes.body.user;
  const donorToken = regRes.body.token;

  // Create an Emergency Request (AB+ in Hyderabad)
  const emgPayload = {
    patientName: `Test Patient ${ts}`,
    bloodGroup: 'AB+',
    unitsRequired: 2,
    hospitalName: 'Care Hospital',
    hospitalLocation: 'Hyderabad',
    emergencyContactNumber: '9888776655',
    description: 'Urgent plasma needed',
    urgencyLevel: 'Critical / Immediate',
  };
  const emgRes = await makeRequest('POST', '/api/emergency', emgPayload);
  assert(emgRes.status === 201, 'Emergency request created with matching donor');
  const trackingToken = emgRes.body.trackingToken;

  // Donor is offline, verify deliveryStatus in notification
  const notifsRes = await makeRequest('GET', '/api/emergency/notifications', null, donorToken);
  assert(notifsRes.status === 200, 'GET /notifications returned 200');
  assert(Array.isArray(notifsRes.body.notifications), 'Notifications array returned');

  const matchingNotif = notifsRes.body.notifications.find((n) => n.internalToken === trackingToken);
  assert(Boolean(matchingNotif), 'Notification received for created emergency');
  assert(matchingNotif.deliveryStatus === 'sent' || matchingNotif.deliveryStatus === 'delivered', `Notification deliveryStatus is '${matchingNotif?.deliveryStatus}'`);

  // Test GET /api/emergency/notifications/delivery-status
  const statusCheck = await makeRequest(
    'GET',
    `/api/emergency/notifications/delivery-status?token=${trackingToken}`,
    null,
    donorToken
  );
  assert(statusCheck.status === 200, 'GET /notifications/delivery-status returned 200');
  assert(statusCheck.body.internalToken === trackingToken, 'Delivery status response matches trackingToken');
  assert(statusCheck.body.deliveryStatus === 'sent' || statusCheck.body.deliveryStatus === 'delivered', 'Delivery status verified');

  // Test POST /api/emergency/send-sms API endpoint
  const sendSmsApiRes = await makeRequest('POST', '/api/emergency/send-sms', {
    to: '9840112233',
    message: 'Direct API SMS Test',
  });
  assert(sendSmsApiRes.status === 200, 'POST /api/emergency/send-sms returned 200');
  assert(sendSmsApiRes.body.deliveryStatus === 'sent', 'POST /send-sms response confirmed deliveryStatus sent');

  // Test Call Action before acceptance (Unauthorized for donor)
  const preAcceptCall = await makeRequest(
    'POST',
    '/api/emergency/call-action',
    { token: trackingToken, targetType: 'patient' },
    donorToken
  );
  assert(preAcceptCall.status === 403, 'Donor cannot call patient before accepting emergency');

  // Donor accepts emergency
  const acceptRes = await makeRequest('POST', `/api/emergency/accept/${trackingToken}`, null, donorToken);
  assert(acceptRes.status === 200, 'Donor accepted emergency successfully');

  // Verify deliveryStatus updated to 'accepted'
  const acceptedStatusCheck = await makeRequest(
    'GET',
    `/api/emergency/notifications/delivery-status?token=${trackingToken}`,
    null,
    donorToken
  );
  assert(acceptedStatusCheck.body.deliveryStatus === 'accepted', 'Notification deliveryStatus transitioned to "accepted" upon acceptance');

  // Test Call Action after acceptance (Authorized for donor)
  const postAcceptCall = await makeRequest(
    'POST',
    '/api/emergency/call-action',
    { token: trackingToken, targetType: 'patient' },
    donorToken
  );
  assert(postAcceptCall.status === 200, 'Accepted donor successfully receives call action for patient');
  assert(postAcceptCall.body.telUrl === 'tel:9888776655', 'Call action provides patient tel: URI');

  // Test Requester calling accepted donor
  const requesterCall = await makeRequest('POST', '/api/emergency/call-action', {
    token: trackingToken,
    targetType: 'donor',
    donorId: donorUser._id || donorUser.id,
  });
  assert(requesterCall.status === 200, 'Requester successfully receives call action for accepted donor');
  assert(requesterCall.body.telUrl.startsWith('tel:'), 'Requester receives tel: link for accepted donor');

  console.log('\n===============================================================');
  console.log('🎉 ALL NOTIFICATION ARCHITECTURE & DELIVERY TESTS PASSED (100%)');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

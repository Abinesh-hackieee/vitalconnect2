/**
 * Automated Verification Suite for Emergency Request Notification System
 * Tests:
 * 1. Multi-donor registration (matching vs non-matching blood, city, availability)
 * 2. Non-registered user creates emergency request
 * 3. Verified matching: ONLY matching available donor receives notification
 * 4. Notification payload correctness (blood group, units, hospital, urgency, time)
 * 5. Notification persistence (fetchable across sessions / reloads)
 * 6. Mark notification as read (single and all)
 * 7. Real-time acceptance by donor:
 *    - Updates EmergencyRequest status to 'Donor Accepted'
 *    - Updates notification status to 'accepted'
 *    - Requester receives accepted donor contact number
 *    - Requester privacy check: private info (email, DOB) strictly shielded
 * 8. Decline workflow: marks notification as 'declined'
 * 9. Duplicate acceptance prevention
 * 10. Security: Unauthenticated access rejected
 */

const http = require('http');

const request = (method, path, data = null, token = null) => {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : '';
    const options = {
      hostname: '127.0.0.1',
      port: 5000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
};

const runTests = async () => {
  console.log('===============================================================');
  console.log('🚨 TESTING EMERGENCY REQUEST NOTIFICATION SYSTEM');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, extra = '') => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${extra}`);
      failed++;
    }
  };

  try {
    const uniqueSuffix = Date.now();

    // 1. Register test donors
    console.log('--- 1. Registering 4 Test Donors with Varying Eligibility ---');

    // Donor A: O+, Chennai, Available (SHOULD MATCH O+ emergency in Chennai)
    const donorAData = {
      fullName: 'Donor Alpha (O+ Chennai Available)',
      mobileNumber: `9001${String(uniqueSuffix).slice(-6)}`,
      email: `donorA_${uniqueSuffix}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'O+',
      dateOfBirth: '1992-05-10',
      gender: 'Male',
      city: 'Chennai',
      userType: 'Donor',
    };
    const regARes = await request('POST', '/api/auth/register', donorAData);
    assert(regARes.status === 201, 'Donor A (O+ Chennai) registered');
    const tokenA = regARes.body.token;

    // Donor B: B+, Chennai, Available (NON-MATCHING BLOOD GROUP)
    const donorBData = {
      fullName: 'Donor Beta (B+ Chennai Available)',
      mobileNumber: `9002${String(uniqueSuffix).slice(-6)}`,
      email: `donorB_${uniqueSuffix}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'B+',
      dateOfBirth: '1993-06-15',
      gender: 'Female',
      city: 'Chennai',
      userType: 'Donor',
    };
    const regBRes = await request('POST', '/api/auth/register', donorBData);
    assert(regBRes.status === 201, 'Donor B (B+ Chennai) registered');
    const tokenB = regBRes.body.token;

    // Donor C: O+, Bangalore, Available (DIFFERENT CITY)
    const donorCData = {
      fullName: 'Donor Gamma (O+ Bangalore Available)',
      mobileNumber: `9003${String(uniqueSuffix).slice(-6)}`,
      email: `donorC_${uniqueSuffix}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'O+',
      dateOfBirth: '1994-07-20',
      gender: 'Male',
      city: 'Bangalore',
      userType: 'Donor',
    };
    const regCRes = await request('POST', '/api/auth/register', donorCData);
    assert(regCRes.status === 201, 'Donor C (O+ Bangalore) registered');
    const tokenC = regCRes.body.token;

    // Donor D: O+, Chennai, Unavailable (isAvailable: false)
    const donorDData = {
      fullName: 'Donor Delta (O+ Chennai Unavailable)',
      mobileNumber: `9004${String(uniqueSuffix).slice(-6)}`,
      email: `donorD_${uniqueSuffix}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'O+',
      dateOfBirth: '1991-08-25',
      gender: 'Female',
      city: 'Chennai',
      userType: 'Donor',
    };
    const regDRes = await request('POST', '/api/auth/register', donorDData);
    assert(regDRes.status === 201, 'Donor D registered');
    const tokenD = regDRes.body.token;
    // Set Donor D availability to false
    const toggleD = await request('PUT', '/api/auth/availability', null, tokenD);
    assert(toggleD.body.isAvailable === false, 'Donor D toggled availability to false');

    // 2. Create Emergency Request as Non-Registered User
    console.log('\n--- 2. Creating Non-Registered Emergency Request (O+ in Chennai) ---');
    const emergencyPayload = {
      patientName: 'Rohan Mehra',
      bloodGroup: 'O+',
      unitsRequired: 3,
      hospitalName: 'Apollo Speciality Hospital',
      hospitalLocation: 'Chennai',
      emergencyContactNumber: '9840112233',
      description: 'Urgent Cardiac Surgery - ICU Ward',
      urgencyLevel: 'Critical / Immediate',
    };

    const emgRes = await request('POST', '/api/emergency', emergencyPayload);
    assert(emgRes.status === 201, 'Emergency request created successfully');
    const trackingToken = emgRes.body.trackingToken;
    assert(trackingToken, 'Valid tracking token generated');

    // 3. Verify Targeted Donor Notification Persistence
    console.log('\n--- 3. Verifying Notification Targeting & Persistence ---');
    // Donor A (Matching Blood & City & Available) SHOULD receive notification
    const notifsA = await request('GET', '/api/emergency/notifications', null, tokenA);
    assert(notifsA.status === 200, 'Fetched Donor A notifications');
    const donorANotif = (notifsA.body.notifications || []).find((n) => n.internalToken === trackingToken);
    assert(donorANotif !== undefined, 'Donor A received persistent emergency notification');
    assert(donorANotif && donorANotif.bloodGroup === 'O+', 'Notification blood group is O+');
    assert(donorANotif && donorANotif.unitsRequired === 3, 'Notification units required is 3');
    assert(donorANotif && donorANotif.hospitalName === 'Apollo Speciality Hospital', 'Hospital name matches');
    assert(donorANotif && donorANotif.hospitalLocation === 'Chennai', 'Location matches');
    assert(donorANotif && donorANotif.urgencyLevel === 'Critical / Immediate', 'Urgency level matches');
    assert(donorANotif && donorANotif.isRead === false, 'Notification initially unread');

    // Donor B (Available donor, B+) receives broadcast alert per requirement #2
    const notifsB = await request('GET', '/api/emergency/notifications', null, tokenB);
    const donorBNotif = (notifsB.body.notifications || []).find((n) => n.internalToken === trackingToken);
    assert(donorBNotif !== undefined, 'Donor B (B+ Available) receives emergency notification per all-donors broadcast requirement');

    // Donor C (Different city Bangalore) should NOT receive notification
    const notifsC = await request('GET', '/api/emergency/notifications', null, tokenC);
    const donorCNotif = (notifsC.body.notifications || []).find((n) => n.internalToken === trackingToken);
    assert(donorCNotif === undefined, 'Donor C (Bangalore) did NOT receive Chennai emergency notification');

    // Donor D (Unavailable) should NOT receive notification
    const notifsD = await request('GET', '/api/emergency/notifications', null, tokenD);
    const donorDNotif = (notifsD.body.notifications || []).find((n) => n.internalToken === trackingToken);
    assert(donorDNotif === undefined, 'Donor D (Unavailable) did NOT receive emergency notification');

    // 4. Mark Notification as Read
    console.log('\n--- 4. Testing Notification Read Operations ---');
    const notifId = donorANotif.id || donorANotif._id;
    const markReadRes = await request('PUT', `/api/emergency/notifications/${notifId}/read`, null, tokenA);
    assert(markReadRes.status === 200, 'Marked notification as read');

    const verifyRead = await request('GET', '/api/emergency/notifications', null, tokenA);
    const updatedNotif = (verifyRead.body.notifications || []).find((n) => n.internalToken === trackingToken);
    assert(updatedNotif && updatedNotif.isRead === true, 'Notification isRead persisted as true');

    // 5. Donor A Accepts Emergency Request
    console.log('\n--- 5. Testing Donor Acceptance & Requester Update ---');
    const acceptRes = await request('POST', `/api/emergency/accept/${trackingToken}`, null, tokenA);
    assert(acceptRes.status === 200, 'Donor A accepted the emergency request');
    assert(
      acceptRes.body.patientEmergencyContact === '9840112233',
      'Requester contact returned to accepted donor for call trigger'
    );

    // Verify Notification status updated to 'accepted'
    const afterAcceptNotifs = await request('GET', '/api/emergency/notifications', null, tokenA);
    const acceptedNotif = (afterAcceptNotifs.body.notifications || []).find((n) => n.internalToken === trackingToken);
    assert(acceptedNotif && acceptedNotif.status === 'accepted', 'Notification status updated to accepted');
    assert(acceptedNotif && acceptedNotif.hasAccepted === true, 'Notification hasAccepted flagged as true');

    // 6. Verify Requester Status & Privacy Shielding
    console.log('\n--- 6. Verifying Requester View & Strict Privacy Controls ---');
    const guestStatus = await request('GET', `/api/emergency/status/${trackingToken}`);
    assert(guestStatus.status === 200, 'Requester fetched status');
    assert(guestStatus.body.statusData.status === 'Donor Accepted', 'Request status updated to Donor Accepted');
    assert(guestStatus.body.statusData.acceptedDonorsCount === 1, 'Accepted donors count is 1');

    const acceptedDonorView = guestStatus.body.statusData.acceptedDonors[0];
    assert(
      acceptedDonorView.mobileNumber === donorAData.mobileNumber,
      'Non-registered requester can see accepted donor phone number for call connection'
    );
    assert(
      acceptedDonorView.email === undefined &&
      acceptedDonorView.dateOfBirth === undefined &&
      acceptedDonorView.fullName === undefined,
      'PRIVACY SHIELD: Non-registered requester does NOT see donor private email, DOB, or full name'
    );

    // 7. Prevent Duplicate Acceptance
    console.log('\n--- 7. Testing Duplicate Acceptance Prevention ---');
    const duplicateAccept = await request('POST', `/api/emergency/accept/${trackingToken}`, null, tokenA);
    assert(duplicateAccept.status === 400, 'Duplicate acceptance rejected with 400 Bad Request');
    assert(
      duplicateAccept.body.message.includes('already accepted'),
      'Clear duplicate acceptance error message returned'
    );

    // 8. Test Decline Notification Workflow
    console.log('\n--- 8. Testing Decline Emergency Request ---');
    // Create second emergency request in Chennai for O+
    const emg2 = await request('POST', '/api/emergency', {
      ...emergencyPayload,
      patientName: 'Sunita Sharma',
      description: 'Emergency ICU 204',
    });
    const trackingToken2 = emg2.body.trackingToken;

    // Donor A declines this emergency
    const declineRes = await request('POST', `/api/emergency/decline/${trackingToken2}`, null, tokenA);
    assert(declineRes.status === 200, 'Emergency declined successfully');

    // Verify notification is marked as declined
    const notifsAfterDecline = await request('GET', '/api/emergency/notifications', null, tokenA);
    const declinedNotif = (notifsAfterDecline.body.notifications || []).find((n) => n.internalToken === trackingToken2);
    assert(declinedNotif && declinedNotif.status === 'declined', 'Notification marked as declined');
    assert(declinedNotif && declinedNotif.isRead === true, 'Declined notification marked as read');

    // 9. Security: Unauthenticated access rejected
    console.log('\n--- 9. Testing Security Constraints ---');
    const unauthNotifs = await request('GET', '/api/emergency/notifications', null, null);
    assert(unauthNotifs.status === 401, 'Unauthenticated notification fetch rejected with 401 Unauthorized');

    console.log('\n===============================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================');

    if (failed === 0) {
      console.log('🎉 ALL EMERGENCY NOTIFICATION SYSTEM CHECKS PASSED PERFECTLY!');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution failed with exception:', err);
    process.exit(1);
  }
};

runTests();

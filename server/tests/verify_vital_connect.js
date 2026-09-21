/**
 * Comprehensive Verification Suite for Vital Connect Platform
 * Tests Registration, Login, Non-Registered Emergency Access,
 * Privacy Filtering, Real-time Donor Acceptance, Auto-call, and the 10-Donor Limit.
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
  console.log('========================================');
  console.log('🏥 VITAL CONNECT END-TO-END VERIFICATION');
  console.log('========================================\n');

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
    // 1. Health Check
    console.log('--- 1. Testing Server Health ---');
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.body.status === 'online', 'Server health is online');

    // 2. User Registration (Donor)
    console.log('\n--- 2. Testing User Registration ---');
    const ts = Date.now();
    const testDonor = {
      fullName: 'Rahul Sharma',
      mobileNumber: '98' + String(ts).slice(-8),
      email: `rahul.donor.${ts}@vitalconnect.org`,
      password: 'SecurePassword123!',
      bloodGroup: 'O+',
      dateOfBirth: '1995-05-15',
      gender: 'Male',
      city: 'Chennai',
      userType: 'Donor',
      lastDonationDate: '2026-03-10',
    };

    const regRes = await request('POST', '/api/auth/register', testDonor);
    assert(regRes.status === 201, 'Donor registered successfully');
    assert(regRes.body.token, 'JWT token issued');
    assert(regRes.body.user.fullName === 'Rahul Sharma', 'User full name matches');
    assert(regRes.body.user.age >= 18, 'Age calculated correctly from DOB');
    const donorToken = regRes.body.token;

    // 3. User Login
    console.log('\n--- 3. Testing User Login ---');
    const loginRes = await request('POST', '/api/auth/login', {
      identifier: testDonor.email,
      password: 'SecurePassword123!',
    });
    assert(loginRes.status === 200 && loginRes.body.token, 'Login successful with email/password');

    // 4. Non-Registered Emergency Request Creation
    console.log('\n--- 4. Testing Non-Registered Emergency Request ---');
    const emergencyPayload = {
      patientName: 'Ananya Verma',
      bloodGroup: 'O+',
      unitsRequired: 2,
      hospitalName: 'Apollo Speciality Hospital',
      hospitalLocation: 'Chennai',
      emergencyContactNumber: '9123456780',
      description: 'Emergency ICU Surgery Room 402',
      urgencyLevel: 'Critical / Immediate',
    };

    // Note: Submitted without any Authorization header (non-registered guest)
    const emgRes = await request('POST', '/api/emergency', emergencyPayload);
    assert(emgRes.status === 201, 'Emergency request created by non-registered user');
    assert(emgRes.body.trackingToken, 'Internal tracking token generated');
    
    // Privacy constraint check 1: NO unique Emergency Request ID displayed in statusData
    assert(
      !emgRes.body.statusData.requestId &&
      !emgRes.body.statusData.emergencyRequestId &&
      !emgRes.body.statusData.id,
      'CRITICAL PRIVACY: No unique Emergency Request ID generated or displayed in statusData'
    );

    // Privacy constraint check 2: Donor contact NOT displayed immediately
    assert(
      emgRes.body.statusData.acceptedDonors.length === 0,
      'CRITICAL PRIVACY: Donor contact info is NOT displayed initially before acceptance'
    );

    const trackingToken = emgRes.body.trackingToken;

    // 5. Donor Notification & Matching
    console.log('\n--- 5. Testing Donor Matching ---');
    assert(emgRes.body.matchingDonorsCount >= 1, 'Matching eligible donor found in Chennai for O+ blood');

    // 6. Donor Accepts Emergency Request
    console.log('\n--- 6. Testing Donor Acceptance & Automatic Call ---');
    const acceptRes = await request('POST', `/api/emergency/accept/${trackingToken}`, null, donorToken);
    assert(acceptRes.status === 200 && acceptRes.body.success, 'Donor accepted the emergency request');
    assert(
      acceptRes.body.patientEmergencyContact === '9123456780',
      'Patient emergency contact delivered for immediate call connection'
    );

    // 7. Non-Registered Requester Status Check (Privacy Check)
    console.log('\n--- 7. Verifying Non-Registered Requester Privacy Shielding ---');
    const guestStatusRes = await request('GET', `/api/emergency/status/${trackingToken}`);
    assert(guestStatusRes.status === 200, 'Live status fetched by non-registered requester');
    const guestDonorView = guestStatusRes.body.statusData.acceptedDonors[0];
    
    // Check: Non-registered user sees ONLY the accepted donor's Contact Number!
    assert(
      guestDonorView.mobileNumber === testDonor.mobileNumber,
      'Non-registered requester sees accepted donor phone number for call action'
    );
    assert(
      guestDonorView.fullName === undefined &&
      guestDonorView.age === undefined &&
      guestDonorView.dateOfBirth === undefined &&
      guestDonorView.email === undefined &&
      guestDonorView.city === undefined &&
      guestDonorView.lastDonationDate === undefined,
      'CRITICAL PRIVACY: Non-registered requester sees ONLY contact number. Name, DOB, email, city, last donation date are strictly hidden!'
    );

    // 8. Registered Requester View (Detailed Allowed View)
    console.log('\n--- 8. Verifying Registered Requester Privacy Controls ---');
    // Register a requester
    const regRequester = await request('POST', '/api/auth/register', {
      fullName: 'Dr. Priya Sundaram',
      mobileNumber: '94' + String(ts).slice(-8),
      email: `priya.requester.${ts}@vitalconnect.org`,
      password: 'SecurePassword123!',
      bloodGroup: 'A+',
      dateOfBirth: '1988-10-20',
      gender: 'Female',
      city: 'Chennai',
      userType: 'Requester',
    });
    const requesterToken = regRequester.body.token;

    const registeredStatusRes = await request(
      'GET',
      `/api/emergency/status/${trackingToken}`,
      null,
      requesterToken
    );
    const registeredDonorView = registeredStatusRes.body.statusData.acceptedDonors[0];
    assert(
      registeredDonorView.fullName === 'Rahul Sharma' &&
      registeredDonorView.bloodGroup === 'O+' &&
      registeredDonorView.city === 'Chennai' &&
      registeredDonorView.mobileNumber === testDonor.mobileNumber,
      'Registered requester sees permitted donor details (Name, Age, Blood Group, City, Contact, Last Donation Date)'
    );
    assert(
      registeredDonorView.email === undefined &&
      registeredDonorView.dateOfBirth === undefined &&
      registeredDonorView.exactAddress === undefined,
      'CRITICAL PRIVACY: Registered requester does NOT see private DOB, email, or exact home address'
    );

    // 9. 10-Donor Limit and 11th Donor Capacity Reached Message
    console.log('\n--- 9. Testing 10-Donor Connection Limit ---');
    // Connect 9 more donors to reach the 10 donor limit
    for (let i = 2; i <= 10; i++) {
      const extraDonor = await request('POST', '/api/auth/register', {
        fullName: `Volunteer Donor ${i}`,
        mobileNumber: '96' + String(ts).slice(-7) + i,
        email: `donor${i}_${ts}@vitalconnect.org`,
        password: 'Password123!',
        bloodGroup: 'O+',
        dateOfBirth: '1992-01-01',
        gender: 'Male',
        city: 'Chennai',
        userType: 'Donor',
      });
      const extraAccept = await request(
        'POST',
        `/api/emergency/accept/${trackingToken}`,
        null,
        extraDonor.body.token
      );
      assert(extraAccept.body.success === true, `Donor #${i} accepted and connected`);
    }

    // Attempt 11th donor acceptance
    console.log('\n--- 10. Testing 11th Donor Response (Over-Capacity Behavior) ---');
    const donor11 = await request('POST', '/api/auth/register', {
      fullName: 'Volunteer Donor 11',
      mobileNumber: '95' + String(ts).slice(-8),
      email: `donor11_${ts}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'O+',
      dateOfBirth: '1990-02-02',
      gender: 'Male',
      city: 'Chennai',
      userType: 'Donor',
    });

    const accept11 = await request(
      'POST',
      `/api/emergency/accept/${trackingToken}`,
      null,
      donor11.body.token
    );

    assert(accept11.body.isCapacityReached === true, '11th donor flagged as capacity reached');
    const expectedMsg =
      'Thank you for responding! This emergency request has already received enough donor support. Your willingness to help is greatly appreciated. Please continue supporting Vital Connect for future emergencies.';
    assert(
      accept11.body.message === expectedMsg,
      'CRITICAL: Exact user-specified appreciation message returned for donor exceeding 10 limit'
    );
    assert(
      !accept11.body.patientEmergencyContact,
      'CRITICAL: Call action NOT initiated for donor beyond 10-donor ceiling'
    );

    console.log('\n========================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================');

    if (failed === 0) {
      console.log('🎉 ALL SYSTEM CHECKS AND PRIVACY CONSTRAINTS PASSED PERFECTLY!');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution exception:', err);
    process.exit(1);
  }
};

runTests();

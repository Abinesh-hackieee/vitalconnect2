/**
 * Automated Verification Suite: Emergency Request Notification to ALL Available Donors
 *
 * Verifies:
 * 1. A+ emergency request reaches all available donors across all blood groups (A+, A-, B+, B-, AB+, AB-, O+, O-).
 * 2. O+ emergency request reaches all available donors across all blood groups.
 * 3. AB- emergency request reaches all available donors across all blood groups.
 * 4. Non-available donors (isAvailable: false) do NOT receive emergency requests.
 * 5. Offline eligible available donors receive the SMS fallback.
 * 6. Notification payload includes Patient Name, Blood Group, Units, Hospital, Location, Urgency, and Request Time.
 * 7. Emergency Request tracks notified donors list and accepted donor.
 * 8. When one donor accepts, request status updates and other donors see acceptance state.
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
  console.log('🩸 VITAL CONNECT - ALL-DONORS EMERGENCY NOTIFICATION SUITE');
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

  const ts = Date.now();
  const testCity = `Metro_${ts}`;

  try {
    // -----------------------------------------------------------------
    // 1. Register Donors for All 8 Blood Groups
    // -----------------------------------------------------------------
    console.log('--- 1. Registering 8 Available Donors for All Blood Groups ---');
    const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const registeredDonors = {};

    for (let i = 0; i < bloodGroups.length; i++) {
      const bg = bloodGroups[i];
      const safeBg = bg.replace('+', 'pos').replace('-', 'neg');
      const donorData = {
        fullName: `Donor ${bg} Volunteer`,
        email: `donor_${safeBg}_${ts}@vitalconnect.org`,
        password: 'Password123!',
        bloodGroup: bg,
        dateOfBirth: '1995-04-12',
        gender: 'Male',
        city: testCity,
        userType: 'Donor',
        mobileNumber: `91${String(ts).slice(-6)}${String(i).padStart(2, '0')}`,
      };

      const regRes = await request('POST', '/api/auth/register', donorData);
      assert(regRes.status === 201, `Donor with blood group ${bg} registered successfully`);
      registeredDonors[bg] = {
        ...regRes.body.user,
        token: regRes.body.token,
      };
    }

    // -----------------------------------------------------------------
    // 2. Register an Unavailable Donor (isAvailable: false)
    // -----------------------------------------------------------------
    console.log('\n--- 2. Registering an Unavailable Donor (isAvailable: false) ---');
    const unavailData = {
      fullName: 'Unavailable Donor',
      email: `unavail_${ts}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'O+',
      dateOfBirth: '1992-08-15',
      gender: 'Female',
      city: testCity,
      userType: 'Donor',
      mobileNumber: `92${String(ts).slice(-6)}99`,
    };
    const regUnavail = await request('POST', '/api/auth/register', unavailData);
    assert(regUnavail.status === 201, 'Unavailable donor registered');
    const unavailToken = regUnavail.body.token;
    // Set isAvailable to false
    const toggleRes = await request('PUT', '/api/auth/availability', null, unavailToken);
    assert(toggleRes.body.isAvailable === false, 'Donor toggled availability to false');

    // -----------------------------------------------------------------
    // 3. Test A+ Emergency Request: Must Reach ALL 8 Available Donors
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Emergency Request for Blood Group A+ ---');
    const emgAplusPayload = {
      patientName: 'Ravi Sharma',
      bloodGroup: 'A+',
      unitsRequired: 2,
      hospitalName: 'Apollo Speciality Center',
      hospitalLocation: testCity,
      emergencyContactNumber: '9840112233',
      description: 'Urgent bypass surgery requirement',
      urgencyLevel: 'Critical / Immediate',
    };

    const emgAplusRes = await request('POST', '/api/emergency', emgAplusPayload);
    assert(emgAplusRes.status === 201, 'A+ emergency request created successfully');
    const tokenAplus = emgAplusRes.body.trackingToken;
    assert(Boolean(tokenAplus), 'Valid trackingToken returned');

    // Verify each of the 8 available donors received the notification
    for (const bg of bloodGroups) {
      const donor = registeredDonors[bg];
      const notifRes = await request('GET', '/api/emergency/notifications', null, donor.token);
      assert(notifRes.status === 200, `Fetched notifications for ${bg} donor`);
      const notif = (notifRes.body.notifications || []).find((n) => n.internalToken === tokenAplus);
      assert(Boolean(notif), `A+ emergency notification reached ${bg} donor!`);
      if (notif) {
        assert(notif.patientName === 'Ravi Sharma', `${bg} notif has correct patient name`);
        assert(notif.bloodGroup === 'A+', `${bg} notif has required blood group A+`);
        assert(notif.unitsRequired === 2, `${bg} notif has units required 2`);
        assert(notif.hospitalName === 'Apollo Speciality Center', `${bg} notif has hospital name`);
        assert(notif.hospitalLocation === testCity, `${bg} notif has hospital location`);
        assert(notif.urgencyLevel === 'Critical / Immediate', `${bg} notif has urgency level`);
        assert(Boolean(notif.createdAt), `${bg} notif has request creation timestamp`);
      }
    }

    // Verify unavailable donor did NOT receive the notification
    const unavailNotifRes = await request('GET', '/api/emergency/notifications', null, unavailToken);
    const unavailNotif = (unavailNotifRes.body.notifications || []).find((n) => n.internalToken === tokenAplus);
    assert(unavailNotif === undefined, 'NON-AVAILABLE donor did NOT receive A+ emergency request');

    // -----------------------------------------------------------------
    // 4. Test O+ Emergency Request: Must Reach ALL 8 Available Donors
    // -----------------------------------------------------------------
    console.log('\n--- 4. Testing Emergency Request for Blood Group O+ ---');
    const emgOplusPayload = {
      patientName: 'Priya Narayanan',
      bloodGroup: 'O+',
      unitsRequired: 3,
      hospitalName: 'Fortis Healthcare',
      hospitalLocation: testCity,
      emergencyContactNumber: '9840223344',
      description: 'Emergency trauma surgery',
      urgencyLevel: 'Critical / Immediate',
    };

    const emgOplusRes = await request('POST', '/api/emergency', emgOplusPayload);
    assert(emgOplusRes.status === 201, 'O+ emergency request created successfully');
    const tokenOplus = emgOplusRes.body.trackingToken;

    for (const bg of bloodGroups) {
      const donor = registeredDonors[bg];
      const notifRes = await request('GET', '/api/emergency/notifications', null, donor.token);
      const notif = (notifRes.body.notifications || []).find((n) => n.internalToken === tokenOplus);
      assert(Boolean(notif), `O+ emergency notification reached ${bg} donor!`);
    }

    // Unavailable donor must NOT receive O+ request
    const unavailOplus = await request('GET', '/api/emergency/notifications', null, unavailToken);
    assert(
      (unavailOplus.body.notifications || []).find((n) => n.internalToken === tokenOplus) === undefined,
      'NON-AVAILABLE donor did NOT receive O+ emergency request'
    );

    // -----------------------------------------------------------------
    // 5. Test AB- Emergency Request: Must Reach ALL 8 Available Donors
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing Emergency Request for Rare Blood Group AB- ---');
    const emgABnegPayload = {
      patientName: 'Anil Kumble',
      bloodGroup: 'AB-',
      unitsRequired: 1,
      hospitalName: 'Manipal Hospital',
      hospitalLocation: testCity,
      emergencyContactNumber: '9840334455',
      description: 'Severe anemia transfusion',
      urgencyLevel: 'Critical / Immediate',
    };

    const emgABnegRes = await request('POST', '/api/emergency', emgABnegPayload);
    assert(emgABnegRes.status === 201, 'AB- emergency request created successfully');
    const tokenABneg = emgABnegRes.body.trackingToken;

    for (const bg of bloodGroups) {
      const donor = registeredDonors[bg];
      const notifRes = await request('GET', '/api/emergency/notifications', null, donor.token);
      const notif = (notifRes.body.notifications || []).find((n) => n.internalToken === tokenABneg);
      assert(Boolean(notif), `AB- emergency notification reached ${bg} donor!`);
    }

    // -----------------------------------------------------------------
    // 6. Test SMS Fallback for Offline Available Donors
    // -----------------------------------------------------------------
    console.log('\n--- 6. Testing SMS Fallback for Offline Donors ---');
    const smsInspection = await request('GET', '/api/emergency/sms-inspection');
    assert(smsInspection.status === 200, 'Fetched SMS inspection ledger');
    const sentMessages = smsInspection.body.messages || [];
    assert(sentMessages.length > 0, 'SMS messages were dispatched to offline donors');

    // Verify SMS format contains required info and privacy shield
    const sampleSms = sentMessages.find((m) => m.emergencyId === tokenAplus || m.emergencyId === tokenOplus);
    if (sampleSms) {
      assert(sampleSms.message.includes('[Vital Connect Emergency Alert]'), 'SMS contains platform header');
      assert(sampleSms.message.includes('Unit(s)'), 'SMS contains units required');
      assert(!sampleSms.message.includes('9840112233'), 'PRIVACY: Patient contact number is strictly shielded from SMS');
    }

    // -----------------------------------------------------------------
    // 7. Test Donor Acceptance & Real-time Update to Other Donors
    // -----------------------------------------------------------------
    console.log('\n--- 7. Testing Donor Acceptance & Multi-Donor Status Tracking ---');
    const acceptingDonor = registeredDonors['B+'];
    const otherDonor = registeredDonors['AB+'];

    const acceptRes = await request('POST', `/api/emergency/accept/${tokenAplus}`, null, acceptingDonor.token);
    assert(acceptRes.status === 200 && acceptRes.body.success === true, 'B+ Donor successfully accepted A+ emergency');

    // Verify emergency status updated to 'Donor Accepted'
    const statusCheck = await request('GET', `/api/emergency/status/${tokenAplus}`);
    assert(statusCheck.body.statusData.status === 'Donor Accepted', 'Emergency status updated to "Donor Accepted"');
    assert(statusCheck.body.statusData.acceptedDonorsCount === 1, 'Emergency acceptedDonorsCount is 1');

    // Other donor checks notification: should see hasAcceptedByOther
    const otherNotifs = await request('GET', '/api/emergency/notifications', null, otherDonor.token);
    const otherNotif = (otherNotifs.body.notifications || []).find((n) => n.internalToken === tokenAplus);
    assert(Boolean(otherNotif), 'Other donor still has notification record');
    assert(otherNotif && otherNotif.hasAcceptedByOther === true, 'Other donor sees hasAcceptedByOther === true');
    assert(otherNotif && otherNotif.acceptedDonorsCount === 1, 'Other donor sees acceptedDonorsCount === 1');

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests();

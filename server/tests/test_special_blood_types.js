/**
 * Test Suite: Special Blood Types Validation & Integration
 *
 * Verifies:
 * 1. Normal blood groups remain unchanged and fully valid.
 * 2. All 9 Special Blood Types are valid for registration:
 *    - A1+, A1-, A2+, A2-, A1B+, A1B-, A2B+, A2B-, Bombay Blood Group (Oh / hh)
 * 3. Profile update accepts and persists special blood types.
 * 4. Emergency request creation accepts special blood types.
 * 5. GET /api/auth/donors?bloodGroup=<special_type> queries donors properly.
 * 6. Invalid blood types are strictly rejected with 400 Bad Request.
 */

const http = require('http');
const express = require('express');
const authRoutes = require('../routes/authRoutes');
const emergencyRoutes = require('../routes/emergencyRoutes');
const { connectDB } = require('../config/db');
const {
  NORMAL_BLOOD_GROUPS,
  SPECIAL_BLOOD_TYPES,
  ALL_VALID_BLOOD_GROUPS,
} = require('../services/bloodCompatibility');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🩸 SPECIAL BLOOD TYPES INTEGRATION & VERIFICATION');
  console.log('====================================================\n');

  await connectDB();

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/emergency', emergencyRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  const makeRequest = (method, endpoint, body = null, token = null) => {
    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}${endpoint}`);
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request(
        url,
        { method, headers },
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => (rawData += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(rawData) });
            } catch (e) {
              resolve({ status: res.statusCode, body: rawData });
            }
          });
        }
      );
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  };

  // --- Step 1: Verify Normal Blood Groups Unchanged ---
  console.log('--- 1. Verifying Normal Blood Groups (8 Standard Types) ---');
  const expectedNormal = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  assert(
    NORMAL_BLOOD_GROUPS.length === 8 &&
      expectedNormal.every((bg) => NORMAL_BLOOD_GROUPS.includes(bg)),
    'Normal blood groups array strictly contains 8 standard groups'
  );

  // --- Step 2: Verify All 9 Special Blood Types ---
  console.log('\n--- 2. Verifying Special Blood Types (9 Types) ---');
  const expectedSpecial = [
    'A1+',
    'A1-',
    'A2+',
    'A2-',
    'A1B+',
    'A1B-',
    'A2B+',
    'A2B-',
    'Bombay Blood Group (Oh / hh)',
  ];
  assert(
    SPECIAL_BLOOD_TYPES.length === 9 &&
      expectedSpecial.every((bg) => SPECIAL_BLOOD_TYPES.includes(bg)),
    'Special blood types array strictly contains all 9 required types'
  );

  // --- Step 3: Register Donors with Each Special Blood Type ---
  console.log('\n--- 3. Testing Registration with Each Special Blood Type ---');
  const timestamp = Date.now();
  let bombayUserToken = null;
  let bombayUserId = null;

  for (let i = 0; i < SPECIAL_BLOOD_TYPES.length; i++) {
    const specialGroup = SPECIAL_BLOOD_TYPES[i];
    const uniqueEmail = `donor_special_${i}_${timestamp}@test.com`;
    const uniquePhone = `98${String(timestamp).slice(-6)}${String(i).padStart(2, '0')}`;

    const regRes = await makeRequest('POST', '/auth/register', {
      fullName: `Special Donor ${specialGroup}`,
      mobileNumber: uniquePhone,
      email: uniqueEmail,
      password: 'Password123!',
      bloodGroup: specialGroup,
      dateOfBirth: '1995-05-15',
      gender: 'Male',
      city: 'Chennai',
      userType: 'Donor',
    });

    assert(
      regRes.status === 201 && regRes.body.success,
      `Registration succeeds for special blood type: ${specialGroup}`
    );
    assert(
      regRes.body.user.bloodGroup === specialGroup,
      `Registered user bloodGroup matches: ${specialGroup}`
    );

    if (specialGroup === 'Bombay Blood Group (Oh / hh)') {
      bombayUserToken = regRes.body.token;
      bombayUserId = regRes.body.user._id || regRes.body.user.id;
    }
  }

  // --- Step 4: Profile Update with Special Blood Types ---
  console.log('\n--- 4. Testing Profile Update with Special Blood Type ---');
  const updateRes = await makeRequest(
    'PUT',
    '/auth/profile',
    {
      fullName: 'Updated Bombay Donor',
      mobileNumber: `97${String(timestamp).slice(-6)}99`,
      email: `updated_bombay_${timestamp}@test.com`,
      bloodGroup: 'Bombay Blood Group (Oh / hh)',
      dateOfBirth: '1992-04-12',
      gender: 'Female',
      city: 'Bangalore',
      isAvailable: true,
    },
    bombayUserToken
  );

  assert(updateRes.status === 200, 'Profile update returns 200 OK');
  assert(
    updateRes.body.user.bloodGroup === 'Bombay Blood Group (Oh / hh)',
    'Updated profile retains special blood group'
  );

  // Switch to A1B+
  const updateToA1B = await makeRequest(
    'PUT',
    '/auth/profile',
    {
      fullName: 'Updated Bombay Donor',
      mobileNumber: `97${String(timestamp).slice(-6)}99`,
      email: `updated_bombay_${timestamp}@test.com`,
      bloodGroup: 'A1B+',
      dateOfBirth: '1992-04-12',
      gender: 'Female',
      city: 'Bangalore',
      isAvailable: true,
    },
    bombayUserToken
  );
  assert(
    updateToA1B.status === 200 && updateToA1B.body.user.bloodGroup === 'A1B+',
    'Successfully updated profile blood group to A1B+'
  );

  // --- Step 5: Emergency Blood Request with Special Blood Types ---
  console.log('\n--- 5. Testing Emergency Request with Special Blood Types ---');
  const emgBombay = await makeRequest('POST', '/emergency', {
    patientName: 'Ramesh Bombay Patient',
    bloodGroup: 'Bombay Blood Group (Oh / hh)',
    unitsRequired: 2,
    hospitalName: 'Apollo Special Care',
    hospitalLocation: 'Chennai',
    emergencyContactNumber: '+91 98401 23456',
    description: 'Rare blood emergency need',
    urgencyLevel: 'Critical / Immediate',
  });

  if (emgBombay.status !== 201) {
    console.error('emgBombay failed:', emgBombay);
  }
  assert(emgBombay.status === 201, 'Emergency request with Bombay blood type returns 201 Created');
  assert(
    emgBombay.body.statusData.bloodGroup === 'Bombay Blood Group (Oh / hh)',
    'Emergency statusData reflects Bombay Blood Group'
  );

  const emgA2Neg = await makeRequest('POST', '/emergency', {
    patientName: 'Priya A2- Patient',
    bloodGroup: 'A2-',
    unitsRequired: 1,
    hospitalName: 'City General Hospital',
    hospitalLocation: 'Chennai',
    emergencyContactNumber: '+91 98401 65432',
    description: 'Urgent A2- needed',
  });
  assert(
    emgA2Neg.status === 201 && emgA2Neg.body.statusData.bloodGroup === 'A2-',
    'Emergency request with A2- returns 201 Created'
  );

  // --- Step 6: Querying Donors by Special Blood Group ---
  console.log('\n--- 6. Testing Donor Lookup by Special Blood Group ---');
  const bombayLookup = await makeRequest(
    'GET',
    `/auth/donors?bloodGroup=${encodeURIComponent('Bombay Blood Group (Oh / hh)')}`
  );
  assert(bombayLookup.status === 200, 'GET /api/auth/donors for Bombay blood group returns 200 OK');
  assert(
    bombayLookup.body.bloodGroup === 'Bombay Blood Group (Oh / hh)',
    'Lookup echoed Bombay Blood Group'
  );

  const a1Lookup = await makeRequest('GET', '/auth/donors?bloodGroup=A1%2B');
  assert(a1Lookup.status === 200, 'GET /api/auth/donors for A1+ returns 200 OK');
  assert(a1Lookup.body.bloodGroup === 'A1+', 'Lookup echoed A1+');

  // --- Step 7: Negative Validation - Reject Invalid Blood Types ---
  console.log('\n--- 7. Testing Rejection of Invalid Blood Types ---');
  const invalidReg = await makeRequest('POST', '/auth/register', {
    fullName: 'Invalid Blood Donor',
    mobileNumber: '9876543299',
    email: `invalid_bg_${timestamp}@test.com`,
    password: 'Password123!',
    bloodGroup: 'Z_POSITIVE',
    dateOfBirth: '1995-05-15',
    gender: 'Male',
    city: 'Chennai',
    userType: 'Donor',
  });
  assert(invalidReg.status === 400, 'Registration rejects invalid blood group Z_POSITIVE with 400');

  const invalidEmg = await makeRequest('POST', '/emergency', {
    patientName: 'Fake Patient',
    bloodGroup: 'INVALID_GROUP',
    unitsRequired: 1,
    hospitalName: 'Test Hospital',
    hospitalLocation: 'Chennai',
    emergencyContactNumber: '+91 98401 11111',
  });
  assert(invalidEmg.status === 400, 'Emergency request rejects invalid blood group with 400');

  server.close();
  console.log('\n====================================================');
  console.log('🎉 ALL SPECIAL BLOOD TYPES TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});

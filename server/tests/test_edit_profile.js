/**
 * Test Suite: Edit Profile Feature for Registered Donors
 * Tests:
 * 1. Successful donor profile update (name, phone, blood group, city, lastDonationDate, isAvailable)
 * 2. Profile fetch (GET /api/auth/me) reflects updated values
 * 3. Validation: Rejection of age < 18
 * 4. Validation: Rejection of invalid blood group
 * 5. Validation: Conflict detection when attempting to change to an existing user's email or mobile
 * 6. Security: Rejection of unauthenticated update requests
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
  console.log('====================================================');
  console.log('📝 TESTING REGISTERED DONOR EDIT PROFILE FEATURE');
  console.log('====================================================\n');

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

    // 1. Register Primary Test Donor
    console.log('--- 1. Registering Primary Donor ---');
    const primaryDonorData = {
      fullName: 'Vikram Sethi',
      mobileNumber: `9811${String(uniqueSuffix).slice(-6)}`,
      email: `vikram_${uniqueSuffix}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'B+',
      dateOfBirth: '1996-04-12',
      gender: 'Male',
      city: 'Bangalore',
      userType: 'Donor',
      lastDonationDate: '2025-12-01',
    };

    const regRes = await request('POST', '/api/auth/register', primaryDonorData);
    assert(regRes.status === 201, 'Primary donor registered');
    const donorToken = regRes.body.token;
    assert(donorToken, 'Token issued for primary donor');

    // 2. Successful Profile Update
    console.log('\n--- 2. Testing Valid Profile Update ---');
    const updatedData = {
      fullName: 'Vikram K. Sethi',
      mobileNumber: `9822${String(uniqueSuffix).slice(-6)}`,
      email: `vikram_updated_${uniqueSuffix}@vitalconnect.org`,
      bloodGroup: 'AB+',
      dateOfBirth: '1995-08-20',
      gender: 'Male',
      city: 'Hyderabad',
      lastDonationDate: '2026-02-15',
      isAvailable: false,
    };

    const updateRes = await request('PUT', '/api/auth/profile', updatedData, donorToken);
    assert(updateRes.status === 200, 'Profile update returns 200 OK');
    assert(updateRes.body.success === true, 'Response indicates success: true');
    assert(updateRes.body.user.fullName === 'Vikram K. Sethi', 'Full name updated to Vikram K. Sethi');
    assert(updateRes.body.user.city === 'Hyderabad', 'City updated to Hyderabad');
    assert(updateRes.body.user.bloodGroup === 'AB+', 'Blood group updated to AB+');
    assert(updateRes.body.user.isAvailable === false, 'Availability updated to false');

    // 3. Verify GET /api/auth/me reflects the changes
    console.log('\n--- 3. Verifying GET /api/auth/me Persistence ---');
    const meRes = await request('GET', '/api/auth/me', null, donorToken);
    assert(meRes.status === 200, 'Fetched /api/auth/me successfully');
    assert(meRes.body.user.fullName === 'Vikram K. Sethi', 'Persistent full name matches');
    assert(meRes.body.user.city === 'Hyderabad', 'Persistent city matches');
    assert(meRes.body.user.bloodGroup === 'AB+', 'Persistent blood group matches');
    assert(meRes.body.user.mobileNumber === updatedData.mobileNumber, 'Persistent phone matches');

    // 4. Validation: Underage Date of Birth
    console.log('\n--- 4. Testing Validation: Underage Donor (< 18) ---');
    const underageData = {
      ...updatedData,
      dateOfBirth: '2015-01-01', // ~11 years old
    };
    const underageRes = await request('PUT', '/api/auth/profile', underageData, donorToken);
    assert(underageRes.status === 400, 'Rejects update with age < 18 with 400 Bad Request');
    assert(
      underageRes.body.message.includes('18 years old'),
      'Clear validation error message returned for underage'
    );

    // 5. Validation: Invalid Blood Group
    console.log('\n--- 5. Testing Validation: Invalid Blood Group ---');
    const invalidBgData = {
      ...updatedData,
      bloodGroup: 'Z_POSITIVE',
    };
    const invalidBgRes = await request('PUT', '/api/auth/profile', invalidBgData, donorToken);
    assert(invalidBgRes.status === 400, 'Rejects invalid blood group with 400 Bad Request');

    // 6. Conflict Validation: Duplicate Email / Mobile with Another User
    console.log('\n--- 6. Testing Uniqueness Conflict Validation ---');
    const secondDonorData = {
      fullName: 'Ananya Rao',
      mobileNumber: `9833${String(uniqueSuffix).slice(-6)}`,
      email: `ananya_${uniqueSuffix}@vitalconnect.org`,
      password: 'Password123!',
      bloodGroup: 'O+',
      dateOfBirth: '1998-07-22',
      gender: 'Female',
      city: 'Hyderabad',
      userType: 'Donor',
    };
    const secondRegRes = await request('POST', '/api/auth/register', secondDonorData);
    assert(secondRegRes.status === 201, 'Second donor registered');

    // Try updating primary donor's email to second donor's email
    const collisionEmailData = {
      ...updatedData,
      email: secondDonorData.email,
    };
    const collisionEmailRes = await request('PUT', '/api/auth/profile', collisionEmailData, donorToken);
    assert(collisionEmailRes.status === 400, 'Rejects update with duplicate email');
    assert(
      collisionEmailRes.body.message.includes('already exists'),
      'Conflict error indicates email already exists'
    );

    // Try updating primary donor's mobile to second donor's mobile
    const collisionMobileData = {
      ...updatedData,
      mobileNumber: secondDonorData.mobileNumber,
    };
    const collisionMobileRes = await request('PUT', '/api/auth/profile', collisionMobileData, donorToken);
    assert(collisionMobileRes.status === 400, 'Rejects update with duplicate mobile number');

    // 7. Security: Unauthenticated request
    console.log('\n--- 7. Testing Security: Unauthenticated Request ---');
    const unauthRes = await request('PUT', '/api/auth/profile', updatedData, null);
    assert(unauthRes.status === 401, 'Rejects update with missing token with 401 Unauthorized');

    console.log('\n====================================================');
    console.log(`SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed === 0) {
      console.log('🎉 ALL EDIT PROFILE TESTS PASSED SUCCESSFULLY!');
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

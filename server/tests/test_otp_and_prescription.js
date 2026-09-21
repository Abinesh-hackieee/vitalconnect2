/**
 * Vital Connect - Automated Test Suite: OTP Verification & Doctor Prescription Flow
 */
const http = require('http');

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode, raw: b });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'GET',
      headers
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode, raw: b });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function put(path, body = {}, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost',
      port: 5000,
      path,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers
      }
    }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(b) });
        } catch {
          resolve({ status: res.statusCode, raw: b });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const assert = (cond, msg) => {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
};

async function runSuite() {
  console.log('====================================================');
  console.log('🧪 VITAL CONNECT: OTP & PRESCRIPTION VERIFICATION SUITE');
  console.log('====================================================\n');

  const ts = Date.now();
  const testUser = {
    fullName: 'Ananya Deshmukh',
    mobileNumber: '93' + String(ts).slice(-8),
    email: `ananya_${ts}@vitalconnect.org`,
    password: 'SecurePassword123!',
    bloodGroup: 'Bombay Blood Group (Oh / hh)',
    dateOfBirth: '1996-08-14',
    gender: 'Female',
    city: 'Chennai',
    userType: 'Donor',
    requireOtp: true
  };

  // --- Scenario 1: OTP Generation & Dispatch ---
  console.log('--- 1. Testing Registration with Single OTP Requirement ---');
  const regRes = await post('/api/auth/register', testUser);
  assert(regRes.status === 201, 'Registration returns 201 status code');
  assert(regRes.body.requiresOtp === true, 'Response requires OTP verification');
  assert(Boolean(regRes.body.userId), 'User ID returned for verification step');
  assert(regRes.body.debugOtp && regRes.body.debugOtp.length === 6, 'Valid 6-digit OTP generated');
  const userId = regRes.body.userId;
  const otp = regRes.body.debugOtp;

  // --- Scenario 2: Invalid OTP Rejection ---
  console.log('\n--- 2. Testing Invalid OTP Rejection ---');
  const badOtpRes = await post('/api/auth/verify-otp', { userId, otp: '999999' });
  assert(badOtpRes.status === 400, 'Invalid OTP returns 400 Bad Request');
  assert(badOtpRes.body.message.includes('remaining'), 'Error message shows remaining attempts');

  // --- Scenario 3: Cooldown on Resend OTP ---
  console.log('\n--- 3. Testing Resend Cooldown Enforcement ---');
  const resendCooldownRes = await post('/api/auth/resend-otp', { userId });
  assert(resendCooldownRes.status === 400, 'Resend during cooldown returns 400 Bad Request');
  assert(resendCooldownRes.body.message.includes('60s'), 'Cooldown warning specifies 60s restriction');

  // --- Scenario 4: Successful OTP Verification ---
  console.log('\n--- 4. Testing Successful OTP Verification ---');
  const verifyRes = await post('/api/auth/verify-otp', { userId, otp });
  assert(verifyRes.status === 200, 'Valid OTP returns 200 OK');
  assert(Boolean(verifyRes.body.token), 'JWT token issued upon verification');
  assert(verifyRes.body.user.emailVerified === true, 'emailVerified is set to true');
  assert(verifyRes.body.user.phoneVerified === true, 'phoneVerified is set to true');
  assert(verifyRes.body.user.bloodGroup === 'Bombay Blood Group (Oh / hh)', 'Special blood group preserved');

  // --- Scenario 5: Prescription & Emergency Request Submission ---
  console.log('\n--- 5. Testing Emergency Request with Prescription & Date ---');
  const today = new Date().toISOString().split('T')[0];
  const emgPayload = {
    patientName: 'K. Srinivasan',
    bloodGroup: 'A2B+',
    unitsRequired: 3,
    hospitalName: 'Kauvery Hospital',
    hospitalLocation: 'Alwarpet, Chennai',
    emergencyContactNumber: '9840223344',
    guardianContactNumber: '9840556677',
    requiredBloodDate: today,
    urgencyLevel: 'Critical / Immediate',
    description: 'Special A2B+ blood requirement for surgical procedure',
    prescriptionFile: {
      filename: 'kauvery_prescription.pdf',
      originalName: 'kauvery_prescription.pdf',
      mimeType: 'application/pdf',
      size: 4096,
      data: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...'
    }
  };

  const emgRes = await post('/api/emergency', emgPayload);
  assert(emgRes.status === 201, 'Emergency request created with 201 status');
  assert(emgRes.body.statusData.verificationStatus === 'Pending Verification', 'Status is Pending Verification');
  assert(Boolean(emgRes.body.trackingToken), 'Tracking token issued');
  const trackingToken = emgRes.body.trackingToken;

  // --- Scenario 6: Prescription Review Queue & Verification ---
  console.log('\n--- 6. Testing Prescription Queue & Reviewer Approval ---');
  const queueRes = await get('/api/emergency/pending-verifications');
  assert(queueRes.status === 200, 'Pending verifications queue returns 200 OK');
  const foundInQueue = (queueRes.body.requests || []).some(r => r.id === trackingToken);
  assert(foundInQueue, 'Emergency request is visible in pending verifications queue');

  const approveRes = await put(`/api/emergency/${trackingToken}/verify`);
  assert(approveRes.status === 200, 'Prescription approval returns 200 OK');
  assert(approveRes.body.emergency.verificationStatus === 'Verified', 'Request is marked as Verified');
  assert(approveRes.body.emergency.status === 'Donors Notified', 'Status transitioned to Donors Notified');
  assert(approveRes.body.notifiedDonorsCount > 0, 'Broadcast sent to available donors in network');

  console.log('\n====================================================');
  console.log('🎉 ALL OTP & PRESCRIPTION TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

runSuite().catch(e => {
  console.error(e);
  process.exit(1);
});

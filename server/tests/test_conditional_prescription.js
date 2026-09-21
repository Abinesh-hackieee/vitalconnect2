/**
 * Automated Test Suite: Conditional Doctor Prescription / Hospital Requisition based on Urgency Level
 */
const http = require('http');
const assert = require('assert');
const { isPrescriptionMandatory } = require('../controllers/emergencyController');

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
        'Origin': 'http://localhost:5173', // Browser header to simulate UI requests
        ...headers,
      },
    }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
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

async function runTests() {
  console.log('=== Vital Connect: Conditional Prescription Validation Test Suite ===\n');

  // 1. Unit Tests for isPrescriptionMandatory
  console.log('1. Testing isPrescriptionMandatory helper:');
  assert.strictEqual(isPrescriptionMandatory('Critical / Immediate'), false, 'Critical / Immediate is optional');
  assert.strictEqual(isPrescriptionMandatory('Immediate'), false, 'Immediate is optional');
  assert.strictEqual(isPrescriptionMandatory('High (Within 2 hrs)'), false, 'High (Within 2 hrs) is optional');
  assert.strictEqual(isPrescriptionMandatory('Within 2 Hours'), false, 'Within 2 Hours is optional');
  assert.strictEqual(isPrescriptionMandatory('Urgent (Within 6 hrs)'), true, 'Urgent (Within 6 hrs) is mandatory');
  assert.strictEqual(isPrescriptionMandatory('Urgent'), true, 'Urgent is mandatory');
  assert.strictEqual(isPrescriptionMandatory('Scheduled'), true, 'Scheduled is mandatory');
  assert.strictEqual(isPrescriptionMandatory('Scheduled/Planned'), true, 'Scheduled/Planned is mandatory');
  console.log('   All helper unit tests PASSED.\n');

  const today = new Date().toISOString().split('T')[0];
  const samplePrescription = {
    filename: 'test_prescription.pdf',
    originalName: 'test_prescription.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    data: 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXr...',
  };

  // 2. Rule 1: Immediate -> Doctor Prescription is OPTIONAL (Submission without file succeeds)
  console.log('2. Testing Immediate: Prescription OPTIONAL (No file attached):');
  const resImmediateNoFile = await post('/api/emergency', {
    patientName: 'Test Patient Immediate',
    bloodGroup: 'B+',
    unitsRequired: 2,
    hospitalName: 'City General Hospital',
    hospitalLocation: 'Chennai Central',
    emergencyContactNumber: '9840112233',
    requiredBloodDate: today,
    urgencyLevel: 'Critical / Immediate',
    prescriptionFile: null,
  });
  assert.strictEqual(resImmediateNoFile.status, 201, 'Immediate without prescription returns 201 Created');
  assert.strictEqual(resImmediateNoFile.body.success, true, 'Request created successfully');
  console.log('   Immediate without prescription PASSED (Status 201).\n');

  // 3. Rule 2: Within 2 Hours -> Doctor Prescription is OPTIONAL (Submission without file succeeds)
  console.log('3. Testing Within 2 Hours: Prescription OPTIONAL (No file attached):');
  const resWithin2HoursNoFile = await post('/api/emergency', {
    patientName: 'Test Patient Within 2 Hours',
    bloodGroup: 'O+',
    unitsRequired: 1,
    hospitalName: 'Apollo Hospital',
    hospitalLocation: 'Greams Road, Chennai',
    emergencyContactNumber: '9840223344',
    requiredBloodDate: today,
    urgencyLevel: 'High (Within 2 hrs)',
    prescriptionFile: null,
  });
  assert.strictEqual(resWithin2HoursNoFile.status, 201, 'Within 2 Hours without prescription returns 201 Created');
  assert.strictEqual(resWithin2HoursNoFile.body.success, true, 'Request created successfully');
  console.log('   Within 2 Hours without prescription PASSED (Status 201).\n');

  // 4. Rule 3: Urgent -> Doctor Prescription is MANDATORY (Submission without file is rejected)
  console.log('4. Testing Urgent: Prescription MANDATORY (No file attached):');
  const resUrgentNoFile = await post('/api/emergency', {
    patientName: 'Test Patient Urgent',
    bloodGroup: 'A+',
    unitsRequired: 2,
    hospitalName: 'Fortis Malar',
    hospitalLocation: 'Adyar, Chennai',
    emergencyContactNumber: '9840334455',
    requiredBloodDate: today,
    urgencyLevel: 'Urgent (Within 6 hrs)',
    prescriptionFile: null,
  });
  assert.strictEqual(resUrgentNoFile.status, 400, 'Urgent without prescription returns 400 Bad Request');
  assert.strictEqual(resUrgentNoFile.body.success, false, 'Rejected due to missing prescription');
  assert(
    resUrgentNoFile.body.message.includes('mandatory'),
    'Error message states prescription is mandatory'
  );
  console.log('   Urgent without prescription PASSED (Rejected with 400: ' + resUrgentNoFile.body.message + ').\n');

  // 5. Rule 4: Scheduled/Planned -> Doctor Prescription is MANDATORY (Submission without file is rejected)
  console.log('5. Testing Scheduled: Prescription MANDATORY (No file attached):');
  const resScheduledNoFile = await post('/api/emergency', {
    patientName: 'Test Patient Scheduled',
    bloodGroup: 'AB+',
    unitsRequired: 1,
    hospitalName: 'MIOT Hospital',
    hospitalLocation: 'Manapakkam, Chennai',
    emergencyContactNumber: '9840445566',
    requiredBloodDate: today,
    urgencyLevel: 'Scheduled',
    prescriptionFile: null,
  });
  assert.strictEqual(resScheduledNoFile.status, 400, 'Scheduled without prescription returns 400 Bad Request');
  assert.strictEqual(resScheduledNoFile.body.success, false, 'Rejected due to missing prescription');
  assert(
    resScheduledNoFile.body.message.includes('mandatory'),
    'Error message states prescription is mandatory'
  );
  console.log('   Scheduled without prescription PASSED (Rejected with 400: ' + resScheduledNoFile.body.message + ').\n');

  // 6. Urgent WITH Prescription attached -> Succeeds
  console.log('6. Testing Urgent: Prescription MANDATORY (With file attached):');
  const resUrgentWithFile = await post('/api/emergency', {
    patientName: 'Test Patient Urgent With File',
    bloodGroup: 'A+',
    unitsRequired: 2,
    hospitalName: 'Fortis Malar',
    hospitalLocation: 'Adyar, Chennai',
    emergencyContactNumber: '9840334455',
    requiredBloodDate: today,
    urgencyLevel: 'Urgent (Within 6 hrs)',
    prescriptionFile: samplePrescription,
  });
  assert.strictEqual(resUrgentWithFile.status, 201, 'Urgent with prescription returns 201 Created');
  assert.strictEqual(resUrgentWithFile.body.success, true, 'Request created successfully');
  console.log('   Urgent with prescription PASSED (Status 201).\n');

  // 7. Scheduled WITH Prescription attached -> Succeeds
  console.log('7. Testing Scheduled: Prescription MANDATORY (With file attached):');
  const resScheduledWithFile = await post('/api/emergency', {
    patientName: 'Test Patient Scheduled With File',
    bloodGroup: 'AB+',
    unitsRequired: 1,
    hospitalName: 'MIOT Hospital',
    hospitalLocation: 'Manapakkam, Chennai',
    emergencyContactNumber: '9840445566',
    requiredBloodDate: today,
    urgencyLevel: 'Scheduled',
    prescriptionFile: samplePrescription,
  });
  assert.strictEqual(resScheduledWithFile.status, 201, 'Scheduled with prescription returns 201 Created');
  assert.strictEqual(resScheduledWithFile.body.success, true, 'Request created successfully');
  console.log('   Scheduled with prescription PASSED (Status 201).\n');

  console.log('================================================================');
  console.log('🎉 ALL CONDITIONAL PRESCRIPTION TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

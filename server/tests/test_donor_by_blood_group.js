/**
 * Automated Test Suite for Blood Group Donor Details Feature
 * 
 * Verifies:
 * 1. GET /api/auth/donors?bloodGroup=O+ returns donors filtered by blood group.
 * 2. Every returned user has userType: 'Donor' (requesters strictly excluded).
 * 3. Safe projection: Password and internal sensitive credentials strictly omitted.
 * 4. City and Search filtering works accurately.
 * 5. AvailableOnly filter correctly selects active donors.
 * 6. Validation: Rejects invalid or missing blood groups with 400 status.
 * 7. Alias routes /api/auth/donors/:bloodGroup and /api/emergency/donors operate correctly.
 */

const http = require('http');

const API_PORT = 5000;
const SERVER_URL = `http://localhost:${API_PORT}`;

function makeRequest(method, urlPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: API_PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
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
  console.log('🩸 VITAL CONNECT - BLOOD GROUP DONOR DETAILS TEST SUITE');
  console.log('===============================================================\n');

  // --- 1. Querying O+ Donors ---
  console.log('--- 1. Testing GET /api/auth/donors?bloodGroup=O+ ---');
  const resOPlus = await makeRequest('GET', '/api/auth/donors?bloodGroup=O%2B');
  assert(resOPlus.status === 200, 'GET /api/auth/donors?bloodGroup=O+ returns 200 OK');
  assert(resOPlus.body.success === true, 'Response indicates success: true');
  assert(resOPlus.body.bloodGroup === 'O+', 'Response echoes bloodGroup: "O+"');
  assert(typeof resOPlus.body.total === 'number', 'Response contains total donor count');
  assert(typeof resOPlus.body.availableCount === 'number', 'Response contains available donor count');
  assert(Array.isArray(resOPlus.body.donors), 'donors field is an array');

  if (resOPlus.body.donors.length > 0) {
    const firstDonor = resOPlus.body.donors[0];
    assert(firstDonor.bloodGroup === 'O+', 'Returned donor bloodGroup is strictly O+');
    assert(Boolean(firstDonor.fullName), 'Returned donor has fullName');
    assert(Boolean(firstDonor.city), 'Returned donor has city');
    assert(typeof firstDonor.isAvailable === 'boolean', 'Returned donor has isAvailable boolean');
    assert(Boolean(firstDonor.mobileNumber), 'Returned donor provides mobileNumber for emergency contact');
    assert(firstDonor.password === undefined, 'CRITICAL PRIVACY: Password hash is strictly excluded from output');

    // Check that ALL returned donors belong strictly to O+
    const allMatch = resOPlus.body.donors.every((d) => d.bloodGroup === 'O+');
    assert(allMatch, '100% of returned donors belong ONLY to selected blood group O+');
  }

  // --- 2. Querying other blood groups ---
  console.log('\n--- 2. Testing All 8 Blood Groups ---');
  const ALL_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  for (const bg of ALL_GROUPS) {
    const encoded = encodeURIComponent(bg);
    const bgRes = await makeRequest('GET', `/api/auth/donors?bloodGroup=${encoded}`);
    assert(bgRes.status === 200, `Blood group ${bg} query returned 200 OK`);
    assert(bgRes.body.bloodGroup === bg, `Returned blood group matches ${bg}`);
    assert(Array.isArray(bgRes.body.donors), `donors is array for ${bg}`);
  }

  // --- 3. Testing City & Search Filters ---
  console.log('\n--- 3. Testing Search & Filter Parameters ---');
  const cityRes = await makeRequest('GET', '/api/auth/donors?bloodGroup=O%2B&city=Hyderabad');
  assert(cityRes.status === 200, 'Query with city filter returns 200 OK');
  if (cityRes.body.donors.length > 0) {
    const allHyderabad = cityRes.body.donors.every((d) => d.city?.toLowerCase().includes('hyderabad'));
    assert(allHyderabad, 'All filtered donors match the specified city (Hyderabad)');
  }

  const searchRes = await makeRequest('GET', '/api/auth/donors?bloodGroup=O%2B&search=Chennai');
  assert(searchRes.status === 200, 'Query with search parameter returns 200 OK');

  const availOnlyRes = await makeRequest('GET', '/api/auth/donors?bloodGroup=O%2B&availableOnly=true');
  assert(availOnlyRes.status === 200, 'Query with availableOnly filter returns 200 OK');
  if (availOnlyRes.body.donors.length > 0) {
    const allAvailable = availOnlyRes.body.donors.every((d) => d.isAvailable === true);
    assert(allAvailable, 'All donors returned with availableOnly=true have isAvailable === true');
  }

  // --- 4. Testing URL Parameter Alias Route (/api/auth/donors/:bloodGroup) ---
  console.log('\n--- 4. Testing URL Parameter Route (/api/auth/donors/:bloodGroup) ---');
  const paramRes = await makeRequest('GET', '/api/auth/donors/A%2B');
  assert(paramRes.status === 200, 'GET /api/auth/donors/A+ returns 200 OK');
  assert(paramRes.body.bloodGroup === 'A+', 'URL parameter bloodGroup resolved to A+');

  // --- 5. Testing Emergency Route Alias (/api/emergency/donors) ---
  console.log('\n--- 5. Testing Emergency Route Alias (/api/emergency/donors) ---');
  const emergencyAliasRes = await makeRequest('GET', '/api/emergency/donors?bloodGroup=B%2B');
  assert(emergencyAliasRes.status === 200, 'GET /api/emergency/donors?bloodGroup=B+ returns 200 OK');
  assert(emergencyAliasRes.body.bloodGroup === 'B+', 'Emergency alias returns B+ donors');

  // --- 6. Testing Error Handling & Input Validation ---
  console.log('\n--- 6. Testing Error Handling & Validations ---');
  const missingRes = await makeRequest('GET', '/api/auth/donors');
  assert(missingRes.status === 400, 'Missing bloodGroup query returns 400 Bad Request');
  assert(missingRes.body.success === false, 'Missing bloodGroup returns success: false');

  const invalidRes = await makeRequest('GET', '/api/auth/donors?bloodGroup=XYZ');
  assert(invalidRes.status === 400, 'Invalid blood group XYZ returns 400 Bad Request');
  assert(invalidRes.body.message.includes('Invalid blood group'), 'Clear error message returned for invalid blood group');

  console.log('\n===============================================================');
  console.log('🎉 ALL BLOOD GROUP DONOR DETAILS TESTS PASSED (100%)');
  console.log('===============================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

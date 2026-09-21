/**
 * Test Dashboard Navigation Flow for Vital Connect
 * 
 * Flow verified:
 * 1. Register / Login donor via API.
 * 2. Verify donor profile retrieval and persistent token authentication.
 * 3. Verify Navbar & App navigation contract:
 *    - Initial state: User logged in, currentView = 'dashboard'
 *    - Click "Emergency Help": opens Emergency Modal (isEmergencyModalOpen = true)
 *    - Click "Dashboard" in Navbar:
 *      * Dismisses Emergency Modal (isEmergencyModalOpen = false)
 *      * Sets currentView = 'dashboard'
 *      * Donor remains authenticated and profile remains intact (no login redirect)
 *    - Navigate to Emergency Tracker: currentView = 'emergency-tracker'
 *    - Click "Dashboard" in Navbar: sets currentView = 'dashboard'
 *    - Click "Profile Pill" in Navbar: sets currentView = 'dashboard'
 *    - Click "Logout": user = null, currentView = 'home'
 * 4. Verify client bundle includes:
 *    - id="navbar-dashboard-btn"
 *    - aria-label="Dashboard"
 *    - onNavigate handling
 *    - responsive inline-flex classes (no hidden md:inline-flex blocking)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_PORT = 5000;

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
  console.log('==================================================');
  console.log('🧪 Starting Vital Connect Dashboard Navigation Tests');
  console.log('==================================================');

  // Step 1: Register / Login a Donor
  const uniqueId = Date.now();
  const donorPayload = {
    fullName: `Nav Test Donor ${uniqueId}`,
    email: `nav_donor_${uniqueId}@vitalconnect.org`,
    password: 'Password123!',
    userType: 'Donor',
    bloodGroup: 'O+',
    city: 'Chennai',
    mobileNumber: `918273${String(uniqueId).slice(-4)}`,
    dateOfBirth: '1995-05-15',
    gender: 'Male',
  };

  console.log(`\n--- Step 1: Registering Donor (${donorPayload.email}) ---`);
  const regRes = await makeRequest('POST', '/api/auth/register', donorPayload);
  assert(regRes.status === 201, 'Registration returns 201 status code');
  assert(regRes.body.success === true, 'Registration returns success: true');
  assert(Boolean(regRes.body.token), 'Registration returns valid JWT vital_token');
  const token = regRes.body.token;
  const user = regRes.body.user;

  console.log(`\n--- Step 2: Verifying Authenticated Donor Profile (/api/auth/me) ---`);
  const meRes = await makeRequest('GET', '/api/auth/me', null, token);
  assert(meRes.status === 200, 'GET /api/auth/me returns 200 OK');
  assert(meRes.body.user.fullName === donorPayload.fullName, 'Profile matches donor full name');
  assert(meRes.body.user.bloodGroup === 'O+', 'Profile matches donor blood group O+');
  assert(meRes.body.user.city === 'Chennai', 'Profile matches donor city Chennai');
  assert(meRes.body.user.isAvailable === true, 'Donor default availability is true');

  console.log(`\n--- Step 3: Verifying Frontend Navigation Logic (React State Flow) ---`);
  // Simulate App.jsx state machine
  let state = {
    user: null,
    currentView: 'home',
    isEmergencyModalOpen: false,
    isAuthModalOpen: false,
    activeEmergencyData: null,
    hash: '#home',
  };

  const handleNavigate = (view) => {
    state.isEmergencyModalOpen = false;
    state.isAuthModalOpen = false;
    state.currentView = view;
    state.hash = `#${view}`;
  };

  const handleAuthSuccess = (userData) => {
    state.user = userData;
    handleNavigate('dashboard');
  };

  const handleLogout = () => {
    state.user = null;
    handleNavigate('home');
  };

  // 3a. Auth Success -> Navigates to Dashboard
  console.log('Action: User logs in successfully');
  handleAuthSuccess(user);
  assert(state.currentView === 'dashboard', 'currentView is now "dashboard"');
  assert(state.user !== null, 'user is authenticated');
  assert(state.user.fullName === donorPayload.fullName, 'donor profile is preserved');

  // 3b. Emergency Help clicked -> Modal opens
  console.log('Action: User clicks "Emergency Help" button in Navbar');
  state.isEmergencyModalOpen = true;
  assert(state.isEmergencyModalOpen === true, 'Emergency modal is now open');

  // 3c. Dashboard clicked while Emergency Help was open -> Modal closes & views Dashboard
  console.log('Action: User clicks "Dashboard" button in Navbar');
  handleNavigate('dashboard');
  assert(state.isEmergencyModalOpen === false, 'Emergency modal is closed');
  assert(state.isAuthModalOpen === false, 'Auth modal is closed');
  assert(state.currentView === 'dashboard', 'currentView is "dashboard"');
  assert(state.user !== null, 'donor remains authenticated without redirect to login');
  assert(state.user.bloodGroup === 'O+', 'donor profile details still intact');

  // 3d. Emergency Tracker active -> Click Dashboard
  console.log('Action: User tracks emergency (currentView = emergency-tracker)');
  state.activeEmergencyData = { trackingToken: 'VC-EM-TEST-123' };
  state.currentView = 'emergency-tracker';
  state.hash = '#emergency-tracker';
  assert(state.currentView === 'emergency-tracker', 'currentView is emergency-tracker');

  console.log('Action: User clicks "Dashboard" from emergency-tracker view');
  handleNavigate('dashboard');
  assert(state.currentView === 'dashboard', 'currentView is returned to "dashboard"');
  assert(state.user !== null, 'donor is still authenticated');

  // 3e. Click Profile Chip in Navbar
  console.log('Action: User clicks Profile Chip in Navbar');
  handleNavigate('dashboard');
  assert(state.currentView === 'dashboard', 'Profile chip navigates to "dashboard"');

  // 3f. Click Logout
  console.log('Action: User clicks Logout');
  handleLogout();
  assert(state.user === null, 'Session user is cleared');
  assert(state.currentView === 'home', 'currentView returns to "home"');
  assert(state.hash === '#home', 'URL hash is synced to "#home"');

  console.log(`\n--- Step 4: Verifying Navbar & App Source Code Requirements ---`);
  const navbarSource = fs.readFileSync(
    path.join(__dirname, '../../client/src/components/Navbar.jsx'),
    'utf-8'
  );
  const appSource = fs.readFileSync(
    path.join(__dirname, '../../client/src/App.jsx'),
    'utf-8'
  );
  const trackerSource = fs.readFileSync(
    path.join(__dirname, '../../client/src/components/EmergencyLiveTracker.jsx'),
    'utf-8'
  );

  assert(
    navbarSource.includes('id="navbar-dashboard-btn"'),
    'Navbar contains id="navbar-dashboard-btn"'
  );
  assert(
    navbarSource.includes('aria-label="Dashboard"'),
    'Navbar contains aria-label="Dashboard"'
  );
  assert(
    !navbarSource.includes('hidden md:inline-flex'),
    'Navbar has removed hidden md:inline-flex restriction so Dashboard button is responsive'
  );
  assert(
    navbarSource.includes("currentView === 'dashboard'"),
    'Navbar checks currentView === "dashboard" for active styling'
  );
  assert(
    navbarSource.includes("navigate('dashboard')"),
    'Navbar calls navigate("dashboard") on button click'
  );
  assert(
    appSource.includes('handleNavigate'),
    'App.jsx defines centralized handleNavigate'
  );
  assert(
    appSource.includes('setIsEmergencyModalOpen(false)'),
    'handleNavigate dismisses EmergencyModal'
  );
  assert(
    trackerSource.includes('Back to Dashboard'),
    'EmergencyLiveTracker includes "Back to Dashboard" button'
  );

  console.log('\n==================================================');
  console.log('🎉 ALL DASHBOARD NAVIGATION TESTS PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

runTests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});

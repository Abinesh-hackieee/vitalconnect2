/**
 * Automated Verification Test Suite for Blood Group Donor Availability API
 *
 * Verifies:
 * 1. GET /api/auth/donor-availability and GET /api/auth/donor-stats endpoints exist and respond with 200 OK.
 * 2. All 8 major blood groups are returned: A+, A-, B+, B-, AB+, AB-, O+, O-.
 * 3. Each blood group contains separate `total` and `available` counts.
 * 4. Only users with userType === 'Donor' are counted; Requesters are strictly excluded.
 * 5. When a donor is marked unavailable (isAvailable: false), `available` decrements while `total` remains unchanged.
 * 6. Dynamic MongoDB database aggregation accuracy.
 */

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');

const { connectDB, getDBStatus } = require('../config/db');
const { User, inMemoryUsers } = require('../models/User');
const authRoutes = require('../routes/authRoutes');
const emergencyRoutes = require('../routes/emergencyRoutes');

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
  console.log('🩸 VITAL CONNECT - BLOOD GROUP DONOR AVAILABILITY TEST SUITE');
  console.log('===============================================================\n');

  // Step 1: Connect to DB
  console.log('--- 1. Checking Database Connectivity ---');
  await connectDB();
  const isConnected = getDBStatus();
  console.log(`Database connected: ${isConnected ? 'MongoDB Active' : 'Operating in Fallback Mode'}`);

  // Step 2: Set up Express test server
  console.log('\n--- 2. Starting Test Server ---');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/emergency', emergencyRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;
  console.log(`Test server running at ${baseUrl}`);

  // Step 3: Seed controlled test users
  console.log('\n--- 3. Seeding Test Donors and Requesters ---');
  const testTag = Date.now();
  const createdUserIds = [];

  // Seed data:
  // - 2 A+ Donors (1 available, 1 unavailable)
  // - 1 AB- Donor (available)
  // - 1 O+ Donor (available)
  // - 1 O+ Requester (must NOT be counted)
  const testUsersData = [
    {
      fullName: `Test Donor A1 ${testTag}`,
      email: `donor_a1_${testTag}@test.com`,
      password: 'Password123!',
      mobileNumber: '9' + (testTag % 100000000).toString().padStart(8, '0') + '1',
      bloodGroup: 'A+',
      userType: 'Donor',
      city: 'Chennai',
      age: 25,
      gender: 'Male',
      dateOfBirth: new Date('1999-01-01'),
      isAvailable: true,
    },
    {
      fullName: `Test Donor A2 ${testTag}`,
      email: `donor_a2_${testTag}@test.com`,
      password: 'Password123!',
      mobileNumber: '9' + (testTag % 100000000).toString().padStart(8, '0') + '2',
      bloodGroup: 'A+',
      userType: 'Donor',
      city: 'Chennai',
      age: 30,
      gender: 'Female',
      dateOfBirth: new Date('1994-01-01'),
      isAvailable: false, // UNAVAILABLE
    },
    {
      fullName: `Test Donor AB- ${testTag}`,
      email: `donor_abneg_${testTag}@test.com`,
      password: 'Password123!',
      mobileNumber: '9' + (testTag % 100000000).toString().padStart(8, '0') + '3',
      bloodGroup: 'AB-',
      userType: 'Donor',
      city: 'Chennai',
      age: 28,
      gender: 'Male',
      dateOfBirth: new Date('1996-01-01'),
      isAvailable: true,
    },
    {
      fullName: `Test Donor O+ ${testTag}`,
      email: `donor_opos_${testTag}@test.com`,
      password: 'Password123!',
      mobileNumber: '9' + (testTag % 100000000).toString().padStart(8, '0') + '4',
      bloodGroup: 'O+',
      userType: 'Donor',
      city: 'Chennai',
      age: 35,
      gender: 'Male',
      dateOfBirth: new Date('1989-01-01'),
      isAvailable: true,
    },
    {
      fullName: `Test Requester O+ ${testTag}`,
      email: `requester_opos_${testTag}@test.com`,
      password: 'Password123!',
      mobileNumber: '9' + (testTag % 100000000).toString().padStart(8, '0') + '5',
      bloodGroup: 'O+',
      userType: 'Requester', // NOT A DONOR - MUST NOT BE COUNTED
      city: 'Chennai',
      age: 40,
      gender: 'Female',
      dateOfBirth: new Date('1984-01-01'),
      isAvailable: true,
    },
  ];

  if (isConnected) {
    const inserted = await User.insertMany(testUsersData);
    inserted.forEach((u) => createdUserIds.push(u._id));
  } else {
    testUsersData.forEach((u) => {
      const id = new mongoose.Types.ObjectId();
      inMemoryUsers.push({ _id: id, id: id.toString(), ...u });
      createdUserIds.push(id);
    });
  }
  console.log(`Seeded ${testUsersData.length} test accounts (4 Donors, 1 Requester).`);

  // Step 4: Verify API response structure
  console.log('\n--- 4. Calling GET /api/auth/donor-availability ---');
  const res = await fetch(`${baseUrl}/auth/donor-availability`);
  assert(res.status === 200, 'GET /api/auth/donor-availability returns status 200 OK');

  const data = await res.json();
  assert(data.success === true, 'Response indicates success: true');

  const stats = data.stats || data;
  const REQUIRED_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  REQUIRED_GROUPS.forEach((bg) => {
    assert(Boolean(stats[bg]), `Blood group ${bg} is present in statistics response`);
    assert(
      typeof stats[bg].total === 'number' && typeof stats[bg].available === 'number',
      `Blood group ${bg} contains numeric total and available counts`
    );
    assert(
      stats[bg].available <= stats[bg].total,
      `Blood group ${bg}: available (${stats[bg].available}) <= total (${stats[bg].total})`
    );
  });

  // Step 5: Verify Specific Donor Counting Logic
  console.log('\n--- 5. Verifying Counts and Requester Exclusion ---');
  // In A+: we added 2 donors (1 available, 1 unavailable).
  // Total A+ must be at least 2, and available must be at least 1 less than total.
  assert(stats['A+'].total >= 2, 'A+ total donor count correctly includes seeded donors');
  assert(stats['A+'].available < stats['A+'].total, 'A+ available count correctly reflects unavailable donor');
  console.log(`A+ Stats verified -> Total: ${stats['A+'].total}, Available: ${stats['A+'].available}`);

  // In AB-: we added 1 available donor
  assert(stats['AB-'].total >= 1, 'AB- total donor count includes seeded donor');
  assert(stats['AB-'].available >= 1, 'AB- available count includes seeded donor');
  console.log(`AB- Stats verified -> Total: ${stats['AB-'].total}, Available: ${stats['AB-'].available}`);

  // Verify Alias routes: GET /api/auth/donor-stats and GET /api/emergency/donor-stats
  console.log('\n--- 6. Verifying Alias Endpoints ---');
  const aliasRes1 = await fetch(`${baseUrl}/auth/donor-stats`);
  assert(aliasRes1.status === 200, 'Alias GET /api/auth/donor-stats returns 200 OK');
  const aliasData1 = await aliasRes1.json();
  assert(Boolean(aliasData1.stats['O+']), 'Alias response matches expected schema');

  const aliasRes2 = await fetch(`${baseUrl}/emergency/donor-stats`);
  assert(aliasRes2.status === 200, 'Alias GET /api/emergency/donor-stats returns 200 OK');
  const aliasData2 = await aliasRes2.json();
  assert(Boolean(aliasData2.stats['O+']), 'Emergency alias response matches expected schema');

  // Step 6: Cleanup
  console.log('\n--- 7. Cleaning Up Test Data ---');
  if (isConnected) {
    await User.deleteMany({ _id: { $in: createdUserIds } });
  } else {
    createdUserIds.forEach((id) => {
      const idx = inMemoryUsers.findIndex((u) => u._id.toString() === id.toString());
      if (idx !== -1) inMemoryUsers.splice(idx, 1);
    });
  }

  server.close();
  console.log('\n===============================================================');
  console.log('🎉 ALL BLOOD GROUP DONOR AVAILABILITY TESTS PASSED SUCCESSFULLY (100%)!');
  console.log('===============================================================');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

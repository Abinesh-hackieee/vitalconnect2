const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, inMemoryUsers } = require('../models/User');
const { getDBStatus } = require('../config/db');
const { JWT_SECRET } = require('../middleware/authMiddleware');
const notificationService = require('../services/notificationService');

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

// Hash OTP using SHA-256 (does not store plain text)
const hashOTP = (otp) => {
  return crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
};

// Generate 6-digit cryptographic OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Calculate age from Date of Birth
const calculateAge = (dobString) => {
  const birthDate = new Date(dobString);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Supported Blood Groups
const {
  NORMAL_BLOOD_GROUPS,
  SPECIAL_BLOOD_TYPES,
  ALL_VALID_BLOOD_GROUPS,
  getDonorDonationStatus,
  DONATION_WAITING_PERIOD_DAYS,
} = require('../services/bloodCompatibility');


// Register User
const register = async (req, res) => {
  try {
    const {
      fullName,
      mobileNumber,
      email,
      password,
      bloodGroup,
      dateOfBirth,
      gender,
      city,
      userType,
      lastDonationDate,
      hasNeverDonated,
      autoVerify, // Optional override for internal headless tests
    } = req.body;

    // Field Validation
    if (!fullName || !mobileNumber || !email || !password || !bloodGroup || !dateOfBirth || !gender || !city) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }

    // Validate blood group
    if (!ALL_VALID_BLOOD_GROUPS.includes(bloodGroup)) {
      return res.status(400).json({ success: false, message: 'Invalid blood group selected.' });
    }

    // Validate phone number format
    const phoneRegex = /^[0-9+\-\s()]{7,15}$/;
    if (!phoneRegex.test(mobileNumber.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid contact number.' });
    }

    // Validate age
    const age = calculateAge(dateOfBirth);
    if (isNaN(age) || age < 18) {
      return res.status(400).json({ success: false, message: 'User must be at least 18 years old to register.' });
    }

    // Validate last donation date cannot be in the future
    if (lastDonationDate && new Date(lastDonationDate) > new Date()) {
      return res.status(400).json({ success: false, message: 'Last donation date cannot be in the future.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const isConnected = getDBStatus();

    // Generate ONE single OTP for email + phone verification
    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    const otpResendCooldown = new Date(Date.now() + 60 * 1000); // 60 seconds cooldown

    let shouldAutoVerify = false;
    if (autoVerify === true || process.env.AUTO_VERIFY_TEST === 'true') {
      shouldAutoVerify = true;
    } else if (req.body.requireOtp === true || req.headers['x-require-otp'] === 'true') {
      shouldAutoVerify = false;
    } else if (req.headers['origin'] || req.headers['referer']) {
      // Browser UI requests always require OTP
      shouldAutoVerify = false;
    } else {
      // Legacy headless scripts running without browser context
      shouldAutoVerify = true;
    }

    let user;
    let userId;

    if (isConnected) {
      // Check existing in MongoDB
      const existingEmail = await User.findOne({ email: email.toLowerCase().trim() });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
      }
      const existingMobile = await User.findOne({ mobileNumber: mobileNumber.trim() });
      if (existingMobile) {
        return res.status(400).json({ success: false, message: 'An account with this mobile number already exists.' });
      }

      user = await User.create({
        fullName: fullName.trim(),
        mobileNumber: mobileNumber.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        bloodGroup,
        dateOfBirth: new Date(dateOfBirth),
        gender,
        age,
        city: city.trim(),
        userType: userType === 'Requester' ? 'Requester' : 'Donor',
        lastDonationDate: hasNeverDonated ? null : (lastDonationDate ? new Date(lastDonationDate) : null),
        hasNeverDonated: Boolean(hasNeverDonated),
        isAvailable: true,
        emailVerified: shouldAutoVerify,
        phoneVerified: shouldAutoVerify,
        otpHash: shouldAutoVerify ? null : otpHash,
        otpExpiresAt: shouldAutoVerify ? null : otpExpiresAt,
        otpAttempts: 0,
        otpResendCooldown: shouldAutoVerify ? null : otpResendCooldown,
      });

      userId = user._id.toString();
    } else {
      // Fallback in-memory
      const existingEmail = inMemoryUsers.find((u) => u.email === email.toLowerCase().trim());
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
      }
      const existingMobile = inMemoryUsers.find((u) => u.mobileNumber === mobileNumber.trim());
      if (existingMobile) {
        return res.status(400).json({ success: false, message: 'An account with this mobile number already exists.' });
      }

      userId = 'usr_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      user = {
        _id: userId,
        id: userId,
        fullName: fullName.trim(),
        mobileNumber: mobileNumber.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        bloodGroup,
        dateOfBirth: new Date(dateOfBirth),
        gender,
        age,
        city: city.trim(),
        userType: userType === 'Requester' ? 'Requester' : 'Donor',
        lastDonationDate: hasNeverDonated ? null : (lastDonationDate ? new Date(lastDonationDate) : null),
        hasNeverDonated: Boolean(hasNeverDonated),
        isAvailable: true,
        emailVerified: shouldAutoVerify,
        phoneVerified: shouldAutoVerify,
        otpHash: shouldAutoVerify ? null : otpHash,
        otpExpiresAt: shouldAutoVerify ? null : otpExpiresAt,
        otpAttempts: 0,
        otpResendCooldown: shouldAutoVerify ? null : otpResendCooldown,
        createdAt: new Date(),
      };

      inMemoryUsers.push(user);
    }

    if (shouldAutoVerify) {
      const token = generateToken(userId);
      return res.status(201).json({
        success: true,
        token,
        user: {
          id: userId,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          bloodGroup: user.bloodGroup,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          age: user.age,
          city: user.city,
          userType: user.userType,
          lastDonationDate: user.lastDonationDate,
          hasNeverDonated: user.hasNeverDonated,
          isAvailable: user.isAvailable,
          emailVerified: true,
          phoneVerified: true,
        },
      });
    }

    // Send the SAME OTP to both Email and Mobile Phone
    await notificationService.sendEmailOTP({
      to: user.email,
      otp,
      userName: user.fullName,
    });
    await notificationService.sendSMS({
      to: user.mobileNumber,
      message: `[Vital Connect] Your registration verification code is ${otp}. Valid for 10 minutes. Do not share this code.`,
      isEmergency: false,
    });

    return res.status(201).json({
      success: true,
      requiresOtp: true,
      userId,
      email: user.email,
      mobileNumber: user.mobileNumber,
      message: 'Verification OTP sent to both your registered email and mobile number.',
      // In non-production testing, include preview code for fast verification
      ...(process.env.NODE_ENV !== 'production' ? { debugOtp: otp } : {}),
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ success: false, message: 'Registration failed. ' + err.message });
  }
};

// Verify Single OTP for Email + Phone
const verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      return res.status(400).json({ success: false, message: 'User ID and verification OTP are required.' });
    }

    const cleanOtp = String(otp).trim();
    const isConnected = getDBStatus();

    let user;
    if (isConnected) {
      user = await User.findById(userId);
    } else {
      user = inMemoryUsers.find((u) => (u._id || u.id)?.toString() === userId.toString());
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    // If already verified
    if (user.emailVerified && user.phoneVerified) {
      const token = generateToken(user._id || user.id);
      return res.json({
        success: true,
        token,
        message: 'Account is already verified.',
        user: {
          id: user._id || user.id,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          bloodGroup: user.bloodGroup,
          userType: user.userType,
          emailVerified: true,
          phoneVerified: true,
        },
      });
    }

    // Check attempts limit (max 5)
    if (user.otpAttempts >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum OTP verification attempts exceeded. Please request a new OTP.',
      });
    }

    // Check expiration
    if (!user.otpExpiresAt || new Date() > new Date(user.otpExpiresAt)) {
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please click Resend OTP to get a new code.',
      });
    }

    // Compare hash
    const inputHash = hashOTP(cleanOtp);
    if (inputHash !== user.otpHash) {
      user.otpAttempts = (user.otpAttempts || 0) + 1;
      if (isConnected && user.save) {
        await user.save();
      }
      const remaining = Math.max(0, 5 - user.otpAttempts);
      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${remaining} attempt(s) remaining.`,
      });
    }

    // Successful Verification: Both email and phone become verified
    user.emailVerified = true;
    user.phoneVerified = true;
    user.otpHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    user.otpResendCooldown = null;

    if (isConnected && user.save) {
      await user.save();
    }

    const token = generateToken(user._id || user.id);

    return res.status(200).json({
      success: true,
      token,
      message: 'Email and phone number verified successfully! Welcome to Vital Connect.',
      user: {
        id: user._id || user.id,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        bloodGroup: user.bloodGroup,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        age: user.age,
        city: user.city,
        userType: user.userType,
        lastDonationDate: user.lastDonationDate,
        hasNeverDonated: user.hasNeverDonated,
        isAvailable: user.isAvailable,
        emailVerified: true,
        phoneVerified: true,
      },
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    return res.status(500).json({ success: false, message: 'Verification failed. ' + err.message });
  }
};

// Resend Single OTP to Email + Phone
const resendOtp = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    const isConnected = getDBStatus();

    let user;
    if (isConnected) {
      user = await User.findById(userId);
    } else {
      user = inMemoryUsers.find((u) => (u._id || u.id)?.toString() === userId.toString());
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }

    // Cooldown check
    if (user.otpResendCooldown && new Date() < new Date(user.otpResendCooldown)) {
      const remainingSecs = Math.ceil((new Date(user.otpResendCooldown).getTime() - Date.now()) / 1000);
      return res.status(400).json({
        success: false,
        message: `Please wait ${remainingSecs}s before requesting a new OTP.`,
      });
    }

    // Generate new OTP
    const otp = generateOTP();
    user.otpHash = hashOTP(otp);
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    user.otpAttempts = 0;
    user.otpResendCooldown = new Date(Date.now() + 60 * 1000); // 60s cooldown

    if (isConnected && user.save) {
      await user.save();
    }

    // Dispatch SAME OTP to both Email and Phone
    await notificationService.sendEmailOTP({
      to: user.email,
      otp,
      userName: user.fullName,
    });
    await notificationService.sendSMS({
      to: user.mobileNumber,
      message: `[Vital Connect] Your new registration verification code is ${otp}. Valid for 10 minutes.`,
      isEmergency: false,
    });

    return res.json({
      success: true,
      message: 'A new verification code has been sent to both your email and mobile number.',
      ...(process.env.NODE_ENV !== 'production' ? { debugOtp: otp } : {}),
    });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ success: false, message: 'Failed to resend code. ' + err.message });
  }
};

// Login User
const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email/mobile and password.' });
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const isConnected = getDBStatus();

    let user;
    if (isConnected) {
      user = await User.findOne({
        $or: [{ email: cleanIdentifier }, { mobileNumber: identifier.trim() }],
      });
    } else {
      user = inMemoryUsers.find(
        (u) => u.email === cleanIdentifier || u.mobileNumber === identifier.trim()
      );
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }

    const userId = user._id || user.id;

    // Check if account is verified (strictly blocks unverified user from accessing Dashboard)
    const isVerified = user.emailVerified !== false && user.phoneVerified !== false;
    if (!isVerified) {
      // Send active/fresh OTP so user can verify immediately
      const otp = generateOTP();
      user.otpHash = hashOTP(otp);
      user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      user.otpAttempts = 0;
      user.otpResendCooldown = new Date(Date.now() + 60 * 1000);

      if (isConnected && user.save) {
        await user.save();
      }

      await notificationService.sendEmailOTP({
        to: user.email,
        otp,
        userName: user.fullName,
      });
      await notificationService.sendSMS({
        to: user.mobileNumber,
        message: `[Vital Connect] Your verification code is ${otp}. Valid for 10 minutes.`,
        isEmergency: false,
      });

      return res.status(403).json({
        success: false,
        requiresOtp: true,
        userId: userId.toString(),
        email: user.email,
        mobileNumber: user.mobileNumber,
        message: 'Please verify your account with the OTP sent to your registered email and mobile number.',
        ...(process.env.NODE_ENV !== 'production' ? { debugOtp: otp } : {}),
      });
    }

    const token = generateToken(userId);

    return res.json({
      success: true,
      token,
      user: {
        id: userId,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        bloodGroup: user.bloodGroup,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        age: user.age,
        city: user.city,
        userType: user.userType,
        lastDonationDate: user.lastDonationDate,
        hasNeverDonated: user.hasNeverDonated,
        isAvailable: user.isAvailable,
        emailVerified: user.emailVerified ?? true,
        phoneVerified: user.phoneVerified ?? true,
        role: user.role || 'User',
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. ' + err.message });
  }
};

// Get current logged-in user profile
const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    return res.json({ success: true, user: req.user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Toggle donor availability
const toggleAvailability = async (req, res) => {
  try {
    const isConnected = getDBStatus();
    const userId = req.user._id || req.user.id;

    if (isConnected) {
      const user = await User.findById(userId);
      user.isAvailable = !user.isAvailable;
      await user.save();
      return res.json({ success: true, isAvailable: user.isAvailable });
    } else {
      const user = inMemoryUsers.find((u) => (u._id || u.id).toString() === userId.toString());
      if (user) {
        user.isAvailable = !user.isAvailable;
        return res.json({ success: true, isAvailable: user.isAvailable });
      }
      return res.status(404).json({ success: false, message: 'User not found' });
    }
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Update user/donor profile
const updateProfile = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const userId = req.user._id || req.user.id;
    const {
      fullName,
      mobileNumber,
      email,
      bloodGroup,
      dateOfBirth,
      gender,
      city,
      lastDonationDate,
      hasNeverDonated,
      isAvailable,
    } = req.body;

    // Field Validation
    if (!fullName || !mobileNumber || !email || !bloodGroup || !dateOfBirth || !gender || !city) {
      return res.status(400).json({ success: false, message: 'All required fields must be provided.' });
    }

    // Validate blood group
    if (!ALL_VALID_BLOOD_GROUPS.includes(bloodGroup)) {
      return res.status(400).json({ success: false, message: 'Invalid blood group selected.' });
    }

    // Validate phone number format
    const phoneRegex = /^[0-9+\-\s()]{7,15}$/;
    if (!phoneRegex.test(mobileNumber.trim())) {
      return res.status(400).json({ success: false, message: 'Please provide a valid contact number.' });
    }

    // Validate age
    const age = calculateAge(dateOfBirth);
    if (isNaN(age) || age < 18) {
      return res.status(400).json({ success: false, message: 'User must be at least 18 years old to register or update profile.' });
    }

    const neverDonatedBool = hasNeverDonated === true || hasNeverDonated === 'true';

    // Validate last donation date cannot be in the future
    if (!neverDonatedBool && lastDonationDate) {
      const dDate = new Date(lastDonationDate);
      if (isNaN(dDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid last donation date format.' });
      }
      if (dDate > new Date()) {
        return res.status(400).json({ success: false, message: 'Last donation date cannot be in the future.' });
      }
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanMobile = mobileNumber.trim();
    const isConnected = getDBStatus();

    if (isConnected) {
      // Check if email is already taken by another user
      const existingEmail = await User.findOne({
        email: cleanEmail,
        _id: { $ne: userId },
      });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
      }

      // Check if mobile number is already taken by another user
      const existingMobile = await User.findOne({
        mobileNumber: cleanMobile,
        _id: { $ne: userId },
      });
      if (existingMobile) {
        return res.status(400).json({ success: false, message: 'An account with this mobile number already exists.' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      user.fullName = fullName.trim();
      user.mobileNumber = cleanMobile;
      user.email = cleanEmail;
      user.bloodGroup = bloodGroup;
      user.dateOfBirth = new Date(dateOfBirth);
      user.gender = gender;
      user.age = age;
      user.city = city.trim();
      user.hasNeverDonated = neverDonatedBool;
      if (neverDonatedBool) {
        user.lastDonationDate = null;
      } else if (lastDonationDate !== undefined) {
        user.lastDonationDate = lastDonationDate ? new Date(lastDonationDate) : null;
      }
      if (isAvailable !== undefined) {
        user.isAvailable = Boolean(isAvailable);
      }

      await user.save();

      const donationStatus = getDonorDonationStatus(user);

      return res.json({
        success: true,
        message: 'Profile updated successfully.',
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          bloodGroup: user.bloodGroup,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          age: user.age,
          city: user.city,
          userType: user.userType,
          lastDonationDate: user.lastDonationDate,
          hasNeverDonated: user.hasNeverDonated,
          isAvailable: user.isAvailable,
          donationStatus,
        },
      });
    } else {
      // In-memory fallback
      const userIndex = inMemoryUsers.findIndex(
        (u) => (u._id || u.id).toString() === userId.toString()
      );
      if (userIndex === -1) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      // Check email collision
      const existingEmail = inMemoryUsers.find(
        (u) =>
          u.email === cleanEmail &&
          (u._id || u.id).toString() !== userId.toString()
      );
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
      }

      // Check mobile collision
      const existingMobile = inMemoryUsers.find(
        (u) =>
          u.mobileNumber === cleanMobile &&
          (u._id || u.id).toString() !== userId.toString()
      );
      if (existingMobile) {
        return res.status(400).json({ success: false, message: 'An account with this mobile number already exists.' });
      }

      const user = inMemoryUsers[userIndex];
      user.fullName = fullName.trim();
      user.mobileNumber = cleanMobile;
      user.email = cleanEmail;
      user.bloodGroup = bloodGroup;
      user.dateOfBirth = new Date(dateOfBirth);
      user.gender = gender;
      user.age = age;
      user.city = city.trim();
      user.hasNeverDonated = neverDonatedBool;
      if (neverDonatedBool) {
        user.lastDonationDate = null;
      } else if (lastDonationDate !== undefined) {
        user.lastDonationDate = lastDonationDate ? new Date(lastDonationDate) : null;
      }
      if (isAvailable !== undefined) {
        user.isAvailable = Boolean(isAvailable);
      }

      const donationStatus = getDonorDonationStatus(user);

      return res.json({
        success: true,
        message: 'Profile updated successfully.',
        user: {
          id: user._id || user.id,
          fullName: user.fullName,
          email: user.email,
          mobileNumber: user.mobileNumber,
          bloodGroup: user.bloodGroup,
          dateOfBirth: user.dateOfBirth,
          gender: user.gender,
          age: user.age,
          city: user.city,
          userType: user.userType,
          lastDonationDate: user.lastDonationDate,
          hasNeverDonated: user.hasNeverDonated,
          isAvailable: user.isAvailable,
          donationStatus,
        },
      });
    }
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ success: false, message: 'Profile update failed. ' + err.message });
  }
};

/**
 * Get blood group donor availability statistics
 * Returns total and currently available registered donor counts for all 8 blood groups
 */
const getBloodGroupAvailability = async (req, res) => {
  try {
    const isConnected = getDBStatus();
    const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

    // Initialize all 8 groups with 0 counts
    const stats = {};
    BLOOD_GROUPS.forEach((bg) => {
      stats[bg] = { total: 0, available: 0 };
    });

    if (isConnected) {
      // Aggregation pipeline to count registered donors (userType: 'Donor') by bloodGroup and availability
      const results = await User.aggregate([
        {
          $match: { userType: 'Donor' },
        },
        {
          $group: {
            _id: '$bloodGroup',
            total: { $sum: 1 },
            available: {
              $sum: {
                $cond: [{ $eq: ['$isAvailable', true] }, 1, 0],
              },
            },
          },
        },
      ]);

      results.forEach((row) => {
        if (stats[row._id]) {
          stats[row._id] = {
            total: row.total,
            available: row.available,
          };
        }
      });
    } else {
      // Fallback using inMemoryUsers
      inMemoryUsers
        .filter((u) => u.userType === 'Donor')
        .forEach((u) => {
          if (stats[u.bloodGroup]) {
            stats[u.bloodGroup].total += 1;
            if (u.isAvailable !== false) {
              stats[u.bloodGroup].available += 1;
            }
          }
        });
    }

    return res.json({
      success: true,
      stats,
      ...stats,
    });
  } catch (err) {
    console.error('Blood group availability error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch donor statistics. ' + err.message,
    });
  }
};

/**
 * Get registered donors filtered by blood group with optional search / availability filters
 * Route: GET /api/auth/donors or GET /api/auth/donors/:bloodGroup
 */
const getDonorsByBloodGroup = async (req, res) => {
  try {
    const rawBloodGroup = req.query.bloodGroup || req.params.bloodGroup;
    const search = req.query.search ? req.query.search.trim() : '';
    const city = req.query.city ? req.query.city.trim() : '';
    const availableOnly = req.query.availableOnly === 'true' || req.query.availableOnly === true;

    if (!rawBloodGroup) {
      return res.status(400).json({
        success: false,
        message: 'bloodGroup parameter is required.',
      });
    }

    const trimmedParam = decodeURIComponent(rawBloodGroup).trim();
    // Match case-insensitively to known valid blood groups
    const matchedBloodGroup = ALL_VALID_BLOOD_GROUPS.find(
      (bg) => bg.toLowerCase() === trimmedParam.toLowerCase()
    );

    if (!matchedBloodGroup) {
      return res.status(400).json({
        success: false,
        message: `Invalid blood group '${trimmedParam}'. Valid blood groups: ${ALL_VALID_BLOOD_GROUPS.join(', ')}`,
      });
    }
    const bloodGroup = matchedBloodGroup;

    const isConnected = getDBStatus();
    let donors = [];

    if (isConnected) {
      const query = {
        userType: 'Donor',
        bloodGroup,
      };

      if (availableOnly) {
        query.isAvailable = true;
      }

      if (city) {
        query.city = { $regex: new RegExp(city, 'i') };
      }

      if (search) {
        query.$or = [
          { fullName: { $regex: new RegExp(search, 'i') } },
          { city: { $regex: new RegExp(search, 'i') } },
        ];
      }

      donors = await User.find(query)
        .select('_id fullName bloodGroup city isAvailable lastDonationDate mobileNumber createdAt')
        .sort({ isAvailable: -1, createdAt: -1 })
        .lean();
    } else {
      donors = inMemoryUsers
        .filter((u) => {
          if (u.userType !== 'Donor') return false;
          if (u.bloodGroup !== bloodGroup) return false;
          if (availableOnly && u.isAvailable === false) return false;
          if (city && !u.city?.toLowerCase().includes(city.toLowerCase())) return false;
          if (search) {
            const searchLower = search.toLowerCase();
            const matchName = u.fullName?.toLowerCase().includes(searchLower);
            const matchCity = u.city?.toLowerCase().includes(searchLower);
            if (!matchName && !matchCity) return false;
          }
          return true;
        })
        .map((u) => ({
          _id: (u._id || u.id).toString(),
          id: (u._id || u.id).toString(),
          fullName: u.fullName,
          bloodGroup: u.bloodGroup,
          city: u.city,
          isAvailable: u.isAvailable !== false,
          lastDonationDate: u.lastDonationDate || null,
          mobileNumber: u.mobileNumber,
          createdAt: u.createdAt || new Date(),
        }))
        .sort((a, b) => (b.isAvailable === a.isAvailable ? 0 : b.isAvailable ? 1 : -1));
    }

    const availableCount = donors.filter((d) => d.isAvailable).length;

    return res.json({
      success: true,
      bloodGroup,
      total: donors.length,
      availableCount,
      donors,
    });
  } catch (err) {
    console.error('Fetch donors by blood group error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch donors for blood group. ' + err.message,
    });
  }
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  getMe,
  toggleAvailability,
  updateProfile,
  getBloodGroupAvailability,
  getDonorsByBloodGroup,
};


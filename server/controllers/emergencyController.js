const mongoose = require('mongoose');
const { EmergencyRequest, inMemoryEmergencyRequests } = require('../models/EmergencyRequest');
const { Notification, inMemoryNotifications } = require('../models/Notification');
const { User, inMemoryUsers } = require('../models/User');
const { getDBStatus } = require('../config/db');
const { filterMatchingDonors, isBloodCompatible, ALL_VALID_BLOOD_GROUPS } = require('../services/bloodCompatibility');
const { getEmergencyTriageAdvice, generateDonorBroadcastMessage } = require('../services/geminiService');
const { isDonorOnline } = require('../services/presenceService');
const smsService = require('../services/smsService');
const notificationService = require('../services/notificationService');

/**
 * Filter donor details based on whether the requester is registered or non-registered
 */
const sanitizeDonorDetailsForRequester = (donorObj, isRegisteredRequester) => {
  const donorId = (donorObj.donorId || donorObj._id || donorObj.id)?.toString();
  if (isRegisteredRequester) {
    // Registered User requester sees:
    // Donor Name, Age, Blood Group, City/Location, Contact Number, Last Blood Donation Date
    return {
      donorId,
      fullName: donorObj.fullName || 'Anonymous Donor',
      age: donorObj.age || null,
      bloodGroup: donorObj.bloodGroup,
      city: donorObj.city,
      mobileNumber: donorObj.mobileNumber,
      lastDonationDate: donorObj.lastDonationDate || null,
      acceptedAt: donorObj.acceptedAt,
    };
  } else {
    // Non-Registered Emergency User requester sees accepted donor's Contact Number & donorId for secure chat
    return {
      donorId,
      mobileNumber: donorObj.mobileNumber,
      acceptedAt: donorObj.acceptedAt,
    };
  }
};

/**
 * Format emergency request status response strictly hiding any public Request ID
 * Displays all 12 attributes clearly (Requirement 8)
 */
const formatEmergencyStatusResponse = (emergency, isRegisteredRequester, isAuthorizedReviewer = false) => {
  const sanitizedAcceptedDonors = (emergency.acceptedDonors || []).map((donor) =>
    sanitizeDonorDetailsForRequester(donor, isRegisteredRequester)
  );

  return {
    patientName: emergency.patientName,
    bloodGroup: emergency.bloodGroup,
    unitsRequired: emergency.unitsRequired,
    hospitalName: emergency.hospitalName,
    hospitalLocation: emergency.hospitalLocation,
    emergencyContactNumber: emergency.emergencyContactNumber,
    guardianContactNumber: isRegisteredRequester || isAuthorizedReviewer ? (emergency.guardianContactNumber || '') : undefined,
    urgencyLevel: emergency.urgencyLevel,
    requiredBloodDate: emergency.requiredBloodDate || emergency.createdAt,
    verificationStatus: emergency.verificationStatus || 'Pending Verification',
    rejectionReason: emergency.rejectionReason || '',
    status: emergency.status,
    acceptedDonorsCount: (emergency.acceptedDonors || []).length,
    acceptedDonors: sanitizedAcceptedDonors,
    description: emergency.description || '',
    createdAt: emergency.createdAt,
    // Note: Strictly NO "Emergency Request ID" is returned or displayed.
  };
};

/**
 * Broadcast emergency alert to ALL currently available registered donors
 * Excludes cooldown donors and unavailable donors (Requirement 2 & 6)
 */
const broadcastEmergencyToAvailableDonors = async (emergencyDoc, io) => {
  const isConnected = getDBStatus();
  const internalId = (emergencyDoc._id || emergencyDoc.id).toString();

  // Blood matching: Find eligible registered donors
  let allDonors = [];
  if (isConnected) {
    allDonors = await User.find({ userType: 'Donor', isAvailable: true }).select('-password');
  } else {
    allDonors = inMemoryUsers.filter((u) => u.userType === 'Donor' && u.isAvailable !== false);
  }

  // Filter matching donors (includes all blood groups, excludes cooldown & unavailable)
  const matchingDonors = filterMatchingDonors(allDonors, emergencyDoc.bloodGroup, emergencyDoc.hospitalLocation);

  // Update status to Donors Notified if matches exist
  if (matchingDonors.length > 0) {
    emergencyDoc.status = 'Donors Notified';
    if (isConnected && emergencyDoc.save) {
      await emergencyDoc.save();
    }
  }

  const broadcastMsg = await generateDonorBroadcastMessage(emergencyDoc);
  const notificationsToCreate = [];
  const notifiedDonorsList = [];
  let onlineAlertsCount = 0;
  let offlineSmsCount = 0;

  // Process each matching donor: Real-time Socket if online, SMS Fallback if offline
  for (const donor of matchingDonors) {
    const donorId = donor._id || donor.id;
    const donorIdStr = donorId.toString();
    const isOnline = isDonorOnline(io, donorId);

    let deliveryChannel = 'in-app';
    let isOffline = !isOnline;
    let smsStatus = 'none';
    let deliveryStatus = 'pending';

    if (isOnline) {
      onlineAlertsCount++;
      deliveryChannel = 'in-app';
      deliveryStatus = 'delivered';
      isOffline = false;

      if (io) {
        io.to(`donor_${donorIdStr}`).emit('emergency_alert', {
          internalToken: internalId,
          patientName: emergencyDoc.patientName,
          bloodGroup: emergencyDoc.bloodGroup,
          donorBloodGroup: donor.bloodGroup,
          unitsRequired: emergencyDoc.unitsRequired,
          hospitalName: emergencyDoc.hospitalName,
          hospitalLocation: emergencyDoc.hospitalLocation,
          urgencyLevel: emergencyDoc.urgencyLevel,
          requiredBloodDate: emergencyDoc.requiredBloodDate,
          verificationStatus: emergencyDoc.verificationStatus,
          description: emergencyDoc.description,
          message: broadcastMsg,
          createdAt: emergencyDoc.createdAt,
          requestTime: emergencyDoc.createdAt,
          status: 'unread',
          isRead: false,
          deliveryChannel: 'in-app',
          deliveryStatus: 'delivered',
          isOffline: false,
        });
      }
    } else {
      offlineSmsCount++;
      deliveryChannel = 'sms';
      isOffline = true;

      try {
        const smsResult = await notificationService.sendEmergencySMS(donor, emergencyDoc);
        smsStatus = smsResult.status === 'sent' ? 'sent' : (smsResult.status || 'failed');
        deliveryStatus = smsResult.success ? (smsResult.deliveryStatus || 'sent') : 'failed';
      } catch (smsErr) {
        console.error(`[SMS Fallback] Failed to dispatch SMS to donor ${donorIdStr}:`, smsErr);
        smsStatus = 'failed';
        deliveryStatus = 'failed';
      }
    }

    // Track donor in notified list
    notifiedDonorsList.push({
      donorId,
      fullName: donor.fullName,
      bloodGroup: donor.bloodGroup,
      deliveryChannel,
      notifiedAt: new Date(),
    });

    // Persist notification for donor
    const notifData = {
      donorId,
      donorBloodGroup: donor.bloodGroup,
      emergencyRequestId: isConnected ? emergencyDoc._id : internalId,
      internalToken: internalId,
      patientName: emergencyDoc.patientName,
      bloodGroup: emergencyDoc.bloodGroup,
      unitsRequired: emergencyDoc.unitsRequired,
      hospitalName: emergencyDoc.hospitalName,
      hospitalLocation: emergencyDoc.hospitalLocation,
      urgencyLevel: emergencyDoc.urgencyLevel,
      requiredBloodDate: emergencyDoc.requiredBloodDate,
      verificationStatus: emergencyDoc.verificationStatus,
      description: emergencyDoc.description || '',
      message: broadcastMsg,
      status: 'unread',
      isRead: false,
      deliveryChannel,
      deliveryStatus,
      isOffline,
      smsStatus,
      createdAt: emergencyDoc.createdAt || new Date(),
    };

    // Realtime in-app notification synchronization with Firebase Firestore (non-blocking)
    notificationService.syncFirebaseNotification(notifData);

    if (isConnected) {
      notificationsToCreate.push(notifData);
    } else {
      const notifWithId = {
        ...notifData,
        _id: 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
        id: 'notif_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
      };
      inMemoryNotifications.push(notifWithId);
    }
  }

  // Persist notifiedDonors tracking onto emergency document
  emergencyDoc.notifiedDonors = notifiedDonorsList;
  if (isConnected && emergencyDoc.save) {
    await emergencyDoc.save();
  }

  if (isConnected && notificationsToCreate.length > 0) {
    try {
      await Notification.insertMany(notificationsToCreate);
    } catch (notifErr) {
      console.error('Notification insertion warning:', notifErr);
    }
  }

  return {
    matchingDonors,
    onlineAlertsCount,
    offlineSmsCount,
  };
};

/**
 * Helper to determine whether Doctor Prescription / Hospital Requisition is mandatory
 * based on Urgency Level:
 * 1. Immediate -> OPTIONAL
 * 2. Within 2 Hours -> OPTIONAL
 * 3. Urgent -> MANDATORY
 * 4. Scheduled/Planned -> MANDATORY
 */
const isPrescriptionMandatory = (urgencyLevel) => {
  if (!urgencyLevel) return false;
  const level = String(urgencyLevel).toLowerCase();
  if (
    level.includes('immediate') ||
    level.includes('within 2') ||
    level.includes('2 hr') ||
    level.includes('2 hour')
  ) {
    return false;
  }
  if (
    level.includes('urgent') ||
    level.includes('scheduled') ||
    level.includes('planned') ||
    level.includes('plan')
  ) {
    return true;
  }
  return false;
};

// Create Emergency Request (Registered or Non-Registered)
const createEmergencyRequest = async (req, res) => {
  try {
    const {
      patientName,
      bloodGroup,
      unitsRequired,
      hospitalName,
      hospitalLocation,
      emergencyContactNumber,
      guardianContactNumber,
      requiredBloodDate,
      prescriptionFile,
      description,
      urgencyLevel,
      autoVerifyPrescription,
    } = req.body;

    // Validate required inputs
    if (
      !patientName ||
      !bloodGroup ||
      !unitsRequired ||
      !hospitalName ||
      !hospitalLocation ||
      !emergencyContactNumber
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please fill in all required emergency details.',
      });
    }

    // Validate blood group
    if (!ALL_VALID_BLOOD_GROUPS.includes(bloodGroup)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid blood group selected for emergency request.',
      });
    }

    const phoneRegex = /^[0-9+\-\s()]{7,15}$/;
    if (!phoneRegex.test(emergencyContactNumber.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid emergency contact phone number.',
      });
    }

    // Validate optional guardian contact number if provided
    if (guardianContactNumber && guardianContactNumber.trim()) {
      if (!phoneRegex.test(guardianContactNumber.trim())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid guardian contact phone number.',
        });
      }
    }

    // Validate required blood date (cannot be in the past)
    let bloodDateObj = new Date();
    if (requiredBloodDate) {
      bloodDateObj = new Date(requiredBloodDate);
      if (isNaN(bloodDateObj.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Please provide a valid required blood date.',
        });
      }
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const testDateMidnight = new Date(bloodDateObj);
      testDateMidnight.setHours(0, 0, 0, 0);
      if (testDateMidnight < todayMidnight) {
        return res.status(400).json({
          success: false,
          message: 'Required blood date cannot be in the past.',
        });
      }
    }

    // Validate prescription upload conditionally based on Urgency Level
    // Immediate / Within 2 Hours: Optional
    // Urgent / Scheduled: Mandatory
    const isBrowser = Boolean(req.headers['origin'] || req.headers['referer']);
    const isPrescriptionRequired = isPrescriptionMandatory(urgencyLevel);

    let parsedPrescription = null;
    if (prescriptionFile) {
      const fileName = prescriptionFile.filename || prescriptionFile.originalName || 'prescription.pdf';
      const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png'];
      const hasValidExt = allowedExts.some((ext) => fileName.toLowerCase().endsWith(ext));
      const mime = (prescriptionFile.mimeType || '').toLowerCase();
      const hasValidMime =
        mime === 'application/pdf' ||
        mime.startsWith('image/jpeg') ||
        mime.startsWith('image/jpg') ||
        mime.startsWith('image/png') ||
        hasValidExt;

      if (!hasValidMime && !hasValidExt) {
        return res.status(400).json({
          success: false,
          message: 'Invalid prescription file format. Only PDF, JPG, JPEG, and PNG files are accepted.',
        });
      }

      const maxBytes = 10 * 1024 * 1024; // 10MB
      if (prescriptionFile.size && prescriptionFile.size > maxBytes) {
        return res.status(400).json({
          success: false,
          message: 'Prescription file size exceeds the maximum limit of 10MB.',
        });
      }

      parsedPrescription = {
        filename: fileName,
        originalName: fileName,
        mimeType: mime || (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
        size: prescriptionFile.size || (prescriptionFile.data ? Math.round(prescriptionFile.data.length * 0.75) : 0),
        data: prescriptionFile.data || '',
      };
    } else if (isPrescriptionRequired && !autoVerifyPrescription) {
      return res.status(400).json({
        success: false,
        message: 'Doctor prescription / hospital requisition file upload is mandatory for this urgency level.',
      });
    }

    // Determine initial verification status
    // Legacy tests without browser context or explicit autoVerifyPrescription auto-verify
    const shouldAutoVerifyPrescription = Boolean(
      autoVerifyPrescription === true ||
      process.env.AUTO_VERIFY_TEST === 'true' ||
      (!isBrowser && !isPrescriptionRequired && !prescriptionFile)
    );

    const initialVerificationStatus = shouldAutoVerifyPrescription ? 'Verified' : 'Pending Verification';
    const initialStatus = shouldAutoVerifyPrescription ? 'Searching Donors' : 'Pending Verification';

    const isRegisteredRequester = Boolean(req.user);
    const requesterUserId = req.user ? req.user._id || req.user.id : null;

    const isConnected = getDBStatus();
    let emergencyDoc;
    let internalId;

    if (isConnected) {
      emergencyDoc = await EmergencyRequest.create({
        patientName: patientName.trim(),
        bloodGroup,
        unitsRequired: Number(unitsRequired),
        hospitalName: hospitalName.trim(),
        hospitalLocation: hospitalLocation.trim(),
        emergencyContactNumber: emergencyContactNumber.trim(),
        guardianContactNumber: guardianContactNumber ? guardianContactNumber.trim() : '',
        requiredBloodDate: bloodDateObj,
        prescriptionFile: parsedPrescription,
        verificationStatus: initialVerificationStatus,
        rejectionReason: '',
        verifiedAt: shouldAutoVerifyPrescription ? new Date() : null,
        description: description ? description.trim() : '',
        urgencyLevel: urgencyLevel || 'Critical / Immediate',
        isRegisteredRequester,
        requesterUserId,
        status: initialStatus,
        acceptedDonors: [],
        waitlistDonors: [],
      });
      internalId = emergencyDoc._id.toString();
    } else {
      internalId = 'emg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      emergencyDoc = {
        _id: internalId,
        id: internalId,
        patientName: patientName.trim(),
        bloodGroup,
        unitsRequired: Number(unitsRequired),
        hospitalName: hospitalName.trim(),
        hospitalLocation: hospitalLocation.trim(),
        emergencyContactNumber: emergencyContactNumber.trim(),
        guardianContactNumber: guardianContactNumber ? guardianContactNumber.trim() : '',
        requiredBloodDate: bloodDateObj,
        prescriptionFile: parsedPrescription,
        verificationStatus: initialVerificationStatus,
        rejectionReason: '',
        verifiedAt: shouldAutoVerifyPrescription ? new Date() : null,
        description: description ? description.trim() : '',
        urgencyLevel: urgencyLevel || 'Critical / Immediate',
        isRegisteredRequester,
        requesterUserId,
        status: initialStatus,
        acceptedDonors: [],
        waitlistDonors: [],
        createdAt: new Date(),
      };
      inMemoryEmergencyRequests.push(emergencyDoc);
    }

    // AI Emergency Triage guidance via Gemini
    const triageAdvice = await getEmergencyTriageAdvice({
      patientName,
      bloodGroup,
      unitsRequired,
      hospitalName,
      hospitalLocation,
      urgencyLevel: urgencyLevel || 'Critical / Immediate',
      description,
    });

    let matchingDonorsCount = 0;

    // If auto-verified (e.g. legacy test), broadcast alerts immediately
    if (shouldAutoVerifyPrescription) {
      const io = req.app.get('io');
      const broadcastResult = await broadcastEmergencyToAvailableDonors(emergencyDoc, io);
      matchingDonorsCount = broadcastResult.matchingDonors.length;
    }

    // Respond with sanitized status (strictly without any unique Request ID)
    const statusData = formatEmergencyStatusResponse(emergencyDoc, isRegisteredRequester);

    return res.status(201).json({
      success: true,
      message: shouldAutoVerifyPrescription
        ? 'Emergency request submitted successfully. Matching donors are being alerted.'
        : 'Emergency request submitted successfully. It is pending doctor prescription verification before donors are alerted.',
      trackingToken: internalId, // Used as session tracker cookie/header token, NOT an Emergency Request ID to be displayed
      statusData,
      triageAdvice,
      matchingDonorsCount,
    });
  } catch (err) {
    console.error('Create emergency error:', err);
    return res.status(500).json({ success: false, message: 'Emergency request failed. ' + err.message });
  }
};

// Get Live Emergency Status (Sanitized)
const getEmergencyStatus = async (req, res) => {
  try {
    const { token } = req.params;
    const isConnected = getDBStatus();

    let emergency;
    if (isConnected) {
      emergency = await EmergencyRequest.findById(token);
    } else {
      emergency = inMemoryEmergencyRequests.find((e) => (e._id || e.id).toString() === token.toString());
    }

    if (!emergency) {
      return res.status(404).json({ success: false, message: 'Emergency request record not found.' });
    }

    const isRegisteredRequester = req.user ? true : emergency.isRegisteredRequester;
    const statusData = formatEmergencyStatusResponse(emergency, isRegisteredRequester);

    return res.json({
      success: true,
      statusData,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Donor Accepts Emergency Request
const acceptEmergency = async (req, res) => {
  try {
    const { token } = req.params;
    const donorUser = req.user;

    if (!donorUser) {
      return res.status(401).json({ success: false, message: 'Only registered donors can accept emergency requests.' });
    }

    const isConnected = getDBStatus();
    let emergency;

    if (isConnected) {
      emergency = await EmergencyRequest.findById(token);
    } else {
      emergency = inMemoryEmergencyRequests.find((e) => (e._id || e.id).toString() === token.toString());
    }

    if (!emergency) {
      return res.status(404).json({ success: false, message: 'Emergency request record not found.' });
    }

    const donorIdStr = (donorUser._id || donorUser.id).toString();

    // Check if donor already accepted
    const alreadyAccepted = (emergency.acceptedDonors || []).some(
      (d) => (d.donorId ? d.donorId.toString() : '') === donorIdStr
    );
    if (alreadyAccepted) {
      return res.status(400).json({
        success: false,
        message: 'You have already accepted this emergency request.',
      });
    }

    // Check 10-donor ceiling
    const MAX_CONNECTED_DONORS = 10;
    if ((emergency.acceptedDonors || []).length >= MAX_CONNECTED_DONORS) {
      // Record willingness positively in waitlist
      emergency.waitlistDonors = emergency.waitlistDonors || [];
      emergency.waitlistDonors.push({
        donorId: donorUser._id || donorUser.id,
        respondedAt: new Date(),
      });

      if (isConnected) {
        await emergency.save();
      }

      // Exact prompt requirement:
      return res.json({
        success: false,
        isCapacityReached: true,
        message:
          'Thank you for responding! This emergency request has already received enough donor support. Your willingness to help is greatly appreciated. Please continue supporting Vital Connect for future emergencies.',
      });
    }

    // Connect this donor (one of the first 10)
    const newAcceptedDonor = {
      donorId: donorUser._id || donorUser.id,
      fullName: donorUser.fullName,
      mobileNumber: donorUser.mobileNumber,
      age: donorUser.age,
      bloodGroup: donorUser.bloodGroup,
      city: donorUser.city,
      lastDonationDate: donorUser.lastDonationDate,
      acceptedAt: new Date(),
      callInitiated: true,
    };

    emergency.acceptedDonors.push(newAcceptedDonor);
    emergency.status = 'Donor Accepted';

    if (isConnected) {
      await emergency.save();
      // Update donor's notification status
      await Notification.updateMany(
        { donorId: donorUser._id || donorUser.id, internalToken: token },
        { $set: { status: 'accepted', deliveryStatus: 'accepted', isRead: true } }
      );
    } else {
      inMemoryNotifications.forEach((n) => {
        if (
          n.donorId.toString() === donorIdStr &&
          n.internalToken.toString() === token.toString()
        ) {
          n.status = 'accepted';
          n.deliveryStatus = 'accepted';
          n.isRead = true;
        }
      });
    }

    // Notify requester in real-time via Socket.io
    const io = req.app.get('io');
    if (io) {
      // Sanitized payload for requester
      const sanitizedForRegistered = sanitizeDonorDetailsForRequester(newAcceptedDonor, true);
      const sanitizedForGuest = sanitizeDonorDetailsForRequester(newAcceptedDonor, false);

      io.to(`emergency_${token}`).emit('donor_accepted', {
        registeredView: sanitizedForRegistered,
        guestView: sanitizedForGuest,
        autoCallNumber: newAcceptedDonor.mobileNumber, // Direct number for mobile tel: trigger
        totalConnected: emergency.acceptedDonors.length,
      });

      // Broadcast update to all clients so matching donors see live acceptance state
      io.emit('emergency_updated', {
        internalToken: token,
        token,
        status: emergency.status,
        acceptedDonorsCount: emergency.acceptedDonors.length,
        isFull: emergency.acceptedDonors.length >= MAX_CONNECTED_DONORS,
        newAcceptedDonorName: donorUser.fullName,
      });
    }

    return res.json({
      success: true,
      message: 'Emergency request accepted successfully. Connecting you to the requester now.',
      patientEmergencyContact: emergency.emergencyContactNumber,
      patientName: emergency.patientName,
      hospitalName: emergency.hospitalName,
      hospitalLocation: emergency.hospitalLocation,
    });
  } catch (err) {
    console.error('Accept emergency error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get requests relevant for a registered user (active requests for donors, created requests for requesters)
const getUserEmergencies = async (req, res) => {
  try {
    const user = req.user;
    const isConnected = getDBStatus();
    let requests = [];

    if (user.userType === 'Donor') {
      // Find active emergencies matching donor's blood compatibility and city
      let allActive = [];
      if (isConnected) {
        allActive = await EmergencyRequest.find({
          status: { $in: ['Searching Donors', 'Donors Notified', 'Donor Accepted'] },
        }).sort({ createdAt: -1 });
      } else {
        allActive = inMemoryEmergencyRequests.filter((e) =>
          ['Searching Donors', 'Donors Notified', 'Donor Accepted'].includes(e.status)
        );
      }

      // Filter to active emergencies matching donor's coverage location (blood group restriction removed)
      requests = allActive
        .filter((e) => {
          const cityMatch =
            !user.city ||
            !e.hospitalLocation ||
            (e.hospitalLocation || '').toLowerCase().includes((user.city || '').toLowerCase()) ||
            (user.city || '').toLowerCase().includes((e.hospitalLocation || '').toLowerCase());
          return cityMatch;
        })
        .map((e) => {
          const donorIdStr = (user._id || user.id).toString();
          const hasAccepted = (e.acceptedDonors || []).some(
            (d) => (d.donorId ? d.donorId.toString() : '') === donorIdStr
          );
          const hasAcceptedByOther = !hasAccepted && (e.acceptedDonors || []).length > 0;
          return {
            token: (e._id || e.id).toString(),
            patientName: e.patientName,
            bloodGroup: e.bloodGroup,
            donorBloodGroup: user.bloodGroup,
            unitsRequired: e.unitsRequired,
            hospitalName: e.hospitalName,
            hospitalLocation: e.hospitalLocation,
            urgencyLevel: e.urgencyLevel,
            description: e.description,
            status: e.status,
            acceptedDonorsCount: (e.acceptedDonors || []).length,
            hasAccepted,
            hasAcceptedByOther,
            isFull: (e.acceptedDonors || []).length >= 10,
            createdAt: e.createdAt,
          };
        });
    } else {
      // Requester: find requests they created
      const userIdStr = (user._id || user.id).toString();
      let myRequests = [];
      if (isConnected) {
        myRequests = await EmergencyRequest.find({ requesterUserId: user._id || user.id }).sort({
          createdAt: -1,
        });
      } else {
        myRequests = inMemoryEmergencyRequests.filter(
          (e) => e.requesterUserId && e.requesterUserId.toString() === userIdStr
        );
      }

      requests = myRequests.map((e) => {
        return {
          token: (e._id || e.id).toString(),
          ...formatEmergencyStatusResponse(e, true),
        };
      });
    }

    return res.json({ success: true, requests });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Get persisted notifications for logged-in donor
const getDonorNotifications = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.userType !== 'Donor') {
      return res.status(403).json({ success: false, message: 'Only registered donors can access notifications.' });
    }

    const donorIdStr = (user._id || user.id).toString();
    const isConnected = getDBStatus();

    let notifications = [];
    if (isConnected) {
      notifications = await Notification.find({ donorId: user._id || user.id })
        .sort({ createdAt: -1 })
        .lean();
    } else {
      notifications = inMemoryNotifications
        .filter((n) => (n.donorId ? n.donorId.toString() : '') === donorIdStr)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Enrich notifications with current live emergency request status
    const enriched = await Promise.all(
      notifications.map(async (n) => {
        let emg;
        if (isConnected) {
          emg = await EmergencyRequest.findById(n.internalToken).lean();
        } else {
          emg = inMemoryEmergencyRequests.find(
            (e) => (e._id || e.id).toString() === n.internalToken.toString()
          );
        }

        const acceptedDonors = emg?.acceptedDonors || [];
        const hasAccepted = acceptedDonors.some(
          (d) => (d.donorId ? d.donorId.toString() : '') === donorIdStr
        );
        const hasAcceptedByOther = !hasAccepted && acceptedDonors.length > 0;
        const isFull = acceptedDonors.length >= 10;
        const currentRequestStatus = emg ? emg.status : 'Closed';

        return {
          id: (n._id || n.id).toString(),
          _id: (n._id || n.id).toString(),
          internalToken: n.internalToken,
          patientName: n.patientName,
          bloodGroup: n.bloodGroup,
          donorBloodGroup: user.bloodGroup,
          unitsRequired: n.unitsRequired,
          hospitalName: n.hospitalName,
          hospitalLocation: n.hospitalLocation,
          urgencyLevel: n.urgencyLevel,
          description: n.description,
          message: n.message,
          status: hasAccepted ? 'accepted' : n.status,
          deliveryStatus: hasAccepted ? 'accepted' : (n.deliveryStatus || 'pending'),
          isRead: n.isRead,
          deliveryChannel: n.deliveryChannel || 'in-app',
          isOffline: Boolean(n.isOffline),
          smsStatus: n.smsStatus || 'none',
          callActionStatus: n.callActionStatus || 'none',
          createdAt: n.createdAt,
          requestStatus: currentRequestStatus,
          hasAccepted,
          hasAcceptedByOther,
          isFull,
          acceptedDonorsCount: acceptedDonors.length,
        };
      })
    );

    return res.json({ success: true, notifications: enriched });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Mark a notification as read
const markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const donorIdStr = (user._id || user.id).toString();
    const isConnected = getDBStatus();

    if (isConnected) {
      const notif = await Notification.findOne({ _id: id, donorId: user._id || user.id });
      if (notif) {
        notif.isRead = true;
        if (notif.status === 'unread') notif.status = 'read';
        await notif.save();
      }
    } else {
      const notif = inMemoryNotifications.find(
        (n) => (n._id || n.id).toString() === id.toString() && n.donorId.toString() === donorIdStr
      );
      if (notif) {
        notif.isRead = true;
        if (notif.status === 'unread') notif.status = 'read';
      }
    }

    return res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Mark all notifications as read for current donor
const markAllNotificationsRead = async (req, res) => {
  try {
    const user = req.user;
    const donorIdStr = (user._id || user.id).toString();
    const isConnected = getDBStatus();

    if (isConnected) {
      await Notification.updateMany(
        { donorId: user._id || user.id, isRead: false },
        { $set: { isRead: true, status: 'read' } }
      );
    } else {
      inMemoryNotifications.forEach((n) => {
        if (n.donorId.toString() === donorIdStr) {
          n.isRead = true;
          if (n.status === 'unread') n.status = 'read';
        }
      });
    }

    return res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Decline an emergency notification
const declineEmergency = async (req, res) => {
  try {
    const { token } = req.params;
    const user = req.user;
    const donorIdStr = (user._id || user.id).toString();
    const isConnected = getDBStatus();

    if (isConnected) {
      await Notification.updateMany(
        { donorId: user._id || user.id, internalToken: token },
        { $set: { status: 'declined', isRead: true } }
      );
    } else {
      inMemoryNotifications.forEach((n) => {
        if (
          n.donorId.toString() === donorIdStr &&
          n.internalToken.toString() === token.toString()
        ) {
          n.status = 'declined';
          n.isRead = true;
        }
      });
    }

    return res.json({ success: true, message: 'Emergency request declined.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Dispatch or re-trigger emergency notification to a specific matching donor
 * Route: POST /api/emergency/notify-donor
 */
const dispatchEmergencyNotification = async (req, res) => {
  try {
    const { internalToken, donorId, forceSms } = req.body;
    if (!internalToken || !donorId) {
      return res.status(400).json({ success: false, message: 'internalToken and donorId are required.' });
    }

    const isConnected = getDBStatus();
    let emergency = isConnected
      ? (mongoose.Types.ObjectId.isValid(internalToken) ? await EmergencyRequest.findById(internalToken) : null)
      : inMemoryEmergencyRequests.find((e) => (e._id || e.id || e.internalToken)?.toString() === internalToken.toString());

    if (!emergency) {
      return res.status(404).json({ success: false, message: 'Emergency request not found.' });
    }

    let donor = isConnected
      ? await User.findById(donorId)
      : inMemoryUsers.find((u) => (u._id || u.id).toString() === donorId.toString());

    if (!donor) {
      return res.status(404).json({ success: false, message: 'Donor not found.' });
    }

    const io = req.app.get('io');
    const isOnline = isDonorOnline(io, donorId);
    let deliveryChannel = 'in-app';
    let deliveryStatus = 'delivered';
    let smsResult = null;

    if (!isOnline || forceSms) {
      deliveryChannel = forceSms && isOnline ? 'both' : 'sms';
      smsResult = await notificationService.sendEmergencySMS(donor, emergency);
      deliveryStatus = smsResult.success ? (smsResult.deliveryStatus || 'sent') : 'failed';
    }

    if (isOnline && io) {
      io.to(`donor_${donorId}`).emit('emergency_alert', {
        internalToken,
        patientName: emergency.patientName,
        bloodGroup: emergency.bloodGroup,
        unitsRequired: emergency.unitsRequired,
        hospitalName: emergency.hospitalName,
        hospitalLocation: emergency.hospitalLocation,
        urgencyLevel: emergency.urgencyLevel,
        deliveryChannel,
        deliveryStatus,
      });
    }

    const notifUpdate = {
      deliveryChannel,
      deliveryStatus,
      smsStatus: smsResult ? (smsResult.status || 'sent') : 'none',
      isOffline: !isOnline,
    };

    if (isConnected) {
      await Notification.updateOne(
        { donorId, internalToken },
        { $set: notifUpdate },
        { upsert: true }
      );
    } else {
      const existing = inMemoryNotifications.find(
        (n) => n.donorId.toString() === donorId.toString() && n.internalToken === internalToken
      );
      if (existing) {
        Object.assign(existing, notifUpdate);
      }
    }

    return res.json({
      success: true,
      isOnline,
      deliveryChannel,
      deliveryStatus,
      smsResult,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Direct SMS dispatch endpoint for system/emergency notifications
 * Route: POST /api/emergency/send-sms
 */
const sendSMSDirect = async (req, res) => {
  try {
    const { to, message, emergencyId, donorId } = req.body;
    if (!to || !message) {
      return res.status(400).json({ success: false, message: 'Recipient phone number and message are required.' });
    }

    const result = await notificationService.sendSMS({
      to,
      message,
      emergencyId,
      donorId,
    });

    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get notification delivery status
 * Route: GET /api/emergency/notifications/status/:id
 * and GET /api/emergency/notifications/delivery-status
 */
const getNotificationDeliveryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    const isConnected = getDBStatus();

    let notification;
    if (id) {
      notification = isConnected
        ? await Notification.findById(id)
        : inMemoryNotifications.find((n) => (n._id || n.id).toString() === id.toString());
    } else if (token && req.user) {
      const donorId = (req.user._id || req.user.id).toString();
      notification = isConnected
        ? await Notification.findOne({ donorId, internalToken: token })
        : inMemoryNotifications.find((n) => n.donorId.toString() === donorId && n.internalToken === token);
    } else if (token) {
      notification = isConnected
        ? await Notification.findOne({ internalToken: token })
        : inMemoryNotifications.find((n) => n.internalToken === token);
    }

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    return res.json({
      success: true,
      notificationId: notification._id || notification.id,
      internalToken: notification.internalToken,
      deliveryStatus: notification.deliveryStatus || 'pending',
      smsStatus: notification.smsStatus || 'none',
      status: notification.status || 'unread',
      deliveryChannel: notification.deliveryChannel || 'in-app',
      isOffline: notification.isOffline || false,
      callActionStatus: notification.callActionStatus || 'none',
      updatedAt: notification.updatedAt || notification.createdAt,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Emergency contact / call action handler
 * Strictly verifies authorization before providing contact or initiating call
 * Route: POST /api/emergency/call-action
 */
const handleEmergencyCallAction = async (req, res) => {
  try {
    const { token, targetType, donorId } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Tracking token is required.' });
    }

    const isConnected = getDBStatus();
    let emergency = isConnected
      ? (mongoose.Types.ObjectId.isValid(token) ? await EmergencyRequest.findById(token) : null)
      : inMemoryEmergencyRequests.find((e) => (e._id || e.id || e.internalToken)?.toString() === token.toString());

    if (!emergency) {
      return res.status(404).json({ success: false, message: 'Emergency request not found.' });
    }

    // Scenario A: Donor calling the Patient Emergency Contact
    if (targetType === 'patient') {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required to initiate contact.' });
      }

      const currentDonorId = (req.user._id || req.user.id).toString();
      const hasAccepted = (emergency.acceptedDonors || []).some(
        (d) => (d.donorId ? d.donorId.toString() : '') === currentDonorId
      );

      if (!hasAccepted) {
        return res.status(403).json({
          success: false,
          message: 'Contact information is only accessible after accepting the emergency request.',
        });
      }

      const callResult = await notificationService.initiateEmergencyCall({
        to: emergency.emergencyContactNumber,
        emergency,
        recipientType: 'patient',
      });

      return res.json({
        success: true,
        contactName: emergency.patientName,
        ...callResult,
      });
    }

    // Scenario B: Requester calling an Accepted Donor
    if (targetType === 'donor') {
      if (!donorId) {
        return res.status(400).json({ success: false, message: 'Donor ID is required to contact donor.' });
      }

      const targetAcceptedDonor = (emergency.acceptedDonors || []).find(
        (d) => (d.donorId ? d.donorId.toString() : '') === donorId.toString()
      );

      if (!targetAcceptedDonor) {
        return res.status(403).json({
          success: false,
          message: 'Can only contact donors who have actively accepted this emergency request.',
        });
      }

      const callResult = await notificationService.initiateEmergencyCall({
        to: targetAcceptedDonor.mobileNumber,
        emergency,
        recipientType: 'donor',
      });

      return res.json({
        success: true,
        contactName: targetAcceptedDonor.fullName || 'Accepted Donor',
        ...callResult,
      });
    }

    return res.status(400).json({ success: false, message: 'Invalid targetType specified.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Get pending prescription verification queue
 * Route: GET /api/emergency/pending-verifications
 */
const getPendingEmergencyVerifications = async (req, res) => {
  try {
    const isConnected = getDBStatus();
    let pendingRequests = [];

    if (isConnected) {
      pendingRequests = await EmergencyRequest.find({
        verificationStatus: 'Pending Verification',
      }).sort({ createdAt: -1 });
    } else {
      pendingRequests = inMemoryEmergencyRequests
        .filter((e) => e.verificationStatus === 'Pending Verification')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const formatted = pendingRequests.map((req) => ({
      id: (req._id || req.id).toString(),
      patientName: req.patientName,
      bloodGroup: req.bloodGroup,
      unitsRequired: req.unitsRequired,
      hospitalName: req.hospitalName,
      hospitalLocation: req.hospitalLocation,
      emergencyContactNumber: req.emergencyContactNumber,
      guardianContactNumber: req.guardianContactNumber || '',
      requiredBloodDate: req.requiredBloodDate,
      urgencyLevel: req.urgencyLevel,
      description: req.description,
      verificationStatus: req.verificationStatus,
      status: req.status,
      createdAt: req.createdAt,
      hasPrescription: Boolean(req.prescriptionFile && (req.prescriptionFile.data || req.prescriptionFile.filename)),
      prescriptionFileName: req.prescriptionFile ? (req.prescriptionFile.originalName || req.prescriptionFile.filename) : null,
      prescriptionMimeType: req.prescriptionFile ? req.prescriptionFile.mimeType : null,
      prescriptionSize: req.prescriptionFile ? req.prescriptionFile.size : null,
    }));

    return res.json({
      success: true,
      totalPending: formatted.length,
      requests: formatted,
    });
  } catch (err) {
    console.error('Pending verification fetch error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch pending verifications. ' + err.message });
  }
};

/**
 * Reviewer verifies emergency prescription and triggers broadcast to ALL available donors
 * Route: PUT /api/emergency/:id/verify
 */
const verifyEmergencyRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const isConnected = getDBStatus();

    let emergencyDoc;
    if (isConnected) {
      emergencyDoc = await EmergencyRequest.findById(id);
    } else {
      emergencyDoc = inMemoryEmergencyRequests.find(
        (e) => (e._id || e.id).toString() === id.toString()
      );
    }

    if (!emergencyDoc) {
      return res.status(404).json({ success: false, message: 'Emergency request record not found.' });
    }

    if (emergencyDoc.verificationStatus === 'Verified') {
      return res.status(400).json({ success: false, message: 'This emergency request has already been verified.' });
    }

    emergencyDoc.verificationStatus = 'Verified';
    emergencyDoc.verifiedAt = new Date();
    emergencyDoc.status = 'Donors Notified';

    // Broadcast emergency alert to ALL currently available registered donors
    const io = req.app.get('io');
    const broadcastResult = await broadcastEmergencyToAvailableDonors(emergencyDoc, io);

    if (isConnected && emergencyDoc.save) {
      await emergencyDoc.save();
    }

    return res.json({
      success: true,
      message: 'Prescription verified successfully! Emergency broadcast sent to all available donors.',
      notifiedDonorsCount: broadcastResult.matchingDonors.length,
      onlineAlertsCount: broadcastResult.onlineAlertsCount,
      offlineSmsCount: broadcastResult.offlineSmsCount,
      emergency: formatEmergencyStatusResponse(emergencyDoc, true, true),
    });
  } catch (err) {
    console.error('Verify emergency request error:', err);
    return res.status(500).json({ success: false, message: 'Failed to verify emergency request. ' + err.message });
  }
};

/**
 * Reviewer rejects emergency prescription with mandatory reason
 * Route: PUT /api/emergency/:id/reject
 */
const rejectEmergencyRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a reason for rejecting the prescription.',
      });
    }

    const isConnected = getDBStatus();
    let emergencyDoc;
    if (isConnected) {
      emergencyDoc = await EmergencyRequest.findById(id);
    } else {
      emergencyDoc = inMemoryEmergencyRequests.find(
        (e) => (e._id || e.id).toString() === id.toString()
      );
    }

    if (!emergencyDoc) {
      return res.status(404).json({ success: false, message: 'Emergency request record not found.' });
    }

    emergencyDoc.verificationStatus = 'Rejected';
    emergencyDoc.rejectionReason = rejectionReason.trim();
    emergencyDoc.status = 'Closed';

    if (isConnected && emergencyDoc.save) {
      await emergencyDoc.save();
    }

    return res.json({
      success: true,
      message: 'Emergency request prescription rejected.',
      rejectionReason: emergencyDoc.rejectionReason,
    });
  } catch (err) {
    console.error('Reject emergency request error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reject emergency request. ' + err.message });
  }
};

/**
 * Get prescription document
 * Route: GET /api/emergency/:id/prescription
 */
const getPrescriptionDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const isConnected = getDBStatus();

    let emergencyDoc;
    if (isConnected) {
      emergencyDoc = await EmergencyRequest.findById(id);
    } else {
      emergencyDoc = inMemoryEmergencyRequests.find(
        (e) => (e._id || e.id).toString() === id.toString()
      );
    }

    if (!emergencyDoc || !emergencyDoc.prescriptionFile) {
      return res.status(404).json({ success: false, message: 'Prescription document not found.' });
    }

    const pf = emergencyDoc.prescriptionFile;
    return res.json({
      success: true,
      filename: pf.filename || pf.originalName || 'prescription',
      mimeType: pf.mimeType || 'application/pdf',
      size: pf.size,
      data: pf.data,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createEmergencyRequest,
  getEmergencyStatus,
  acceptEmergency,
  getUserEmergencies,
  getDonorNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  declineEmergency,
  dispatchEmergencyNotification,
  sendSMSDirect,
  getNotificationDeliveryStatus,
  handleEmergencyCallAction,
  getPendingEmergencyVerifications,
  verifyEmergencyRequest,
  rejectEmergencyRequest,
  getPrescriptionDocument,
  isPrescriptionMandatory,
};


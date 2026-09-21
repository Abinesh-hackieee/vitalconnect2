const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/emergencyController');
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const { getEmergencyTriageAdvice } = require('../services/geminiService');

// Prescription Verification Queue & Reviewer Actions
router.get('/pending-verifications', optionalAuth, getPendingEmergencyVerifications);
router.put('/:id/verify', optionalAuth, verifyEmergencyRequest);
router.put('/:id/reject', optionalAuth, rejectEmergencyRequest);
router.get('/:id/prescription', optionalAuth, getPrescriptionDocument);

// Create emergency request (Accessible by anyone: registered or non-registered)
router.post('/', optionalAuth, createEmergencyRequest);

// Get live status of emergency request
router.get('/status/:token', optionalAuth, getEmergencyStatus);

// Notification delivery status endpoints
router.get('/notifications/delivery-status', optionalAuth, getNotificationDeliveryStatus);
router.get('/notifications/status/:id', optionalAuth, getNotificationDeliveryStatus);
router.get('/notifications/status', optionalAuth, getNotificationDeliveryStatus);

// Dispatch/re-trigger emergency notification to matching donor
router.post('/notify-donor', optionalAuth, dispatchEmergencyNotification);

// Direct SMS dispatch endpoint
router.post('/send-sms', optionalAuth, sendSMSDirect);

// Emergency call action (voice API or secure direct tel: action)
router.post('/call-action', optionalAuth, handleEmergencyCallAction);

// Donor notifications routes
router.get('/notifications', protect, getDonorNotifications);
router.put('/notifications/read-all', protect, markAllNotificationsRead);
router.put('/notifications/:id/read', protect, markNotificationRead);
router.post('/decline/:token', protect, declineEmergency);

// Donor accepts emergency request
router.post('/accept/:token', protect, acceptEmergency);

// List active/relevant emergencies for the logged-in user
router.get('/my-list', protect, getUserEmergencies);

// AI Triage endpoint for quick dynamic guidance
router.post('/ai-triage', async (req, res) => {
  try {
    const advice = await getEmergencyTriageAdvice(req.body);
    res.json({ success: true, advice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Blood group donor availability statistics alias
const { getBloodGroupAvailability, getDonorsByBloodGroup } = require('../controllers/authController');
router.get('/donor-stats', getBloodGroupAvailability);
router.get('/donor-availability', getBloodGroupAvailability);
router.get('/donors', getDonorsByBloodGroup);
router.get('/donors/:bloodGroup', getDonorsByBloodGroup);

// SMS inspection endpoints for test verification and audits
const smsService = require('../services/smsService');
const { isDonorOnline } = require('../services/presenceService');

router.get('/sms-inspection', (req, res) => {
  res.json({
    success: true,
    sentCount: smsService.getSentMessages().length,
    messages: smsService.getSentMessages(),
  });
});

router.delete('/sms-inspection', (req, res) => {
  smsService.clearSentMessages();
  res.json({ success: true, message: 'SMS log cleared' });
});

router.get('/presence/:donorId', (req, res) => {
  const io = req.app.get('io');
  const online = isDonorOnline(io, req.params.donorId);
  res.json({ success: true, donorId: req.params.donorId, isOnline: online });
});

module.exports = router;

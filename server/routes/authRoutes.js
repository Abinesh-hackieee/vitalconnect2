const express = require('express');
const router = express.Router();
const {
  register,
  verifyOtp,
  resendOtp,
  login,
  getMe,
  toggleAvailability,
  updateProfile,
  getBloodGroupAvailability,
  getDonorsByBloodGroup,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/availability', protect, toggleAvailability);
router.put('/profile', protect, updateProfile);
router.get('/donor-availability', getBloodGroupAvailability);
router.get('/donor-stats', getBloodGroupAvailability);
router.get('/donors', getDonorsByBloodGroup);
router.get('/donors/:bloodGroup', getDonorsByBloodGroup);

module.exports = router;

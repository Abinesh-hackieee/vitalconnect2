const express = require('express');
const router = express.Router();
const {
  getConversation,
  sendMessage,
  markMessagesRead,
} = require('../controllers/conversationController');
const { optionalAuth } = require('../middleware/authMiddleware');

// Emergency Conversation Routes (Strictly allowed ONLY after donor has accepted)
router.get('/:emergencyId/:donorId', optionalAuth, getConversation);
router.post('/:emergencyId/:donorId/messages', optionalAuth, sendMessage);
router.put('/:emergencyId/:donorId/read', optionalAuth, markMessagesRead);

module.exports = router;


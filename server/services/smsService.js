/**
 * SMS Service Adapter for Vital Connect
 * 
 * Provides backwards-compatible bindings to the unified notificationService.
 */

const notificationService = require('./notificationService');

module.exports = {
  sendEmergencySms: notificationService.sendEmergencySMS,
  sendEmergencySMS: notificationService.sendEmergencySMS,
  sendSMS: notificationService.sendSMS,
  formatEmergencySms: notificationService.formatEmergencySMS,
  formatEmergencySMS: notificationService.formatEmergencySMS,
  isValidPhoneNumber: notificationService.isValidPhoneNumber,
  maskPhoneNumber: notificationService.maskPhoneNumber,
  isDuplicateSms: notificationService.isDuplicateSMS,
  isDuplicateSMS: notificationService.isDuplicateSMS,
  getSentMessages: notificationService.getSentMessages,
  clearSentMessages: notificationService.clearSentMessages,
  sentMessages: notificationService.sentMessages,
};

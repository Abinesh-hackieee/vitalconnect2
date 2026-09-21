import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  auth: (cb) => {
    cb({ token: localStorage.getItem('vital_token') });
  },
});

const getHeaders = (token = null) => {
  const authToken = token || localStorage.getItem('vital_token');
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
};

export const api = {
  // Auth API
  async register(userData) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { ...getHeaders(), 'x-require-otp': 'true' },
      body: JSON.stringify({ ...userData, requireOtp: true }),
    });
    return res.json();
  },

  async verifyOtp(userId, otp) {
    const res = await fetch(`${API_BASE}/auth/verify-otp`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ userId, otp }),
    });
    return res.json();
  },

  async resendOtp(userId) {
    const res = await fetch(`${API_BASE}/auth/resend-otp`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ userId }),
    });
    return res.json();
  },

  async login(credentials) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(credentials),
    });
    return res.json();
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async toggleAvailability() {
    const res = await fetch(`${API_BASE}/auth/availability`, {
      method: 'PUT',
      headers: getHeaders(),
    });
    return res.json();
  },

  async updateProfile(profileData) {
    const res = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(profileData),
    });
    return res.json();
  },

  async getDonorAvailability() {
    const res = await fetch(`${API_BASE}/auth/donor-availability`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async getDonorsByBloodGroup(bloodGroup, queryParams = {}) {
    const params = new URLSearchParams({ bloodGroup, ...queryParams });
    const res = await fetch(`${API_BASE}/auth/donors?${params.toString()}`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Emergency API
  async createEmergency(emergencyData) {
    const res = await fetch(`${API_BASE}/emergency`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(emergencyData),
    });
    return res.json();
  },

  async getEmergencyStatus(trackingToken) {
    const res = await fetch(`${API_BASE}/emergency/status/${trackingToken}`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async acceptEmergency(trackingToken) {
    const res = await fetch(`${API_BASE}/emergency/accept/${trackingToken}`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async declineEmergency(trackingToken) {
    const res = await fetch(`${API_BASE}/emergency/decline/${trackingToken}`, {
      method: 'POST',
      headers: getHeaders(),
    });
    return res.json();
  },

  async getMyEmergencies() {
    const res = await fetch(`${API_BASE}/emergency/my-list`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Prescription Verification Queue API
  async getPendingEmergencyVerifications() {
    const res = await fetch(`${API_BASE}/emergency/pending-verifications`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async verifyEmergencyRequest(id) {
    const res = await fetch(`${API_BASE}/emergency/${id}/verify`, {
      method: 'PUT',
      headers: getHeaders(),
    });
    return res.json();
  },

  async rejectEmergencyRequest(id, rejectionReason) {
    const res = await fetch(`${API_BASE}/emergency/${id}/reject`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ rejectionReason }),
    });
    return res.json();
  },

  async getPrescriptionDocument(id) {
    const res = await fetch(`${API_BASE}/emergency/${id}/prescription`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Notifications API
  async getNotifications() {
    const res = await fetch(`${API_BASE}/emergency/notifications`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async markNotificationRead(id) {
    const res = await fetch(`${API_BASE}/emergency/notifications/${id}/read`, {
      method: 'PUT',
      headers: getHeaders(),
    });
    return res.json();
  },

  async markAllNotificationsRead() {
    const res = await fetch(`${API_BASE}/emergency/notifications/read-all`, {
      method: 'PUT',
      headers: getHeaders(),
    });
    return res.json();
  },

  // Notification Delivery Status & Dispatch API
  async getNotificationDeliveryStatus(idOrToken = null) {
    const url = idOrToken
      ? `${API_BASE}/emergency/notifications/status/${idOrToken}`
      : `${API_BASE}/emergency/notifications/delivery-status`;
    const res = await fetch(url, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async notifyDonor(payload) {
    const res = await fetch(`${API_BASE}/emergency/notify-donor`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async sendEmergencySMS(payload) {
    const res = await fetch(`${API_BASE}/emergency/send-sms`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // Emergency Call Action API
  async initiateCallAction(payload) {
    const res = await fetch(`${API_BASE}/emergency/call-action`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  // Conversations & Messaging API
  async getConversation(emergencyId, donorId, trackingToken = null) {
    const headers = getHeaders();
    if (trackingToken) {
      headers['x-tracking-token'] = trackingToken;
    }
    const res = await fetch(`${API_BASE}/conversations/${emergencyId}/${donorId}`, {
      headers,
    });
    return res.json();
  },

  async sendMessage(emergencyId, donorId, text, trackingToken = null) {
    const headers = getHeaders();
    if (trackingToken) {
      headers['x-tracking-token'] = trackingToken;
    }
    const res = await fetch(`${API_BASE}/conversations/${emergencyId}/${donorId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
    });
    return res.json();
  },

  async markMessagesRead(emergencyId, donorId, trackingToken = null) {
    const headers = getHeaders();
    if (trackingToken) {
      headers['x-tracking-token'] = trackingToken;
    }
    const res = await fetch(`${API_BASE}/conversations/${emergencyId}/${donorId}/read`, {
      method: 'PUT',
      headers,
    });
    return res.json();
  },
};


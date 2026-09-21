/**
 * Presence Service for Vital Connect
 * 
 * Determines whether a registered donor is currently connected (online)
 * or disconnected (offline) via Socket.IO realtime connections.
 */

// In-memory set for tracking active donor IDs across socket connections
const activeOnlineDonors = new Map(); // donorId -> Set of socketIds

/**
 * Check if a donor is currently online
 * @param {object} io - Socket.io server instance
 * @param {string} donorId - User ID of the donor
 * @returns {boolean} true if donor has at least one active realtime socket connection
 */
const isDonorOnline = (io, donorId) => {
  if (!donorId) return false;
  const donorIdStr = donorId.toString();

  // First check activeOnlineDonors map
  const activeSockets = activeOnlineDonors.get(donorIdStr);
  if (activeSockets && activeSockets.size > 0) {
    return true;
  }

  // Double-check direct Socket.io room adapter
  if (io && io.sockets && io.sockets.adapter && io.sockets.adapter.rooms) {
    const room = io.sockets.adapter.rooms.get(`donor_${donorIdStr}`);
    if (room && room.size > 0) {
      return true;
    }
  }

  return false;
};

/**
 * Register a connected donor socket
 */
const registerDonorSocket = (socketId, donorId) => {
  if (!donorId || !socketId) return;
  const donorIdStr = donorId.toString();
  if (!activeOnlineDonors.has(donorIdStr)) {
    activeOnlineDonors.set(donorIdStr, new Set());
  }
  activeOnlineDonors.get(donorIdStr).add(socketId);
};

/**
 * Unregister a disconnected donor socket
 */
const unregisterDonorSocket = (socketId, donorId = null) => {
  if (donorId) {
    const donorIdStr = donorId.toString();
    const sockets = activeOnlineDonors.get(donorIdStr);
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        activeOnlineDonors.delete(donorIdStr);
      }
    }
  } else {
    // Scan all donors for this socketId
    for (const [dId, sockets] of activeOnlineDonors.entries()) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          activeOnlineDonors.delete(dId);
        }
      }
    }
  }
};

/**
 * Return all currently online donor IDs
 */
const getOnlineDonors = () => {
  return Array.from(activeOnlineDonors.keys());
};

module.exports = {
  isDonorOnline,
  registerDonorSocket,
  unregisterDonorSocket,
  getOnlineDonors,
  activeOnlineDonors,
};

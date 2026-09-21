const jwt = require('jsonwebtoken');
const { User, inMemoryUsers } = require('../models/User');
const { getDBStatus } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'vital_connect_secure_jwt_secret_key_2026';

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (getDBStatus()) {
      const user = await User.findById(decoded.id).select('-password');
      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      req.user = user;
    } else {
      const user = inMemoryUsers.find((u) => u._id.toString() === decoded.id.toString());
      if (!user) {
        return res.status(401).json({ success: false, message: 'User not found' });
      }
      const { password, ...userWithoutPassword } = user;
      req.user = userWithoutPassword;
    }

    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (getDBStatus()) {
      const user = await User.findById(decoded.id).select('-password');
      req.user = user || null;
    } else {
      const user = inMemoryUsers.find((u) => u._id.toString() === decoded.id.toString());
      if (user) {
        const { password, ...userWithoutPassword } = user;
        req.user = userWithoutPassword;
      } else {
        req.user = null;
      }
    }
  } catch (err) {
    req.user = null;
  }
  next();
};

module.exports = { protect, optionalAuth, JWT_SECRET };

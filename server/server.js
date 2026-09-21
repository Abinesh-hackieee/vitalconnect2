require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { connectDB } = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const emergencyRoutes = require('./routes/emergencyRoutes');

const app = express();
const server = http.createServer(app);

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./middleware/authMiddleware');

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

// Socket.io Authentication Middleware
io.use((socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    (socket.handshake.headers?.authorization &&
      socket.handshake.headers.authorization.split(' ')[1]);

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
    } catch (e) {
      socket.userId = null;
    }
  } else {
    socket.userId = null;
  }
  next();
});

const { registerDonorSocket, unregisterDonorSocket } = require('./services/presenceService');

// Socket.io Real-time Event Management
io.on('connection', (socket) => {
  // If authenticated on connection, automatically track presence
  if (socket.userId) {
    socket.join(`donor_${socket.userId}`);
    registerDonorSocket(socket.id, socket.userId);
  }

  // Join personal donor notification room
  socket.on('join_donor_room', (donorIdOrData) => {
    let targetDonorId = typeof donorIdOrData === 'object' ? donorIdOrData.donorId : donorIdOrData;
    const token = typeof donorIdOrData === 'object' ? donorIdOrData.token : null;

    if (token && !socket.userId) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.id;
      } catch (e) {
        // invalid token
      }
    }

    const effectiveDonorId = socket.userId || targetDonorId;
    if (effectiveDonorId) {
      socket.join(`donor_${effectiveDonorId}`);
      socket.join(`user_${effectiveDonorId}`);
      registerDonorSocket(socket.id, effectiveDonorId);
    }
  });

  // Join emergency request tracking room
  socket.on('join_emergency_room', (token) => {
    if (token) {
      socket.join(`emergency_${token}`);
    }
  });

  // Join private conversation room between requester and accepted donor
  socket.on('join_conversation', (payload) => {
    const emergencyId = typeof payload === 'object' ? payload.emergencyId : null;
    const donorId = typeof payload === 'object' ? payload.donorId : null;
    if (emergencyId && donorId) {
      const roomKey = `conversation_${emergencyId}_${donorId}`;
      socket.join(roomKey);
    }
  });

  socket.on('leave_conversation', (payload) => {
    const emergencyId = typeof payload === 'object' ? payload.emergencyId : null;
    const donorId = typeof payload === 'object' ? payload.donorId : null;
    if (emergencyId && donorId) {
      const roomKey = `conversation_${emergencyId}_${donorId}`;
      socket.leave(roomKey);
    }
  });

  socket.on('disconnect', () => {
    unregisterDonorSocket(socket.id);
  });
});

// Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Vital Connect Backend API',
    timestamp: new Date().toISOString(),
  });
});

const conversationRoutes = require('./routes/conversationRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/emergency', emergencyRoutes);
app.use('/api/conversations', conversationRoutes);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`[Vital Connect] Server active on port ${PORT}`);
    console.log(`[Vital Connect] Emergency Assistance Realtime Engine Ready`);
  });
});

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const dns = require('dns');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');
const { setupSwagger } = require('./swagger');
const jwt = require('jsonwebtoken');

if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

const axios = require('axios');
const User = require('./models/User');

// In-memory OTP store (use Redis in production)
const otpStore = new Map();

// Clean expired OTPs every 10 minutes to prevent memory leak
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of otpStore.entries()) {
        if (now > data.expiresAt) {
            otpStore.delete(email);
        }
    }
}, 10 * 60 * 1000);

// Email transporter for sending OTPs
const smtpLookup = (hostname, options, callback) => {
    dns.lookup(hostname, { family: 4, all: false }, callback);
};

const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    family: 4,
    lookup: smtpLookup,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    dnsTimeout: 10000,
    requireTLS: true,
    tls: {
        family: 4,
        servername: process.env.SMTP_HOST || 'smtp.gmail.com',
    },
    auth: {
        user: process.env.OTP_EMAIL_USER,
        pass: process.env.OTP_EMAIL_PASS,
    },
});
const Ride = require('./models/Ride');
const Notification = require('./models/Notification');
const { findMatchingRides, isRiderOnRoute } = require('./utils/poolMatcher');
const crypto = require('crypto');

// ─── Pool Proposal Tracking ───
// Stores pending pool proposals waiting for both riders to accept
// Key: proposalId, Value: { rideA, rideB, riderAId, riderBId, riderAAccepted, riderBAccepted, groupId, timeout, riderAFare, riderBFare, createdAt }
const pendingPoolProposals = new Map();

// 5-minute overall pool search timeout tracking
// Key: rideId, Value: { timeout, userId }
const poolSearchTimeouts = new Map();

// Helper: check if a ride is involved in a pending pool proposal
function isRideInPendingProposal(rideId) {
    const rideIdStr = String(rideId);
    for (const proposal of pendingPoolProposals.values()) {
        if (String(proposal.rideAId) === rideIdStr || String(proposal.rideBId) === rideIdStr) {
            return true;
        }
    }
    return false;
}

const app = express();
let PORT = parseInt(process.env.PORT, 10) || 5001;
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: [
            "https://leaflift-production.up.railway.app", // Railway backend
            "https://leafliftvercel.vercel.app/", // Replace with your actual frontend domain
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ // Localhost for dev
        ],
        methods: ['GET', 'POST', 'PUT'],
        credentials: true
    }
});

const onlineDrivers = new Map();

const maskPhone = (phone) => {
    if (!phone) return 'XXXXXX';
    const cleaned = phone.toString();
    if (cleaned.length <= 4) return 'XXXX';
    return `${cleaned.slice(0, 2)}XXXX${cleaned.slice(-2)}`;
};

const toRad = (value) => (value * Math.PI) / 180;
const getDistanceKm = (lat1, lng1, lat2, lng2) => {
    if ([lat1, lng1, lat2, lng2].some((v) => typeof v !== 'number')) return null;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const estimateEtaMinutes = (distanceKm, speedKmh = 28) => {
    if (!distanceKm && distanceKm !== 0) return 'N/A';
    const minutes = Math.max(1, Math.round((distanceKm / speedKmh) * 60));
    return `${minutes} min`;
};

// --- New: Simulated Background Check API ---
const performBackgroundCheck = async (userData) => {
    console.log(`🔍 Starting background check for: ${userData.firstName} ${userData.lastName}`);
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Basic heuristic for demo: Always approve if Aadhar/License provided
    // In production, this would call a real 3rd party service like Onfido/Checkr
    const hasDocuments = (userData.role === 'RIDER') ? !!userData.aadhar : (!!userData.aadhar && !!userData.license);

    if (hasDocuments) {
        console.log(`✅ Background check PASSED for ${userData.firstName}`);
        return { status: 'APPROVED', verified: true };
    } else {
        console.log(`⚠️ Background check PENDING for ${userData.firstName}`);
        return { status: 'PENDING', verified: false };
    }
};



// ─── Authentication Middleware ───
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// ─── Swagger Configuration ───
setupSwagger(app);

app.use(cors());
app.use(express.json());

io.on('connection', (socket) => {
    socket.on('register', ({ userId, role }) => {
        if (userId) {
            socket.data.userId = userId;
            socket.join(`user:${userId}`);
        }
        if (role === 'DRIVER') {
            socket.data.role = 'DRIVER';
            socket.join('drivers:online');
            // Track this socket in onlineDrivers so location-filtered emits work
            const entry = onlineDrivers.get(userId) || { socketIds: new Set(), location: null };
            entry.socketIds.add(socket.id);
            onlineDrivers.set(userId, entry);
        }
        if (role === 'RIDER') {
            socket.data.role = 'RIDER';
            socket.join('riders:online');
        }
    });

    socket.on('join:ride', ({ rideId }) => {
        if (rideId) socket.join(`ride:${rideId}`);
    });

    socket.on('leave:ride', ({ rideId }) => {
        if (rideId) socket.leave(`ride:${rideId}`);
    });

    socket.on('driver:location', ({ driverId, lat, lng }) => {
        if (!driverId || typeof lat !== 'number' || typeof lng !== 'number') return;
        const entry = onlineDrivers.get(driverId) || { socketIds: new Set(), location: null, lastUpdate: 0 };

        // Throttle: max 1 update per second to prevent flooding
        const now = Date.now();
        if (now - (entry.lastUpdate || 0) < 1000) return;

        entry.location = { lat, lng, updatedAt: new Date() };
        entry.lastUpdate = now;
        onlineDrivers.set(driverId, entry);
        io.to('riders:online').emit('nearby:driver:update', { driverId, lat, lng });
    });

    socket.on('driver:offline', ({ driverId }) => {
        if (!driverId) return;
        onlineDrivers.delete(driverId);
        io.to('riders:online').emit('nearby:driver:remove', { driverId });
    });

    socket.on('rider:search', ({ rideId, riderId, pickup, dropoff, fare, isPooled }) => {
        if (!rideId || !pickup || !pickup.lat || !pickup.lng) return;
        socket.data.searchRideId = rideId;

        // Don't broadcast individual pooled rides to drivers via rider:search.
        // Pooled rides are sent to drivers as a combined "2 riders" request
        // after BOTH riders accept the pool proposal (via confirmPoolMatch → ride:request).
        if (isPooled) return;

        const NEARBY_RADIUS_KM = 6;
        const payload = { rideId, riderId, pickup, dropoff, fare, isPooled };

        // Send only to drivers within radius instead of broadcasting to all
        for (const [driverId, entry] of onlineDrivers.entries()) {
            if (!entry.location || typeof entry.location.lat !== 'number') {
                // Driver has no GPS yet, skip
                continue;
            }
            const dist = getDistanceKm(entry.location.lat, entry.location.lng, pickup.lat, pickup.lng);
            if (dist !== null && dist <= NEARBY_RADIUS_KM) {
                // Emit to each socket this driver has
                for (const sid of entry.socketIds) {
                    io.to(sid).emit('nearby:rider:update', payload);
                }
            }
        }
    });

    socket.on('rider:search:stop', ({ rideId }) => {
        if (rideId) io.to('drivers:online').emit('nearby:rider:remove', { rideId });
        // Clear pool search timeout if rider stops searching
        const pst = poolSearchTimeouts.get(rideId);
        if (pst) { clearTimeout(pst.timeout); poolSearchTimeouts.delete(rideId); }
    });

    // ─── Pool Proposal: Rider Accepts ───
    socket.on('pool:accept', ({ proposalId, riderId }) => {
        const proposal = pendingPoolProposals.get(proposalId);
        if (!proposal) return;

        const riderAId = String(proposal.riderAId);
        const riderBId = String(proposal.riderBId);
        const rId = String(riderId);

        if (rId === riderAId) proposal.riderAAccepted = true;
        else if (rId === riderBId) proposal.riderBAccepted = true;
        else return;

        console.log(`✅ Pool proposal ${proposalId}: rider ${rId} accepted (A:${proposal.riderAAccepted}, B:${proposal.riderBAccepted})`);

        // If BOTH accepted → confirm pool
        if (proposal.riderAAccepted && proposal.riderBAccepted) {
            clearTimeout(proposal.timeout);
            pendingPoolProposals.delete(proposalId);
            confirmPoolMatch(proposal, io);
        }
    });

    // ─── Pool Proposal: Rider Rejects ───
    socket.on('pool:reject', ({ proposalId, riderId }) => {
        const proposal = pendingPoolProposals.get(proposalId);
        if (!proposal) return;

        clearTimeout(proposal.timeout);
        pendingPoolProposals.delete(proposalId);

        const riderAId = String(proposal.riderAId);
        const riderBId = String(proposal.riderBId);

        console.log(`❌ Pool proposal ${proposalId}: rider ${riderId} rejected`);

        // Notify both riders that pool was rejected
        io.to(`user:${riderAId}`).emit('pool:rejected', { proposalId, message: 'Pool match declined. Continuing search...' });
        io.to(`user:${riderBId}`).emit('pool:rejected', { proposalId, message: 'Pool match declined. Continuing search...' });

        // Both rides continue searching — broadcast individual requests to nearby drivers
        broadcastIndividualRide(proposal.rideAId, io);
        broadcastIndividualRide(proposal.rideBId, io);
    });

    socket.on('disconnect', () => {
        if (socket.data && socket.data.role === 'DRIVER' && socket.data.userId) {
            const entry = onlineDrivers.get(socket.data.userId);
            if (entry && entry.socketIds) {
                entry.socketIds.delete(socket.id);
                if (entry.socketIds.size === 0) {
                    onlineDrivers.delete(socket.data.userId);
                    io.to('riders:online').emit('nearby:driver:remove', { driverId: socket.data.userId });
                }
            }
        }
        if (socket.data && socket.data.role === 'RIDER' && socket.data.searchRideId) {
            io.to('drivers:online').emit('nearby:rider:remove', { rideId: socket.data.searchRideId });
        }
    });
});

// ─── Helper: Confirm pool match after both riders accept ───
async function confirmPoolMatch(proposal, io) {
    try {
        const { groupId, rideAId, rideBId, riderAId, riderBId, riderAFare, riderBFare } = proposal;

        const rideA = await Ride.findById(rideAId);
        const rideB = await Ride.findById(rideBId);
        if (!rideA || !rideB) {
            console.error('❌ confirmPoolMatch: One or both rides not found');
            return;
        }

        // Save pool group ID and fares to DB
        rideA.poolGroupId = groupId;
        rideA.currentFare = riderAFare;
        await rideA.save();

        rideB.poolGroupId = groupId;
        rideB.currentFare = riderBFare;
        await rideB.save();

        console.log(`🤝 Pool confirmed! Group ${groupId}: Rider ${riderAId} ↔ Rider ${riderBId}`);
        console.log(`💰 Pool fares: ₹${riderAFare} + ₹${riderBFare}`);

        // Clear pool search timeouts for both rides
        for (const rideId of [rideAId.toString(), rideBId.toString()]) {
            const pst = poolSearchTimeouts.get(rideId);
            if (pst) { clearTimeout(pst.timeout); poolSearchTimeouts.delete(rideId); }
        }

        // Notify both riders that pool is confirmed
        const riderAUser = await User.findById(riderAId).select('firstName lastName');
        const riderBUser = await User.findById(riderBId).select('firstName lastName');

        io.to(`user:${riderAId}`).emit('pool:confirmed', {
            poolGroupId: groupId,
            matchedRider: {
                name: `${riderBUser?.firstName || 'Rider'} ${riderBUser?.lastName || ''}`.trim(),
                pickup: rideB.pickup,
                dropoff: rideB.dropoff
            },
            rideId: rideAId,
            originalFare: rideA.fare,
            poolFare: riderAFare,
            message: 'Pool confirmed! Searching for a driver...'
        });

        io.to(`user:${riderBId}`).emit('pool:confirmed', {
            poolGroupId: groupId,
            matchedRider: {
                name: `${riderAUser?.firstName || 'Rider'} ${riderAUser?.lastName || ''}`.trim(),
                pickup: rideA.pickup,
                dropoff: rideA.dropoff
            },
            rideId: rideBId,
            originalFare: rideB.fare,
            poolFare: riderBFare,
            message: 'Pool confirmed! Searching for a driver...'
        });


        // Now broadcast consolidated pool ride request to nearby drivers
        const RIDE_BROADCAST_RADIUS_KM = 6;

        const poolPayload = {
            rideId: rideB._id.toString(),
            pickup: rideB.pickup,
            dropoff: rideB.dropoff,
            fare: riderAFare + riderBFare,
            currentFare: riderAFare + riderBFare,
            isPooled: true,
            poolGroupId: groupId,
            routeIndex: rideB.routeIndex,
            bookingTime: rideB.bookingTime,
            poolGroupRiders: [
                {
                    name: `${riderAUser?.firstName || 'Rider'} ${riderAUser?.lastName || ''}`.trim(),
                    pickup: rideA.pickup,
                    dropoff: rideA.dropoff,
                    rideId: rideA._id.toString()
                },
                {
                    name: `${riderBUser?.firstName || 'Rider'} ${riderBUser?.lastName || ''}`.trim(),
                    pickup: rideB.pickup,
                    dropoff: rideB.dropoff,
                    rideId: rideB._id.toString()
                }
            ]
        };

        if (rideB.pickup && typeof rideB.pickup.lat === 'number' && typeof rideB.pickup.lng === 'number') {
            let sentCount = 0;
            for (const [driverId, entry] of onlineDrivers.entries()) {
                if (!entry.location || typeof entry.location.lat !== 'number') continue;
                const dist = getDistanceKm(entry.location.lat, entry.location.lng, rideB.pickup.lat, rideB.pickup.lng);
                if (dist !== null && dist <= RIDE_BROADCAST_RADIUS_KM) {
                    for (const sid of entry.socketIds) {
                        io.to(sid).emit('ride:request', poolPayload);
                    }
                    sentCount++;
                }
            }
            console.log(`🤝 Pool ride:request sent to ${sentCount} nearby drivers (${poolPayload.poolGroupRiders.length} riders, ₹${poolPayload.fare})`);
        } else {
            io.to('drivers:online').emit('ride:request', poolPayload);
        }
    } catch (err) {
        console.error('❌ confirmPoolMatch error:', err);
    }
}

// ─── Helper: Re-broadcast individual ride request to nearby drivers ───
async function broadcastIndividualRide(rideId, io) {
    try {
        const ride = await Ride.findById(rideId);
        if (!ride || ride.status !== 'SEARCHING') return;

        const RIDE_BROADCAST_RADIUS_KM = 6;
        const ridePayload = {
            rideId: ride._id,
            pickup: ride.pickup,
            dropoff: ride.dropoff,
            fare: ride.fare,
            currentFare: ride.currentFare || ride.fare,
            isPooled: ride.isPooled,
            poolGroupId: null,
            routeIndex: ride.routeIndex,
            bookingTime: ride.bookingTime
        };

        if (ride.pickup && typeof ride.pickup.lat === 'number' && typeof ride.pickup.lng === 'number') {
            let sentCount = 0;
            for (const [driverId, entry] of onlineDrivers.entries()) {
                if (!entry.location || typeof entry.location.lat !== 'number') continue;
                const dist = getDistanceKm(entry.location.lat, entry.location.lng, ride.pickup.lat, ride.pickup.lng);
                if (dist !== null && dist <= RIDE_BROADCAST_RADIUS_KM) {
                    for (const sid of entry.socketIds) {
                        io.to(sid).emit('ride:request', ridePayload);
                    }
                    sentCount++;
                }
            }
            console.log(`📡 Re-broadcast ride ${rideId} to ${sentCount} nearby drivers`);
        } else {
            io.to('drivers:online').emit('ride:request', ridePayload);
        }
    } catch (err) {
        console.error('❌ broadcastIndividualRide error:', err);
    }
}

const OLA_API_KEY = process.env.OLA_MAPS_API_KEY;


// ✅ OLA Maps Autocomplete Proxy
/**
 * @swagger
 * /api/ola/autocomplete:
 *   get:
 *     summary: Local proxy for OLA Maps Autocomplete
 *     tags: [OlaMaps]
 *     parameters:
 *       - in: query
 *         name: input
 *         schema:
 *           type: string
 *         required: true
 *         description: Text input to search for
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Bias location (lat,lng)
 *     responses:
 *       200:
 *         description: Autocomplete predictions
 *       400:
 *         description: Missing input
 *       500:
 *         description: OLA API error
 */
app.get('/api/ola/autocomplete', async (req, res) => {
    try {
        const { input, location } = req.query;

        if (!input) {
            return res.status(400).json({ error: 'Input query required' });
        }

        if (!OLA_API_KEY) {
            return res.status(500).json({ error: 'OLA_MAPS_API_KEY not configured' });
        }

        let url = `https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(input)}&api_key=${OLA_API_KEY}`;

        // Add location bias if provided
        if (location) {
            url += `&location=${location}`;
        }

        console.log(`📍 OLA Autocomplete: ${input}`);
        const response = await axios.get(url);
        res.json(response.data);

    } catch (error) {
        console.error('❌ OLA Autocomplete error:', (error.response && error.response.data) || error.message);
        res.status(500).json({
            error: 'Failed to fetch autocomplete',
            details: (error.response && error.response.data) || error.message
        });
    }
});

// ✅ OLA Maps Directions Proxy (with multi-stop waypoints support)
/**
 * @swagger
 * /api/ola/directions:
 *   post:
 *     summary: Local proxy for OLA Maps Directions
 *     tags: [OlaMaps]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - origin
 *               - destination
 *             properties:
 *               origin:
 *                 type: string
 *                 description: Origin coordinates (lat,lng)
 *               destination:
 *                 type: string
 *                 description: Destination coordinates (lat,lng)
 *               waypoints:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of waypoint coordinates
 *     responses:
 *       200:
 *         description: Route directions
 *       400:
 *         description: Missing param
 *       500:
 *         description: OLA API error
 */
app.post('/api/ola/directions', async (req, res) => {
    try {
        const { origin, destination, alternatives, waypoints } = req.body;

        if (!origin || !destination) {
            return res.status(400).json({ error: 'Origin and destination required' });
        }

        if (!OLA_API_KEY) {
            return res.status(500).json({ error: 'OLA_MAPS_API_KEY not configured' });
        }

        let url = `https://api.olamaps.io/routing/v1/directions?origin=${origin}&destination=${destination}&alternatives=${alternatives || false}&steps=true&overview=full&language=en&traffic_metadata=true&api_key=${OLA_API_KEY}`;

        // Add waypoints for multi-stop rides (format: "lat,lng|lat,lng")
        if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
            url += `&waypoints=${waypoints.join('|')}`;
        }

        console.log(`🗺️ OLA Directions: ${origin} → ${destination}${waypoints ? ` via ${waypoints.length} stops` : ''}`);
        const response = await axios.post(url);
        res.json(response.data);

    } catch (error) {
        console.error('❌ OLA Directions error:', (error.response && error.response.data) || error.message);
        res.status(500).json({
            error: 'Failed to fetch directions',
            details: (error.response && error.response.data) || error.message
        });
    }
});

// ✅ OLA Maps Reverse Geocode Proxy
/**
 * @swagger
 * /api/ola/reverse-geocode:
 *   get:
 *     summary: Local proxy for OLA Maps Reverse Geocode
 *     tags: [OlaMaps]
 *     parameters:
 *       - in: query
 *         name: latlng
 *         schema:
 *           type: string
 *         required: true
 *         description: Coordinates (lat,lng)
 *     responses:
 *       200:
 *         description: Geocoded address
 *       400:
 *         description: Missing latlng
 *       500:
 *         description: OLA API error
 */
app.get('/api/ola/reverse-geocode', async (req, res) => {
    try {
        const { latlng } = req.query;

        if (!latlng) {
            return res.status(400).json({ error: 'latlng parameter required (format: lat,lng)' });
        }

        if (!OLA_API_KEY) {
            return res.status(500).json({ error: 'OLA_MAPS_API_KEY not configured' });
        }

        const url = `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${latlng}&api_key=${OLA_API_KEY}`;

        console.log(`📍 OLA Reverse Geocode: ${latlng}`);
        const response = await axios.get(url);
        res.json(response.data);

    } catch (error) {
        console.error('❌ OLA Reverse Geocode error:', (error.response && error.response.data) || error.message);
        res.status(500).json({
            error: 'Failed to reverse geocode',
            details: (error.response && error.response.data) || error.message
        });
    }
});

// Health check
/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Server health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Server is running
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'OLA Maps server running' });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(async () => {
            console.log('✅ Connected to MongoDB');
            // ─── Startup Cleanup: cancel ALL stale SEARCHING rides ───
            // When server restarts, any ride still in SEARCHING is stale
            try {
                // Cancel ALL old SEARCHING rides on server restart
                // Any ride still in SEARCHING from a previous server session is stale
                const result = await Ride.updateMany(
                    { status: 'SEARCHING' },
                    { $set: { status: 'CANCELED', canceledBy: 'SYSTEM', cancelReason: 'Server restart cleanup' } }
                );
                if (result.modifiedCount > 0) {
                    console.log(`🧹 Startup cleanup: canceled ${result.modifiedCount} stale SEARCHING rides`);
                }
            } catch (cleanupErr) {
                console.warn('⚠️  Startup cleanup error:', cleanupErr.message);
            }
        })
        .catch(err => console.error('❌ MongoDB error:', err));
} else {
    console.warn('⚠️ MONGODB_URI not set - database features will not work');
}

// User Routes
// User Routes

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: User login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [RIDER, DRIVER]
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exists:
 *                   type: boolean
 *                 user:
 *                   type: object
 *       500:
 *         description: Server error
 */
app.post('/api/login', async (req, res) => {
    try {
        const { email, phone, role } = req.body;
        let user;
        if (email) {
            user = await User.findOne({ email });
        } else if (phone && role) {
            user = await User.findOne({ phone, role });
        }
        res.json({ exists: !!user, user });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
});

/**
 * @swagger
 * /api/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *               - firstName
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [RIDER, DRIVER]
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: User already exists
 *       500:
 *         description: Server error
 */
app.post('/api/signup', async (req, res) => {
    try {
        const {
            role,
            email,
            phone,
            firstName,
            lastName,
            dob,
            gender,
            license,
            aadhar,
            authProvider,
            vehicleMake,
            vehicleModel,
            vehicleNumber,
            rating,
            photoUrl,
            accessibilitySupport,
            licenseUrl,
            aadharUrl
        } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists with this email' });
        }

        const driverDefaults = role === 'DRIVER' ? {
            vehicleMake: vehicleMake || 'Tata',
            vehicleModel: vehicleModel || 'Nexon',
            vehicleNumber: vehicleNumber || 'TN 37 AB 1234',
            rating: rating || 4.8,
            photoUrl: photoUrl || `https://i.pravatar.cc/150?u=${email}`
        } : {};

        user = new User({ role, email, phone, firstName, lastName, dob, gender, license, aadhar, ...driverDefaults });
        await user.save();
        res.status(201).json({ message: 'User created and verified', user });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup' });
    }
});

// --- Email OTP Endpoints ---
/**
 * @swagger
 * /api/send-otp:
 *   post:
 *     summary: Send OTP to email
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent
 *       400:
 *         description: Missing email
 *       500:
 *         description: Failed to send
 */
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        otpStore.set(email, { otp, expiresAt });

        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #16a34a;">LeafLift</h2>
                <p>Your email verification code is:</p>
                <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${otp}</span>
                </div>
                <p style="color: #666; font-size: 14px;">This code expires in 5 minutes. Do not share it with anyone.</p>
            </div>
        `;

        if (process.env.OTP_EMAIL_USER && process.env.OTP_EMAIL_PASS) {
            await emailTransporter.sendMail({
                from: `"LeafLift" <${process.env.OTP_EMAIL_USER}>`,
                to: email,
                subject: 'LeafLift - Email Verification OTP',
                html: emailHtml,
            });
            console.log(`📧 OTP sent via SMTP to ${email}`);
        } else {
            console.log(`📧 [DEV] OTP for ${email}: ${otp}`);
        }

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

/**
 * @swagger
 * /api/verify-otp:
 *   post:
 *     summary: Verify email OTP
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified
 *       400:
 *         description: Invalid or expired OTP
 *       500:
 *         description: Server error
 */
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

        const stored = otpStore.get(email);
        if (!stored) return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
        if (Date.now() > stored.expiresAt) {
            otpStore.delete(email);
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }
        if (stored.otp !== otp) return res.status(400).json({ message: 'Invalid OTP. Please try again.' });

        otpStore.delete(email);
        res.json({ message: 'OTP verified successfully', verified: true });
    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ message: 'Failed to verify OTP' });
    }
});

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of users
 */
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// Duplicate route removed (merged into lower handler)

/**
 * @swagger
 * /api/users/{userId}/privacy:
 *   put:
 *     summary: Update privacy settings
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               privacySettings:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated user
 */
app.put('/api/users/:userId/privacy', async (req, res) => {
    try {
        const { privacySettings } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { privacySettings },
            { new: true }
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        console.error('Update privacy settings error:', error);
        res.status(500).json({ message: 'Error updating privacy settings' });
    }
});

// Get single user by ID
/**
 * @swagger
 * /api/users/{userId}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 */
app.get('/api/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user' });
    }
});

// Update user profile
/**
 * @swagger
 * /api/users/{userId}:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               gender:
 *                 type: string
 *               photoUrl:
 *                 type: string
 *               accessibilitySupport:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Updated user
 */
app.put('/api/users/:userId', async (req, res) => {
    try {
        const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'dob', 'gender', 'photoUrl', 'license', 'aadhar', 'vehicleMake', 'vehicleModel', 'vehicleNumber', 'accessibilitySupport'];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        }
        const user = await User.findByIdAndUpdate(req.params.userId, updates, { new: true, runValidators: true });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Error updating user' });
    }
});

// ── Driver Daily Route ──
/**
 * @swagger
 * /api/driver/route:
 *   post:
 *     summary: Update driver daily route
 *     tags: [Users]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - source
 *               - destination
 *     responses:
 *       200:
 *         description: Route updated
 */
app.post('/api/driver/route', async (req, res) => {
    console.log('📬 Received route update request:', JSON.stringify(req.body, null, 2));
    try {
        const { userId, source, destination, isActive, genderPreference } = req.body;
        const existingUser = await User.findById(userId);
        if (!existingUser) return res.status(404).json({ message: 'User not found' });

        const dailyRoute = {
            source: {
                address: source.address,
                lat: Number(source.lat),
                lng: Number(source.lng)
            },
            destination: {
                address: destination.address,
                lat: Number(destination.lat),
                lng: Number(destination.lng)
            },
            isActive: isActive !== undefined ? isActive : true,
            genderPreference: genderPreference || 'Any'
        };

        const updatedUser = await User.findByIdAndUpdate(
            userId, { dailyRoute }, { new: true, runValidators: false }
        );

        if (!updatedUser) return res.status(404).json({ message: 'User not found' });

        console.log('✅ Route updated successfully for user:', userId);
        res.json({ message: 'Route updated', dailyRoute: updatedUser.dailyRoute });
    } catch (error) {
        console.error('❌ Update route error:', error);
        res.status(500).json({ message: 'Error updating route', error: error.message });
    }
});

/**
 * @swagger
 * /api/rides:
 *   get:
 *     summary: Get user's ride history
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of rides
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ride'
 */
app.get('/api/rides', authenticateToken, async (req, res) => {
    try {
        // This endpoint is intended to get the authenticated user's ride history.
        // The `pickupLat`, `pickupLng`, `dropoffLat`, `dropoffLng` parameters
        // are typically used for matching drivers, not for fetching a user's ride history.
        // Assuming the JSDoc summary "Get user's ride history" is the correct intent,
        // this implementation should fetch rides associated with the authenticated user.
        // If the intent was to match drivers, this endpoint's path and JSDoc would be different.

        // For now, returning an empty array or an error as the provided code snippet
        // for this specific endpoint is incomplete and contradictory to its JSDoc summary.
        // A proper implementation would involve getting the userId from the authenticated token
        // and querying the database for rides associated with that userId.
        return res.status(501).json({ message: 'This endpoint is not yet fully implemented for fetching user ride history. Please use /api/rides/user/:userId for now.' });
    } catch (error) {
        console.error('Error fetching user rides:', error);
        res.status(500).json({ message: 'Error fetching user rides' });
    }
});

/**
 * @swagger
 * /api/rider/match-driver:
 *   get:
 *     summary: Find matching drivers for daily route
 *     tags: [Rides]
 *     parameters:
 *       - in: query
 *         name: pickupLat
 *         schema:
 *           type: number
 *         required: true
 *       - in: query
 *         name: pickupLng
 *         schema:
 *           type: number
 *         required: true
 *       - in: query
 *         name: dropoffLat
 *         schema:
 *           type: number
 *         required: true
 *       - in: query
 *         name: dropoffLng
 *         schema:
 *           type: number
 *         required: true
 *     responses:
 *       200:
 *         description: List of matching drivers
 */
app.get('/api/rider/match-driver', async (req, res) => {
    try {
        const { pickupLat, pickupLng, dropoffLat, dropoffLng } = req.query;
        if (!pickupLat || !pickupLng || !dropoffLat || !dropoffLng) {
            return res.status(400).json({ message: 'Missing coordinates' });
        }

        const pLat = Number(pickupLat);
        const pLng = Number(pickupLng);
        const dLat = Number(dropoffLat);
        const dLng = Number(dropoffLng);

        // Find drivers with active daily routes matching the rider's request
        const drivers = await User.find({
            role: 'DRIVER',
            'dailyRoute.isActive': true
        });

        const matches = drivers.filter(driver => {
            const route = driver.dailyRoute;
            if (!route || !route.source || !route.destination) return false;

            // Check pickup proximity (within 5km of driver source)
            const pickupDist = getDistanceKm(pLat, pLng, route.source.lat, route.source.lng);
            // Check dropoff proximity (within 5km of driver destination)
            const dropoffDist = getDistanceKm(dLat, dLng, route.destination.lat, route.destination.lng);

            // Check accessibility support if rider requested it
            const reqAccessibility = req.query.accessibilityOptions ? req.query.accessibilityOptions.split(',') : [];
            if (reqAccessibility.length > 0) {
                const supportsAll = reqAccessibility.every(opt => (driver.accessibilitySupport || []).includes(opt));
                if (!supportsAll) return false;
            }

            // Gender preference filtering (Bidirectional)
            const riderGenderPref = req.query.genderPreference;
            const riderGender = req.query.riderGender;

            // 1. Check Rider's preference vs Driver's gender
            if (riderGenderPref && riderGenderPref !== 'Any') {
                const targetGender = riderGenderPref === 'Female only' ? 'Female' : 'Male';
                if (driver.gender !== targetGender) return false;
            }

            // 2. Check Driver's preference vs Rider's gender
            const driverGenPref = driver.dailyRoute?.genderPreference;
            if (driverGenPref && driverGenPref !== 'Any') {
                const targetGender = driverGenPref === 'Female only' ? 'Female' : 'Male';
                if (riderGender && riderGender !== targetGender) return false;
            }

            return pickupDist <= 5 && dropoffDist <= 5;
        });

        res.json(matches.map(d => ({
            id: d._id,
            name: [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || 'Driver',
            rating: d.rating || 4.8,
            vehicle: [d.vehicleMake || '', d.vehicleModel || ''].filter(Boolean).join(' ') || 'Car',
            vehicleNumber: d.vehicleNumber,
            photoUrl: d.photoUrl,
            phone: maskPhone(d.phone), // Ensure phone is masked
            dailyRoute: d.dailyRoute
        })));
    } catch (error) {
        console.error('Match driver error:', error);
        res.status(500).json({ message: 'Error matching drivers' });
    }
});

// ── Bridge: Admin → Driver real-time push ──
/**
 * @swagger
 * /api/internal/push-notification:
 *   post:
 *     summary: Internal endpoint to push socket notifications
 *     tags: [System]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [driver-alert, notification, broadcast]
 *               driverId:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Notification pushed
 */
app.post('/api/internal/push-notification', (req, res) => {
    try {
        const { type, driverId, notification, zone, message, title, count } = req.body;

        if (type === 'driver-alert') {
            // Broadcast surge/zone alert to ALL online drivers
            io.to('drivers:online').emit('notification:new', {
                _id: notification?._id || Date.now().toString(),
                title: zone || 'Surge Alert',
                message: message || 'High demand in your area!',
                type: 'SYSTEM',
                createdAt: new Date(),
            });
            console.log('[Bridge] driver-alert pushed to drivers:online');
        } else if (type === 'notification' && driverId) {
            // Push to a specific driver
            io.to(`user:${driverId}`).emit('notification:new', notification);
            console.log(`[Bridge] notification pushed to user:${driverId}`);
        } else if (type === 'broadcast') {
            // Broadcast to ALL online drivers
            io.to('drivers:online').emit('notification:new', {
                _id: Date.now().toString(),
                title: title || 'Admin Broadcast',
                message: message || '',
                type: 'SYSTEM',
                createdAt: new Date(),
            });
            console.log(`[Bridge] broadcast pushed to drivers:online (${count || '?'} drivers)`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('[Bridge] push-notification error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Notifications ──
/**
 * @swagger
 * /api/notifications/{userId}:
 *   get:
 *     summary: Get user notifications
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of notifications
 */
app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

/**
 * @swagger
 * /api/notifications/{id}/read:
 *   post:
 *     summary: Mark notification as read
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Marked as read
 */
app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Error marking notification as read' });
    }
});

/**
 * @swagger
 * /api/notifications/sent/{userId}:
 *   get:
 *     summary: Get notifications sent by user
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of sent notifications
 */
app.get('/api/notifications/sent/:userId', async (req, res) => {
    try {
        const notifications = await Notification.find({ fromId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sent requests' });
    }
});

// ── Daily Route Join Request ──
/**
 * @swagger
 * /api/rider/request-daily-join:
 *   post:
 *     summary: Request to join a driver's daily route
 *     tags: [Rides]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - riderId
 *               - driverId
 *               - pickup
 *               - dropoff
 *     responses:
 *       200:
 *         description: Request sent
 */
app.post('/api/rider/request-daily-join', async (req, res) => {
    console.log('📬 Daily join request received:', JSON.stringify(req.body, null, 2));
    try {
        const { riderId, driverId, pickup, dropoff } = req.body;

        if (!riderId || !driverId || !pickup || !dropoff) {
            console.error('❌ Missing fields in join request');
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const rider = await User.findById(riderId);
        if (!rider) {
            console.error('❌ Rider not found:', riderId);
            return res.status(404).json({ message: 'Rider not found' });
        }

        const pickupAddr = pickup.address || 'Unknown Pickup';
        const dropoffAddr = dropoff.address || 'Unknown Dropoff';

        const notification = new Notification({
            userId: driverId,
            fromId: riderId,
            title: 'New Daily Route Partner?',
            message: `${rider.firstName} wants to join your daily route from ${pickupAddr.split(',')[0]} to ${dropoffAddr.split(',')[0]}.`,
            type: 'DAILY_JOIN_REQUEST',
            data: { riderId, pickup, dropoff }
        });

        await notification.save();
        console.log('✅ Notification saved for driver:', driverId);

        if (io) {
            io.to(`user:${driverId}`).emit('notification:new', notification);
            console.log('📡 Socket notification emitted to:', `user:${driverId}`);
        }

        res.json({ message: 'Request sent successfully', notification });
    } catch (error) {
        console.error('❌ Request daily join error:', error);
        res.status(500).json({ message: 'Error sending join request', error: error.message });
    }
});

// Ride Routes
/**
 * @swagger
 * components:
 *   schemas:
 *     Location:
 *       type: object
 *       properties:
 *         lat:
 *           type: number
 *         lng:
 *           type: number
 *         address:
 *           type: string
 *     Ride:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         riderId:
 *           type: string
 *         pickup:
 *           $ref: '#/components/schemas/Location'
 *         dropoff:
 *           $ref: '#/components/schemas/Location'
 *         status:
 *           type: string
 *           enum: [REQUESTED, SEARCHING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED]
 *         fare:
 *           type: number
 *         isPooled:
 *           type: boolean
 */

/**
 * @swagger
 * /api/rides:
 *   post:
 *     summary: Request a new ride
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - pickup
 *               - dropoff
 *             properties:
 *               pickup:
 *                 $ref: '#/components/schemas/Location'
 *               dropoff:
 *                 $ref: '#/components/schemas/Location'
 *               isPooled:
 *                 type: boolean
 *               passengerCount:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Ride created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ride'
 *       400:
 *         description: Active ride already exists
 *       500:
 *         description: Server error
 */
app.post('/api/rides', async (req, res) => {
    try {
        const payload = { ...req.body };

        if (!payload.userId) {
            return res.status(400).json({ message: 'userId is required' });
        }

        if (payload.bookingTime) {
            const parsed = new Date(payload.bookingTime);
            payload.bookingTime = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
        }

        if (!payload.currentFare && payload.fare) {
            payload.currentFare = payload.fare;
        }

        // ─── For pooled rides: fetch route polyline from OLA Maps ───
        if (payload.isPooled && payload.pickup?.lat && payload.pickup?.lng && payload.dropoff?.lat && payload.dropoff?.lng) {
            try {
                const origin = `${payload.pickup.lat},${payload.pickup.lng}`;
                const destination = `${payload.dropoff.lat},${payload.dropoff.lng}`;
                const url = `https://api.olamaps.io/routing/v1/directions?origin=${origin}&destination=${destination}&alternatives=false&steps=false&overview=full&language=en&api_key=${OLA_API_KEY}`;
                const routeResp = await axios.post(url);
                if (routeResp.data?.routes?.[0]?.overview_polyline) {
                    payload.routePolyline = routeResp.data.routes[0].overview_polyline;
                    console.log(`✅ Pool ride polyline fetched for rider ${payload.userId}`);
                }
            } catch (err) {
                console.warn('⚠️  Could not fetch polyline for pool ride:', err.message);
            }
        }

        const ride = new Ride(payload);
        await ride.save();
        console.log(`📝 Ride created: ${ride._id} | isPooled=${ride.isPooled} | status=${ride.status} | category=${ride.vehicleCategory} | pickup=${ride.pickup?.lat?.toFixed(4)},${ride.pickup?.lng?.toFixed(4)} | dropoff=${ride.dropoff?.lat?.toFixed(4)},${ride.dropoff?.lng?.toFixed(4)}`);

        // ─── Pool Matching: find other SEARCHING pooled rides with nearby pickup/dropoff ───
        let poolMatch = null;
        const POOL_PICKUP_RADIUS_KM = 10;   // Generous 10km pickup radius
        const POOL_DROPOFF_RADIUS_KM = 20;  // Generous 20km dropoff radius
        if (ride.isPooled && ride.pickup?.lat && ride.dropoff?.lat) {
            try {
                // Find ALL other SEARCHING pooled rides (no vehicle category or polyline restriction)
                const candidateRides = await Ride.find({
                    _id: { $ne: ride._id },
                    status: 'SEARCHING',
                    isPooled: true,
                    'pickup.lat': { $exists: true },
                    'dropoff.lat': { $exists: true }
                }).populate('userId', 'firstName lastName email phone');

                console.log(`🔍 Pool matching: found ${candidateRides.length} candidate rides for rider ${ride.userId}`);

                for (const candidate of candidateRides) {
                    const pickupDist = getDistanceKm(
                        ride.pickup.lat, ride.pickup.lng,
                        candidate.pickup.lat, candidate.pickup.lng
                    );
                    const dropoffDist = getDistanceKm(
                        ride.dropoff.lat, ride.dropoff.lng,
                        candidate.dropoff.lat, candidate.dropoff.lng
                    );

                    console.log(`  📏 Candidate ${candidate._id}: pickup dist=${pickupDist?.toFixed(2)}km, dropoff dist=${dropoffDist?.toFixed(2)}km`);

                    if (pickupDist !== null && dropoffDist !== null &&
                        pickupDist <= POOL_PICKUP_RADIUS_KM &&
                        dropoffDist <= POOL_DROPOFF_RADIUS_KM) {
                        poolMatch = candidate;
                        console.log(`  ✅ MATCHED! Rider ${ride.userId} ↔ Rider ${candidate.userId._id || candidate.userId}`);
                        break;
                    }
                }

                if (poolMatch) {
                    // ─── Pool Proposal (don't auto-confirm — ask both riders first) ───
                    const proposalId = crypto.randomUUID();
                    const groupId = crypto.randomUUID();

                    // Calculate proposed pool fares (35% discount)
                    const newRiderPoolFare = Math.round((ride.currentFare || ride.fare) * 0.65);
                    const existingRiderPoolFare = Math.round((poolMatch.currentFare || poolMatch.fare) * 0.65);

                    // Fetch both riders' info (including gender)
                    const newRider = await User.findById(ride.userId).select('firstName lastName gender');
                    const existingRiderId = poolMatch.userId._id || poolMatch.userId;
                    const existingRiderUser = poolMatch.userId.firstName ? poolMatch.userId : await User.findById(existingRiderId).select('firstName lastName gender');

                    // Store pending proposal (don't save to DB yet)
                    const proposal = {
                        proposalId,
                        groupId,
                        rideAId: poolMatch._id,
                        rideBId: ride._id,
                        riderAId: existingRiderId,
                        riderBId: ride.userId,
                        riderAAccepted: false,
                        riderBAccepted: false,
                        riderAFare: existingRiderPoolFare,
                        riderBFare: newRiderPoolFare,
                        rideA: poolMatch,
                        rideB: ride,
                        createdAt: Date.now(),
                        timeout: null
                    };

                    // 60-second auto-reject timeout
                    proposal.timeout = setTimeout(() => {
                        pendingPoolProposals.delete(proposalId);
                        console.log(`⏰ Pool proposal ${proposalId} expired (60s timeout)`);
                        io.to(`user:${existingRiderId}`).emit('pool:rejected', { proposalId, message: 'Pool match expired. Continuing search...' });
                        io.to(`user:${ride.userId}`).emit('pool:rejected', { proposalId, message: 'Pool match expired. Continuing search...' });
                        // Re-broadcast individual rides
                        broadcastIndividualRide(poolMatch._id, io);
                        broadcastIndividualRide(ride._id, io);
                    }, 60000);

                    pendingPoolProposals.set(proposalId, proposal);

                    console.log(`🤝 Pool proposal sent! ${proposalId}: Rider ${ride.userId} ↔ Rider ${existingRiderId}`);
                    console.log(`💰 Proposed fares: ₹${newRiderPoolFare} + ₹${existingRiderPoolFare} (was ₹${ride.fare} + ₹${poolMatch.fare})`);

                    // Send proposal to existing rider (Rider A)
                    io.to(`user:${existingRiderId}`).emit('pool:proposal', {
                        proposalId,
                        matchedRider: {
                            name: `${newRider?.firstName || 'Rider'} ${newRider?.lastName || ''}`.trim(),
                            gender: newRider?.gender || 'Not specified',
                            pickup: ride.pickup,
                            dropoff: ride.dropoff
                        },
                        rideId: poolMatch._id,
                        originalFare: poolMatch.fare,
                        poolFare: existingRiderPoolFare,
                        message: `${newRider?.firstName || 'A rider'} wants to pool with you!`
                    });

                    // Send proposal to new rider (Rider B)
                    const matchedRiderName = `${existingRiderUser?.firstName || 'Rider'} ${existingRiderUser?.lastName || ''}`.trim();
                    io.to(`user:${ride.userId}`).emit('pool:proposal', {
                        proposalId,
                        matchedRider: {
                            name: matchedRiderName,
                            gender: existingRiderUser?.gender || 'Not specified',
                            pickup: poolMatch.pickup,
                            dropoff: poolMatch.dropoff
                        },
                        rideId: ride._id,
                        originalFare: ride.fare,
                        poolFare: newRiderPoolFare,
                        message: `Matched with ${matchedRiderName} for pooling!`
                    });

                    // Remove both riders' individual requests from drivers while proposal is pending
                    io.to('drivers:online').emit('nearby:rider:remove', { rideId: poolMatch._id.toString() });
                    io.to('drivers:online').emit('nearby:rider:remove', { rideId: ride._id.toString() });

                    // Start 5-minute overall pool search timeout for the new rider
                    if (!poolSearchTimeouts.has(ride._id.toString())) {
                        const pst = setTimeout(() => {
                            poolSearchTimeouts.delete(ride._id.toString());
                            io.to(`user:${ride.userId}`).emit('pool:timeout', {
                                rideId: ride._id,
                                message: 'No pool matches found in 5 minutes. Try a solo ride?'
                            });
                        }, 5 * 60 * 1000);
                        poolSearchTimeouts.set(ride._id.toString(), { timeout: pst, userId: ride.userId });
                    }
                }
            } catch (err) {
                console.error('⚠️  Pool matching error:', err);
            }
        }

        // ─── Broadcast ride request to nearby drivers ───
        const RIDE_BROADCAST_RADIUS_KM = 6;

        // NEVER broadcast pooled rides to drivers directly.
        // Pooled rides only reach drivers via confirmPoolMatch() after both riders accept.
        // Solo/non-pooled rides are broadcast immediately.
        if (!poolMatch && !ride.isPooled) {
            // No pool match — broadcast normal individual request
            const ridePayload = {
                rideId: ride._id,
                pickup: ride.pickup,
                dropoff: ride.dropoff,
                fare: ride.fare,
                currentFare: ride.currentFare,
                isPooled: ride.isPooled,
                poolGroupId: ride.poolGroupId || null,
                routeIndex: ride.routeIndex,
                bookingTime: ride.bookingTime
            };
            // Send to drivers within radius
            for (const [driverId, entry] of onlineDrivers) {
                if (!entry.location) continue;
                const dist = getDistanceKm(ride.pickup.lat, ride.pickup.lng, entry.location.lat, entry.location.lng);
                if (dist !== null && dist <= RIDE_BROADCAST_RADIUS_KM) {
                    for (const sid of entry.socketIds) {
                        io.to(sid).emit('nearby:rider:update', ridePayload);
                    }
                }
            }
        }

        res.status(201).json(ride);
    } catch (error) {
        console.error('Create ride error:', error);
        res.status(500).json({ message: 'Error creating ride' });
    }
});

/**
 * @swagger
 * /api/rides/user/{userId}:
 *   get:
 *     summary: Get rider history
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of rides
 */
app.get('/api/rides/user/:userId', async (req, res) => {
    try {
        const rides = await Ride.find({ userId: req.params.userId }).sort({ bookingTime: -1, createdAt: -1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rides' });
    }
});

/**
 * @swagger
 * /api/rides/driver/{driverId}:
 *   get:
 *     summary: Get driver history
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: driverId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of rides
 */
app.get('/api/rides/driver/:driverId', async (req, res) => {
    try {
        const rides = await Ride.find({ driverId: req.params.driverId }).sort({ bookingTime: -1, createdAt: -1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rides' });
    }
});

// Nearby ride requests for drivers
/**
 * @swagger
 * /api/rides/nearby:
 *   get:
 *     summary: Get nearby available rides (Driver only)
 *     tags: [Rides]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         required: true
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         required: true
 *     responses:
 *       200:
 *         description: List of nearby rides
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Ride'
 */
app.get('/api/rides/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 6 } = req.query;
        // Only return rides created in the last 5 minutes to avoid stale requests
        const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
        const rides = await Ride.find({
            status: 'SEARCHING',
            createdAt: { $gte: staleThreshold }
        }).populate('userId', 'firstName lastName').sort({ bookingTime: -1 });

        // Auto-cancel old stale SEARCHING rides
        await Ride.updateMany(
            { status: 'SEARCHING', createdAt: { $lt: staleThreshold } },
            { $set: { status: 'CANCELED' } }
        );

        const latNum = lat ? Number(lat) : null;
        const lngNum = lng ? Number(lng) : null;
        const radiusNum = Number(radius) || 6;

        // Filter out rides that are in pending pool proposals (not yet confirmed)
        const nonPendingRides = rides.filter(ride => !isRideInPendingProposal(ride._id));

        let resultRides = nonPendingRides;
        if (latNum !== null && lngNum !== null) {
            resultRides = nonPendingRides.filter((ride) => {
                if (!ride.pickup || typeof ride.pickup.lat !== 'number') return false;
                const dist = getDistanceKm(latNum, lngNum, ride.pickup.lat, ride.pickup.lng);
                return dist !== null && dist <= radiusNum;
            });
        }

        // Group confirmed pool rides (those with a poolGroupId) into combined entries
        const poolGroups = new Map();
        const finalRides = [];
        for (const ride of resultRides) {
            if (ride.poolGroupId) {
                if (!poolGroups.has(ride.poolGroupId)) {
                    poolGroups.set(ride.poolGroupId, []);
                }
                poolGroups.get(ride.poolGroupId).push(ride);
            } else {
                finalRides.push(ride);
            }
        }

        // Convert pool groups into combined ride entries
        for (const [groupId, groupRides] of poolGroups.entries()) {
            const primaryRide = groupRides[0];
            const totalFare = groupRides.reduce((sum, r) => sum + (r.currentFare || r.fare || 0), 0);
            const combinedRide = {
                ...primaryRide.toObject(),
                fare: totalFare,
                currentFare: totalFare,
                isPooled: true,
                poolGroupId: groupId,
                poolGroupRiders: groupRides.map(r => {
                    const rUser = r.userId;
                    return {
                        name: rUser?.firstName ? `${rUser.firstName} ${rUser.lastName || ''}`.trim() : 'Rider',
                        pickup: r.pickup,
                        dropoff: r.dropoff,
                        rideId: r._id.toString()
                    };
                })
            };
            finalRides.push(combinedRide);
        }

        res.json(finalRides);
    } catch (error) {
        console.error('Error fetching nearby rides:', error);
        res.status(500).json({ message: 'Error fetching nearby rides', details: error.message });
    }
});

// ── Driver search by location (uses OLA geocoding) ──
/**
 * @swagger
 * /api/rides/nearby-by-location:
 *   get:
 *     summary: Get nearby rides by location name
 *     tags: [Rides]
 *     parameters:
 *       - in: query
 *         name: location
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: List of nearby rides
 */
app.get('/api/rides/nearby-by-location', async (req, res) => {
    try {
        const { location, radius = 6 } = req.query;
        if (!location) return res.status(400).json({ message: 'location query required' });

        let lat, lng;
        if (OLA_API_KEY) {
            try {
                const url = `https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(location)}&api_key=${OLA_API_KEY}`;
                const response = await axios.get(url);
                const preds = response.data && response.data.predictions;
                const first = preds && preds[0];
                if (first && first.geometry && first.geometry.location) {
                    lat = first.geometry.location.lat;
                    lng = first.geometry.location.lng;
                }
            } catch (e) {
                console.error('Geocode for driver search failed', e.message);
            }
        }

        if (typeof lat !== 'number' || typeof lng !== 'number') {
            return res.status(400).json({ message: 'Could not geocode location' });
        }

        const radiusNum = Number(radius) || 6;
        const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);
        const rides = await Ride.find({
            status: 'SEARCHING',
            createdAt: { $gte: staleThreshold }
        }).sort({ bookingTime: -1 });

        // Filter out rides in pending pool proposals
        const nonPendingRides = rides.filter(ride => !isRideInPendingProposal(ride._id));
        const filtered = nonPendingRides.filter((ride) => {
            if (!ride.pickup || typeof ride.pickup.lat !== 'number') return false;
            const dist = getDistanceKm(lat, lng, ride.pickup.lat, ride.pickup.lng);
            return dist !== null && dist <= radiusNum;
        });

        res.json(filtered);
    } catch (error) {
        res.status(500).json({ message: 'Error searching by location' });
    }
});

// ── Get Active Ride for Driver ──
/**
 * @swagger
 * /api/driver/{userId}/active-ride:
 *   get:
 *     summary: Get driver's active ride
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Active ride details
 */
app.get('/api/driver/:userId/active-ride', async (req, res) => {
    try {
        const ride = await Ride.findOne({
            driverId: req.params.userId,
            status: { $in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] }
        });
        if (!ride) return res.json({ ride: null });

        const driver = await User.findById(ride.driverId);
        const rider = await User.findById(ride.userId);

        res.json({
            ride,
            driver: driver ? {
                id: driver._id,
                name: `${driver.firstName} ${driver.lastName}`,
                rating: driver.rating || 4.8,
                vehicle: `${driver.vehicleMake || 'Car'} ${driver.vehicleModel || ''}`.trim(),
                vehicleNumber: driver.vehicleNumber || 'TN 37 AB 1234',
                photoUrl: driver.photoUrl || `https://i.pravatar.cc/150?u=${driver._id}`,
                isVerified: driver.isVerified,
                maskedPhone: maskPhone(driver.phone)
            } : null,
            rider: rider ? {
                id: rider._id,
                name: `${rider.firstName} ${rider.lastName}`,
                isVerified: rider.isVerified,
                maskedPhone: maskPhone(rider.phone)
            } : null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching active ride' });
    }
});

// ── Get Active Ride for Rider ──
/**
 * @swagger
 * /api/rider/{userId}/active-ride:
 *   get:
 *     summary: Get rider's active ride
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Active ride details
 */
app.get('/api/rider/:userId/active-ride', async (req, res) => {
    try {
        const ride = await Ride.findOne({
            userId: req.params.userId,
            status: { $in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] }
        });
        if (!ride) return res.json({ ride: null });

        const driver = await User.findById(ride.driverId);
        const rider = await User.findById(ride.userId);

        res.json({
            ride,
            driver: driver ? {
                id: driver._id,
                name: `${driver.firstName} ${driver.lastName}`,
                rating: driver.rating || 4.8,
                vehicle: `${driver.vehicleMake || 'Car'} ${driver.vehicleModel || ''}`.trim(),
                vehicleNumber: driver.vehicleNumber || 'TN 37 AB 1234',
                photoUrl: driver.photoUrl || `https://i.pravatar.cc/150?u=${driver._id}`,
                isVerified: driver.isVerified,
                maskedPhone: maskPhone(driver.phone)
            } : null,
            rider: rider ? {
                id: rider._id,
                name: `${rider.firstName} ${rider.lastName}`,
                isVerified: rider.isVerified,
                maskedPhone: maskPhone(rider.phone)
            } : null
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching active ride' });
    }
});

// ── Find matching SEARCHING pooled rides (rider-to-rider matching) ──
/**
 * @swagger
 * /api/rides/pooled-in-progress:
 *   get:
 *     summary: Find matching pooled rides
 *     tags: [Rides]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: destLat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: destLng
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: List of matching pooled rides
 */
app.get('/api/rides/pooled-in-progress', async (req, res) => {
    try {
        const { lat, lng, destLat, destLng, vehicleCategory, bufferKm = 0.5, excludeUserId, genderPreference } = req.query;

        if (!lat || !lng || !destLat || !destLng) {
            return res.status(400).json({ message: 'lat, lng, destLat, destLng required' });
        }

        const latNum = Number(lat);
        const lngNum = Number(lng);
        const destLatNum = Number(destLat);
        const destLngNum = Number(destLng);
        const bufferKmNum = Number(bufferKm) || 0.5;

        // Find other SEARCHING pooled rides (rider-to-rider matching)
        const query = {
            status: 'SEARCHING',
            isPooled: true,
            routePolyline: { $exists: true, $ne: '' },
            vehicleCategory: vehicleCategory || { $in: ['CAR', 'BIG_CAR'] },
            'pickup.lat': { $exists: true },
            'dropoff.lat': { $exists: true }
        };

        // Exclude the current rider's own rides
        if (excludeUserId) {
            query.userId = { $ne: excludeUserId };
        }

        const rides = await Ride.find(query)
            .populate('userId', 'firstName lastName email rating gender');

        const riderPickup = { lat: latNum, lng: lngNum };
        const riderDropoff = { lat: destLatNum, lng: destLngNum };

        // Match using geometric algorithm
        const matched = [];
        for (const ride of rides) {
            const result = isRiderOnRoute(ride.routePolyline, riderPickup, riderDropoff, bufferKmNum);
            if (result.match) {
                const riderInfo = ride.userId || {};

                // Filter by gender preference
                if (genderPreference && genderPreference !== 'any') {
                    const rideGenderPref = ride.safetyPreferences?.genderPreference || 'any';
                    const riderGender = riderInfo.gender?.toLowerCase();

                    // Skip if gender preferences don't match
                    if (rideGenderPref !== 'any' && rideGenderPref !== genderPreference) {
                        continue;
                    }
                    if (genderPreference !== 'any' && riderGender && riderGender !== genderPreference) {
                        continue;
                    }
                }

                matched.push({
                    _id: ride._id,
                    rideId: ride._id,
                    poolGroupId: ride.poolGroupId,
                    vehicleCategory: ride.vehicleCategory,
                    rider: {
                        name: `${riderInfo.firstName || 'Rider'} ${riderInfo.lastName || ''}`.trim(),
                        rating: riderInfo.rating || 4.8,
                        gender: riderInfo.gender || 'Not specified'
                    },
                    pickup: ride.pickup,
                    dropoff: ride.dropoff,
                    fare: ride.fare,
                    matchDetails: {
                        pickupDistance: result.pickupDistance,
                        dropoffDistance: result.dropoffDistance,
                        matchType: 'geometric'
                    }
                });
            }
        }

        // Also add proximity-based matches for rides without polylines
        const ridesWithoutPolyline = await Ride.find({
            status: 'SEARCHING',
            isPooled: true,
            vehicleCategory: vehicleCategory || { $in: ['CAR', 'BIG_CAR'] },
            $or: [
                { routePolyline: { $exists: false } },
                { routePolyline: '' }
            ],
            'pickup.lat': { $exists: true },
            'dropoff.lat': { $exists: true },
            ...(excludeUserId ? { userId: { $ne: excludeUserId } } : {})
        }).populate('userId', 'firstName lastName email rating gender');

        for (const ride of ridesWithoutPolyline) {
            const pickupDist = getDistanceKm(latNum, lngNum, ride.pickup.lat, ride.pickup.lng);
            const dropoffDist = getDistanceKm(destLatNum, destLngNum, ride.dropoff.lat, ride.dropoff.lng);
            if (pickupDist !== null && pickupDist <= 3 && dropoffDist !== null && dropoffDist <= 3) {
                const riderInfo = ride.userId || {};

                // Filter by gender preference
                if (genderPreference && genderPreference !== 'any') {
                    const rideGenderPref = ride.safetyPreferences?.genderPreference || 'any';
                    const riderGender = riderInfo.gender?.toLowerCase();

                    // Skip if gender preferences don't match
                    if (rideGenderPref !== 'any' && rideGenderPref !== genderPreference) {
                        continue;
                    }
                    if (genderPreference !== 'any' && riderGender && riderGender !== genderPreference) {
                        continue;
                    }
                }

                matched.push({
                    _id: ride._id,
                    rideId: ride._id,
                    poolGroupId: ride.poolGroupId,
                    vehicleCategory: ride.vehicleCategory,
                    rider: {
                        name: `${riderInfo.firstName || 'Rider'} ${riderInfo.lastName || ''}`.trim(),
                        rating: riderInfo.rating || 4.8,
                        gender: riderInfo.gender || 'Not specified'
                    },
                    pickup: ride.pickup,
                    dropoff: ride.dropoff,
                    fare: ride.fare,
                    matchDetails: {
                        pickupDistance: pickupDist,
                        dropoffDistance: dropoffDist,
                        matchType: 'proximity'
                    }
                });
            }
        }

        res.json(matched);
    } catch (error) {
        console.error('Error fetching pooled rides:', error);
        res.status(500).json({ message: 'Error fetching pooled rides' });
    }
});

/**
 * @swagger
 * /api/rides/{rideId}:
 *   get:
 *     summary: Get ride details
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ride details
 *       404:
 *         description: Ride not found
 */
app.get('/api/rides/:rideId', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        res.json(ride);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ride' });
    }
});

/**
 * @swagger
 * /api/rides/{rideId}/status:
 *   put:
 *     summary: Update ride status
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [SEARCHING, ACCEPTED, ARRIVED, IN_PROGRESS, COMPLETED, CANCELED]
 *     responses:
 *       200:
 *         description: Updated ride
 */
app.put('/api/rides/:rideId/status', async (req, res) => {
    try {
        const { status } = req.body;
        const ride = await Ride.findByIdAndUpdate(
            req.params.rideId, { status }, { new: true }
        );
        res.json(ride);
    } catch (error) {
        res.status(500).json({ message: 'Error updating ride' });
    }
});

// ─── Cancel Ride (Driver or Rider) with Auto Re-Search ───
/**
 * @swagger
 * /api/rides/{rideId}/cancel:
 *   post:
 *     summary: Cancel a ride
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - canceledBy
 *             properties:
 *               canceledBy:
 *                 type: string
 *                 enum: [RIDER, DRIVER]
 *               cancelReason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ride canceled
 */
app.post('/api/rides/:rideId/cancel', async (req, res) => {
    try {
        const { canceledBy, cancelReason } = req.body;
        if (!canceledBy || !['RIDER', 'DRIVER'].includes(canceledBy)) {
            return res.status(400).json({ message: 'canceledBy must be RIDER or DRIVER' });
        }

        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        // Only allow cancel for active statuses
        if (!['SEARCHING', 'ACCEPTED', 'ARRIVED'].includes(ride.status)) {
            return res.status(409).json({ message: `Cannot cancel ride with status ${ride.status}` });
        }

        // Calculate cancellation fee (only if ride was ACCEPTED or ARRIVED)
        let cancellationFee = 0;
        if (canceledBy === 'DRIVER' && ['ACCEPTED', 'ARRIVED'].includes(ride.status)) {
            // Driver penalty: flat ₹50 for canceling after accepting
            cancellationFee = 50;
        } else if (canceledBy === 'RIDER' && ['ACCEPTED', 'ARRIVED'].includes(ride.status)) {
            // Rider pays ₹25 if driver already started coming
            cancellationFee = 25;
        }

        const previousDriverId = ride.driverId;

        ride.status = 'CANCELED';
        ride.canceledBy = canceledBy;
        ride.cancelReason = cancelReason || '';
        ride.canceledAt = new Date();
        ride.cancellationFee = cancellationFee;
        if (previousDriverId) {
            ride.previousDriverIds = [...(ride.previousDriverIds || []), previousDriverId];
        }
        await ride.save();

        // Notify the other party via socket
        const cancelPayload = {
            rideId: ride._id,
            canceledBy,
            cancelReason: cancelReason || '',
            cancellationFee,
            status: 'CANCELED'
        };

        if (canceledBy === 'DRIVER') {
            // Notify rider
            io.to(`user:${ride.userId}`).emit('ride:canceled', cancelPayload);
            io.to(`ride:${ride._id}`).emit('ride:canceled', cancelPayload);

            // Create notification for rider
            try {
                const driver = previousDriverId ? await User.findById(previousDriverId) : null;
                const driverName = driver ? [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Driver' : 'Driver';
                await Notification.create({
                    userId: ride.userId,
                    fromId: previousDriverId,
                    title: 'Ride Canceled by Driver',
                    message: `${driverName} canceled your ride${cancelReason ? ': ' + cancelReason : ''}. We're searching for another driver.`,
                    type: 'RIDE_CANCELED',
                    data: { rideId: ride._id, canceledBy, cancellationFee }
                });
                io.to(`user:${ride.userId}`).emit('notification:new', {
                    title: 'Ride Canceled by Driver',
                    message: `${driverName} canceled your ride. Searching for a new driver...`,
                    type: 'RIDE_CANCELED'
                });
            } catch (e) { console.error('Cancel notification error:', e); }

            // ─── Auto Re-Search: Find nearby drivers within 5km traveling same route ───
            const AUTO_SEARCH_RADIUS_KM = 5;
            let nearbyDriversFound = 0;

            if (ride.pickup && typeof ride.pickup.lat === 'number') {
                // Create a new ride entry for re-search
                const reSearchRide = new Ride({
                    userId: ride.userId,
                    status: 'SEARCHING',
                    pickup: ride.pickup,
                    dropoff: ride.dropoff,
                    fare: ride.fare,
                    currentFare: ride.currentFare || ride.fare,
                    distance: ride.distance,
                    duration: ride.duration,
                    rideType: ride.rideType,
                    paymentMethod: ride.paymentMethod,
                    routeIndex: ride.routeIndex,
                    vehicleCategory: ride.vehicleCategory,
                    co2Emissions: ride.co2Emissions,
                    co2Saved: ride.co2Saved,
                    isPooled: ride.isPooled,
                    passengers: ride.passengers,
                    maxPassengers: ride.maxPassengers,
                    stops: ride.stops || [],
                    previousDriverIds: [...(ride.previousDriverIds || [])],
                    autoReSearched: true,
                    bookingTime: new Date()
                });
                await reSearchRide.save();

                // Mark original ride as re-searched
                ride.autoReSearched = true;
                await ride.save();

                // Broadcast to nearby drivers (excluding previous driver)
                const ridePayload = {
                    rideId: reSearchRide._id,
                    pickup: reSearchRide.pickup,
                    dropoff: reSearchRide.dropoff,
                    fare: reSearchRide.fare,
                    currentFare: reSearchRide.currentFare,
                    isPooled: reSearchRide.isPooled,
                    routeIndex: reSearchRide.routeIndex,
                    bookingTime: reSearchRide.bookingTime,
                    isReSearch: true
                };

                const excludeDriverIds = new Set((reSearchRide.previousDriverIds || []).map(id => id.toString()));

                for (const [driverId, entry] of onlineDrivers.entries()) {
                    // Skip the driver who just canceled
                    if (excludeDriverIds.has(driverId)) continue;
                    if (!entry.location || typeof entry.location.lat !== 'number') continue;

                    const dist = getDistanceKm(
                        entry.location.lat, entry.location.lng,
                        ride.pickup.lat, ride.pickup.lng
                    );
                    if (dist !== null && dist <= AUTO_SEARCH_RADIUS_KM) {
                        for (const sid of entry.socketIds) {
                            io.to(sid).emit('ride:request', ridePayload);
                        }
                        nearbyDriversFound++;
                    }
                }

                console.log(`Auto re-search: broadcast to ${nearbyDriversFound} nearby drivers (within ${AUTO_SEARCH_RADIUS_KM}km)`);

                // Notify rider about re-search result
                io.to(`user:${ride.userId}`).emit('ride:re-search', {
                    oldRideId: ride._id,
                    newRideId: reSearchRide._id,
                    driversNotified: nearbyDriversFound,
                    searchRadius: AUTO_SEARCH_RADIUS_KM
                });
            }

        } else if (canceledBy === 'RIDER') {
            // Notify driver
            if (ride.driverId) {
                io.to(`user:${ride.driverId}`).emit('ride:canceled', cancelPayload);
            }
            io.to(`ride:${ride._id}`).emit('ride:canceled', cancelPayload);

            // Create notification for driver
            if (ride.driverId) {
                try {
                    const rider = await User.findById(ride.userId);
                    const riderName = rider ? [rider.firstName, rider.lastName].filter(Boolean).join(' ') || 'Rider' : 'Rider';
                    await Notification.create({
                        userId: ride.driverId,
                        fromId: ride.userId,
                        title: 'Ride Canceled by Rider',
                        message: `${riderName} canceled the ride${cancelReason ? ': ' + cancelReason : ''}.`,
                        type: 'RIDE_CANCELED',
                        data: { rideId: ride._id, canceledBy, cancellationFee }
                    });
                    io.to(`user:${ride.driverId}`).emit('notification:new', {
                        title: 'Ride Canceled by Rider',
                        message: `${riderName} canceled the ride.`,
                        type: 'RIDE_CANCELED'
                    });
                } catch (e) { console.error('Cancel notification error:', e); }
            }
        }

        // Always remove canceled ride from all drivers' request lists
        io.to('drivers:online').emit('nearby:rider:remove', { rideId: ride._id.toString() });

        res.json({
            ride,
            cancellationFee,
            canceledBy
        });
    } catch (error) {
        console.error('Cancel ride error:', error);
        res.status(500).json({ message: 'Error canceling ride' });
    }
});

// Driver presence
/**
 * @swagger
 * /api/drivers/online:
 *   post:
 *     summary: Update driver presence
 *     tags: [System]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *     responses:
 *       200:
 *         description: Status updated
 */
app.post('/api/drivers/online', async (req, res) => {
    const { driverId, location } = req.body;
    if (!driverId) return res.status(400).json({ message: 'driverId required' });

    const entry = onlineDrivers.get(driverId) || { socketIds: new Set(), location: null };
    if (req.body.socketId) entry.socketIds.add(req.body.socketId);
    entry.location = location || entry.location;
    onlineDrivers.set(driverId, entry);
    res.json({ ok: true, onlineDrivers: onlineDrivers.size });
});

/**
 * @swagger
 * /api/drivers/offline:
 *   post:
 *     summary: Mark driver offline
 *     tags: [System]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Marked offline
 */
app.post('/api/drivers/offline', async (req, res) => {
    const { driverId } = req.body;
    if (driverId) onlineDrivers.delete(driverId);
    res.json({ ok: true });
});

// Accept ride
/**
 * @swagger
 * /api/rides/{rideId}/accept:
 *   post:
 *     summary: Accept a ride request
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *               driverLocation:
 *                 $ref: '#/components/schemas/Location'
 *     responses:
 *       200:
 *         description: Ride accepted
 *       404:
 *         description: Ride not found
 *       409:
 *         description: Ride already accepted
 */
app.post('/api/rides/:rideId/accept', async (req, res) => {
    try {
        const { driverId, driverLocation } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        if (ride.status !== 'SEARCHING') return res.status(409).json({ message: 'Ride already accepted' });
        if (!driverId) return res.status(400).json({ message: 'driverId required' });

        const rider = await User.findById(ride.userId);
        const driver = await User.findById(driverId);

        const hasDriverLocation = driverLocation && typeof driverLocation.lat === 'number' && typeof driverLocation.lng === 'number';
        const hasPickup = ride.pickup && typeof ride.pickup.lat === 'number' && typeof ride.pickup.lng === 'number';
        const hasDropoff = ride.dropoff && typeof ride.dropoff.lat === 'number' && typeof ride.dropoff.lng === 'number';
        const distanceKm = hasDriverLocation && hasPickup ?
            getDistanceKm(driverLocation.lat, driverLocation.lng, ride.pickup.lat, ride.pickup.lng) :
            null;
        const etaToPickup = estimateEtaMinutes(distanceKm);

        ride.driverId = driverId;
        ride.status = 'ACCEPTED';
        ride.etaToPickup = etaToPickup;

        // Store original ETA as baseline for delay detection
        const etaMatch = etaToPickup && etaToPickup.match(/(\d+)/);
        if (etaMatch) {
            ride.originalEtaMinutes = parseInt(etaMatch[1], 10);
        } else if (distanceKm) {
            ride.originalEtaMinutes = Math.max(1, Math.round((distanceKm / 28) * 60));
        }

        if (hasDriverLocation) {
            ride.driverLocation = { lat: driverLocation.lat, lng: driverLocation.lng, updatedAt: new Date() };
        }
        ride.contact = {
            riderMasked: maskPhone(rider && rider.phone),
            driverMasked: maskPhone(driver && driver.phone)
        };

        // CRITICAL: Fetch and store route polyline for pooled rides
        if (ride.isPooled && hasPickup && hasDropoff && hasDriverLocation) {
            try {
                console.log('Fetching route polyline for pooled ride:', ride._id);
                const OLA_API_KEY = process.env.OLA_MAPS_API_KEY || process.env.VITE_OLA_MAPS_API_KEY;

                if (!OLA_API_KEY) {
                    console.warn('OLA_MAPS_API_KEY not found, skipping polyline fetch');
                } else {
                    const origin = `${driverLocation.lat},${driverLocation.lng}`;
                    const destination = `${ride.dropoff.lat},${ride.dropoff.lng}`;
                    const url = `https://api.olamaps.io/routing/v1/directions?origin=${origin}&destination=${destination}&alternatives=false&steps=false&overview=full&language=en&api_key=${OLA_API_KEY}`;

                    console.log(`🗺️  Calling OLA API: ${origin} → ${destination}`);
                    const routeResponse = await axios.post(url, null, {
                        headers: { 'X-Request-Id': `ride-${ride._id}-${Date.now()}` },
                        timeout: 5000
                    });

                    if (routeResponse.data?.routes?.[0]?.overview_polyline) {
                        ride.routePolyline = routeResponse.data.routes[0].overview_polyline;
                        console.log('✅ Route polyline stored:', ride.routePolyline.substring(0, 50) + '...');
                    } else {
                        console.warn('⚠️  No overview_polyline in OLA response');
                    }
                }
            } catch (routeError) {
                console.error('❌ Error fetching route polyline:', routeError.response?.data || routeError.message);
                // Continue without polyline - non-critical for ride acceptance
            }
        }

        await ride.save();

        // ─── Pool Group: accept all rides + build sequential stops ───
        let poolGroupRides = [];
        let poolStops = [];
        if (ride.isPooled && ride.poolGroupId) {
            poolGroupRides = await Ride.find({
                poolGroupId: ride.poolGroupId,
                _id: { $ne: ride._id },
                status: 'SEARCHING'
            });

            // Collect all riders (including the primary ride)
            const allPoolRides = [ride, ...poolGroupRides];
            const allRiders = [];

            for (const r of allPoolRides) {
                const riderInfo = await User.findById(r.userId).select('firstName lastName phone');
                allRiders.push({
                    ride: r,
                    user: riderInfo,
                    name: riderInfo ? [riderInfo.firstName, riderInfo.lastName].filter(Boolean).join(' ') || 'Rider' : 'Rider'
                });
            }

            // ─── Compute optimal stop order ───
            // Strategy: pickup closest rider first, then next, then dropoffs by distance
            const driverLoc = driverLocation || { lat: ride.pickup.lat, lng: ride.pickup.lng };

            // Sort riders by distance from driver for pickup order
            const sortedForPickup = [...allRiders].sort((a, b) => {
                const distA = getDistanceKm(driverLoc.lat, driverLoc.lng, a.ride.pickup.lat, a.ride.pickup.lng) || 999;
                const distB = getDistanceKm(driverLoc.lat, driverLoc.lng, b.ride.pickup.lat, b.ride.pickup.lng) || 999;
                return distA - distB;
            });

            // Build stops: all pickups first (by proximity), then all dropoffs
            let order = 0;
            for (const r of sortedForPickup) {
                poolStops.push({
                    type: 'PICKUP',
                    riderId: r.ride.userId,
                    riderName: r.name,
                    rideId: r.ride._id,
                    address: r.ride.pickup?.address || 'Pickup',
                    lat: r.ride.pickup?.lat,
                    lng: r.ride.pickup?.lng,
                    order: order++,
                    status: 'PENDING'
                });
            }

            // Sort dropoffs: from last pickup location, find nearest dropoff first
            let lastLoc = sortedForPickup[sortedForPickup.length - 1]?.ride.pickup || driverLoc;
            const dropoffRiders = [...sortedForPickup];
            const orderedDropoffs = [];
            while (dropoffRiders.length > 0) {
                let nearest = 0;
                let nearestDist = Infinity;
                for (let i = 0; i < dropoffRiders.length; i++) {
                    const d = getDistanceKm(lastLoc.lat, lastLoc.lng, dropoffRiders[i].ride.dropoff.lat, dropoffRiders[i].ride.dropoff.lng) || 999;
                    if (d < nearestDist) { nearestDist = d; nearest = i; }
                }
                orderedDropoffs.push(dropoffRiders.splice(nearest, 1)[0]);
                lastLoc = orderedDropoffs[orderedDropoffs.length - 1].ride.dropoff;
            }

            for (const r of orderedDropoffs) {
                poolStops.push({
                    type: 'DROPOFF',
                    riderId: r.ride.userId,
                    riderName: r.name,
                    rideId: r.ride._id,
                    address: r.ride.dropoff?.address || 'Dropoff',
                    lat: r.ride.dropoff?.lat,
                    lng: r.ride.dropoff?.lng,
                    order: order++,
                    status: 'PENDING'
                });
            }

            // Save poolStops on the primary ride (the one driver accepted)
            ride.poolStops = poolStops;
            ride.currentPoolStopIndex = 0;
            await ride.save();

            // Accept all other group rides and notify their riders
            for (const groupRide of poolGroupRides) {
                groupRide.driverId = driverId;
                groupRide.status = 'ACCEPTED';
                groupRide.etaToPickup = ride.etaToPickup;
                groupRide.contact = {
                    riderMasked: maskPhone((await User.findById(groupRide.userId))?.phone),
                    driverMasked: maskPhone(driver && driver.phone)
                };
                if (ride.routePolyline) groupRide.routePolyline = ride.routePolyline;
                await groupRide.save();

                const groupRider = await User.findById(groupRide.userId);
                const groupPayload = {
                    ride: groupRide,
                    driver: driver ? {
                        id: driver._id,
                        name: [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Driver',
                        rating: driver.rating || 4.8,
                        vehicle: [driver.vehicleMake || 'Car', driver.vehicleModel || ''].filter(Boolean).join(' '),
                        vehicleNumber: driver.vehicleNumber || 'TN 37 AB 1234',
                        photoUrl: driver.photoUrl || `https://i.pravatar.cc/150?u=${driver._id}`,
                        maskedPhone: maskPhone(driver.phone)
                    } : null,
                    rider: groupRider ? {
                        id: groupRider._id,
                        name: [groupRider.firstName, groupRider.lastName].filter(Boolean).join(' ') || 'Rider',
                        maskedPhone: maskPhone(groupRider.phone)
                    } : null,
                    poolStops
                };
                io.to(`user:${groupRide.userId}`).emit('ride:accepted', groupPayload);
                console.log(`🤝 Pool group ride ${groupRide._id} accepted for rider ${groupRide.userId}`);
            }

            console.log(`📍 Pool stops computed: ${poolStops.map(s => `${s.type}:${s.riderName}`).join(' → ')}`);
        }

        const payload = {
            ride,
            driver: driver ? {
                id: driver._id,
                name: [driver.firstName, driver.lastName].filter(Boolean).join(' ') || driver.email || 'Driver',
                rating: driver.rating || 4.8,
                vehicle: [driver.vehicleMake || 'Car', driver.vehicleModel || ''].filter(Boolean).join(' '),
                vehicleNumber: driver.vehicleNumber || 'TN 37 AB 1234',
                photoUrl: driver.photoUrl || `https://i.pravatar.cc/150?u=${driver._id}`,
                isVerified: driver.isVerified,
                maskedPhone: maskPhone(driver.phone)
            } : null,
            rider: rider ? {
                id: rider._id,
                name: `${rider.firstName} ${rider.lastName}`,
                maskedPhone: maskPhone(rider.phone)
            } : null,
            poolStops: poolStops.length > 0 ? poolStops : undefined,
            poolGroupRides: poolGroupRides.length > 0 ? poolGroupRides.map(r => ({
                rideId: r._id,
                userId: r.userId,
                pickup: r.pickup,
                dropoff: r.dropoff
            })) : undefined
        };

        io.to(`ride:${ride._id}`).emit('ride:accepted', payload);
        io.to(`user:${ride.userId}`).emit('ride:accepted', payload);
        io.to(`user:${driverId}`).emit('ride:accepted', payload);

        // Remove this ride and ALL pool group rides from ALL drivers' request lists
        io.to('drivers:online').emit('nearby:rider:remove', { rideId: ride._id.toString() });
        if (poolGroupRides && poolGroupRides.length > 0) {
            for (const groupRide of poolGroupRides) {
                io.to('drivers:online').emit('nearby:rider:remove', { rideId: groupRide._id.toString() });
            }
        }

        res.json(payload);
    } catch (error) {
        console.error('Accept ride error:', error);
        res.status(500).json({ message: 'Error accepting ride' });
    }
});

// ─── Pool Stop Navigation: driver reached a pool stop ───
/**
 * @swagger
 * /api/rides/{rideId}/pool-stop-reached:
 *   post:
 *     summary: Mark pool stop as reached
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stopIndex
 *             properties:
 *               stopIndex:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Stop reached
 */
app.post('/api/rides/:rideId/pool-stop-reached', async (req, res) => {
    try {
        const { stopIndex } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        if (!ride.poolStops || ride.poolStops.length === 0) return res.status(400).json({ message: 'No pool stops on this ride' });
        if (stopIndex < 0 || stopIndex >= ride.poolStops.length) return res.status(400).json({ message: 'Invalid stop index' });

        const stop = ride.poolStops[stopIndex];
        stop.status = 'REACHED';
        stop.reachedAt = new Date();

        if (stop.type === 'PICKUP') {
            // Generate OTP for this rider's pickup
            const otp = Math.floor(1000 + Math.random() * 9000).toString();
            stop.otp = otp;
            stop.otpVerified = false;

            // Notify the specific rider with their OTP
            io.to(`user:${stop.riderId}`).emit('ride:otp', {
                rideId: stop.rideId || ride._id,
                otp,
                poolStop: { type: 'PICKUP', riderName: stop.riderName, address: stop.address }
            });

            // Also send OTP via email
            try {
                const riderUser = await User.findById(stop.riderId).select('email firstName');
                if (riderUser?.email && process.env.OTP_EMAIL_USER && process.env.OTP_EMAIL_PASS) {
                    await emailTransporter.sendMail({
                        from: `"LeafLift" <${process.env.OTP_EMAIL_USER}>`,
                        to: riderUser.email,
                        subject: 'LeafLift - Your Ride Verification OTP',
                        html: `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;border-radius:16px;border:1px solid #e5e7eb">
                            <h2 style="color:#16a34a;margin:0 0 8px">Your ride is here! 🚗</h2>
                            <p style="color:#6b7280;margin:0 0 16px">Share this OTP with your driver to start your ride:</p>
                            <div style="text-align:center;padding:16px;background:#f0fdf4;border-radius:12px">
                                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">${otp}</span>
                            </div>
                            <p style="color:#9ca3af;font-size:12px;margin:16px 0 0;text-align:center">This OTP is valid for this ride only.</p>
                        </div>`
                    });
                    console.log(`📧 Ride OTP emailed to pool rider ${riderUser.email}`);
                }
            } catch (emailErr) {
                console.warn('⚠️  Failed to email pool ride OTP:', emailErr.message);
            }
        }

        if (stop.type === 'DROPOFF') {
            stop.status = 'COMPLETED';
            // Mark the individual rider's ride as completed if it's their dropoff
            if (stop.rideId) {
                const riderRide = await Ride.findById(stop.rideId);
                if (riderRide && riderRide.status !== 'COMPLETED') {
                    riderRide.status = 'COMPLETED';
                    riderRide.paymentStatus = 'PENDING';
                    await riderRide.save();
                    io.to(`user:${stop.riderId}`).emit('ride:status', {
                        rideId: stop.rideId,
                        status: 'COMPLETED',
                        fare: riderRide.currentFare || riderRide.fare
                    });
                }
            }
        }

        // Advance current stop index
        ride.currentPoolStopIndex = stopIndex + 1;
        await ride.save();

        // Check if all stops are complete
        const allComplete = ride.poolStops.every(s => s.status === 'COMPLETED' || s.status === 'REACHED');
        const allDropoffsComplete = ride.poolStops.filter(s => s.type === 'DROPOFF').every(s => s.status === 'COMPLETED');

        if (allDropoffsComplete) {
            ride.status = 'COMPLETED';
            await ride.save();
        }

        // Notify all riders in this pool group about progress
        if (ride.poolGroupId) {
            const groupRides = await Ride.find({ poolGroupId: ride.poolGroupId });
            for (const gr of groupRides) {
                io.to(`user:${gr.userId}`).emit('pool:stop-update', {
                    poolGroupId: ride.poolGroupId,
                    currentStopIndex: ride.currentPoolStopIndex,
                    stops: ride.poolStops,
                    completedStop: { ...stop.toObject(), index: stopIndex },
                    allComplete: allDropoffsComplete
                });
            }
        }

        // Also notify the driver
        if (ride.driverId) {
            io.to(`user:${ride.driverId}`).emit('pool:stop-update', {
                poolGroupId: ride.poolGroupId,
                currentStopIndex: ride.currentPoolStopIndex,
                stops: ride.poolStops,
                completedStop: { ...stop.toObject(), index: stopIndex },
                allComplete: allDropoffsComplete
            });
        }

        res.json({
            ok: true,
            currentStop: stop,
            nextStopIndex: ride.currentPoolStopIndex,
            allComplete: allDropoffsComplete,
            poolStops: ride.poolStops
        });
    } catch (error) {
        console.error('Pool stop reached error:', error);
        res.status(500).json({ message: 'Error processing pool stop' });
    }
});

// ─── Pool Stop OTP Verification ───
/**
 * @swagger
 * /api/rides/{rideId}/pool-stop-verify-otp:
 *   post:
 *     summary: Verify OTP for pool stop
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stopIndex
 *               - otp
 *             properties:
 *               stopIndex:
 *                 type: integer
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified
 */
app.post('/api/rides/:rideId/pool-stop-verify-otp', async (req, res) => {
    try {
        const { stopIndex, otp } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        if (!ride.poolStops?.[stopIndex]) return res.status(400).json({ message: 'Invalid stop' });

        const stop = ride.poolStops[stopIndex];
        if (stop.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });

        stop.otpVerified = true;
        stop.status = 'COMPLETED';

        // Advance to next stop after OTP is verified
        ride.currentPoolStopIndex = stopIndex + 1;
        await ride.save();

        // Notify all riders about progress
        if (ride.poolGroupId) {
            const groupRides = await Ride.find({ poolGroupId: ride.poolGroupId });
            for (const gr of groupRides) {
                io.to(`user:${gr.userId}`).emit('pool:stop-update', {
                    poolGroupId: ride.poolGroupId,
                    currentStopIndex: ride.currentPoolStopIndex,
                    stops: ride.poolStops,
                    message: `${stop.riderName} picked up! ✅`
                });
            }
        }

        // Also notify the driver so their UI updates
        if (ride.driverId) {
            io.to(`user:${ride.driverId}`).emit('pool:stop-update', {
                poolGroupId: ride.poolGroupId,
                currentStopIndex: ride.currentPoolStopIndex,
                stops: ride.poolStops,
                message: `${stop.riderName} picked up! ✅`
            });
        }

        res.json({ ok: true, stop, poolStops: ride.poolStops, nextStopIndex: ride.currentPoolStopIndex });
    } catch (error) {
        console.error('Pool OTP verify error:', error);
        res.status(500).json({ message: 'Error verifying OTP' });
    }
});

// Driver reached pickup -> generate OTP
/**
 * @swagger
 * /api/rides/{rideId}/reached:
 *   post:
 *     summary: Driver arrived at pickup
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OTP generated
 */
app.post('/api/rides/:rideId/reached', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        ride.status = 'ARRIVED';
        ride.otp = otp;
        ride.otpVerified = false;
        ride.otpGeneratedAt = new Date();
        await ride.save();

        io.to(`ride:${ride._id}`).emit('ride:otp', { rideId: ride._id, otp });
        io.to(`user:${ride.userId}`).emit('ride:otp', { rideId: ride._id, otp });

        // Also send OTP via email
        try {
            const riderUser = await User.findById(ride.userId).select('email firstName');
            if (riderUser?.email && process.env.OTP_EMAIL_USER && process.env.OTP_EMAIL_PASS) {
                await emailTransporter.sendMail({
                    from: `"LeafLift" <${process.env.OTP_EMAIL_USER}>`,
                    to: riderUser.email,
                    subject: 'LeafLift - Your Ride Verification OTP',
                    html: `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:24px;border-radius:16px;border:1px solid #e5e7eb">
                        <h2 style="color:#16a34a;margin:0 0 8px">Your driver has arrived! 🚗</h2>
                        <p style="color:#6b7280;margin:0 0 16px">Share this OTP with your driver to start your ride:</p>
                        <div style="text-align:center;padding:16px;background:#f0fdf4;border-radius:12px">
                            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#111">${otp}</span>
                        </div>
                        <p style="color:#9ca3af;font-size:12px;margin:16px 0 0;text-align:center">This OTP is valid for this ride only.</p>
                    </div>`
                });
                console.log(`📧 Ride OTP emailed to ${riderUser.email}`);
            }
        } catch (emailErr) {
            console.warn('⚠️  Failed to email ride OTP:', emailErr.message);
        }

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Error marking reached' });
    }
});

// Verify OTP and start ride
/**
 * @swagger
 * /api/rides/{rideId}/verify-otp:
 *   post:
 *     summary: Verify pickup OTP
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - otp
 *             properties:
 *               otp:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified, ride started
 */
app.post('/api/rides/:rideId/verify-otp', async (req, res) => {
    try {
        const { otp } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        if (ride.otp !== otp) return res.status(400).json({ message: 'Invalid OTP' });

        ride.otpVerified = true;
        ride.status = 'IN_PROGRESS';
        await ride.save();

        io.to(`ride:${ride._id}`).emit('ride:status', { rideId: ride._id, status: ride.status });
        io.to(`user:${ride.userId}`).emit('ride:status', { rideId: ride._id, status: ride.status });
        if (ride.driverId) io.to(`user:${ride.driverId}`).emit('ride:status', { rideId: ride._id, status: ride.status });

        res.json({ ok: true, ride });
    } catch (error) {
        res.status(500).json({ message: 'Error verifying OTP' });
    }
});

// Complete ride
/**
 * @swagger
 * /api/rides/{rideId}/complete:
 *   post:
 *     summary: Complete the ride
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Ride completed
 */
app.post('/api/rides/:rideId/complete', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        ride.status = 'COMPLETED';
        ride.paymentStatus = 'PAID';
        ride.riderConfirmedComplete = false; // Will be confirmed by rider
        await ride.save();

        // Emit confirmation request to rider
        const distStr = ride.distance || '0';
        const distKm = parseFloat(distStr) || 0;
        io.to(`ride:${ride._id}`).emit('ride:confirm-complete', {
            rideId: ride._id,
            completedFare: ride.currentFare || ride.fare,
            actualDistanceKm: distKm.toFixed(1)
        });
        io.to(`user:${ride.userId}`).emit('ride:confirm-complete', {
            rideId: ride._id,
            completedFare: ride.currentFare || ride.fare,
            actualDistanceKm: distKm.toFixed(1)
        });

        // Also emit status update 
        io.to(`ride:${ride._id}`).emit('ride:status', { rideId: ride._id, status: ride.status });
        io.to(`user:${ride.userId}`).emit('ride:status', { rideId: ride._id, status: ride.status });
        if (ride.driverId) io.to(`user:${ride.driverId}`).emit('ride:status', { rideId: ride._id, status: ride.status });

        // Update user stats
        await User.findByIdAndUpdate(ride.userId, {
            $inc: { totalTrips: 1, totalKmTraveled: distKm, totalCO2Emitted: ride.co2Emissions || 0, totalCO2Saved: ride.co2Saved || 0 }
        });
        if (ride.driverId) {
            await User.findByIdAndUpdate(ride.driverId, { $inc: { totalTrips: 1, totalKmTraveled: distKm } });
        }

        res.json({ ok: true, ride });
    } catch (error) {
        res.status(500).json({ message: 'Error completing ride' });
    }
});

// Update live location
/**
 * @swagger
 * /api/rides/{rideId}/location:
 *   post:
 *     summary: Update active ride location
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *               - lat
 *               - lng
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [DRIVER, RIDER]
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated
 */
app.post('/api/rides/:rideId/location', async (req, res) => {
    try {
        const { role, lat, lng } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ message: 'lat/lng required' });

        const payload = { lat, lng, updatedAt: new Date() };
        if (role === 'DRIVER') {
            ride.driverLocation = payload;
        } else {
            ride.riderLocation = payload;
        }
        await ride.save();

        io.to(`ride:${ride._id}`).emit(`ride:${role === 'DRIVER' ? 'driver' : 'rider'}-location`, { rideId: ride._id, location: payload });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Error updating location' });
    }
});

// Chat messages
/**
 * @swagger
 * /api/rides/{rideId}/messages:
 *   get:
 *     summary: Get chat messages
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of messages
 */
app.get('/api/rides/:rideId/messages', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        res.json(ride.chat || []);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages' });
    }
});

/**
 * @swagger
 * /api/rides/{rideId}/messages:
 *   post:
 *     summary: Send chat message
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               senderId:
 *                 type: string
 *               senderRole:
 *                 type: string
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Message sent
 */
app.post('/api/rides/:rideId/messages', async (req, res) => {
    try {
        const { senderId, senderRole, message } = req.body;
        if (!message) return res.status(400).json({ message: 'Message required' });
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        const msg = {
            senderId,
            senderRole,
            message,
            createdAt: new Date()
        };
        ride.chat.push(msg);
        await ride.save();

        io.to(`ride:${ride._id}`).emit('chat:message', msg);
        res.json(msg);
    } catch (error) {
        res.status(500).json({ message: 'Error sending message' });
    }
});

// Pooling: add rider mid-ride
/**
 * @swagger
 * /api/rides/{rideId}/pool/add:
 *   post:
 *     summary: Add rider to existing pool
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *               fareAdjustment:
 *                 type: number
 *     responses:
 *       200:
 *         description: Rider added
 */
app.post('/api/rides/:rideId/pool/add', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        if (!ride.isPooled) return res.status(400).json({ message: 'Ride is not pooled' });

        const adjustment = typeof (req.body && req.body.fareAdjustment) === 'number' ?
            req.body.fareAdjustment :
            Math.round((ride.currentFare || ride.fare || 0) * -0.3);

        ride.currentFare = Math.max(0, (ride.currentFare || ride.fare || 0) + adjustment);
        ride.pooledRiders.push({
            userId: req.body && req.body.userId,
            fareAdjustment: adjustment,
            joinedAt: new Date()
        });
        await ride.save();

        // Notify all riders in the car about the new rider and updated fare
        io.to(`ride:${ride._id}`).emit('ride:pooled-rider-added', {
            rideId: ride._id,
            currentFare: ride.currentFare,
            pooledRiders: ride.pooledRiders,
            totalPassengers: totalPassengersAfter,
            newRider: {
                name: `${firstName || 'Rider'} ${lastName || ''}`.trim(),
                pickup,
                dropoff
            }
        });

        // Also notify the new rider that they have joined
        io.to(`user:${newRiderId}`).emit('pool:join-result', { rideId: ride._id, approved: true });

        res.json({
            ...ride.toObject(),
            currentPassengers: totalPassengersAfter,
            farePerPerson: newFarePerPerson
        });
    } catch (error) {
        console.error('Error adding pooled rider:', error);
        res.status(500).json({ message: 'Error adding pooled rider' });
    }
});

// Join in-progress pooled ride as new rider
/**
 * @swagger
 * /api/rides/{rideId}/pool/join:
 *   post:
 *     summary: Request to join active pool
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - pickup
 *               - dropoff
 *             properties:
 *               userId:
 *                 type: string
 *               pickup:
 *                 $ref: '#/components/schemas/Location'
 *               dropoff:
 *                 $ref: '#/components/schemas/Location'
 *               passengers:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Join request sent
 */
app.post('/api/rides/:rideId/pool/join', async (req, res) => {
    try {
        const { userId, pickup, dropoff, passengers = 1 } = req.body;
        if (!userId) return res.status(400).json({ message: 'userId required' });

        const pooledRide = await Ride.findById(req.params.rideId).populate('userId', 'firstName lastName');
        if (!pooledRide) return res.status(404).json({ message: 'Ride not found' });
        if (!pooledRide.isPooled) return res.status(400).json({ message: 'Ride is not pooled' });
        if (pooledRide.status !== 'ACCEPTED' && pooledRide.status !== 'IN_PROGRESS') {
            return res.status(400).json({ message: 'Ride not available for pooling' });
        }

        // Check if user already joined this ride
        const alreadyJoined = pooledRide.pooledRiders?.some(r => r.userId?.toString() === userId);
        if (alreadyJoined) {
            return res.status(400).json({ message: 'You have already joined this ride' });
        }

        const currentPassengers = pooledRide.passengers + (pooledRide.pooledRiders ? pooledRide.pooledRiders.length : 0);
        const maxPass = pooledRide.maxPassengers || 4;
        if (currentPassengers + passengers > maxPass) {
            return res.status(400).json({ message: 'Not enough seats available' });
        }

        // Notify driver about pool request
        io.to(`ride:${pooledRide._id}`).emit('pool:join-request', {
            rideId: pooledRide._id,
            userId,
            pickup,
            dropoff,
            passengers
        });

        res.json({ message: 'Pool join request sent to driver', pooledRideId: pooledRide._id });
    } catch (error) {
        console.error('Pool join error:', error);
        res.status(500).json({ message: 'Error joining pooled ride' });
    }
});

// ── Driver requests early completion (rider must confirm) ──
/**
 * @swagger
 * /api/rides/{rideId}/request-complete:
 *   post:
 *     summary: Driver requests early completion
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - actualLat
 *               - actualLng
 *             properties:
 *               actualLat:
 *                 type: number
 *               actualLng:
 *                 type: number
 *               actualAddress:
 *                 type: string
 *     responses:
 *       200:
 *         description: Completion requested
 */
app.post('/api/rides/:rideId/request-complete', async (req, res) => {
    try {
        const { actualLat, actualLng, actualAddress } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        if (ride.status !== 'IN_PROGRESS') return res.status(409).json({ message: 'Ride not in progress' });

        // Calculate actual distance from pickup to current location
        const pickupLat = ride.pickup && ride.pickup.lat;
        const pickupLng = ride.pickup && ride.pickup.lng;
        let actualDistanceMeters = 0;
        let completedFare = ride.currentFare || ride.fare || 0;

        if (typeof pickupLat === 'number' && typeof actualLat === 'number') {
            const distKm = getDistanceKm(pickupLat, pickupLng, actualLat, actualLng);
            actualDistanceMeters = Math.round((distKm || 0) * 1000);
            // Recalculate fare based on actual distance
            const baseFare = 30;
            const perKmRate = 12;
            completedFare = Math.round(baseFare + ((actualDistanceMeters / 1000) * perKmRate));
        }

        ride.actualDropoff = { address: actualAddress || 'Early drop', lat: actualLat, lng: actualLng };
        ride.actualDistanceMeters = actualDistanceMeters;
        ride.completedFare = completedFare;
        ride.riderConfirmedComplete = false;
        await ride.save();

        // Ask rider to confirm
        io.to(`ride:${ride._id}`).emit('ride:confirm-complete', {
            rideId: ride._id,
            actualDropoff: ride.actualDropoff,
            actualDistanceKm: (actualDistanceMeters / 1000).toFixed(1),
            completedFare
        });
        io.to(`user:${ride.userId}`).emit('ride:confirm-complete', {
            rideId: ride._id,
            actualDropoff: ride.actualDropoff,
            actualDistanceKm: (actualDistanceMeters / 1000).toFixed(1),
            completedFare
        });

        res.json({ ok: true, completedFare, actualDistanceMeters });
    } catch (error) {
        console.error('Request complete error:', error);
        res.status(500).json({ message: 'Error requesting completion' });
    }
});

// ── Rider confirms early completion ──
app.post('/api/rides/:rideId/confirm-complete', async (req, res) => {
    try {
        const { confirmed } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        if (confirmed) {
            ride.riderConfirmedComplete = true;
            ride.status = 'COMPLETED';
            ride.paymentStatus = 'PAID';
            ride.currentFare = ride.completedFare || ride.currentFare;
            await ride.save();

            // Update user stats
            const distKm = (ride.actualDistanceMeters || 0) / 1000;
            await User.findByIdAndUpdate(ride.userId, {
                $inc: { totalTrips: 1, totalKmTraveled: distKm, totalCO2Emitted: ride.co2Emissions || 0, totalCO2Saved: ride.co2Saved || 0 }
            });
            if (ride.driverId) {
                await User.findByIdAndUpdate(ride.driverId, { $inc: { totalTrips: 1, totalKmTraveled: distKm } });
            }

            io.to(`ride:${ride._id}`).emit('ride:status', { rideId: ride._id, status: 'COMPLETED', fare: ride.currentFare });
            io.to(`user:${ride.userId}`).emit('ride:status', { rideId: ride._id, status: 'COMPLETED', fare: ride.currentFare });
            if (ride.driverId) io.to(`user:${ride.driverId}`).emit('ride:status', { rideId: ride._id, status: 'COMPLETED', fare: ride.currentFare });
        }

        res.json({ ok: true, ride });
    } catch (error) {
        res.status(500).json({ message: 'Error confirming completion' });
    }
});

// ── Wallet endpoints ──
/**
 * @swagger
 * /api/users/{userId}/wallet:
 *   get:
 *     summary: Get user wallet balance
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wallet balance
 */
app.get('/api/users/:userId/wallet', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ balance: user.walletBalance || 0 });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet' });
    }
});

/**
 * @swagger
 * /api/users/{userId}/wallet/add:
 *   post:
 *     summary: Add funds to wallet
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Funds added
 */
app.post('/api/users/:userId/wallet/add', async (req, res) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) return res.status(400).json({ message: 'Invalid amount' });
        const user = await User.findByIdAndUpdate(
            req.params.userId, { $inc: { walletBalance: amount } }, { new: true }
        );
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ walletBalance: user.walletBalance });
    } catch (error) {
        res.status(500).json({ message: 'Error adding to wallet' });
    }
});

// ── User stats (CO2, trips) ──
/**
 * @swagger
 * /api/users/{userId}/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User stats
 */
app.get('/api/users/:userId/stats', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({
            totalTrips: user.totalTrips || 0,
            totalKmTraveled: Math.round((user.totalKmTraveled || 0) * 10) / 10,
            totalCO2Saved: user.totalCO2Saved || 0,
            totalCO2Emitted: user.totalCO2Emitted || 0,
            walletBalance: user.walletBalance || 0
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stats' });
    }
});

// ── Scheduled rides ──
/**
 * @swagger
 * /api/rides/schedule:
 *   post:
 *     summary: Schedule a ride
 *     tags: [Rides]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - scheduledFor
 *             properties:
 *               userId:
 *                 type: string
 *               scheduledFor:
 *                 type: string
 *                 format: date-time
 *               pickup:
 *                 $ref: '#/components/schemas/Location'
 *               dropoff:
 *                 $ref: '#/components/schemas/Location'
 *     responses:
 *       201:
 *         description: Ride scheduled
 */
app.post('/api/rides/schedule', async (req, res) => {
    try {
        const payload = { ...req.body, isScheduled: true, status: 'SEARCHING' };
        if (!payload.userId) return res.status(400).json({ message: 'userId required' });
        if (!payload.scheduledFor) return res.status(400).json({ message: 'scheduledFor required' });
        payload.scheduledFor = new Date(payload.scheduledFor);
        if (!payload.currentFare && payload.fare) payload.currentFare = payload.fare;
        const ride = new Ride(payload);
        await ride.save();
        res.status(201).json(ride);
    } catch (error) {
        console.error('Schedule ride error:', error);
        res.status(500).json({ message: 'Error scheduling ride' });
    }
});

/**
 * @swagger
 * /api/rides/scheduled/{userId}:
 *   get:
 *     summary: Get scheduled rides for user
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of scheduled rides
 */
app.get('/api/rides/scheduled/:userId', async (req, res) => {
    try {
        const rides = await Ride.find({
            userId: req.params.userId,
            isScheduled: true,
            scheduledFor: { $gte: new Date() },
            status: { $in: ['SEARCHING', 'ACCEPTED'] }
        }).sort({ scheduledFor: 1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching scheduled rides' });
    }
});

/**
 * @swagger
 * /api/rides/scheduled/{rideId}:
 *   delete:
 *     summary: Cancel scheduled ride
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scheduled ride canceled
 */
app.delete('/api/rides/scheduled/:rideId', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        ride.status = 'CANCELED';
        await ride.save();
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Error canceling scheduled ride' });
    }
});

// ── Geospatial clustering: find nearby drivers (optimized Haversine) ──
/**
 * @swagger
 * /api/drivers/nearby:
 *   get:
 *     summary: Get drivers nearby a location
 *     tags: [Rides]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: List of nearby drivers
 */
app.get('/api/drivers/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 6 } = req.query;
        const latNum = Number(lat);
        const lngNum = Number(lng);
        const radiusNum = Number(radius) || 6;

        if (isNaN(latNum) || isNaN(lngNum)) {
            return res.status(400).json({ message: 'lat and lng required' });
        }

        const drivers = [];
        for (const [driverId, entry] of onlineDrivers.entries()) {
            if (!entry.location) continue;
            const dist = getDistanceKm(latNum, lngNum, entry.location.lat, entry.location.lng);
            if (dist !== null && dist <= radiusNum) {
                drivers.push({ driverId, location: entry.location, distance: Math.round(dist * 10) / 10 });
            }
        }
        drivers.sort((a, b) => a.distance - b.distance);
        res.json(drivers);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching nearby drivers' });
    }
});

// ── SOS Emergency Alert ──
/**
 * @swagger
 * /api/rides/{rideId}/sos:
 *   post:
 *     summary: Send SOS alert
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - userRole
 *               - location
 *             properties:
 *               userId:
 *                 type: string
 *               userRole:
 *                 type: string
 *               location:
 *                 $ref: '#/components/schemas/Location'
 *     responses:
 *       200:
 *         description: SOS alert sent
 */
app.post('/api/rides/:rideId/sos', async (req, res) => {
    try {
        const { userId, userRole, location } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        console.log(`🚨 SOS ALERT: Ride ${ride._id}, User: ${userId}, Role: ${userRole}`);

        // In a real app, this would:
        // 1. Alert emergency services
        // 2. Notify platform support
        // 3. Share live location
        // 4. Record the incident

        // Notify both driver and rider
        io.to(`user:${ride.userId}`).emit('ride:sos', {
            rideId: ride._id,
            alertedBy: userRole,
            location,
            timestamp: new Date()
        });

        if (ride.driverId) {
            io.to(`user:${ride.driverId}`).emit('ride:sos', {
                rideId: ride._id,
                alertedBy: userRole,
                location,
                timestamp: new Date()
            });
        }

        res.json({ ok: true, message: 'SOS alert sent' });
    } catch (error) {
        console.error('SOS error:', error);
        res.status(500).json({ message: 'Error sending SOS alert' });
    }
});

// ── Multi-Stop: Mark stop as reached ──
/**
 * @swagger
 * /api/rides/{rideId}/stops/{stopIndex}/reached:
 *   post:
 *     summary: Mark multi-stop index reached
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: stopIndex
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Stop reached
 */
app.post('/api/rides/:rideId/stops/:stopIndex/reached', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        const stopIdx = parseInt(req.params.stopIndex, 10);
        if (!ride.stops || stopIdx < 0 || stopIdx >= ride.stops.length) {
            return res.status(400).json({ message: 'Invalid stop index' });
        }

        ride.stops[stopIdx].status = 'REACHED';
        ride.stops[stopIdx].reachedAt = new Date();
        ride.currentStopIndex = stopIdx + 1;
        await ride.save();

        const payload = {
            rideId: ride._id,
            stopIndex: stopIdx,
            currentStopIndex: ride.currentStopIndex,
            stops: ride.stops
        };

        io.to(`ride:${ride._id}`).emit('ride:stop-reached', payload);
        io.to(`user:${ride.userId}`).emit('ride:stop-reached', payload);
        if (ride.driverId) io.to(`user:${ride.driverId}`).emit('ride:stop-reached', payload);

        res.json({ ok: true, ride });
    } catch (error) {
        console.error('Stop reached error:', error);
        res.status(500).json({ message: 'Error marking stop as reached' });
    }
});

// ── Multi-Stop: Skip a stop ──
/**
 * @swagger
 * /api/rides/{rideId}/stops/{stopIndex}/skip:
 *   post:
 *     summary: Skip a multi-stop index
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: stopIndex
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Stop skipped
 */
app.post('/api/rides/:rideId/stops/:stopIndex/skip', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        const stopIdx = parseInt(req.params.stopIndex, 10);
        if (!ride.stops || stopIdx < 0 || stopIdx >= ride.stops.length) {
            return res.status(400).json({ message: 'Invalid stop index' });
        }

        ride.stops[stopIdx].status = 'SKIPPED';
        ride.currentStopIndex = stopIdx + 1;
        await ride.save();

        const payload = {
            rideId: ride._id,
            stopIndex: stopIdx,
            currentStopIndex: ride.currentStopIndex,
            stops: ride.stops
        };

        io.to(`ride:${ride._id}`).emit('ride:stop-skipped', payload);
        io.to(`user:${ride.userId}`).emit('ride:stop-skipped', payload);
        if (ride.driverId) io.to(`user:${ride.driverId}`).emit('ride:stop-skipped', payload);

        res.json({ ok: true, ride });
    } catch (error) {
        console.error('Stop skip error:', error);
        res.status(500).json({ message: 'Error skipping stop' });
    }
});

// ── Multi-Stop: Get ride stops info ──
/**
 * @swagger
 * /api/rides/{rideId}/stops:
 *   get:
 *     summary: Get stops for a ride
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of stops
 */
app.get('/api/rides/:rideId/stops', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        res.json({
            stops: ride.stops || [],
            currentStopIndex: ride.currentStopIndex || 0,
            pickup: ride.pickup,
            dropoff: ride.dropoff
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stops' });
    }
});

// ── Live ETA for active rides ──
/**
 * @swagger
 * /api/rides/{rideId}/live-eta:
 *   get:
 *     summary: Get live ETA for ride
 *     tags: [Rides]
 *     parameters:
 *       - in: path
 *         name: rideId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Live ETA
 */
app.get('/api/rides/:rideId/live-eta', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        const driverEntry = ride.driverId ? onlineDrivers.get(ride.driverId.toString()) : null;
        const driverLoc = driverEntry?.location || ride.driverLocation;

        if (!driverLoc || typeof driverLoc.lat !== 'number') {
            return res.json({ etaMinutes: null, etaText: 'N/A', source: 'unavailable' });
        }

        let destinationLat, destinationLng;
        if (ride.status === 'ACCEPTED' || ride.status === 'ARRIVED') {
            // ETA to pickup
            if (!ride.pickup || typeof ride.pickup.lat !== 'number') {
                return res.json({ etaMinutes: null, etaText: 'N/A', source: 'no-pickup' });
            }
            destinationLat = ride.pickup.lat;
            destinationLng = ride.pickup.lng;
        } else if (ride.status === 'IN_PROGRESS') {
            // ETA to dropoff
            if (!ride.dropoff || typeof ride.dropoff.lat !== 'number') {
                return res.json({ etaMinutes: null, etaText: 'N/A', source: 'no-dropoff' });
            }
            destinationLat = ride.dropoff.lat;
            destinationLng = ride.dropoff.lng;
        } else {
            return res.json({ etaMinutes: null, etaText: 'N/A', source: 'inactive' });
        }

        // Try OLA Directions API for traffic-aware ETA
        let etaMinutes = null;
        let etaText = 'N/A';
        let source = 'haversine';

        if (OLA_API_KEY) {
            try {
                const origin = `${driverLoc.lat},${driverLoc.lng}`;
                const destination = `${destinationLat},${destinationLng}`;
                const url = `https://api.olamaps.io/routing/v1/directions?origin=${origin}&destination=${destination}&alternatives=false&steps=false&overview=none&language=en&traffic_metadata=true&api_key=${OLA_API_KEY}`;
                const response = await axios.post(url);
                const routes = response.data?.routes;
                if (routes && routes.length > 0) {
                    const durationSec = routes[0].legs?.[0]?.duration || routes[0].duration;
                    if (typeof durationSec === 'number') {
                        etaMinutes = Math.max(1, Math.round(durationSec / 60));
                        etaText = `${etaMinutes} min`;
                        source = 'ola-traffic';
                    }
                }
            } catch (e) {
                console.error('Live ETA OLA API error:', e.message);
            }
        }

        // Fallback to Haversine estimate
        if (etaMinutes === null) {
            const distKm = getDistanceKm(driverLoc.lat, driverLoc.lng, destinationLat, destinationLng);
            etaText = estimateEtaMinutes(distKm);
            etaMinutes = distKm ? Math.max(1, Math.round((distKm / 28) * 60)) : null;
        }

        res.json({ etaMinutes, etaText, source, rideStatus: ride.status });
    } catch (error) {
        console.error('Live ETA error:', error);
        res.status(500).json({ message: 'Error computing live ETA' });
    }
});

// ── Periodic live ETA broadcast (every 60 seconds) ──
const LIVE_ETA_INTERVAL_MS = 60 * 1000;
let liveEtaTimer = null;

const broadcastLiveEta = async () => {
    try {
        const activeRides = await Ride.find({
            status: { $in: ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'] },
            driverId: { $ne: null }
        });

        for (const ride of activeRides) {
            const driverEntry = onlineDrivers.get(ride.driverId.toString());
            const driverLoc = driverEntry?.location || ride.driverLocation;

            if (!driverLoc || typeof driverLoc.lat !== 'number') continue;

            let destinationLat, destinationLng, etaLabel;
            if (ride.status === 'ACCEPTED' || ride.status === 'ARRIVED') {
                if (!ride.pickup || typeof ride.pickup.lat !== 'number') continue;
                destinationLat = ride.pickup.lat;
                destinationLng = ride.pickup.lng;
                etaLabel = 'pickup';
            } else {
                if (!ride.dropoff || typeof ride.dropoff.lat !== 'number') continue;
                destinationLat = ride.dropoff.lat;
                destinationLng = ride.dropoff.lng;
                etaLabel = 'dropoff';
            }

            let etaMinutes = null;
            let etaText = 'N/A';
            let source = 'haversine';

            if (OLA_API_KEY) {
                try {
                    const origin = `${driverLoc.lat},${driverLoc.lng}`;
                    const dest = `${destinationLat},${destinationLng}`;
                    const url = `https://api.olamaps.io/routing/v1/directions?origin=${origin}&destination=${dest}&alternatives=false&steps=false&overview=none&language=en&traffic_metadata=true&api_key=${OLA_API_KEY}`;
                    const resp = await axios.post(url);
                    const routes = resp.data?.routes;
                    if (routes && routes.length > 0) {
                        const durationSec = routes[0].legs?.[0]?.duration || routes[0].duration;
                        if (typeof durationSec === 'number') {
                            etaMinutes = Math.max(1, Math.round(durationSec / 60));
                            etaText = `${etaMinutes} min`;
                            source = 'ola-traffic';
                        }
                    }
                } catch (e) {
                    // Silently fall back to haversine
                }
            }

            if (etaMinutes === null) {
                const distKm = getDistanceKm(driverLoc.lat, driverLoc.lng, destinationLat, destinationLng);
                etaText = estimateEtaMinutes(distKm);
                etaMinutes = distKm ? Math.max(1, Math.round((distKm / 28) * 60)) : null;
            }

            const payload = {
                rideId: ride._id,
                etaMinutes,
                etaText,
                etaLabel,
                source,
                updatedAt: new Date().toISOString()
            };

            // Update the ride document with latest ETA
            if (etaLabel === 'pickup') {
                ride.etaToPickup = etaText;
            } else {
                ride.etaToDropoff = etaText;
            }

            // ── Delay Detection (User Story 2.6) ──
            const DELAY_THRESHOLD_MIN = 5;
            const DELAY_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 min cooldown between alerts

            if (etaMinutes !== null && ride.originalEtaMinutes) {
                const delayMinutes = etaMinutes - ride.originalEtaMinutes;
                const now = Date.now();
                const lastAlert = ride.lastDelayAlertAt ? new Date(ride.lastDelayAlertAt).getTime() : 0;
                const cooldownPassed = (now - lastAlert) > DELAY_ALERT_COOLDOWN_MS;

                if (delayMinutes >= DELAY_THRESHOLD_MIN && cooldownPassed) {
                    ride.lastDelayAlertAt = new Date();

                    // Create persistent notification
                    const notification = new Notification({
                        userId: ride.userId,
                        title: 'Traffic Delay Detected',
                        message: `Your ride is delayed by ~${delayMinutes} min due to traffic congestion. Updated ETA: ${etaText}.`,
                        type: 'DELAY_ALERT',
                        data: {
                            rideId: ride._id,
                            delayMinutes,
                            originalEtaMinutes: ride.originalEtaMinutes,
                            currentEtaMinutes: etaMinutes,
                            etaLabel
                        }
                    });
                    await notification.save();

                    // Push real-time delay alert to rider
                    const delayPayload = {
                        rideId: ride._id,
                        delayMinutes,
                        originalEtaMinutes: ride.originalEtaMinutes,
                        currentEtaMinutes: etaMinutes,
                        etaText,
                        etaLabel,
                        message: `Delayed ~${delayMinutes} min due to traffic`,
                        notificationId: notification._id
                    };
                    io.to(`ride:${ride._id}`).emit('ride:delay-alert', delayPayload);
                    io.to(`user:${ride.userId}`).emit('ride:delay-alert', delayPayload);
                    console.log(`⚠️  Delay alert: ride ${ride._id} delayed ${delayMinutes}min`);
                }
            }

            await ride.save();

            // Emit to rider and driver
            io.to(`ride:${ride._id}`).emit('ride:eta-update', payload);
            io.to(`user:${ride.userId}`).emit('ride:eta-update', payload);
            if (ride.driverId) io.to(`user:${ride.driverId}`).emit('ride:eta-update', payload);
        }
    } catch (error) {
        console.error('Live ETA broadcast error:', error);
    }
};

// Start ETA broadcast when DB is connected
mongoose.connection.once('open', () => {
    liveEtaTimer = setInterval(broadcastLiveEta, LIVE_ETA_INTERVAL_MS);
    console.log('⏱️  Live ETA broadcast started (every 60s)');
});

// Only start listening when run directly (not when imported for testing)
if (require.main === module) {
    httpServer.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

module.exports = { app, httpServer, io, onlineDrivers, otpStore, liveEtaTimer };
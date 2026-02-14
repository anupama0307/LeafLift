const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const nodemailer = require('nodemailer');

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
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.OTP_EMAIL_USER,
        pass: process.env.OTP_EMAIL_PASS,
    },
});
const Ride = require('./models/Ride');
const Notification = require('./models/Notification');
const { findMatchingRides, isRiderOnRoute } = require('./utils/poolMatcher');
const crypto = require('crypto');

const app = express();
let PORT = parseInt(process.env.PORT, 10) || 5001;
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: (origin, callback) => {
            // Allow any localhost origin (any port), plus no-origin requests (e.g. Postman, curl)
            if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
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

const OLA_API_KEY = process.env.OLA_MAPS_API_KEY;

// ✅ OLA Maps Autocomplete Proxy
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
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'OLA Maps server running' });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => console.log('✅ Connected to MongoDB'))
        .catch(err => console.error('❌ MongoDB error:', err));
} else {
    console.warn('⚠️ MONGODB_URI not set - database features will not work');
}

// User Routes
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
            photoUrl
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

        user = new User({
            role,
            email,
            phone,
            firstName,
            lastName,
            dob,
            gender,
            license,
            aadhar,
            authProvider: authProvider || 'email',
            emailVerified: true,
            photoUrl,
            ...driverDefaults
        });
        await user.save();
        res.status(201).json({ message: 'User created', user });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup' });
    }
});

// --- Email OTP Endpoints ---
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: 'Email is required' });

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

        otpStore.set(email, { otp, expiresAt });

        // Check if email transporter is configured
        if (process.env.OTP_EMAIL_USER && process.env.OTP_EMAIL_PASS) {
            await emailTransporter.sendMail({
                from: `"LeafLift" <${process.env.OTP_EMAIL_USER}>`,
                to: email,
                subject: 'LeafLift - Email Verification OTP',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #16a34a;">LeafLift</h2>
                        <p>Your email verification code is:</p>
                        <div style="background: #f3f4f6; padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0;">
                            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${otp}</span>
                        </div>
                        <p style="color: #666; font-size: 14px;">This code expires in 5 minutes. Do not share it with anyone.</p>
                    </div>
                `,
            });
            console.log(`📧 OTP sent to ${email}`);
        } else {
            // Dev fallback: log OTP to console
            console.log(`📧 [DEV] OTP for ${email}: ${otp}`);
        }

        res.json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

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

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// Get single user by ID
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
app.put('/api/users/:userId', async (req, res) => {
    try {
        const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'dob', 'gender', 'photoUrl', 'license', 'aadhar', 'vehicleMake', 'vehicleModel', 'vehicleNumber'];
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
app.post('/api/driver/route', async (req, res) => {
    console.log('📬 Received route update request:', JSON.stringify(req.body, null, 2));
    try {
        const { userId, source, destination, isActive } = req.body;

        // Validate required fields
        if (!userId) {
            return res.status(400).json({ message: 'userId is required' });
        }
        if (!source || !source.address || source.lat === undefined || source.lng === undefined) {
            return res.status(400).json({ message: 'source with address, lat, lng is required' });
        }
        if (!destination || !destination.address || destination.lat === undefined || destination.lng === undefined) {
            return res.status(400).json({ message: 'destination with address, lat, lng is required' });
        }

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
            isActive: isActive !== undefined ? isActive : true
        };

        const user = await User.findByIdAndUpdate(
            userId, { dailyRoute }, { new: true, runValidators: false }
        );

        if (!user) return res.status(404).json({ message: 'User not found' });

        console.log('✅ Route updated successfully for user:', userId);
        res.json({ message: 'Route updated', dailyRoute: user.dailyRoute });
    } catch (error) {
        console.error('❌ Update route error:', error);
        res.status(500).json({ message: 'Error updating route', error: error.message });
    }
});

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

            return pickupDist <= 5 && dropoffDist <= 5;
        });

        res.json(matches.map(d => ({
            id: d._id,
            name: [d.firstName, d.lastName].filter(Boolean).join(' ') || d.email || 'Driver',
            rating: d.rating || 4.8,
            vehicle: [d.vehicleMake || '', d.vehicleModel || ''].filter(Boolean).join(' ') || 'Car',
            vehicleNumber: d.vehicleNumber,
            photoUrl: d.photoUrl,
            phone: maskPhone(d.phone),
            dailyRoute: d.dailyRoute
        })));
    } catch (error) {
        console.error('Match driver error:', error);
        res.status(500).json({ message: 'Error matching drivers' });
    }
});

// ── Notifications ──
app.get('/api/notifications/:userId', async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Error marking notification as read' });
    }
});

app.get('/api/notifications/sent/:userId', async (req, res) => {
    try {
        const notifications = await Notification.find({ fromId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sent requests' });
    }
});

// ── Daily Route Join Request ──
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

        // ─── Pool Matching: find other SEARCHING pooled rides with compatible routes ───
        let poolMatch = null;
        if (ride.isPooled && ride.routePolyline && ride.pickup?.lat && ride.dropoff?.lat) {
            try {
                // Find other SEARCHING pooled rides in the same vehicle category
                const candidateRides = await Ride.find({
                    _id: { $ne: ride._id },
                    status: 'SEARCHING',
                    isPooled: true,
                    vehicleCategory: ride.vehicleCategory,
                    routePolyline: { $exists: true, $ne: '' },
                    'pickup.lat': { $exists: true },
                    'dropoff.lat': { $exists: true }
                }).populate('userId', 'firstName lastName email phone');

                const riderPickup = { lat: ride.pickup.lat, lng: ride.pickup.lng };
                const riderDropoff = { lat: ride.dropoff.lat, lng: ride.dropoff.lng };

                for (const candidate of candidateRides) {
                    // Check if this new rider's pickup/dropoff lies on the candidate's route
                    const matchOnCandidate = isRiderOnRoute(
                        candidate.routePolyline, riderPickup, riderDropoff, 0.5
                    );
                    // Also check if candidate's pickup/dropoff lies on this new rider's route
                    const candidatePickup = { lat: candidate.pickup.lat, lng: candidate.pickup.lng };
                    const candidateDropoff = { lat: candidate.dropoff.lat, lng: candidate.dropoff.lng };
                    const matchOnNew = isRiderOnRoute(
                        ride.routePolyline, candidatePickup, candidateDropoff, 0.5
                    );

                    if (matchOnCandidate.match || matchOnNew.match) {
                        poolMatch = candidate;
                        break;
                    }
                }

                if (poolMatch) {
                    // Generate a shared pool group ID
                    const groupId = poolMatch.poolGroupId || crypto.randomUUID();

                    // ─── Fare Splitting: 35% discount for each rider ───
                    const newRiderPoolFare = Math.round((ride.currentFare || ride.fare) * 0.65);
                    const existingRiderPoolFare = Math.round((poolMatch.currentFare || poolMatch.fare) * 0.65);

                    // Update both rides with group ID and pool fares
                    ride.poolGroupId = groupId;
                    ride.currentFare = newRiderPoolFare;
                    await ride.save();

                    if (!poolMatch.poolGroupId) {
                        poolMatch.poolGroupId = groupId;
                    }
                    poolMatch.currentFare = existingRiderPoolFare;
                    await poolMatch.save();

                    console.log(`🤝 Pool match found! Group ${groupId}: Rider ${ride.userId} ↔ Rider ${poolMatch.userId._id || poolMatch.userId}`);
                    console.log(`💰 Pool fares: ₹${newRiderPoolFare} + ₹${existingRiderPoolFare} (was ₹${ride.fare} + ₹${poolMatch.fare})`);

                    // Fetch the new rider's info for the notification
                    const newRider = await User.findById(ride.userId).select('firstName lastName');

                    // Notify the existing rider about the match
                    const existingRiderId = poolMatch.userId._id || poolMatch.userId;
                    io.to(`user:${existingRiderId}`).emit('pool:matched', {
                        poolGroupId: groupId,
                        matchedRider: {
                            name: `${newRider?.firstName || 'Rider'} ${newRider?.lastName || ''}`.trim(),
                            pickup: ride.pickup,
                            dropoff: ride.dropoff
                        },
                        rideId: poolMatch._id,
                        originalFare: poolMatch.fare,
                        poolFare: existingRiderPoolFare,
                        message: `${newRider?.firstName || 'A rider'} wants to pool with you!`
                    });

                    // Notify the new rider about the match
                    const matchedRiderName = `${poolMatch.userId.firstName || 'Rider'} ${poolMatch.userId.lastName || ''}`.trim();
                    io.to(`user:${ride.userId}`).emit('pool:matched', {
                        poolGroupId: groupId,
                        matchedRider: {
                            name: matchedRiderName,
                            pickup: poolMatch.pickup,
                            dropoff: poolMatch.dropoff
                        },
                        rideId: ride._id,
                        originalFare: ride.fare,
                        poolFare: newRiderPoolFare,
                        message: `Matched with ${matchedRiderName} for pooling!`
                    });
                }
            } catch (err) {
                console.error('⚠️  Pool matching error:', err);
            }
        }

        // ─── Broadcast ride request to nearby drivers ───
        const RIDE_BROADCAST_RADIUS_KM = 6;

        // If pool match was found, remove the first rider's individual request
        // and broadcast ONE consolidated pool request
        if (poolMatch) {
            // Remove BOTH riders' individual requests from all drivers
            // The first rider's request was already broadcast earlier when they created their ride
            // The second rider's request might have been briefly broadcast too
            io.to('drivers:online').emit('nearby:rider:remove', { rideId: poolMatch._id.toString() });
            io.to('drivers:online').emit('nearby:rider:remove', { rideId: ride._id.toString() });

            // Fetch rider names
            const riderA = poolMatch.userId;
            const riderB = await User.findById(ride.userId).select('firstName lastName');

            // Build ONE consolidated pool request payload
            const poolPayload = {
                rideId: ride._id.toString(), // Use the newer ride as the primary, stringified
                pickup: ride.pickup, // Use first pickup (closest) for map marker
                dropoff: ride.dropoff,
                fare: (ride.currentFare || ride.fare) + (poolMatch.currentFare || poolMatch.fare), // Combined fare for driver
                currentFare: (ride.currentFare || ride.fare) + (poolMatch.currentFare || poolMatch.fare),
                isPooled: true,
                poolGroupId: ride.poolGroupId,
                routeIndex: ride.routeIndex,
                bookingTime: ride.bookingTime,
                poolGroupRiders: [
                    {
                        name: `${riderA.firstName || 'Rider'} ${riderA.lastName || ''}`.trim(),
                        pickup: poolMatch.pickup,
                        dropoff: poolMatch.dropoff,
                        rideId: poolMatch._id.toString()
                    },
                    {
                        name: `${riderB?.firstName || 'Rider'} ${riderB?.lastName || ''}`.trim(),
                        pickup: ride.pickup,
                        dropoff: ride.dropoff,
                        rideId: ride._id.toString()
                    }
                ]
            };

            // Small delay to ensure remove events are processed before the new consolidated request
            await new Promise(resolve => setTimeout(resolve, 50));

            // Broadcast to nearby drivers
            if (ride.pickup && typeof ride.pickup.lat === 'number' && typeof ride.pickup.lng === 'number') {
                let sentCount = 0;
                for (const [driverId, entry] of onlineDrivers.entries()) {
                    if (!entry.location || typeof entry.location.lat !== 'number') continue;
                    const dist = getDistanceKm(entry.location.lat, entry.location.lng, ride.pickup.lat, ride.pickup.lng);
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
        } else {
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
                console.log(`ride:request sent to ${sentCount} nearby drivers (within ${RIDE_BROADCAST_RADIUS_KM}km)`);
            } else {
                io.to('drivers:online').emit('ride:request', ridePayload);
            }
        }

        res.status(201).json({ ...ride.toObject(), poolGroupId: ride.poolGroupId });
    } catch (error) {
        console.error('Create ride error:', error);
        res.status(500).json({ message: 'Error creating ride' });
    }
});

app.get('/api/rides/user/:userId', async (req, res) => {
    try {
        const rides = await Ride.find({ userId: req.params.userId }).sort({ bookingTime: -1, createdAt: -1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rides' });
    }
});

app.get('/api/rides/driver/:driverId', async (req, res) => {
    try {
        const rides = await Ride.find({ driverId: req.params.driverId }).sort({ bookingTime: -1, createdAt: -1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rides' });
    }
});

// Nearby ride requests for drivers
app.get('/api/rides/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 6 } = req.query;
        // Only return rides created in the last 15 minutes to avoid stale requests
        const staleThreshold = new Date(Date.now() - 15 * 60 * 1000);
        const rides = await Ride.find({
            status: 'SEARCHING',
            createdAt: { $gte: staleThreshold }
        }).sort({ bookingTime: -1 });

        // Auto-cancel old stale SEARCHING rides
        await Ride.updateMany(
            { status: 'SEARCHING', createdAt: { $lt: staleThreshold } },
            { $set: { status: 'CANCELED' } }
        );

        const latNum = lat ? Number(lat) : null;
        const lngNum = lng ? Number(lng) : null;
        const radiusNum = Number(radius) || 6;

        if (latNum !== null && lngNum !== null) {
            const filtered = rides.filter((ride) => {
                if (!ride.pickup || typeof ride.pickup.lat !== 'number') return false;
                const dist = getDistanceKm(latNum, lngNum, ride.pickup.lat, ride.pickup.lng);
                return dist !== null && dist <= radiusNum;
            });
            return res.json(filtered);
        }

        res.json(rides);
    } catch (error) {
        console.error('Error fetching nearby rides:', error);
        res.status(500).json({ message: 'Error fetching nearby rides', details: error.message });
    }
});

// ── Driver search by location (uses OLA geocoding) ──
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
        const rides = await Ride.find({ status: 'SEARCHING' }).sort({ bookingTime: -1 });
        const filtered = rides.filter((ride) => {
            if (!ride.pickup || typeof ride.pickup.lat !== 'number') return false;
            const dist = getDistanceKm(lat, lng, ride.pickup.lat, ride.pickup.lng);
            return dist !== null && dist <= radiusNum;
        });

        res.json(filtered);
    } catch (error) {
        res.status(500).json({ message: 'Error searching by location' });
    }
});

// ── Find matching SEARCHING pooled rides (rider-to-rider matching) ──
app.get('/api/rides/pooled-in-progress', async (req, res) => {
    try {
        const { lat, lng, destLat, destLng, vehicleCategory, bufferKm = 0.5, excludeUserId } = req.query;

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
            .populate('userId', 'firstName lastName email rating');

        const riderPickup = { lat: latNum, lng: lngNum };
        const riderDropoff = { lat: destLatNum, lng: destLngNum };

        // Match using geometric algorithm
        const matched = [];
        for (const ride of rides) {
            const result = isRiderOnRoute(ride.routePolyline, riderPickup, riderDropoff, bufferKmNum);
            if (result.match) {
                const riderInfo = ride.userId || {};
                matched.push({
                    _id: ride._id,
                    rideId: ride._id,
                    poolGroupId: ride.poolGroupId,
                    vehicleCategory: ride.vehicleCategory,
                    rider: {
                        name: `${riderInfo.firstName || 'Rider'} ${riderInfo.lastName || ''}`.trim(),
                        rating: riderInfo.rating || 4.8
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
        }).populate('userId', 'firstName lastName email rating');

        for (const ride of ridesWithoutPolyline) {
            const pickupDist = getDistanceKm(latNum, lngNum, ride.pickup.lat, ride.pickup.lng);
            const dropoffDist = getDistanceKm(destLatNum, destLngNum, ride.dropoff.lat, ride.dropoff.lng);
            if (pickupDist !== null && pickupDist <= 3 && dropoffDist !== null && dropoffDist <= 3) {
                const riderInfo = ride.userId || {};
                matched.push({
                    _id: ride._id,
                    rideId: ride._id,
                    poolGroupId: ride.poolGroupId,
                    vehicleCategory: ride.vehicleCategory,
                    rider: {
                        name: `${riderInfo.firstName || 'Rider'} ${riderInfo.lastName || ''}`.trim(),
                        rating: riderInfo.rating || 4.8
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

// ── Get all rides in a pool group ──
app.get('/api/rides/pool-group/:poolGroupId', async (req, res) => {
    try {
        const rides = await Ride.find({ poolGroupId: req.params.poolGroupId })
            .populate('userId', 'firstName lastName email phone rating')
            .populate('driverId', 'firstName lastName rating vehicleMake vehicleModel vehicleNumber');
        res.json(rides);
    } catch (error) {
        console.error('Error fetching pool group:', error);
        res.status(500).json({ message: 'Error fetching pool group' });
    }
});

app.get('/api/rides/:rideId', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        res.json(ride);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ride' });
    }
});

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
app.post('/api/drivers/online', async (req, res) => {
    const { driverId, location } = req.body;
    if (!driverId) return res.status(400).json({ message: 'driverId required' });

    const entry = onlineDrivers.get(driverId) || { socketIds: new Set(), location: null };
    if (req.body.socketId) entry.socketIds.add(req.body.socketId);
    entry.location = location || entry.location;
    onlineDrivers.set(driverId, entry);
    res.json({ ok: true, onlineDrivers: onlineDrivers.size });
});

app.post('/api/drivers/offline', async (req, res) => {
    const { driverId } = req.body;
    if (driverId) onlineDrivers.delete(driverId);
    res.json({ ok: true });
});

// Accept ride
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
                maskedPhone: maskPhone(driver.phone)
            } : null,
            rider: rider ? {
                id: rider._id,
                name: [rider.firstName, rider.lastName].filter(Boolean).join(' ') || rider.email || 'Rider',
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
        io.to('drivers:online').emit('nearby:rider:remove', { rideId: ride._id });

        res.json(payload);
    } catch (error) {
        console.error('Accept ride error:', error);
        res.status(500).json({ message: 'Error accepting ride' });
    }
});

// ─── Pool Stop Navigation: driver reached a pool stop ───
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

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Error marking reached' });
    }
});

// Verify OTP and start ride
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
app.get('/api/rides/:rideId/messages', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        res.json(ride.chat || []);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages' });
    }
});

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
app.post('/api/rides/:rideId/pool/add', async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        if (!ride.isPooled) return res.status(400).json({ message: 'Ride is not pooled' });

        const { userId, pickup, dropoff, firstName, lastName } = req.body;

        // Calculate new fare split
        const originalFare = ride.fare || 0; // Original full fare
        const currentPassengers = ride.passengers + (ride.pooledRiders ? ride.pooledRiders.length : 0);
        const totalPassengersAfter = currentPassengers + 1; // Including new rider

        // New fare per person after split
        const newFarePerPerson = Math.round(originalFare / totalPassengersAfter);

        // Update current fare to the new split amount
        ride.currentFare = newFarePerPerson;

        // Add the new rider
        if (!ride.pooledRiders) ride.pooledRiders = [];
        ride.pooledRiders.push({
            userId,
            firstName: firstName || 'Pooled Rider',
            lastName: lastName || '',
            pickup,
            dropoff,
            fareAdjustment: -(originalFare - newFarePerPerson), // How much they save
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

        // Get joining user details
        const joiningUser = await User.findById(userId);
        if (!joiningUser) return res.status(404).json({ message: 'User not found' });

        // Add rider to pooledRiders array
        pooledRide.pooledRiders.push({
            userId,
            firstName: joiningUser.firstName,
            lastName: joiningUser.lastName,
            pickup,
            dropoff,
            fareAdjustment: 0,
            joinedAt: new Date()
        });

        // Recalculate fare: split original fare among all passengers
        const originalFare = pooledRide.fare;
        const totalPassengers = pooledRide.passengers + pooledRide.pooledRiders.length;
        const perPersonFare = Math.round(originalFare / totalPassengers);

        // Update current fare to reflect the split
        pooledRide.currentFare = perPersonFare;

        await pooledRide.save();

        // Notify driver and existing riders about new pool member
        io.to(`ride:${pooledRide._id}`).emit('pool:rider-joined', {
            rideId: pooledRide._id,
            newRider: {
                name: `${joiningUser.firstName} ${joiningUser.lastName}`,
                pickup: pickup?.address,
                dropoff: dropoff?.address
            },
            totalPassengers,
            perPersonFare
        });

        res.json({
            message: 'Successfully joined pool ride!',
            pooledRideId: pooledRide._id,
            perPersonFare,
            totalPassengers
        });
    } catch (error) {
        console.error('Pool join error:', error);
        res.status(500).json({ message: 'Error joining pooled ride' });
    }
});

// ── Driver requests early completion (rider must confirm) ──
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
app.get('/api/users/:userId/wallet', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ balance: user.walletBalance || 0 });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet' });
    }
});

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

// ── Multi-Stop: Mark stop as reached ──
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
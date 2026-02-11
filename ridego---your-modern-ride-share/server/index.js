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

const app = express();
const PORT = process.env.PORT || 5001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3005';
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: CORS_ORIGIN,
        methods: ['GET', 'POST', 'PUT']
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
app.get('/api/ola/autocomplete', async(req, res) => {
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

// ✅ OLA Maps Directions Proxy
app.post('/api/ola/directions', async(req, res) => {
    try {
        const { origin, destination, alternatives } = req.body;

        if (!origin || !destination) {
            return res.status(400).json({ error: 'Origin and destination required' });
        }

        if (!OLA_API_KEY) {
            return res.status(500).json({ error: 'OLA_MAPS_API_KEY not configured' });
        }

        const url = `https://api.olamaps.io/routing/v1/directions?origin=${origin}&destination=${destination}&alternatives=${alternatives || false}&steps=true&overview=full&language=en&traffic_metadata=true&api_key=${OLA_API_KEY}`;

        console.log(`🗺️ OLA Directions: ${origin} → ${destination}`);
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
app.get('/api/ola/reverse-geocode', async(req, res) => {
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
app.post('/api/login', async(req, res) => {
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

app.post('/api/signup', async(req, res) => {
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
app.post('/api/send-otp', async(req, res) => {
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

app.post('/api/verify-otp', async(req, res) => {
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

app.get('/api/users', async(req, res) => {
    try {
        const users = await User.find();
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
});

// Get single user by ID
app.get('/api/users/:userId', async(req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user' });
    }
});

// Update user profile
app.put('/api/users/:userId', async(req, res) => {
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
app.post('/api/driver/route', async(req, res) => {
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

app.get('/api/rider/match-driver', async(req, res) => {
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
app.get('/api/notifications/:userId', async(req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});

app.post('/api/notifications/:id/read', async(req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Error marking notification as read' });
    }
});

app.get('/api/notifications/sent/:userId', async(req, res) => {
    try {
        const notifications = await Notification.find({ fromId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching sent requests' });
    }
});

// ── Daily Route Join Request ──
app.post('/api/rider/request-daily-join', async(req, res) => {
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
app.post('/api/rides', async(req, res) => {
    try {
        const payload = {...req.body };

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

        const ride = new Ride(payload);
        await ride.save();

        // Location-filtered broadcast: only send to drivers within 6 km of pickup
        const RIDE_BROADCAST_RADIUS_KM = 6;
        const ridePayload = {
            rideId: ride._id,
            pickup: ride.pickup,
            dropoff: ride.dropoff,
            fare: ride.fare,
            currentFare: ride.currentFare,
            isPooled: ride.isPooled,
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
            // Fallback: no pickup coords, broadcast to all
            io.to('drivers:online').emit('ride:request', ridePayload);
        }

        res.status(201).json(ride);
    } catch (error) {
        console.error('Create ride error:', error);
        res.status(500).json({ message: 'Error creating ride' });
    }
});

app.get('/api/rides/user/:userId', async(req, res) => {
    try {
        const rides = await Ride.find({ userId: req.params.userId }).sort({ bookingTime: -1, createdAt: -1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rides' });
    }
});

app.get('/api/rides/driver/:driverId', async(req, res) => {
    try {
        const rides = await Ride.find({ driverId: req.params.driverId }).sort({ bookingTime: -1, createdAt: -1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching rides' });
    }
});

// Nearby ride requests for drivers
app.get('/api/rides/nearby', async(req, res) => {
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
app.get('/api/rides/nearby-by-location', async(req, res) => {
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

// ── Find in-progress pooled rides for joining ──
app.get('/api/rides/pooled-in-progress', async(req, res) => {
    try {
        const { lat, lng, destLat, destLng, vehicleCategory, radius = 3 } = req.query;

        if (!lat || !lng || !destLat || !destLng) {
            return res.status(400).json({ message: 'lat, lng, destLat, destLng required' });
        }

        const latNum = Number(lat);
        const lngNum = Number(lng);
        const destLatNum = Number(destLat);
        const destLngNum = Number(destLng);
        const radiusNum = Number(radius) || 3;

        // Find rides that are ACCEPTED or IN_PROGRESS, pooled, and have capacity
        const rides = await Ride.find({
            status: { $in: ['ACCEPTED', 'IN_PROGRESS'] },
            isPooled: true,
            vehicleCategory: vehicleCategory || { $in: ['CAR', 'BIG_CAR'] }
        });

        const available = rides.filter((ride) => {
            // Check if ride has capacity
            const currentPassengers = ride.passengers + (ride.pooledRiders ? ride.pooledRiders.length : 0);
            const maxPass = ride.maxPassengers || 4;
            if (currentPassengers >= maxPass) return false;

            // Check if pickup is nearby
            if (!ride.pickup || typeof ride.pickup.lat !== 'number') return false;
            const pickupDist = getDistanceKm(latNum, lngNum, ride.pickup.lat, ride.pickup.lng);
            if (pickupDist === null || pickupDist > radiusNum) return false;

            // Check if dropoff is in similar direction (optional enhancement)
            return true;
        });

        const enriched = available.map(ride => ({
            ...ride.toObject(),
            currentPassengers: ride.passengers + (ride.pooledRiders ? ride.pooledRiders.length : 0),
            availableSeats: (ride.maxPassengers || 4) - (ride.passengers + (ride.pooledRiders ? ride.pooledRiders.length : 0))
        }));

        res.json(enriched);
    } catch (error) {
        console.error('Error fetching pooled rides:', error);
        res.status(500).json({ message: 'Error fetching pooled rides' });
    }
});

app.get('/api/rides/:rideId', async(req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        res.json(ride);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ride' });
    }
});

app.put('/api/rides/:rideId/status', async(req, res) => {
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

// Driver presence
app.post('/api/drivers/online', async(req, res) => {
    const { driverId, location } = req.body;
    if (!driverId) return res.status(400).json({ message: 'driverId required' });

    const entry = onlineDrivers.get(driverId) || { socketIds: new Set(), location: null };
    if (req.body.socketId) entry.socketIds.add(req.body.socketId);
    entry.location = location || entry.location;
    onlineDrivers.set(driverId, entry);
    res.json({ ok: true, onlineDrivers: onlineDrivers.size });
});

app.post('/api/drivers/offline', async(req, res) => {
    const { driverId } = req.body;
    if (driverId) onlineDrivers.delete(driverId);
    res.json({ ok: true });
});

// Accept ride
app.post('/api/rides/:rideId/accept', async(req, res) => {
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
        const distanceKm = hasDriverLocation && hasPickup ?
            getDistanceKm(driverLocation.lat, driverLocation.lng, ride.pickup.lat, ride.pickup.lng) :
            null;
        const etaToPickup = estimateEtaMinutes(distanceKm);

        ride.driverId = driverId;
        ride.status = 'ACCEPTED';
        ride.etaToPickup = etaToPickup;
        if (hasDriverLocation) {
            ride.driverLocation = { lat: driverLocation.lat, lng: driverLocation.lng, updatedAt: new Date() };
        }
        ride.contact = {
            riderMasked: maskPhone(rider && rider.phone),
            driverMasked: maskPhone(driver && driver.phone)
        };

        await ride.save();

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
            } : null
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

// Driver reached pickup -> generate OTP
app.post('/api/rides/:rideId/reached', async(req, res) => {
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
app.post('/api/rides/:rideId/verify-otp', async(req, res) => {
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
app.post('/api/rides/:rideId/complete', async(req, res) => {
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
app.post('/api/rides/:rideId/location', async(req, res) => {
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
app.get('/api/rides/:rideId/messages', async(req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });
        res.json(ride.chat || []);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages' });
    }
});

app.post('/api/rides/:rideId/messages', async(req, res) => {
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
app.post('/api/rides/:rideId/pool/add', async(req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ message: 'Ride not found' });

        if (!ride.isPooled) return res.status(400).json({ message: 'Ride is not pooled' });

        const adjustment = typeof(req.body && req.body.fareAdjustment) === 'number' ?
            req.body.fareAdjustment :
            Math.round((ride.currentFare || ride.fare || 0) * -0.3);

        ride.currentFare = Math.max(0, (ride.currentFare || ride.fare || 0) + adjustment);
        ride.pooledRiders.push({
            userId: req.body && req.body.userId,
            fareAdjustment: adjustment,
            joinedAt: new Date()
        });
        await ride.save();

        io.to(`ride:${ride._id}`).emit('ride:pooled-rider-added', {
            rideId: ride._id,
            currentFare: ride.currentFare,
            pooledRiders: ride.pooledRiders
        });

        res.json(ride);
    } catch (error) {
        res.status(500).json({ message: 'Error adding pooled rider' });
    }
});

// Join in-progress pooled ride as new rider
app.post('/api/rides/:rideId/pool/join', async(req, res) => {
    try {
        const { userId, pickup, dropoff, passengers = 1 } = req.body;
        if (!userId) return res.status(400).json({ message: 'userId required' });

        const pooledRide = await Ride.findById(req.params.rideId);
        if (!pooledRide) return res.status(404).json({ message: 'Ride not found' });
        if (!pooledRide.isPooled) return res.status(400).json({ message: 'Ride is not pooled' });
        if (pooledRide.status !== 'ACCEPTED' && pooledRide.status !== 'IN_PROGRESS') {
            return res.status(400).json({ message: 'Ride not available for pooling' });
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
app.post('/api/rides/:rideId/request-complete', async(req, res) => {
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
app.post('/api/rides/:rideId/confirm-complete', async(req, res) => {
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
app.get('/api/users/:userId/wallet', async(req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ balance: user.walletBalance || 0 });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet' });
    }
});

app.post('/api/users/:userId/wallet/add', async(req, res) => {
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
app.get('/api/users/:userId/stats', async(req, res) => {
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
app.post('/api/rides/schedule', async(req, res) => {
    try {
        const payload = {...req.body, isScheduled: true, status: 'SEARCHING' };
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

app.get('/api/rides/scheduled/:userId', async(req, res) => {
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

app.delete('/api/rides/scheduled/:rideId', async(req, res) => {
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
app.get('/api/drivers/nearby', async(req, res) => {
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

// ── Live ETA for active rides ──
app.get('/api/rides/:rideId/live-eta', async(req, res) => {
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
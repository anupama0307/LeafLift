const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config();

const axios = require('axios');
const User = require('./models/User');
const Ride = require('./models/Ride');

const app = express();
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
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
        }
    });

    socket.on('join:ride', ({ rideId }) => {
        if (rideId) socket.join(`ride:${rideId}`);
    });

    socket.on('leave:ride', ({ rideId }) => {
        if (rideId) socket.leave(`ride:${rideId}`);
    });

    socket.on('disconnect', () => {
        if (socket.data?.role === 'DRIVER' && socket.data?.userId) {
            const entry = onlineDrivers.get(socket.data.userId);
            if (entry?.socketIds) {
                entry.socketIds.delete(socket.id);
                if (entry.socketIds.size === 0) {
                    onlineDrivers.delete(socket.data.userId);
                }
            }
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
        console.error('❌ OLA Autocomplete error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch autocomplete',
            details: error.response?.data || error.message
        });
    }
});

// ✅ OLA Maps Directions Proxy
app.post('/api/ola/directions', async (req, res) => {
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
        console.error('❌ OLA Directions error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to fetch directions',
            details: error.response?.data || error.message
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
        console.error('❌ OLA Reverse Geocode error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to reverse geocode',
            details: error.response?.data || error.message
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'OLA Maps server running' });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB error:', err));

// User Routes
app.post('/api/login', async (req, res) => {
    try {
        const { phone, role } = req.body;
        const user = await User.findOne({ phone, role });
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
            phone,
            firstName,
            lastName,
            dob,
            gender,
            license,
            aadhar,
            vehicleMake,
            vehicleModel,
            vehicleNumber,
            rating,
            photoUrl
        } = req.body;
        
        let user = await User.findOne({ phone, role });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const driverDefaults = role === 'DRIVER' ? {
            vehicleMake: vehicleMake || 'Tata',
            vehicleModel: vehicleModel || 'Nexon',
            vehicleNumber: vehicleNumber || 'TN 37 AB 1234',
            rating: rating || 4.8,
            photoUrl: photoUrl || `https://i.pravatar.cc/150?u=${phone}`
        } : {};

        user = new User({ role, phone, firstName, lastName, dob, gender, license, aadhar, ...driverDefaults });
        await user.save();
        res.status(201).json({ message: 'User created', user });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error during signup' });
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

        const ride = new Ride(payload);
        await ride.save();

        io.to('drivers:online').emit('ride:request', {
            rideId: ride._id,
            pickup: ride.pickup,
            dropoff: ride.dropoff,
            fare: ride.fare,
            currentFare: ride.currentFare,
            isPooled: ride.isPooled,
            routeIndex: ride.routeIndex,
            bookingTime: ride.bookingTime
        });

        res.status(201).json(ride);
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
            req.params.rideId,
            { status },
            { new: true }
        );
        res.json(ride);
    } catch (error) {
        res.status(500).json({ message: 'Error updating ride' });
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

// Nearby ride requests for drivers
app.get('/api/rides/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 6 } = req.query;
        const rides = await Ride.find({ status: 'SEARCHING' }).sort({ bookingTime: -1 });

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
        res.status(500).json({ message: 'Error fetching nearby rides' });
    }
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
        const distanceKm = hasDriverLocation && hasPickup
            ? getDistanceKm(driverLocation.lat, driverLocation.lng, ride.pickup.lat, ride.pickup.lng)
            : null;
        const etaToPickup = estimateEtaMinutes(distanceKm);

        ride.driverId = driverId;
        ride.status = 'ACCEPTED';
        ride.etaToPickup = etaToPickup;
        if (hasDriverLocation) {
            ride.driverLocation = { lat: driverLocation.lat, lng: driverLocation.lng, updatedAt: new Date() };
        }
        ride.contact = {
            riderMasked: maskPhone(rider?.phone),
            driverMasked: maskPhone(driver?.phone)
        };

        await ride.save();

        const payload = {
            ride,
            driver: driver ? {
                id: driver._id,
                name: `${driver.firstName} ${driver.lastName}`,
                rating: driver.rating || 4.8,
                vehicle: `${driver.vehicleMake || 'Car'} ${driver.vehicleModel || ''}`.trim(),
                vehicleNumber: driver.vehicleNumber || 'TN 37 AB 1234',
                photoUrl: driver.photoUrl || `https://i.pravatar.cc/150?u=${driver._id}`,
                maskedPhone: maskPhone(driver.phone)
            } : null,
            rider: rider ? {
                id: rider._id,
                name: `${rider.firstName} ${rider.lastName}`,
                maskedPhone: maskPhone(rider.phone)
            } : null
        };

        io.to(`ride:${ride._id}`).emit('ride:accepted', payload);
        io.to(`user:${ride.userId}`).emit('ride:accepted', payload);
        io.to(`user:${driverId}`).emit('ride:accepted', payload);

        res.json(payload);
    } catch (error) {
        console.error('Accept ride error:', error);
        res.status(500).json({ message: 'Error accepting ride' });
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
        await ride.save();

        io.to(`ride:${ride._id}`).emit('ride:status', { rideId: ride._id, status: ride.status });
        io.to(`user:${ride.userId}`).emit('ride:status', { rideId: ride._id, status: ride.status });
        if (ride.driverId) io.to(`user:${ride.driverId}`).emit('ride:status', { rideId: ride._id, status: ride.status });

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

        const adjustment = typeof req.body?.fareAdjustment === 'number'
            ? req.body.fareAdjustment
            : Math.round((ride.currentFare || ride.fare || 0) * -0.3);

        ride.currentFare = Math.max(0, (ride.currentFare || ride.fare || 0) + adjustment);
        ride.pooledRiders.push({
            userId: req.body?.userId,
            fareAdjustment: adjustment,
            joinedAt: new Date()
        });

        await ride.save();

        io.to(`ride:${ride._id}`).emit('ride:fare-update', {
            rideId: ride._id,
            currentFare: ride.currentFare,
            adjustment
        });
        io.to(`user:${ride.userId}`).emit('ride:fare-update', {
            rideId: ride._id,
            currentFare: ride.currentFare,
            adjustment
        });

        res.json({ ok: true, ride });
    } catch (error) {
        res.status(500).json({ message: 'Error adding pooled rider' });
    }
});

httpServer.listen(PORT, () => {
    console.log(`✅ OLA Maps Server running on port ${PORT}`);
});

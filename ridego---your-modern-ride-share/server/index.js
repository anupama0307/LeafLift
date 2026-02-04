const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Load env from parent directory if not found locally
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config(); // Fallback to local .env

const axios = require('axios');
const User = require('./models/User');
const Ride = require('./models/Ride');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Mappls Token State
let accessToken = null;
let tokenExpiry = 0;

// Token generation endpoint - FIXED VERSION
app.post('/api/mappls/token', async (req, res) => {
    try {
        // Return cached token if still valid
        if (accessToken && Date.now() < tokenExpiry) {
            return res.json({ access_token: accessToken });
        }

        const clientId = process.env.VITE_MAPPLS_CLIENT_ID;
        const clientSecret = process.env.VITE_MAPPLS_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return res.status(500).json({ error: 'MapPLS credentials not configured' });
        }

        const tokenUrl = 'https://outpost.mappls.com/api/security/oauth/token';

        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);

        const response = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const data = response.data;
        accessToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000; // Refresh 1 min before expiry

        console.log('✅ MapPLS token generated successfully');
        res.json({ access_token: accessToken });

    } catch (error) {
        console.error('❌ Token generation error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Failed to generate token',
            details: error.response?.data || error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://iris715nn_db_user:net15thu08@leaflift.zqkaqdc.mongodb.net/leaflift?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// Routes
app.post('/api/login', async (req, res) => {
    try {
        const { phone, role } = req.body;
        const user = await User.findOne({ phone, role });
        if (user) {
            res.json({ exists: true, user });
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        console.error('Login check error:', error);
        res.status(500).json({ message: 'Server error during login check' });
    }
});

app.post('/api/signup', async (req, res) => {
    try {
        const { role, phone, firstName, lastName, dob, gender, license, aadhar } = req.body;

        // Check if user already exists
        let user = await User.findOne({ phone, role });
        if (user) {
            return res.status(400).json({ message: 'User already exists with this phone number and role' });
        }

        user = new User({
            role,
            phone,
            firstName,
            lastName,
            dob,
            gender,
            license,
            aadhar
        });

        await user.save();
        res.status(201).json({ message: 'User created successfully', user });
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
        res.status(500).json({ message: 'Server error fetching users' });
    }
});

// Ride Routes
app.post('/api/rides', async (req, res) => {
    try {
        const ride = new Ride(req.body);
        await ride.save();
        res.status(201).json(ride);
    } catch (error) {
        console.error('Create ride error:', error);
        res.status(500).json({ message: 'Error creating ride' });
    }
});

app.get('/api/rides/user/:userId', async (req, res) => {
    try {
        const rides = await Ride.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(rides);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user rides' });
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
        res.status(500).json({ message: 'Error updating ride status' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

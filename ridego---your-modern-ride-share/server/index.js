const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

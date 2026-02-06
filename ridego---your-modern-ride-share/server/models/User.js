const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    role: { type: String, enum: ['RIDER', 'DRIVER'], required: true },
    phone: { type: String, required: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dob: { type: String, required: true },
    gender: { type: String, required: true },
    // Driver specific fields
    license: { type: String },
    aadhar: { type: String },
    vehicleMake: { type: String },
    vehicleModel: { type: String },
    vehicleNumber: { type: String },
    rating: { type: Number, default: 4.8 },
    photoUrl: { type: String },
    createdAt: { type: Date, default: Date.now },
});


module.exports = mongoose.model('User', userSchema);

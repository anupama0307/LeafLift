const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });
require('dotenv').config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/leaflift';

mongoose.connect(mongoUri)
    .then(async () => {
        const users = await mongoose.connection.db.collection('users').find({ role: 'DRIVER' }).toArray();
        console.log('DRIVER USERS FOUND:', users.length);
        if (users.length > 0) {
            console.log('FIRST DRIVER ID:', users[0]._id);
            console.log('FIRST DRIVER DATA:', JSON.stringify(users[0], null, 2));
        } else {
            const allUsers = await mongoose.connection.db.collection('users').find({}).toArray();
            console.log('TOTAL USERS IN DB:', allUsers.length);
            if (allUsers.length > 0) {
                console.log('SAMPLE USER:', JSON.stringify(allUsers[0], null, 2));
            }
        }
        process.exit(0);
    })
    .catch(e => {
        console.error('DB Connection Error:', e);
        process.exit(1);
    });

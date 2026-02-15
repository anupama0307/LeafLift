const axios = require('axios');
const crypto = require('crypto');

const BASE_URL = 'http://localhost:5000/api';

// Helper to generate random phone number
const randomPhone = () => '9' + Math.floor(100000000 + Math.random() * 900000000);

async function runTests() {
    console.log('🚀 Starting Integration Tests...');

    // 1. Health Check
    try {
        await axios.get(`${BASE_URL}/health`);
        console.log('✅ Server is reachable');
    } catch (error) {
        console.error('❌ Server is NOT reachable. Please start the server (npm run dev) and try again.');
        process.exit(1);
    }

    // 2. Signup Verified Female Driver
    const driverPhone = randomPhone();
    const driverData = {
        role: 'DRIVER',
        phone: driverPhone,
        firstName: 'D',
        lastName: 'FemaleVerified',
        dob: '1990-01-01',
        gender: 'Female',
        license: 'LIC12345',
        aadhar: '123412341234', // Triggers auto-verification
        vehicleMake: 'Tata',
        vehicleModel: 'Nexon',
        vehicleNumber: 'TN 01 AB 1234',
        // Driver needs a location to be "active" for nearby searches
    };

    let driverId;
    try {
        const res = await axios.post(`${BASE_URL}/signup`, driverData);
        if (res.data.user.isVerified) {
            console.log('✅ Driver Signup & Verification: SUCCESS');
            driverId = res.data.user._id;
        } else {
            console.error('❌ Driver Signup & Verification: FAILED (User not verified)');
        }
    } catch (error) {
        console.error('❌ Driver Signup Failed:', error.response?.data || error.message);
    }

    // 3. Signup Rider (Female)
    const riderPhone = randomPhone();
    const riderData = {
        role: 'RIDER',
        phone: riderPhone,
        firstName: 'R',
        lastName: 'Female',
        dob: '1995-01-01',
        gender: 'Female',
        aadhar: '987698769876' // Triggers verification
    };

    let riderId;
    try {
        const res = await axios.post(`${BASE_URL}/signup`, riderData);
        riderId = res.data.user._id;
        console.log('✅ Rider Signup: SUCCESS');
    } catch (error) {
        console.error('❌ Rider Signup Failed:', error.response?.data || error.message);
    }

    // 4. Driver Publishes Route
    if (driverId) {
        const routeData = {
            userId: driverId,
            source: { address: 'Anna Nagar, Chennai', lat: 13.0827, lng: 80.2707 },
            destination: { address: 'T Nagar, Chennai', lat: 13.0418, lng: 80.2341 },
            isActive: true,
            genderPreference: 'Any'
        };
        try {
            await axios.post(`${BASE_URL}/driver/route`, routeData);
            console.log('✅ Driver Publish Route: SUCCESS');
        } catch (error) {
            console.error('❌ Driver Publish Route Failed:', error.response?.data || error.message);
        }
    }

    // 5. Rider Matches Driver (Location + Gender)
    if (riderId && driverId) {
        // Source near Driver Start, Dest near Driver End
        const searchParams = {
            pickupLat: 13.0820,
            pickupLng: 80.2700,
            dropoffLat: 13.0410,
            dropoffLng: 80.2340,
            riderGender: 'Female',
            genderPreference: 'Any'
        };

        try {
            const res = await axios.get(`${BASE_URL}/rider/match-driver`, { params: searchParams });
            const matched = res.data.find(d => d.id === driverId);
            if (matched) {
                console.log('✅ Rider Match Driver (Basic): SUCCESS');
                if (matched.isVerified) {
                    console.log('✅ Verified Badge Check: SUCCESS');
                } else {
                    console.error('❌ Verified Badge Check: FAILED (Driver not shown as verified)');
                }
            } else {
                console.error('❌ Rider Match Driver (Basic): FAILED (Driver not found)');
            }
        } catch (error) {
            console.error('❌ Rider Match Driver Error:', error.response?.data || error.message);
        }
    }

    // 6. Gender Preference Test (Negative Case)
    // Create Male Driver
    const maleDriverPhone = randomPhone();
    let maleDriverId;
    try {
        const res = await axios.post(`${BASE_URL}/signup`, {
            ...driverData,
            phone: maleDriverPhone,
            firstName: 'D',
            lastName: 'Male',
            gender: 'Male'
        });
        maleDriverId = res.data.user._id;

        // Publish same route
        await axios.post(`${BASE_URL}/driver/route`, {
            userId: maleDriverId,
            source: { address: 'Anna Nagar, Chennai', lat: 13.0827, lng: 80.2707 },
            destination: { address: 'T Nagar, Chennai', lat: 13.0418, lng: 80.2341 },
            isActive: true,
            genderPreference: 'Any'
        });

        // Rider searches for Female Only
        const searchParams = {
            pickupLat: 13.0820,
            pickupLng: 80.2700,
            dropoffLat: 13.0410,
            dropoffLng: 80.2340,
            riderGender: 'Female',
            genderPreference: 'Female only' // Should exclude Male driver
        };

        const matchRes = await axios.get(`${BASE_URL}/rider/match-driver`, { params: searchParams });
        const maleMatch = matchRes.data.find(d => d.id === maleDriverId);
        const femaleMatch = matchRes.data.find(d => d.id === driverId);

        if (!maleMatch && femaleMatch) {
            console.log('✅ Gender Preference Filtering: SUCCESS');
        } else {
            console.error(`❌ Gender Preference Filtering: FAILED. Male Found: ${!!maleMatch}, Female Found: ${!!femaleMatch}`);
        }

    } catch (error) {
        console.error('❌ Gender Test Setup Failed:', error.response?.data || error.message);
    }

    // 7. Ride Request Simulation
    try {
        console.log('🔄 simulatiing Ride Request...');
        const rideData = {
            userId: riderId,
            pickup: { address: 'Anna Nagar', lat: 13.0827, lng: 80.2707 },
            dropoff: { address: 'T Nagar', lat: 13.0418, lng: 80.2341 },
            fare: 150,
            status: 'SEARCHING',
            genderPreference: 'Female only',
            bookingTime: new Date()
        };

        const rideRes = await axios.post(`${BASE_URL}/rides`, rideData);
        const rideId = rideRes.data._id;
        console.log('✅ Ride Created: SUCCESS');

        // Check if visible in nearby rides (Driver's perspective)
        const nearbyRes = await axios.get(`${BASE_URL}/rides/nearby`, {
            params: { lat: 13.0827, lng: 80.2707, radius: 5 }
        });

        const foundRide = nearbyRes.data.find(r => r._id === rideId);
        if (foundRide) {
            console.log('✅ Ride Visible in Nearby Search: SUCCESS');
            // Check if rider's verification status is visible in ride request
            if (foundRide.userId.isVerified) {
                console.log('✅ Rider Verification Visible in Request: SUCCESS');
            } else {
                console.error('❌ Rider Verification Visible in Request: FAILED');
            }
        } else {
            console.error('❌ Ride Visible in Nearby Search: FAILED');
        }

    } catch (error) {
        console.error('❌ Ride Request Test Failed:', error.response?.data || error.message);
    }
}

// Ensure cleanup allows script to exit
process.on('unhandledRejection', (reason, p) => {
    console.error('Unhandled Rejection at:', p, 'reason:', reason);
    process.exit(1);
});

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});

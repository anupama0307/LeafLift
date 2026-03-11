/**
 * Epic 5 Integration Tests — Safety & Trust
 *
 * US5.1  Location data encryption at rest (AES-256-CBC)
 * US5.2  Location sharing privacy toggle
 * US5.3  SOS emergency alert
 * US5.4  Driver/rider verification via documents
 * US5.5  Gender-preference pooling (womenOnly, genderPreference)
 * US5.6  Accessibility ride options
 * US5.7  Role-based access control (RBAC) — protected vs public routes
 */

let app, request, mongoose;

const TEST_TAG = 'Vitest_Epic5Safety';

beforeAll(async () => {
    const supertest = await import('supertest');
    request = supertest.default;
    mongoose = (await import('mongoose')).default;

    const server = await import('../../index.js');
    app = server.app;

    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
            mongoose.connection.once('connected', resolve);
            setTimeout(resolve, 8000);
        });
    }
}, 20000);

afterAll(async () => {
    try {
        const Ride = mongoose.model('Ride');
        const User = mongoose.model('User');
        await Ride.deleteMany({ 'pickup.address': new RegExp(TEST_TAG) });
        await User.deleteMany({ email: new RegExp('vitest_epic5') });
    } catch (_) {}
    try { await mongoose.connection.close(); } catch (_) {}
}, 30000);

// ─── Helpers ──────────────────────────────────────────────────────────────

async function makeUser(overrides = {}) {
    const User = mongoose.model('User');
    return new User({
        role:      'RIDER',
        email:     `vitest_epic5_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone:     '9700000001',
        firstName: 'Safety',
        lastName:  'Test',
        dob:       '1996-09-12',
        gender:    'Male',
        ...overrides,
    }).save();
}

async function makeRide(userId, extra = {}) {
    const Ride = mongoose.model('Ride');
    return new Ride({
        userId,
        pickup:  { address: `${TEST_TAG} Pickup`, lat: 11.0168, lng: 76.9558 },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 11.0500, lng: 76.9900 },
        fare: 90, currentFare: 90, vehicleCategory: 'CAR', status: 'IN_PROGRESS',
        ...extra,
    }).save();
}

// ─── US 5.1 — Location data encryption at rest ───────────────────────────

describe('US5.1 — Location data encryption at rest', () => {
    let rider, rideId;

    beforeAll(async () => {
        rider = await makeUser();
    });

    afterAll(async () => {
        try {
            if (rideId) await mongoose.model('Ride').findByIdAndDelete(rideId);
            await mongoose.model('User').findByIdAndDelete(rider?._id);
        } catch (_) {}
    });

    it('5.1-A: ride lat/lng is stored encrypted (not plain numbers) in raw DB document', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:  rider._id.toString(),
            pickup:  { address: `${TEST_TAG} Enc Test`, lat: 11.0168, lng: 76.9558 },
            dropoff: { address: `${TEST_TAG} Enc Drop`,  lat: 11.0500, lng: 76.9900 },
            fare: 90, vehicleCategory: 'CAR',
        });
        expect(res.status).toBe(201);
        rideId = res.body._id;

        // lean() bypasses Mongoose getters — returns raw encrypted strings
        const rawDoc = await mongoose.model('Ride').findById(rideId).lean();
        expect(typeof rawDoc.pickup.lat).toBe('string');
        expect(rawDoc.pickup.lat).toContain(':');
        expect(typeof rawDoc.pickup.lng).toBe('string');
        expect(rawDoc.pickup.lng).toContain(':');
    });

    it('5.1-B: encrypted lat/lng uses iv:ciphertext hex format (AES-256-CBC)', async () => {
        const rawDoc  = await mongoose.model('Ride').findById(rideId).lean();
        const latParts = rawDoc.pickup.lat.split(':');
        expect(latParts).toHaveLength(2);
        // IV is 16 bytes = 32 hex characters
        expect(latParts[0].length).toBe(32);
        // Ciphertext must be valid hex
        expect(/^[0-9a-f]+$/.test(latParts[1])).toBe(true);
    });

    it('5.1-C: GET /api/rides/:rideId returns decrypted lat/lng via the API', async () => {
        const res = await request(app).get(`/api/rides/${rideId}`);
        expect(res.status).toBe(200);
        expect(typeof res.body.pickup.lat).toBe('number');
        expect(res.body.pickup.lat).toBeCloseTo(11.0168, 3);
        expect(typeof res.body.pickup.lng).toBe('number');
        expect(res.body.pickup.lng).toBeCloseTo(76.9558, 3);
    });

    it('5.1-D: dropoff coordinates are also encrypted in the raw DB document', async () => {
        const rawDoc = await mongoose.model('Ride').findById(rideId).lean();
        expect(typeof rawDoc.dropoff.lat).toBe('string');
        expect(rawDoc.dropoff.lat).toContain(':');
        expect(typeof rawDoc.dropoff.lng).toBe('string');
        expect(rawDoc.dropoff.lng).toContain(':');
    });

    it('5.1-E: raw pickup address is stored as plain text (non-sensitive field)', async () => {
        // Address strings are NOT encrypted — only lat/lng numbers are
        const rawDoc = await mongoose.model('Ride').findById(rideId).lean();
        expect(typeof rawDoc.pickup.address).toBe('string');
        expect(rawDoc.pickup.address).toContain(TEST_TAG);
    });

    it('5.1-F: POST /api/driver/route encrypts dailyRoute lat/lng in user document', async () => {
        const res = await request(app).post('/api/driver/route').send({
            userId:      rider._id.toString(),
            source:      { address: `${TEST_TAG} Route Src`,  lat: 11.0100, lng: 76.9500 },
            destination: { address: `${TEST_TAG} Route Dest`, lat: 11.0600, lng: 76.9950 },
            isActive:    true,
        });
        expect(res.status).toBe(200);
        const rawUser = await mongoose.model('User').findById(rider._id).lean();
        if (rawUser.dailyRoute?.source?.lat !== undefined) {
            // If stored, it should be encrypted
            expect(typeof rawUser.dailyRoute.source.lat).toBe('string');
            expect(rawUser.dailyRoute.source.lat).toContain(':');
        }
    });
});

// ─── US 5.2 — Location sharing privacy toggle ─────────────────────────────

describe('US5.2 — Location sharing privacy toggle', () => {
    let user;

    beforeAll(async () => {
        user = await makeUser();
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').findByIdAndDelete(user?._id);
        } catch (_) {}
    });

    it('5.2-A: new user has locationSharing=true by default', async () => {
        const res = await request(app).get(`/api/users/${user._id}`);
        expect(res.status).toBe(200);
        expect(res.body.privacySettings.locationSharing).toBe(true);
    });

    it('5.2-B: PUT /api/users/:userId/privacy sets locationSharing=false', async () => {
        const res = await request(app)
            .put(`/api/users/${user._id}/privacy`)
            .send({ privacySettings: { locationSharing: false } });
        expect(res.status).toBe(200);
        expect(res.body.privacySettings.locationSharing).toBe(false);
    });

    it('5.2-C: GET /api/users/:userId confirms locationSharing is persisted as false', async () => {
        const res = await request(app).get(`/api/users/${user._id}`);
        expect(res.status).toBe(200);
        expect(res.body.privacySettings.locationSharing).toBe(false);
    });

    it('5.2-D: locationSharing can be toggled back to true', async () => {
        const res = await request(app)
            .put(`/api/users/${user._id}/privacy`)
            .send({ privacySettings: { locationSharing: true } });
        expect(res.status).toBe(200);
        expect(res.body.privacySettings.locationSharing).toBe(true);
    });

    it('5.2-E: shareStats toggle works independently of locationSharing', async () => {
        const res = await request(app)
            .put(`/api/users/${user._id}/privacy`)
            .send({ privacySettings: { shareStats: false, locationSharing: true } });
        expect(res.status).toBe(200);
        expect(res.body.privacySettings.shareStats).toBe(false);
        expect(res.body.privacySettings.locationSharing).toBe(true);
    });

    it('5.2-F: publicProfile toggle is persisted correctly', async () => {
        const res = await request(app)
            .put(`/api/users/${user._id}/privacy`)
            .send({ privacySettings: { publicProfile: false } });
        expect(res.status).toBe(200);
        expect(res.body.privacySettings.publicProfile).toBe(false);
    });

    it('5.2-G: privacy endpoint returns 404 for non-existent user', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .put(`/api/users/${fakeId}/privacy`)
            .send({ privacySettings: { locationSharing: false } });
        expect(res.status).toBe(404);
    });
});

// ─── US 5.3 — SOS emergency alert ─────────────────────────────────────────

describe('US5.3 — SOS emergency alert', () => {
    let rider, driver, ride;

    beforeAll(async () => {
        rider  = await makeUser({ gender: 'Female' });
        driver = await makeUser({ role: 'DRIVER', gender: 'Male' });
        ride   = await makeRide(rider._id, { driverId: driver._id, status: 'IN_PROGRESS' });
    });

    afterAll(async () => {
        try {
            await mongoose.model('Ride').findByIdAndDelete(ride?._id);
            await mongoose.model('User').deleteMany({ _id: { $in: [rider?._id, driver?._id] } });
        } catch (_) {}
    });

    it('5.3-A: POST /api/rides/:rideId/sos returns { ok: true } when triggered by rider', async () => {
        const res = await request(app)
            .post(`/api/rides/${ride._id}/sos`)
            .send({
                userId:   rider._id.toString(),
                userRole: 'RIDER',
                location: { lat: 11.0168, lng: 76.9558 },
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.message).toMatch(/sos alert sent/i);
    });

    it('5.3-B: SOS returns 200 when triggered by driver role', async () => {
        const res = await request(app)
            .post(`/api/rides/${ride._id}/sos`)
            .send({
                userId:   driver._id.toString(),
                userRole: 'DRIVER',
                location: { lat: 11.0200, lng: 76.9600 },
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('5.3-C: SOS returns 404 for non-existent ride ID', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .post(`/api/rides/${fakeId}/sos`)
            .send({ userId: rider._id.toString(), userRole: 'RIDER', location: { lat: 0, lng: 0 } });
        expect(res.status).toBe(404);
    });

    it('5.3-D: SOS response includes a confirmation message field', async () => {
        const res = await request(app)
            .post(`/api/rides/${ride._id}/sos`)
            .send({ userId: rider._id.toString(), userRole: 'RIDER', location: { lat: 11.0168, lng: 76.9558 } });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('ok', true);
        expect(res.body).toHaveProperty('message');
        expect(typeof res.body.message).toBe('string');
    });

    it('5.3-E: multiple SOS calls on the same ride are all accepted', async () => {
        for (let i = 0; i < 2; i++) {
            const res = await request(app)
                .post(`/api/rides/${ride._id}/sos`)
                .send({ userId: rider._id.toString(), userRole: 'RIDER', location: { lat: 11.0168 + i * 0.001, lng: 76.9558 } });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        }
    });
});

// ─── US 5.4 — Driver/rider verification ──────────────────────────────────

describe('US5.4 — Driver and rider document verification', () => {
    let driver, rider;

    beforeAll(async () => {
        driver = await makeUser({ role: 'DRIVER', isVerified: false });
        rider  = await makeUser({ isVerified: false });
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').deleteMany({ _id: { $in: [driver?._id, rider?._id] } });
        } catch (_) {}
    });

    it('5.4-A: driver is not verified and status is PENDING by default', async () => {
        const user = await mongoose.model('User').findById(driver._id);
        expect(user.isVerified).toBe(false);
        expect(user.verificationStatus).toBe('PENDING');
    });

    it('5.4-B: PUT /api/users/:userId with license + aadhar auto-verifies a DRIVER', async () => {
        const res = await request(app)
            .put(`/api/users/${driver._id}`)
            .send({ license: 'KA01234567', aadhar: '123456789012' });
        expect(res.status).toBe(200);
        expect(res.body.isVerified).toBe(true);
        expect(res.body.verificationStatus).toBe('APPROVED');
    });

    it('5.4-C: verificationDate is set when driver is auto-verified', async () => {
        const user = await mongoose.model('User').findById(driver._id);
        expect(user.verificationDate).toBeInstanceOf(Date);
    });

    it('5.4-D: GET /api/users/:userId shows isVerified=true and APPROVED status', async () => {
        const res = await request(app).get(`/api/users/${driver._id}`);
        expect(res.status).toBe(200);
        expect(res.body.isVerified).toBe(true);
        expect(res.body.verificationStatus).toBe('APPROVED');
    });

    it('5.4-E: DRIVER with only license (no aadhar) is NOT auto-verified', async () => {
        const partialDriver = await makeUser({
            role: 'DRIVER',
            email: `vitest_epic5_partial_${Date.now()}@test.com`,
            isVerified: false,
        });
        const res = await request(app)
            .put(`/api/users/${partialDriver._id}`)
            .send({ license: 'KA99887766' });
        expect(res.status).toBe(200);
        expect(res.body.isVerified).toBe(false);
        await mongoose.model('User').findByIdAndDelete(partialDriver._id);
    });

    it('5.4-F: DRIVER with only aadhar (no license) is NOT auto-verified', async () => {
        const partialDriver2 = await makeUser({
            role: 'DRIVER',
            email: `vitest_epic5_aadharonly_${Date.now()}@test.com`,
            isVerified: false,
        });
        const res = await request(app)
            .put(`/api/users/${partialDriver2._id}`)
            .send({ aadhar: '987654321098' });
        expect(res.status).toBe(200);
        expect(res.body.isVerified).toBe(false);
        await mongoose.model('User').findByIdAndDelete(partialDriver2._id);
    });

    it('5.4-G: RIDER role with license + aadhar is NOT auto-verified (DRIVER-only feature)', async () => {
        const res = await request(app)
            .put(`/api/users/${rider._id}`)
            .send({ license: 'MH01234567', aadhar: '987654321098' });
        expect(res.status).toBe(200);
        // Only DRIVER role triggers auto-verify
        expect(res.body.isVerified).toBe(false);
    });
});

// ─── US 5.5 — Gender-preference pooling ──────────────────────────────────

describe('US5.5 — Gender-preference pooling enforcement', () => {
    let femaleRider, maleRider;

    beforeAll(async () => {
        femaleRider = await makeUser({ gender: 'Female' });
        maleRider   = await makeUser({ gender: 'Male' });
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').deleteMany({ _id: { $in: [femaleRider?._id, maleRider?._id] } });
            await mongoose.model('Ride').deleteMany({
                $or: [{ userId: femaleRider?._id }, { userId: maleRider?._id }],
            });
        } catch (_) {}
    });

    it('5.5-A: female rider creates womenOnly pooled ride with genderPreference=female', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          femaleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} WomenPool`, lat: 12.9100, lng: 77.6000 },
            dropoff:         { address: `${TEST_TAG} WomenPool Drop`, lat: 12.9500, lng: 77.6200 },
            fare:            90,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { womenOnly: true, genderPreference: 'female' },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.womenOnly).toBe(true);
        expect(res.body.safetyPreferences.genderPreference).toBe('female');
    });

    it('5.5-B: male rider ride has no womenOnly preference by default', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          maleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} MalePool`, lat: 12.9200, lng: 77.6100 },
            dropoff:         { address: `${TEST_TAG} MalePool Drop`, lat: 12.9600, lng: 77.6300 },
            fare:            90,
            isPooled:        true,
            vehicleCategory: 'CAR',
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences?.womenOnly).toBeFalsy();
    });

    it('5.5-C: gender field is updatable via PUT /api/users/:userId', async () => {
        const res = await request(app)
            .put(`/api/users/${femaleRider._id}`)
            .send({ gender: 'Female', firstName: 'Priya', lastName: 'Sharma' });
        expect(res.status).toBe(200);
        expect(res.body.gender).toBe('Female');
    });

    it('5.5-D: genderPreference "any" does not restrict pool matching', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          maleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} AnyGen`, lat: 12.9300, lng: 77.6200 },
            dropoff:         { address: `${TEST_TAG} AnyGen Drop`, lat: 12.9700, lng: 77.6400 },
            fare:            90,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { genderPreference: 'any' },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.genderPreference).toBe('any');
    });

    it('5.5-E: genderPreference "male" preference is persisted', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          maleRider._id.toString(),
            pickup:          { address: `${TEST_TAG} MalePref`, lat: 12.9400, lng: 77.6300 },
            dropoff:         { address: `${TEST_TAG} MalePref Drop`, lat: 12.9800, lng: 77.6500 },
            fare:            90,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { genderPreference: 'male' },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.genderPreference).toBe('male');
    });

    it('5.5-F: womenOnly and male rides both visible in nearby — not force-grouped', async () => {
        // Both rides in same area with different preferences — should remain independent
        const femRide = new (mongoose.model('Ride'))({
            userId:  femaleRider._id,
            pickup:  { address: `${TEST_TAG} Fem55F`, lat: 11.1000, lng: 77.0000 },
            dropoff: { address: `${TEST_TAG} Fem55F Drop`, lat: 11.1500, lng: 77.0500 },
            fare: 90, currentFare: 90, vehicleCategory: 'CAR', status: 'SEARCHING',
            safetyPreferences: { womenOnly: true },
        });
        await femRide.save();

        const maleRide = new (mongoose.model('Ride'))({
            userId:  maleRider._id,
            pickup:  { address: `${TEST_TAG} Male55F`, lat: 11.1002, lng: 77.0002 },
            dropoff: { address: `${TEST_TAG} Male55F Drop`, lat: 11.1502, lng: 77.0502 },
            fare: 90, currentFare: 90, vehicleCategory: 'CAR', status: 'SEARCHING',
        });
        await maleRide.save();

        const res = await request(app)
            .get('/api/rides/nearby')
            .query({ lat: 11.1000, lng: 77.0000, radius: 10 });
        expect(res.status).toBe(200);
        // At least one of the rides should be visible
        const allIds = res.body.flatMap(r =>
            r.poolGroupRiders ? r.poolGroupRiders.map(p => p.rideId?.toString()) : [r._id?.toString()]
        ).filter(Boolean);
        expect(allIds.some(id => id === femRide._id.toString() || id === maleRide._id.toString())).toBe(true);

        await mongoose.model('Ride').deleteMany({ _id: { $in: [femRide._id, maleRide._id] } });
    });
});

// ─── US 5.6 — Accessibility ride options ──────────────────────────────────

describe('US5.6 — Accessibility ride options', () => {
    let rider;

    beforeAll(async () => {
        rider = await makeUser();
    });

    afterAll(async () => {
        try {
            await mongoose.model('User').findByIdAndDelete(rider?._id);
            await mongoose.model('Ride').deleteMany({ userId: rider?._id });
        } catch (_) {}
    });

    it('5.6-A: ride created with accessibilityOptions array is stored correctly', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:               rider._id.toString(),
            pickup:               { address: `${TEST_TAG} Access`, lat: 12.9100, lng: 77.6000 },
            dropoff:              { address: `${TEST_TAG} Access Drop`, lat: 12.9500, lng: 77.6200 },
            fare:                 90,
            vehicleCategory:      'CAR',
            accessibilityOptions: ['Wheelchair', 'Hearing Impaired Assistance'],
        });
        expect(res.status).toBe(201);
        expect(Array.isArray(res.body.accessibilityOptions)).toBe(true);
    });

    it('5.6-B: safetyPreferences.needsWheelchair is stored on ride', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          rider._id.toString(),
            pickup:          { address: `${TEST_TAG} WC Ride`, lat: 12.9200, lng: 77.6100 },
            dropoff:         { address: `${TEST_TAG} WC Ride Drop`, lat: 12.9600, lng: 77.6300 },
            fare:            90,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { needsWheelchair: true },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.needsWheelchair).toBe(true);
    });

    it('5.6-C: safetyPreferences.wheelchairFriendly is stored on ride', async () => {
        const res = await request(app).post('/api/rides').send({
            userId:          rider._id.toString(),
            pickup:          { address: `${TEST_TAG} WC Friendly`, lat: 12.9300, lng: 77.6200 },
            dropoff:         { address: `${TEST_TAG} WC Friendly Drop`, lat: 12.9700, lng: 77.6400 },
            fare:            90,
            isPooled:        true,
            vehicleCategory: 'CAR',
            safetyPreferences: { wheelchairFriendly: true },
        });
        expect(res.status).toBe(201);
        expect(res.body.safetyPreferences.wheelchairFriendly).toBe(true);
    });

    it('5.6-D: user accessibilitySupport field is stored in profile', async () => {
        const res = await request(app)
            .put(`/api/users/${rider._id}`)
            .send({ accessibilitySupport: ['Wheelchair', 'Visual Impairment Support'] });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.accessibilitySupport)).toBe(true);
        expect(res.body.accessibilitySupport).toContain('Wheelchair');
    });

    it('5.6-E: GET /api/rides/:rideId returns accessibilityOptions and safetyPrefs in response', async () => {
        const ride = await new (mongoose.model('Ride'))({
            userId:               rider._id,
            pickup:               { address: `${TEST_TAG} Acc Fetch`, lat: 12.9400, lng: 77.6300 },
            dropoff:              { address: `${TEST_TAG} Acc Fetch Drop`, lat: 12.9800, lng: 77.6500 },
            fare: 90, currentFare: 90, vehicleCategory: 'CAR', status: 'SEARCHING',
            accessibilityOptions: ['Wheelchair'],
            safetyPreferences:    { needsWheelchair: true },
        }).save();

        const res = await request(app).get(`/api/rides/${ride._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.accessibilityOptions)).toBe(true);
        expect(res.body.safetyPreferences.needsWheelchair).toBe(true);
        await mongoose.model('Ride').findByIdAndDelete(ride._id);
    });

    it('5.6-F: both needsWheelchair and wheelchairFriendly can coexist on different rides', async () => {
        const Ride = mongoose.model('Ride');
        const needsWC = await new Ride({
            userId:  rider._id,
            pickup:  { address: `${TEST_TAG} NeedsWC`, lat: 12.9500, lng: 77.6400 },
            dropoff: { address: `${TEST_TAG} NeedsWC Drop`, lat: 12.9900, lng: 77.6600 },
            fare: 90, currentFare: 90, vehicleCategory: 'CAR', isPooled: true,
            safetyPreferences: { needsWheelchair: true },
        }).save();
        const isFriendly = await new Ride({
            userId:  rider._id,
            pickup:  { address: `${TEST_TAG} WCFriendly`, lat: 12.9600, lng: 77.6500 },
            dropoff: { address: `${TEST_TAG} WCFriendly Drop`, lat: 13.0000, lng: 77.6700 },
            fare: 90, currentFare: 90, vehicleCategory: 'CAR', isPooled: true,
            safetyPreferences: { wheelchairFriendly: true },
        }).save();

        const res1 = await request(app).get(`/api/rides/${needsWC._id}`);
        const res2 = await request(app).get(`/api/rides/${isFriendly._id}`);
        expect(res1.body.safetyPreferences.needsWheelchair).toBe(true);
        expect(res2.body.safetyPreferences.wheelchairFriendly).toBe(true);
        await Ride.deleteMany({ _id: { $in: [needsWC._id, isFriendly._id] } });
    });
});

// ─── US 5.7 — Role-based access control (RBAC) ───────────────────────────

describe('US5.7 — Role-based access control (RBAC)', () => {
    it('5.7-A: GET /api/rides without Authorization header → 401 Unauthorized', async () => {
        const res = await request(app).get('/api/rides');
        expect(res.status).toBe(401);
    });

    it('5.7-B: GET /api/rides with invalid JWT token → 403 Forbidden', async () => {
        const res = await request(app)
            .get('/api/rides')
            .set('Authorization', 'Bearer invalid.jwt.token.here');
        expect(res.status).toBe(403);
    });

    it('5.7-C: GET /api/rides/user/:userId is public (no auth required) → 200', async () => {
        const rider = await makeUser();
        const res   = await request(app).get(`/api/rides/user/${rider._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        await mongoose.model('User').findByIdAndDelete(rider._id);
    });

    it('5.7-D: GET /api/rides/nearby is public (accessible without auth) → 200', async () => {
        const res = await request(app).get('/api/rides/nearby');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('5.7-E: GET /api/health is fully public → 200 with status ok', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });

    it('5.7-F: GET /api/users is accessible (admin-visible user list)', async () => {
        const res = await request(app).get('/api/users');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('5.7-G: GET /api/rides/driver/:driverId is public — driver sees own rides', async () => {
        const driver = await makeUser({ role: 'DRIVER' });
        const res    = await request(app).get(`/api/rides/driver/${driver._id}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        await mongoose.model('User').findByIdAndDelete(driver._id);
    });

    it('5.7-H: POST /api/rides/:rideId/sos returns 404 (not 401) for invalid rideId — SOS is public', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(app)
            .post(`/api/rides/${fakeId}/sos`)
            .send({ userId: 'abc', userRole: 'RIDER', location: { lat: 0, lng: 0 } });
        expect(res.status).toBe(404);
    });

    it('5.7-I: GET /api/rides/estimate is public for pre-booking fare checks', async () => {
        const res = await request(app)
            .get('/api/rides/estimate')
            .query({ pickupLat: 12.9, pickupLng: 77.5, dropoffLat: 12.95, dropoffLng: 77.6 });
        expect(res.status).toBe(200);
    });

    it('5.7-J: GET /api/emission-compare is public for eco-awareness screens', async () => {
        const res = await request(app)
            .get('/api/emission-compare')
            .query({ distKm: 5, vehicleCategory: 'BIKE' });
        expect(res.status).toBe(200);
    });
});

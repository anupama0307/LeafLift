/**
 * Tests for User Story 2.6 — Driver Nearby Alert
 *
 * 2.6.1  Server emits `driver:nearby` event when driver is ≤ 300 m from the
 *        rider's pickup point on an ACCEPTED ride.
 * 2.6.2  Server does NOT emit `driver:nearby` when driver is > 300 m away.
 * 2.6.3  Server does NOT emit `driver:nearby` twice for the same ride
 *        (deduplication via nearbyNotifiedRides Set).
 */

let app, httpServer, ioclient, mongoose;
let testPort = 0;
const TEST_TAG = 'Vitest_US26';

// ─── Haversine helper (mirrors server getDistanceKm) — used to verify offsets ───
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Pickup used for all socket tests
const PICKUP = { lat: 11.0168, lng: 76.9558 };

// A location ~200 m north of PICKUP — within 300 m threshold
const CLOSE_LOC  = { lat: 11.0186, lng: 76.9558 }; // ~200 m

// A location ~500 m north of PICKUP — outside 300 m threshold
const FAR_LOC    = { lat: 11.0213, lng: 76.9558 }; // ~500 m

// ─── Promise helpers ────────────────────────────────────────────────────────
function waitForSocketEvent(socket, eventName, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`Timed out waiting for socket event: '${eventName}'`)),
            timeoutMs
        );
        socket.once(eventName, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

function expectNoSocketEvent(socket, eventName, waitMs = 1500) {
    return new Promise((resolve) => {
        let received = false;
        const handler = () => { received = true; };
        socket.once(eventName, handler);
        setTimeout(() => {
            socket.off(eventName, handler);
            resolve(received);
        }, waitMs);
    });
}

// ─── DB Helpers ─────────────────────────────────────────────────────────────
async function makeUser(o = {}) {
    return new (mongoose.model('User'))({
        role: 'RIDER',
        email: `vitest_us26_${Date.now()}_${Math.random().toString(36).slice(2)}@test.com`,
        phone: '9876543210',
        firstName: 'Nearby',
        lastName: 'Tester',
        dob: '1998-05-15',
        gender: 'Male',
        isVerified: false,
        ...o,
    }).save();
}

async function makeRide(userId, driverId, status = 'ACCEPTED', pickupOverride = PICKUP) {
    return new (mongoose.model('Ride'))({
        userId,
        driverId,
        pickup:  { address: `${TEST_TAG} Pickup`,  lat: pickupOverride.lat, lng: pickupOverride.lng },
        dropoff: { address: `${TEST_TAG} Dropoff`, lat: 11.0500, lng: 76.9900 },
        fare: 90, currentFare: 90,
        vehicleCategory: 'CAR',
        status,
    }).save();
}

// ─── Global setup ────────────────────────────────────────────────────────────
beforeAll(async () => {
    const ioclientModule = await import('socket.io-client');
    ioclient = ioclientModule.default ?? ioclientModule.io;

    mongoose = (await import('mongoose')).default;
    const server = await import('../index.js');
    app        = server.app;
    httpServer = server.httpServer;

    // Wait for DB
    if (mongoose.connection.readyState !== 1) {
        await new Promise((resolve) => {
            mongoose.connection.once('connected', resolve);
            setTimeout(resolve, 8000);
        });
    }

    // Start the HTTP server on a random port (server does NOT auto-listen in test mode)
    await new Promise((resolve, reject) => {
        if (httpServer.listening) return resolve();
        httpServer.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
    });
    testPort = httpServer.address().port;
}, 25000);

afterAll(async () => {
    try {
        await mongoose.model('Ride').deleteMany({ 'pickup.address': new RegExp(TEST_TAG) });
        await mongoose.model('User').deleteMany({ email: new RegExp('vitest_us26') });
    } catch (_) {}
    await new Promise((resolve) => {
        // Force-close all keep-alive connections so httpServer.close() doesn't hang
        if (typeof httpServer.closeAllConnections === 'function') httpServer.closeAllConnections();
        const timer = setTimeout(resolve, 5000); // bail out after 5 s no matter what
        httpServer.close(() => { clearTimeout(timer); resolve(); });
    });
    try { await mongoose.connection.close(); } catch (_) {}
}, 45000);

// ─── Socket client factory ───────────────────────────────────────────────────
function connectSocket(userId, role) {
    const socket = ioclient(`http://127.0.0.1:${testPort}`, {
        transports: ['websocket'],
        forceNew: true,
    });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
        socket.once('connect', () => {
            clearTimeout(timer);
            if (userId) socket.emit('register', { userId: String(userId), role });
            resolve(socket);
        });
        socket.once('connect_error', reject);
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// US 2.6.1 — driver:nearby emitted when driver is within 300 m
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.6.1 — driver:nearby emitted when driver ≤ 300 m from pickup', () => {
    it('CLOSE_LOC is indeed within 300 m of PICKUP', () => {
        const distKm = haversineKm(PICKUP.lat, PICKUP.lng, CLOSE_LOC.lat, CLOSE_LOC.lng);
        expect(distKm * 1000).toBeLessThan(300);
    });

    it('rider receives driver:nearby when driver is ~200 m from pickup', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER' });
        const ride   = await makeRide(rider._id, driver._id.toString());

        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        // Rider joins ride room so it can receive driver:nearby
        riderSocket.emit('join:ride', { rideId: ride._id.toString() });

        // Allow room join to propagate
        await new Promise(r => setTimeout(r, 300));

        const nearbyPromise = waitForSocketEvent(riderSocket, 'driver:nearby', 12000);

        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: CLOSE_LOC.lat,
            lng: CLOSE_LOC.lng,
        });

        const payload = await nearbyPromise;
        expect(payload).toHaveProperty('rideId', ride._id.toString());

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 25000);

    it('driver:nearby payload contains the rideId string', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER' });
        const ride   = await makeRide(rider._id, driver._id.toString());

        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        riderSocket.emit('join:ride', { rideId: ride._id.toString() });
        await new Promise(r => setTimeout(r, 300));

        const nearbyPromise = waitForSocketEvent(riderSocket, 'driver:nearby', 12000);
        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: CLOSE_LOC.lat,
            lng: CLOSE_LOC.lng,
        });

        const payload = await nearbyPromise;
        expect(typeof payload.rideId).toBe('string');
        expect(payload.rideId).toBe(ride._id.toString());

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 25000);

    it('rider also receives driver:nearby via user room (user:{userId})', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER' });
        const ride   = await makeRide(rider._id, driver._id.toString());

        // Register rider so server adds them to user:{userId} room
        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        await new Promise(r => setTimeout(r, 300));

        const nearbyPromise = waitForSocketEvent(riderSocket, 'driver:nearby', 12000);
        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: CLOSE_LOC.lat,
            lng: CLOSE_LOC.lng,
        });

        const payload = await nearbyPromise;
        expect(payload.rideId).toBe(ride._id.toString());

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 25000);
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.6.2 — driver:nearby NOT emitted when driver > 300 m from pickup
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.6.2 — driver:nearby NOT emitted when driver > 300 m away', () => {
    it('FAR_LOC is indeed more than 300 m from PICKUP', () => {
        const distKm = haversineKm(PICKUP.lat, PICKUP.lng, FAR_LOC.lat, FAR_LOC.lng);
        expect(distKm * 1000).toBeGreaterThan(300);
    });

    it('rider does NOT receive driver:nearby when driver is ~500 m from pickup', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER' });
        const ride   = await makeRide(rider._id, driver._id.toString());

        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        riderSocket.emit('join:ride', { rideId: ride._id.toString() });
        await new Promise(r => setTimeout(r, 300));

        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: FAR_LOC.lat,
            lng: FAR_LOC.lng,
        });

        // Wait and confirm no event arrived
        const received = await expectNoSocketEvent(riderSocket, 'driver:nearby', 1500);
        expect(received).toBe(false);

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 20000);

    it('ride in SEARCHING status does NOT trigger driver:nearby when close', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER' });
        // Use SEARCHING status — not ACCEPTED
        const ride   = await makeRide(rider._id, driver._id.toString(), 'SEARCHING');

        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        riderSocket.emit('join:ride', { rideId: ride._id.toString() });
        await new Promise(r => setTimeout(r, 300));

        driverSocket.emit('driver:location', {
            driverId: driver._id.toString(),
            lat: CLOSE_LOC.lat,
            lng: CLOSE_LOC.lng,
        });

        const received = await expectNoSocketEvent(riderSocket, 'driver:nearby', 3000);
        expect(received).toBe(false);

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 25000);
});

// ══════════════════════════════════════════════════════════════════════════════
// US 2.6.3 — driver:nearby deduplication: same ride only notified once
// ══════════════════════════════════════════════════════════════════════════════
describe('US 2.6.3 — driver:nearby not emitted twice for the same ride', () => {
    it('second driver:location update does not re-emit driver:nearby for the same ride', async () => {
        const rider  = await makeUser({ role: 'RIDER' });
        const driver = await makeUser({ role: 'DRIVER' });
        const ride   = await makeRide(rider._id, driver._id.toString());
        const driverId = driver._id.toString();

        const riderSocket  = await connectSocket(rider._id.toString(), 'RIDER');
        const driverSocket = await connectSocket(null, 'DRIVER');

        riderSocket.emit('join:ride', { rideId: ride._id.toString() });
        await new Promise(r => setTimeout(r, 300));

        // ── First emission at 200 m — MUST receive driver:nearby ──
        const firstNearby = waitForSocketEvent(riderSocket, 'driver:nearby', 12000);
        driverSocket.emit('driver:location', { driverId, lat: CLOSE_LOC.lat, lng: CLOSE_LOC.lng });
        await firstNearby; // Wait for the event to arrive

        // Must wait > 1 s to bypass the 1-update-per-second throttle
        await new Promise(r => setTimeout(r, 1200));

        // ── Second emission at same 200 m — must NOT receive driver:nearby again ──
        driverSocket.emit('driver:location', { driverId, lat: CLOSE_LOC.lat, lng: CLOSE_LOC.lng });

        const receivedSecond = await expectNoSocketEvent(riderSocket, 'driver:nearby', 1500);
        expect(receivedSecond).toBe(false); // deduplication worked

        riderSocket.disconnect();
        driverSocket.disconnect();
        await ride.deleteOne();
        await rider.deleteOne();
        await driver.deleteOne();
    }, 15000);

    it('a different ride with a different driver DOES emit driver:nearby independently', async () => {
        const rider1  = await makeUser({ role: 'RIDER' });
        const rider2  = await makeUser({ role: 'RIDER' });
        const driver1 = await makeUser({ role: 'DRIVER' });
        const driver2 = await makeUser({ role: 'DRIVER' });
        const ride1   = await makeRide(rider1._id, driver1._id.toString());
        const ride2   = await makeRide(rider2._id, driver2._id.toString());

        const rider1Socket  = await connectSocket(rider1._id.toString(), 'RIDER');
        const driver1Socket = await connectSocket(null, 'DRIVER');
        const rider2Socket  = await connectSocket(rider2._id.toString(), 'RIDER');
        const driver2Socket = await connectSocket(null, 'DRIVER');

        rider1Socket.emit('join:ride', { rideId: ride1._id.toString() });
        rider2Socket.emit('join:ride', { rideId: ride2._id.toString() });
        await new Promise(r => setTimeout(r, 300));

        const nearby1 = waitForSocketEvent(rider1Socket, 'driver:nearby', 12000);
        const nearby2 = waitForSocketEvent(rider2Socket, 'driver:nearby', 12000);

        driver1Socket.emit('driver:location', { driverId: driver1._id.toString(), lat: CLOSE_LOC.lat, lng: CLOSE_LOC.lng });
        driver2Socket.emit('driver:location', { driverId: driver2._id.toString(), lat: CLOSE_LOC.lat, lng: CLOSE_LOC.lng });

        const [p1, p2] = await Promise.all([nearby1, nearby2]);
        expect(p1.rideId).toBe(ride1._id.toString());
        expect(p2.rideId).toBe(ride2._id.toString());

        rider1Socket.disconnect();
        rider2Socket.disconnect();
        driver1Socket.disconnect();
        driver2Socket.disconnect();
        await ride1.deleteOne();
        await ride2.deleteOne();
        await rider1.deleteOne();
        await rider2.deleteOne();
        await driver1.deleteOne();
        await driver2.deleteOne();
    }, 30000);
});

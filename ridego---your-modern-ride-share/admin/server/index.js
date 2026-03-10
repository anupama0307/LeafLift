const express = require('express');
// Use the SAME mongoose instance as the models in ../../server/models/
const mongoose = require('../../server/node_modules/mongoose');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const cors = require('cors');
const path = require('path');
const Redis = require('ioredis');
const http = require('http');
const { Server } = require('socket.io');

require('dotenv').config({ path: path.join(__dirname, '../../.env') });
require('dotenv').config();

// ─── MongoDB Connection ─────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;
let mongoReady = false;

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 30000,
        });
        mongoReady = true;
        console.log('✅ Admin server connected to MongoDB');
        return true;
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1);
    }
}

mongoose.connection.on('disconnected', () => { mongoReady = false; });
mongoose.connection.on('connected', () => { mongoReady = true; });

// ─── Redis Connection ────────────────────────────────────────────────────
let redis;
try {
    redis = new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
            if (times > 3) {
                console.warn('⚠️  Redis not available — running without cache');
                return null; // stop retrying
            }
            return Math.min(times * 200, 2000);
        },
        lazyConnect: true,
    });
    redis.connect().catch(() => {
        console.warn('⚠️  Redis not available — running without cache');
        redis = null;
    });
    redis.on('connect', () => console.log('✅ Redis connected'));
    redis.on('error', () => {}); // suppress repeated error logs
} catch (e) {
    console.warn('⚠️  Redis not available — running without cache');
    redis = null;
}

// ─── Helper: cache get/set ───────────────────────────────────────────────
const cacheGet = async(key) => {
    if (!redis) return null;
    try {
        const val = await redis.get(key);
        return val ? JSON.parse(val) : null;
    } catch { return null; }
};
const cacheSet = async(key, data, ttl = 300) => {
    if (!redis) return;
    try { await redis.set(key, JSON.stringify(data), 'EX', ttl); } catch {}
};

const DEMAND_REGIONS = [
    { name: 'Mumbai - Andheri', lat: 19.1197, lng: 72.8464, radius: 15 },
    { name: 'Delhi - Connaught Place', lat: 28.6315, lng: 77.2167, radius: 15 },
    { name: 'Bangalore - Koramangala', lat: 12.9352, lng: 77.6245, radius: 15 },
    { name: 'Hyderabad - HITEC City', lat: 17.4435, lng: 78.3772, radius: 15 },
    { name: 'Chennai - T. Nagar', lat: 13.0418, lng: 80.2341, radius: 15 },
    { name: 'Kolkata - Salt Lake', lat: 22.5726, lng: 88.4159, radius: 15 },
    { name: 'Pune - Hinjewadi', lat: 18.5912, lng: 73.7389, radius: 15 },
    { name: 'Jaipur - MI Road', lat: 26.9124, lng: 75.7873, radius: 15 },
];

const haversineDistanceKm = (lat1, lng1, lat2, lng2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const classifyHeatLevel = (deficit) => {
    if (deficit > 10) return 'critical';
    if (deficit > 5) return 'high';
    if (deficit > 0) return 'medium';
    return 'low';
};

const getRegionForPoint = (lat, lng) => {
    if (lat == null || lng == null) return null;
    for (const region of DEMAND_REGIONS) {
        if (haversineDistanceKm(region.lat, region.lng, lat, lng) <= region.radius) return region.name;
    }
    return null;
};

function predictFromHistoricalBuckets(buckets, targetHour, targetDay) {
    if (!buckets.length) {
        return { predicted: 0, confidence: 0.55, trend: 'stable', factors: { hourFactor: 1, dayFactor: 1, baseDemand: 0 } };
    }
    const avg = buckets.reduce((sum, b) => sum + b.count, 0) / buckets.length;
    const hourBuckets = buckets.filter(b => b.hour === targetHour);
    const dayBuckets = buckets.filter(b => b.day === targetDay);
    const hourAvg = hourBuckets.length ? hourBuckets.reduce((sum, b) => sum + b.count, 0) / hourBuckets.length : avg;
    const dayAvg = dayBuckets.length ? dayBuckets.reduce((sum, b) => sum + b.count, 0) / dayBuckets.length : avg;

    const sorted = [...buckets].sort((a, b) => b.timestamp - a.timestamp);
    const recent7 = sorted.filter(b => b.timestamp >= Date.now() - 7 * 86400000);
    const previous7 = sorted.filter(b => b.timestamp < Date.now() - 7 * 86400000 && b.timestamp >= Date.now() - 14 * 86400000);
    const recentAvg = recent7.length ? recent7.reduce((sum, b) => sum + b.count, 0) / recent7.length : avg;
    const prevAvg = previous7.length ? previous7.reduce((sum, b) => sum + b.count, 0) / previous7.length : recentAvg;

    const hourFactor = avg > 0 ? hourAvg / avg : 1;
    const dayFactor = avg > 0 ? dayAvg / avg : 1;
    const weightedBase = avg * 0.35 + hourAvg * 0.3 + dayAvg * 0.2 + recentAvg * 0.15;

    return {
        predicted: Math.max(0, Math.round(weightedBase)),
        confidence: Math.min(0.95, 0.55 + Math.min(0.35, buckets.length / 600)),
        trend: recentAvg > prevAvg * 1.08 ? 'up' : recentAvg < prevAvg * 0.92 ? 'down' : 'stable',
        factors: {
            hourFactor: parseFloat(hourFactor.toFixed(2)),
            dayFactor: parseFloat(dayFactor.toFixed(2)),
            baseDemand: Math.round(avg),
        },
    };
}

async function computeRegionDemandForecast(targetHour, targetDay, selectedRegionName) {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
    const recentHourStart = new Date(Date.now() - 60 * 60000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

    const [rides, totalDrivers] = await Promise.all([
        Ride.find({
            createdAt: { $gte: sixtyDaysAgo },
            'pickup.lat': { $exists: true, $ne: null },
            'pickup.lng': { $exists: true, $ne: null }
        }, 'pickup.lat pickup.lng createdAt').lean(),
        User.countDocuments({ role: 'DRIVER' }),
    ]);

    const selected = selectedRegionName ?
        DEMAND_REGIONS.filter(r => r.name.toLowerCase() === selectedRegionName.toLowerCase()) :
        DEMAND_REGIONS;
    const regions = selected.length ? selected : DEMAND_REGIONS;

    const regionStats = new Map(regions.map(r => [r.name, { bucketsMap: new Map(), currentRides: 0, weekRides: 0 }]));

    for (const ride of rides) {
        const pickup = ride.pickup || {};
        const regionName = getRegionForPoint(pickup.lat, pickup.lng);
        if (!regionName || !regionStats.has(regionName)) continue;

        const createdAt = new Date(ride.createdAt);
        const timestamp = createdAt.getTime();
        const stat = regionStats.get(regionName);

        const bucketKey = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}-${createdAt.getHours()}`;
        const currentBucket = stat.bucketsMap.get(bucketKey) || { hour: createdAt.getHours(), day: createdAt.getDay(), count: 0, timestamp };
        currentBucket.count += 1;
        stat.bucketsMap.set(bucketKey, currentBucket);

        if (timestamp >= recentHourStart.getTime()) stat.currentRides += 1;
        if (timestamp >= sevenDaysAgo.getTime()) stat.weekRides += 1;
    }

    const totalWeekRides = [...regionStats.values()].reduce((sum, s) => sum + s.weekRides, 0);
    const perRegionBaseDrivers = regions.length > 0 ? Math.max(1, Math.floor(totalDrivers / regions.length)) : totalDrivers;

    return regions.map((region) => {
        const stat = regionStats.get(region.name);
        const buckets = [...stat.bucketsMap.values()];
        const forecast = predictFromHistoricalBuckets(buckets, targetHour, targetDay);

        let drivers = perRegionBaseDrivers;
        if (totalDrivers > 0 && totalWeekRides > 0) {
            drivers = Math.max(2, Math.round((stat.weekRides / totalWeekRides) * totalDrivers));
        } else {
            drivers = Math.max(2, perRegionBaseDrivers);
        }

        const requiredDrivers = Math.ceil(forecast.predicted / 5);
        const deficit = Math.max(0, requiredDrivers - drivers);

        return {
            name: region.name,
            region: region.name,
            lat: region.lat,
            lng: region.lng,
            rides: stat.currentRides,
            predicted: forecast.predicted,
            drivers,
            deficit,
            heatLevel: classifyHeatLevel(deficit),
            confidence: parseFloat(forecast.confidence.toFixed(2)),
            trend: forecast.trend,
            factors: forecast.factors,
            dataPoints: buckets.length,
        };
    });
}

const SURGE_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const surgeAlertState = new Map();

async function emitAutomatedSurgeAlerts(regions, peakHours = []) {
    const criticalZones = (regions || [])
        .filter((r) => (r.deficit || 0) >= 5)
        .sort((a, b) => (b.deficit || 0) - (a.deficit || 0))
        .slice(0, 3);

    if (!criticalZones.length) return;

    const now = Date.now();
    const eligibleZones = criticalZones.filter((zone) => {
        const lastAt = surgeAlertState.get(zone.name) || 0;
        return now - lastAt >= SURGE_ALERT_COOLDOWN_MS;
    });

    if (!eligibleZones.length) return;

    const drivers = await User.find({ role: 'DRIVER' }).select('_id').lean();
    if (!drivers.length) return;

    for (const zone of eligibleZones) {
        const multiplier = zone.deficit >= 12 ? 2.5 : zone.deficit >= 8 ? 2.0 : zone.deficit >= 5 ? 1.5 : 1.2;
        const message = `${zone.name} demand spike: ${zone.rides || 0} active rides, deficit ${zone.deficit}. Go online for ${multiplier}x surge bonus.`;
        const notifications = drivers.map((d) => ({
            userId: d._id,
            title: zone.name,
            message,
            type: 'SYSTEM',
            data: {
                source: 'auto-demand-engine',
                region: zone.name,
                deficit: zone.deficit,
                surgeMultiplier: multiplier,
            },
        }));

        await Notification.insertMany(notifications, { ordered: false }).catch(() => {});

        io.emit('driver-alert', {
            zone: zone.name,
            message,
            deficit: zone.deficit,
            surgeMultiplier: multiplier,
            count: drivers.length,
            at: new Date().toISOString(),
        });

        pushToDrivers({
            type: 'driver-alert',
            zone: zone.name,
            message,
            count: drivers.length,
            surgeMultiplier: multiplier,
            peakHours,
            highDemandZones: criticalZones.map((z) => ({
                name: z.name,
                heatLevel: z.heatLevel,
                deficit: z.deficit,
                predicted: z.predicted,
                rides: z.rides,
                lat: z.lat,
                lng: z.lng,
            })),
        });

        surgeAlertState.set(zone.name, now);
    }
}

// ─── Mongoose models (reuse main app schemas) ──────────────────────────
const User = require('../../server/models/User');
const Ride = require('../../server/models/Ride');
const Notification = require('../../server/models/Notification');

// ─── Express & Socket.IO Setup ──────────────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
const PORT = process.env.ADMIN_PORT || 5002;
const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL || 'http://localhost:5001';

app.use(cors());
app.use(express.json());

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'LeafLift Admin API',
            version: '1.0.0',
            description: 'API Documentation for LeafLift Admin Application',
        },
        servers: [{
            url: `http://localhost:${PORT}`,
            description: 'Admin server',
        }, ],
    },
    apis: [path.join(__dirname, './index.js')],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// ─── Bridge: push notifications to drivers via main server (port 5001) ──
async function pushToDrivers(payload) {
    try {
        const res = await fetch(`${MAIN_SERVER_URL}/api/internal/push-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) console.error('[Bridge] Main server responded', res.status);
        else console.log('[Bridge] Pushed to main server:', payload.type);
    } catch (err) {
        console.error('[Bridge] Cannot reach main server:', err.message);
    }
}

// ─── Socket.IO Real-Time Data Broadcasting ─────────────────────────────
let connectedClients = 0;

io.on('connection', (socket) => {
    connectedClients++;
    console.log(`🔵 Admin client connected (${connectedClients} total)`);

    socket.on('disconnect', () => {
        connectedClients--;
        console.log(`🔴 Admin client disconnected (${connectedClients} remaining)`);
    });
});

// Real-time data broadcaster (only when mongo ready) — REAL data only, no random noise
async function broadcastRealTimeData() {
    if (connectedClients === 0 || !mongoReady) return;

    try {
        const now = new Date();
        const [activeDrivers, totalRiders, recentRides, ongoingRides, totalRides, revenueAgg, peaks, regions, poolingRows, ecoRows, fleetRows] = await Promise.all([
            User.countDocuments({ role: 'DRIVER' }),
            User.countDocuments({ role: 'RIDER' }),
            Ride.countDocuments({ createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } }),
            Ride.countDocuments({ status: { $in: ['SEARCHING', 'ACCEPTED', 'IN_PROGRESS'] } }),
            Ride.countDocuments(),
            Ride.aggregate([{ $match: { status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$fare' } } }]),
            Ride.aggregate([
                { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
                { $sort: { '_id': 1 } }
            ]),
            computeRegionDemandForecast(now.getHours(), now.getDay(), null),
            Ride.aggregate([{
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                        pooled: { $sum: { $cond: ['$isPooled', 1, 0] } },
                        matched: { $sum: { $cond: [{ $and: ['$isPooled', { $eq: ['$status', 'COMPLETED'] }] }, 1, 0] } },
                        total: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 7 }
            ]),
            Ride.aggregate([{
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                        co2Saved: { $sum: { $ifNull: ['$co2Saved', 0] } },
                        co2Emitted: { $sum: { $ifNull: ['$co2Emissions', 0] } },
                        greenTrips: { $sum: { $cond: [{ $gt: ['$co2Saved', 0] }, 1, 0] } },
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 7 }
            ]),
            Ride.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
                { $group: { _id: '$vehicleCategory', rides: { $sum: 1 }, activeDrivers: { $addToSet: '$driverId' } } },
            ]),
        ]);
        io.emit('stats-update', {
            activeDrivers,
            recentRides,
            timestamp: new Date().toISOString(),
            liveRiders: totalRiders,
            ongoingRides,
            totalRides,
            revenue: revenueAgg.length > 0 ? revenueAgg[0].total : 0,
        });

        const peakHourMap = {};
        peaks.forEach((h) => { peakHourMap[h._id] = h.count; });
        const peakCounts = Object.values(peakHourMap).map(Number);
        const peakMean = peakCounts.length ? peakCounts.reduce((a, b) => a + b, 0) / peakCounts.length : 0;
        const peakStd = peakCounts.length ? Math.sqrt(peakCounts.reduce((a, c) => a + Math.pow(c - peakMean, 2), 0) / peakCounts.length) : 0;
        const peakThreshold = Math.round(peakMean + peakStd);
        const peakPayload = Array.from({ length: 24 }, (_, hour) => {
            const count = peakHourMap[hour] || 0;
            return { hour, count, rides: count, isPeak: count > peakThreshold, threshold: peakThreshold };
        });

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const poolingMonthly = poolingRows.map((m) => {
            const monthIdx = parseInt(String(m._id).split('-')[1], 10) - 1;
            const pooled = Number(m.pooled || 0);
            const solo = Math.max(0, Number(m.total || 0) - pooled);
            const total = pooled + solo;
            const rate = total > 0 ? Number(((pooled / total) * 100).toFixed(1)) : 0;
            return {
                month: monthNames[monthIdx] || String(m._id),
                pooled,
                solo,
                rate,
                totalRequests: pooled,
                matched: Number(m.matched || 0),
                successRate: pooled > 0 ? Number(((Number(m.matched || 0) / pooled) * 100).toFixed(1)) : 0,
            };
        });
        const totalPooled = poolingMonthly.reduce((s, m) => s + m.pooled, 0);
        const totalSolo = poolingMonthly.reduce((s, m) => s + m.solo, 0);
        const totalMatched = poolingMonthly.reduce((s, m) => s + m.matched, 0);
        const poolingCurrent = {
            totalPooled,
            totalSolo,
            successRate: totalPooled > 0 ? Number(((totalMatched / totalPooled) * 100).toFixed(1)) : 0,
            avgSavings: 28,
            avgOccupancy: totalPooled > 0 ? Number((1 + Math.min(1.8, totalPooled / Math.max(totalRides, 1) * 3)).toFixed(1)) : 1.0,
        };

        const ecoMonthly = ecoRows.map((m) => {
            const monthIdx = parseInt(String(m._id).split('-')[1], 10) - 1;
            const saved = Number(m.co2Saved || 0);
            const emitted = Number(m.co2Emitted || 0);
            const efficiency = saved + emitted > 0 ? Number(((saved / (saved + emitted)) * 100).toFixed(1)) : 0;
            return {
                month: monthNames[monthIdx] || String(m._id),
                saved,
                emitted,
                efficiency,
                greenTrips: Number(m.greenTrips || 0),
            };
        });
        const totalSaved = ecoMonthly.reduce((s, m) => s + m.saved, 0);
        const totalEmitted = ecoMonthly.reduce((s, m) => s + m.emitted, 0);
        const totalGreenTrips = ecoMonthly.reduce((s, m) => s + m.greenTrips, 0);
        const ecoCurrent = {
            totalCO2Saved: Number(totalSaved.toFixed(1)),
            totalCO2Emitted: Number(totalEmitted.toFixed(1)),
            poolingImpact: totalSaved > 0 ? Number(((totalSaved / Math.max(totalSaved + totalEmitted, 1)) * 100).toFixed(1)) : 0,
            avgEfficiency: ecoMonthly.length ? Number((ecoMonthly.reduce((s, m) => s + m.efficiency, 0) / ecoMonthly.length).toFixed(1)) : 0,
            greenRidesPct: totalRides > 0 ? Number(((totalGreenTrips / totalRides) * 100).toFixed(1)) : 0,
        };

        const fleetByCategory = new Map((fleetRows || []).map((r) => [r._id, r]));
        const fleetLabels = { BIKE: 'Bike', AUTO: 'Auto', CAR: 'Car', BIG_CAR: 'SUV' };
        const fleetData = ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'].map((cat) => {
            const row = fleetByCategory.get(cat);
            const active = row ? new Set((row.activeDrivers || []).filter(Boolean).map(String)).size : 0;
            const ridesForCat = row ? Number(row.rides || 0) : 0;
            const total = Math.max(active + 4, 12);
            const idle = Math.max(0, total - active);
            const maintenance = Math.max(1, Math.round(total * 0.08));
            const utilization = total > 0 ? Number(((active / total) * 100).toFixed(1)) : 0;
            return { type: fleetLabels[cat], total, active, idle, maintenance, utilization, rides: ridesForCat };
        });

        io.emit('demand-update', {
            regions,
            generatedAt: new Date().toISOString(),
        });
        io.emit('peak-update', peakPayload);
        io.emit('pooling-update', { current: poolingCurrent, monthly: poolingMonthly });
        io.emit('eco-update', { current: ecoCurrent, monthly: ecoMonthly });
        io.emit('fleet-update', { vehicles: fleetData, period: 'day', generatedAt: new Date().toISOString() });

        const activePeakHours = peakPayload.filter((h) => h.isPeak).map((h) => h.hour);
        pushToDrivers({
            type: 'demand-sync',
            highDemandZones: regions
                .filter((z) => z.heatLevel === 'critical' || z.heatLevel === 'high' || z.deficit > 0)
                .slice(0, 8)
                .map((z) => ({
                    name: z.name,
                    heatLevel: z.heatLevel,
                    deficit: z.deficit,
                    predicted: z.predicted,
                    rides: z.rides,
                    lat: z.lat,
                    lng: z.lng,
                })),
            peakHours: activePeakHours,
        });

        await emitAutomatedSurgeAlerts(regions, activePeakHours);
    } catch (err) {
        // silently skip if DB not ready
    }
}

// Broadcast updates every 5 seconds
setInterval(broadcastRealTimeData, 5000);

// ─── Middleware: ensure DB ready ────────────────────────────────────
app.use('/api/admin', (req, res, next) => {
    if (!mongoReady) return res.status(503).json({ error: 'Database connecting...' });
    next();
});

// ═══════════════════════════════════════════════════════════════════
// SEED: Create demo data for admin dashboard
// ═══════════════════════════════════════════════════════════════════
const SEED_VEHICLE_CATEGORIES = ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'];
const SEED_PAYMENT_METHODS = ['Cash', 'UPI', 'Wallet'];
const SEED_REGION_POINTS = DEMAND_REGIONS.map((r) => ({ name: r.name, lat: r.lat, lng: r.lng }));
const SEED_ALERT_MESSAGES = [
    'High demand detected. Extra drivers needed.',
    'Surge active. Go online for bonuses.',
    'Riders waiting in your area.',
    'Live simulation: peak cluster building in your zone.',
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (items) => items[Math.floor(Math.random() * items.length)];
const randomOffset = (value, maxDelta = 0.01) => value + (Math.random() - 0.5) * maxDelta;

async function ensureSeedUsers(role, minCount) {
    let users = await User.find({ role }).select('_id').lean();
    if (users.length >= minCount) return users;

    const toCreate = minCount - users.length;
    const nowToken = Date.now();
    const docs = [];
    for (let i = 0; i < toCreate; i++) {
        const idx = users.length + i + 1;
        const isDriver = role === 'DRIVER';
        docs.push({
            firstName: `${isDriver ? 'Driver' : 'Rider'}${idx}`,
            lastName: 'Sim',
            email: `${isDriver ? 'driver' : 'rider'}-${nowToken}-${idx}@leaflift.test`,
            phone: `${isDriver ? '99' : '98'}${String(nowToken + idx).slice(-8)}`,
            role,
            gender: idx % 2 === 0 ? 'Male' : 'Female',
            dob: isDriver ? '1990-01-15' : '1995-06-20',
        });
    }
    if (docs.length > 0) await User.insertMany(docs, { ordered: false }).catch(() => {});
    users = await User.find({ role }).select('_id').lean();
    return users;
}

function buildSeedRide({ riderId, driverId, now, simulation }) {
    const pickupRegion = randomChoice(SEED_REGION_POINTS);
    const dropoffRegion = randomChoice(SEED_REGION_POINTS);
    const vehicleCategory = randomChoice(SEED_VEHICLE_CATEGORIES);
    const isPooled = (vehicleCategory === 'CAR' || vehicleCategory === 'BIG_CAR') ? Math.random() > 0.5 : false;

    const waitMinutes = randomInt(2, 10);
    const tripMinutes = simulation ? randomInt(7, 35) : randomInt(8, 45);
    const distanceKm = simulation ? (1.5 + Math.random() * 12) : (2 + Math.random() * 18);

    let createdAt;
    if (simulation) {
        const ageMinutes = randomInt(0, 180);
        createdAt = new Date(now.getTime() - ageMinutes * 60000);
    } else {
        const daysAgo = randomInt(0, 210);
        const minutesAgo = randomInt(0, 1439);
        createdAt = new Date(now.getTime() - daysAgo * 86400000 - minutesAgo * 60000);
    }

    const startedAt = new Date(createdAt.getTime() + waitMinutes * 60000);
    const naturalEndAt = new Date(startedAt.getTime() + tripMinutes * 60000);

    let status;
    if (simulation) {
        if (now.getTime() < startedAt.getTime()) {
            status = Math.random() < 0.62 ? 'SEARCHING' : 'ACCEPTED';
        } else if (now.getTime() < naturalEndAt.getTime()) {
            status = 'IN_PROGRESS';
        } else {
            status = Math.random() < 0.86 ? 'COMPLETED' : 'CANCELED';
        }
    } else {
        status = randomChoice(['COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELED', 'IN_PROGRESS', 'ACCEPTED', 'SEARCHING']);
    }

    let endedAt = null;
    let canceledAt = null;
    let canceledBy = null;
    let cancelReason = '';
    if (status === 'COMPLETED') {
        endedAt = naturalEndAt;
    } else if (status === 'CANCELED') {
        const cancelDelayMinutes = randomInt(1, Math.max(2, Math.floor(tripMinutes / 2)));
        canceledAt = new Date(startedAt.getTime() + cancelDelayMinutes * 60000);
        endedAt = canceledAt;
        canceledBy = Math.random() < 0.55 ? 'RIDER' : 'DRIVER';
        cancelReason = canceledBy === 'RIDER' ? 'Changed plans' : 'Vehicle issue';
    }

    const rates = { BIKE: 7, AUTO: 10, CAR: 12, BIG_CAR: 16 };
    const bases = { BIKE: 15, AUTO: 25, CAR: 30, BIG_CAR: 45 };
    const co2Rates = { BIKE: 20, AUTO: 60, CAR: 120, BIG_CAR: 180 };

    let fare = Math.round(bases[vehicleCategory] + distanceKm * rates[vehicleCategory]);
    if (isPooled) fare = Math.round(fare * 0.67);
    const co2Emissions = Math.round(distanceKm * co2Rates[vehicleCategory]);
    const co2Saved = isPooled ? Math.round(distanceKm * (co2Rates[vehicleCategory] - 40)) : 0;

    const pickup = {
        address: pickupRegion.name,
        lat: randomOffset(pickupRegion.lat, 0.015),
        lng: randomOffset(pickupRegion.lng, 0.015),
    };
    const dropoff = {
        address: dropoffRegion.name,
        lat: randomOffset(dropoffRegion.lat, 0.015),
        lng: randomOffset(dropoffRegion.lng, 0.015),
    };
    const midpoint = {
        lat: (pickup.lat + dropoff.lat) / 2,
        lng: (pickup.lng + dropoff.lng) / 2,
    };

    const assignedDriverId = (status === 'SEARCHING' && simulation && Math.random() < 0.55) ? null : driverId;
    const paymentStatus = status === 'COMPLETED' ? 'PAID' : 'PENDING';

    const ride = {
        userId: riderId,
        driverId: assignedDriverId,
        status,
        pickup,
        dropoff,
        fare,
        distance: `${distanceKm.toFixed(1)} km`,
        duration: `${tripMinutes} min`,
        vehicleCategory,
        isPooled,
        co2Emissions,
        co2Saved,
        passengers: isPooled ? randomInt(2, 4) : 1,
        maxPassengers: vehicleCategory === 'BIG_CAR' ? 6 : 4,
        paymentMethod: randomChoice(SEED_PAYMENT_METHODS),
        paymentStatus,
        createdAt,
        bookingTime: createdAt,
        startedAt,
        endedAt,
        canceledAt,
        canceledBy,
        cancelReason,
    };

    if (status === 'SEARCHING' || status === 'ACCEPTED') {
        ride.riderLocation = { lat: pickup.lat, lng: pickup.lng, updatedAt: now };
        if (assignedDriverId) ride.driverLocation = { lat: randomOffset(pickup.lat, 0.005), lng: randomOffset(pickup.lng, 0.005), updatedAt: now };
    } else if (status === 'IN_PROGRESS') {
        ride.riderLocation = { lat: randomOffset(midpoint.lat, 0.004), lng: randomOffset(midpoint.lng, 0.004), updatedAt: now };
        if (assignedDriverId) ride.driverLocation = { lat: randomOffset(midpoint.lat, 0.003), lng: randomOffset(midpoint.lng, 0.003), updatedAt: now };
    } else if (status === 'COMPLETED') {
        ride.driverLocation = { lat: dropoff.lat, lng: dropoff.lng, updatedAt: endedAt || now };
    }

    return ride;
}

app.post('/api/admin/seed', async(req, res) => {
    try {
        const rawCount = parseInt(String((req.body && req.body.count !== undefined ? req.body.count : null) || (req.query && req.query.count !== undefined ? req.query.count : null) || '200'), 10);
        const count = Number.isFinite(rawCount) ? clamp(rawCount, 1, 500) : 200;
        const simulation = String((req.body && req.body.simulation !== undefined ? req.body.simulation : null) || (req.query && req.query.simulation !== undefined ? req.query.simulation : null) || '').toLowerCase() === 'true' || (req.body && req.body.simulation === true);
        const force = String((req.body && req.body.force !== undefined ? req.body.force : null) || (req.query && req.query.force !== undefined ? req.query.force : null) || '').toLowerCase() === 'true' || (req.body && req.body.force === true);
        const mode = simulation ? 'live-simulation' : 'historical';

        const existingRides = await Ride.countDocuments();
        if (!simulation && !force && existingRides > 50) {
            return res.json({
                message: 'DB already has data',
                rides: existingRides,
                hint: 'Use simulation=true (or the Seed 100 Live action) to add realtime rides.',
            });
        }

        const minDrivers = simulation ? Math.max(20, Math.ceil(count * 0.35)) : 15;
        const minRiders = simulation ? Math.max(40, Math.ceil(count * 1.5)) : 25;
        const [drivers, riders] = await Promise.all([
            ensureSeedUsers('DRIVER', minDrivers),
            ensureSeedUsers('RIDER', minRiders),
        ]);

        const now = new Date();
        const rides = [];
        for (let i = 0; i < count; i++) {
            rides.push(buildSeedRide({
                riderId: randomChoice(riders)._id,
                driverId: randomChoice(drivers)._id,
                now,
                simulation,
            }));
        }
        await Ride.insertMany(rides, { ordered: false });

        const notifCount = simulation ? clamp(Math.round(count / 8), 8, 40) : 10;
        const notifDocs = [];
        for (let i = 0; i < notifCount; i++) {
            notifDocs.push({
                userId: randomChoice(drivers)._id,
                title: randomChoice(SEED_REGION_POINTS).name,
                message: randomChoice(SEED_ALERT_MESSAGES),
                type: 'SYSTEM',
                createdAt: new Date(now.getTime() - randomInt(0, simulation ? 30 : 120) * 60000),
            });
        }
        await Notification.insertMany(notifDocs, { ordered: false });

        const statusBreakdown = rides.reduce((acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        }, {});
        const createdTimes = rides.map((r) => new Date(r.createdAt).getTime()).sort((a, b) => a - b);
        const endedTimes = rides.filter((r) => r.endedAt).map((r) => new Date(r.endedAt).getTime()).sort((a, b) => a - b);

        if (redis) {
            const keys = await redis.keys('admin:*');
            if (keys.length > 0) await redis.del(...keys);
        }

        res.json({
            success: true,
            mode,
            simulation,
            riders: riders.length,
            drivers: drivers.length,
            rides: count,
            notifications: notifCount,
            statusBreakdown,
            timeWindow: {
                oldestRideAt: createdTimes.length ? new Date(createdTimes[0]).toISOString() : null,
                latestRideAt: createdTimes.length ? new Date(createdTimes[createdTimes.length - 1]).toISOString() : null,
                latestRideEndAt: endedTimes.length ? new Date(endedTimes[endedTimes.length - 1]).toISOString() : null,
            },
        });
    } catch (err) {
        console.error('Seed error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// EXPORT REPORT (CSV)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/admin/export/rides', async(req, res) => {
    try {
        const { format = 'csv', period = 'month' } = req.query;
        let dateFilter = {};
        const now = new Date();
        if (period === 'week') dateFilter = { createdAt: { $gte: new Date(now - 7 * 86400000) } };
        else if (period === 'month') dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
        else if (period === 'year') dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), 0, 1) } };

        const rides = await Ride.find(dateFilter)
            .select('status pickup.address dropoff.address fare vehicleCategory isPooled co2Emissions co2Saved passengers paymentMethod createdAt')
            .sort({ createdAt: -1 }).limit(1000).lean();

        if (format === 'json') return res.json(rides);

        const header = 'Date,Status,Pickup,Dropoff,Fare,Vehicle,Pooled,CO2_Emitted_g,CO2_Saved_g,Passengers,Payment\n';
        const rows = rides.map(r => {
            const date = new Date(r.createdAt).toISOString().split('T')[0];
            return `${date},${r.status},"${r.pickup?.address || ''}","${r.dropoff?.address || ''}",${r.fare || 0},${r.vehicleCategory},${r.isPooled},${r.co2Emissions || 0},${r.co2Saved || 0},${r.passengers || 1},${r.paymentMethod || 'Cash'}`;
        }).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=leaflift-rides-${period}.csv`);
        res.send(header + rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════
// PEAK CONFIG (save/load surge multiplier)
// ═══════════════════════════════════════════════════════════════════
let peakConfig = { multiplier: 1.5 };

app.get('/api/admin/config/peak', (req, res) => {
    res.json(peakConfig);
});

app.post('/api/admin/config/peak', (req, res) => {
    const { multiplier } = req.body;
    if (typeof multiplier === 'number' && multiplier > 0 && multiplier < 5) {
        peakConfig.multiplier = multiplier;
        cacheSet('admin:peak-hours', null, 1);
        io.emit('peak-config', peakConfig);
        res.json({ success: true, config: peakConfig });
    } else {
        res.status(400).json({ error: 'Invalid multiplier (0-5)' });
    }
});

// ═══════════════════════════════════════════════════════════════════
// HEATMAP POINTS (lat/lng for map rendering)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/admin/heatmap/points', async(req, res) => {
    try {
        const cached = await cacheGet('admin:heatmap-points');
        if (cached) return res.json(cached);

        const riderPoints = await Ride.find({ 'pickup.lat': { $exists: true } },
            'pickup.lat pickup.lng status createdAt'
        ).sort({ createdAt: -1 }).limit(500).lean();

        const driverRides = await Ride.find({ driverId: { $exists: true }, 'dropoff.lat': { $exists: true } },
            'dropoff.lat dropoff.lng driverId'
        ).sort({ createdAt: -1 }).limit(200).lean();

        const regions = [
            { name: 'Mumbai - Andheri', lat: 19.1197, lng: 72.8464, radius: 15 },
            { name: 'Delhi - Connaught Place', lat: 28.6315, lng: 77.2167, radius: 15 },
            { name: 'Bangalore - Koramangala', lat: 12.9352, lng: 77.6245, radius: 15 },
            { name: 'Hyderabad - HITEC City', lat: 17.4435, lng: 78.3772, radius: 15 },
            { name: 'Chennai - T. Nagar', lat: 13.0418, lng: 80.2341, radius: 15 },
            { name: 'Kolkata - Salt Lake', lat: 22.5726, lng: 88.4159, radius: 15 },
            { name: 'Pune - Hinjewadi', lat: 18.5912, lng: 73.7389, radius: 15 },
            { name: 'Jaipur - MI Road', lat: 26.9124, lng: 75.7873, radius: 15 },
        ];

        const haversine = (lat1, lng1, lat2, lng2) => {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLng = (lng2 - lng1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        const riders = riderPoints.map(r => ({ lat: r.pickup.lat, lng: r.pickup.lng, intensity: 0.6 + Math.random() * 0.4 }));

        const uniqueDrivers = new Map();
        driverRides.forEach(r => {
            if (r.driverId && !uniqueDrivers.has(r.driverId.toString())) {
                uniqueDrivers.set(r.driverId.toString(), { lat: r.dropoff.lat + (Math.random() - 0.5) * 0.005, lng: r.dropoff.lng + (Math.random() - 0.5) * 0.005, intensity: 0.5 + Math.random() * 0.5 });
            }
        });
        regions.forEach(reg => {
            for (let i = 0; i < 3 + Math.floor(Math.random() * 8); i++) {
                uniqueDrivers.set(`sim-${reg.name}-${i}`, { lat: reg.lat + (Math.random() - 0.5) * 0.015, lng: reg.lng + (Math.random() - 0.5) * 0.015, intensity: 0.4 + Math.random() * 0.6 });
            }
        });

        const regionSummary = regions.map(reg => {
            const nearby = riderPoints.filter(r => r.pickup && r.pickup.lat && haversine(reg.lat, reg.lng, r.pickup.lat, r.pickup.lng) < reg.radius).length;
            const driverCount = [...uniqueDrivers.values()].filter(d => haversine(reg.lat, reg.lng, d.lat, d.lng) < reg.radius).length;
            const deficit = Math.max(0, Math.ceil(nearby / 5) - driverCount);
            let heatLevel = 'low';
            if (deficit > 10) heatLevel = 'critical';
            else if (deficit > 5) heatLevel = 'high';
            else if (deficit > 2) heatLevel = 'medium';
            return {...reg, rides: nearby, drivers: driverCount, deficit, heatLevel };
        });

        const result = { riders: riders.slice(0, 300), drivers: [...uniqueDrivers.values()], regions: regionSummary, updatedAt: new Date().toISOString() };
        await cacheSet('admin:heatmap-points', result, 60);
        res.json(result);
    } catch (err) {
        console.error('Heatmap points error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 1. DASHBOARD OVERVIEW
// ═══════════════════════════════════════════════════════════════════════
/**
 * @openapi
 * /api/admin/overview:
 *   get:
 *     summary: Get dashboard overview statistics
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Overview stats
 */
app.get('/api/admin/overview', async(req, res) => {
    try {
        const cached = await cacheGet('admin:overview');
        if (cached) return res.json(cached);

        const [totalRides, activeDrivers, totalRiders, pooledRides, totalPoolRequests, co2Agg, revenueAgg] = await Promise.all([
            Ride.countDocuments(),
            User.countDocuments({ role: 'DRIVER' }),
            User.countDocuments({ role: 'RIDER' }),
            Ride.countDocuments({ isPooled: true, status: 'COMPLETED' }),
            Ride.countDocuments({ isPooled: true }),
            Ride.aggregate([{ $group: { _id: null, totalSaved: { $sum: '$co2Saved' }, totalEmitted: { $sum: '$co2Emissions' } } }]),
            Ride.aggregate([{ $match: { status: 'COMPLETED' } }, { $group: { _id: null, total: { $sum: '$fare' } } }]),
        ]);

        const poolSuccessRate = totalPoolRequests > 0 ? parseFloat(((pooledRides / totalPoolRequests) * 100).toFixed(1)) : 0;
        const co2Saved = co2Agg.length > 0 ? co2Agg[0].totalSaved : 0;
        const revenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

        // Average wait time: time between ride creation and acceptance
        const waitAgg = await Ride.aggregate([
            { $match: { status: { $in: ['COMPLETED', 'IN_PROGRESS', 'ACCEPTED'] } } },
            { $project: { waitMs: { $subtract: ['$updatedAt', '$createdAt'] } } },
            { $group: { _id: null, avg: { $avg: '$waitMs' } } }
        ]);
        const avgWaitTime = waitAgg.length > 0 ? parseFloat((waitAgg[0].avg / 60000).toFixed(1)) : 4.2;

        // Peak hour detection
        const hourAgg = await Ride.aggregate([
            { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 2 }
        ]);
        const peakHours = hourAgg.map(h => {
            const hr = h._id;
            return `${hr === 0 ? 12 : hr > 12 ? hr - 12 : hr}${hr < 12 ? 'AM' : 'PM'}`;
        });
        const peakHour = peakHours.length > 0 ? peakHours.join(' - ') : '8 AM - 10 AM';

        const result = { totalRides, activeDrivers, totalRiders, poolSuccessRate, co2Saved, revenue, avgWaitTime, peakHour };
        await cacheSet('admin:overview', result, 120);
        res.json(result);
    } catch (err) {
        console.error('Overview error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 2. PEAK HOURS (4.2)
// ═══════════════════════════════════════════════════════════════════════
/**
 * @openapi
 * /api/admin/peak-hours:
 *   get:
 *     summary: Get peak hour data for the last week
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Peak hour stats
 */
app.get('/api/admin/peak-hours', async(req, res) => {
    try {
        const cached = await cacheGet('admin:peak-hours');
        if (cached) return res.json(cached);

        const hourAgg = await Ride.aggregate([
            { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
            { $sort: { '_id': 1 } }
        ]);

        const hourMap = {};
        hourAgg.forEach(h => { hourMap[h._id] = h.count; });

        // Statistical threshold = mean + 1 std deviation
        const counts = Object.values(hourMap).map(Number);
        const mean = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 50;
        const std = counts.length > 0 ? Math.sqrt(counts.reduce((a, c) => a + Math.pow(c - mean, 2), 0) / counts.length) : 20;
        const threshold = Math.round(mean + std);

        const result = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            label: `${i === 0 ? 12 : i > 12 ? i - 12 : i}${i < 12 ? 'AM' : 'PM'}`,
            count: hourMap[i] || 0,
            rides: hourMap[i] || 0,
            isPeak: (hourMap[i] || 0) > threshold,
            threshold,
        }));

        await cacheSet('admin:peak-hours', result, 300);
        res.json(result);
    } catch (err) {
        console.error('Peak hours error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 3. DEMAND BY REGION (4.1)
// ═══════════════════════════════════════════════════════════════════════
/**
 * @openapi
 * /api/admin/demand/regions:
 *   get:
 *     summary: Get demand statistics by region
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Region demand data
 */
app.get('/api/admin/demand/regions', async(req, res) => {
    try {
        const region = typeof req.query.region === 'string' ? req.query.region.trim() : '';
        const targetHour = Number.isFinite(parseInt(req.query.hour, 10)) ? parseInt(req.query.hour, 10) : new Date().getHours();
        const targetDay = Number.isFinite(parseInt(req.query.day, 10)) ? parseInt(req.query.day, 10) : new Date().getDay();
        const cacheKey = `admin:demand-regions:${region || 'all'}:${targetHour}:${targetDay}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const result = await computeRegionDemandForecast(targetHour, targetDay, region || null);
        await cacheSet(cacheKey, result, 180);
        res.json(result);
    } catch (err) {
        console.error('Demand regions error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 4. DRIVER ALERTS (4.3)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/driver-alerts', async(req, res) => {
    try {
        const alerts = await Notification.find({ type: 'SYSTEM' })
            .sort({ createdAt: -1 })
            .limit(30)
            .lean();
        const severityFromMessage = (msg = '') => {
            const m = msg.toLowerCase();
            if (m.includes('critical') || m.includes('urgent') || m.includes('shortage')) return 'critical';
            if (m.includes('high') || m.includes('surge')) return 'high';
            if (m.includes('medium') || m.includes('warning')) return 'medium';
            return 'low';
        };

        const result = alerts.map(a => ({
            id: String(a._id),
            type: a.type || 'system',
            message: a.message || 'Demand alert',
            severity: severityFromMessage(a.message),
            region: a.title || 'Unknown Region',
            timestamp: (a.createdAt || new Date()).toISOString(),
            acknowledged: Boolean(a.read),
        }));

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Send surge alert to drivers in a zone
app.post('/api/admin/driver-alerts/broadcast', async(req, res) => {
    try {
        const { zone, message } = req.body;
        const drivers = await User.find({ role: 'DRIVER' }).select('_id').lean();
        const notifications = drivers.map(d => ({
            userId: d._id,
            title: zone || 'Surge Zone',
            message: message || `High demand in ${zone}! Go online to earn more.`,
            type: 'SYSTEM',
        }));
        await Notification.insertMany(notifications);
        io.emit('driver-alert', { zone, message, count: drivers.length, at: new Date() });
        // Bridge: push to drivers connected on main server (port 5001)
        pushToDrivers({ type: 'driver-alert', zone, message, count: drivers.length });
        await cacheSet('admin:driver-alerts:last', { zone, count: drivers.length, at: new Date() }, 600);
        res.json({ success: true, driversNotified: drivers.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH: Acknowledge a driver alert
app.patch('/api/admin/driver-alerts/:id/acknowledge', async(req, res) => {
    try {
        const { id } = req.params;
        const notif = await Notification.findByIdAndUpdate(id, { read: true }, { new: true });
        if (!notif) return res.status(404).json({ error: 'Alert not found' });
        io.emit('alert-acknowledged', { id });
        res.json({ success: true, id });
    } catch (err) {
        // If ID is not a valid ObjectId, just return success for demo
        res.json({ success: true, id: req.params.id });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 4b. ADMIN → DRIVER NOTIFICATION & SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════

// Send notification to a specific driver
app.post('/api/admin/notifications/send', async(req, res) => {
    try {
        const { driverId, title, message, type } = req.body;
        if (!driverId || !message) return res.status(400).json({ error: 'driverId and message are required' });

        const driver = await User.findById(driverId).lean();
        if (!driver) return res.status(404).json({ error: 'Driver not found' });

        const notif = await Notification.create({
            userId: driverId,
            title: title || 'Admin Notification',
            message,
            type: type || 'SYSTEM',
            data: { fromAdmin: true, sentAt: new Date() },
        });

        // Bridge: push to the specific driver on main server (port 5001)
        pushToDrivers({ type: 'notification', driverId, notification: notif });

        res.json({ success: true, notification: notif });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send suggestion to a specific driver
app.post('/api/admin/suggestions/send', async(req, res) => {
    try {
        const { driverId, suggestion, zone } = req.body;
        if (!driverId || !suggestion) return res.status(400).json({ error: 'driverId and suggestion are required' });

        const driver = await User.findById(driverId).lean();
        if (!driver) return res.status(404).json({ error: 'Driver not found' });

        const notif = await Notification.create({
            userId: driverId,
            title: zone ? `Suggestion: ${zone}` : 'Admin Suggestion',
            message: suggestion,
            type: 'SYSTEM',
            data: { fromAdmin: true, isSuggestion: true, zone, sentAt: new Date() },
        });

        // Bridge: push to the specific driver on main server (port 5001)
        pushToDrivers({ type: 'notification', driverId, notification: notif });
        res.json({ success: true, notification: notif });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Broadcast notification to ALL drivers
app.post('/api/admin/notifications/broadcast', async(req, res) => {
    try {
        const { title, message, type } = req.body;
        if (!message) return res.status(400).json({ error: 'message is required' });

        const drivers = await User.find({ role: 'DRIVER' }).select('_id').lean();
        const notifDocs = drivers.map(d => ({
            userId: d._id,
            title: title || 'Admin Broadcast',
            message,
            type: type || 'SYSTEM',
            data: { fromAdmin: true, isBroadcast: true, sentAt: new Date() },
        }));
        await Notification.insertMany(notifDocs);

        io.emit('admin:broadcast', { message, title, count: drivers.length });
        // Bridge: push broadcast to all online drivers on main server (port 5001)
        pushToDrivers({ type: 'broadcast', title, message, count: drivers.length });
        res.json({ success: true, driversNotified: drivers.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// List all drivers (for the admin notification UI)
app.get('/api/admin/drivers', async(req, res) => {
    try {
        const cached = await cacheGet('admin:drivers-list');
        if (cached) return res.json(cached);

        const drivers = await User.find({ role: 'DRIVER' })
            .select('firstName lastName email phone _id')
            .sort({ firstName: 1 })
            .lean();

        await cacheSet('admin:drivers-list', drivers, 60);
        res.json(drivers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get sent notifications history (admin view)
app.get('/api/admin/notifications/sent', async(req, res) => {
    try {
        const notifications = await Notification.find({ 'data.fromAdmin': true })
            .sort({ createdAt: -1 })
            .limit(50)
            .populate('userId', 'firstName lastName email')
            .lean();

        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 5. POOLING STATS (4.4)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/pooling/stats', async(req, res) => {
    try {
        const cached = await cacheGet('admin:pooling-stats');
        if (cached) return res.json(cached);

        const monthlyAgg = await Ride.aggregate([{
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    totalRequests: { $sum: { $cond: ['$isPooled', 1, 0] } },
                    matched: { $sum: { $cond: [{ $and: ['$isPooled', { $eq: ['$status', 'COMPLETED'] }] }, 1, 0] } },
                    total: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 7 }
        ]);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthly = monthlyAgg.map(m => {
            const monthIdx = parseInt(m._id.split('-')[1]) - 1;
            const pooled = Number(m.totalRequests || 0);
            const solo = Math.max(0, Number(m.total || 0) - pooled);
            const total = pooled + solo;
            const matched = m.matched;
            return {
                month: monthNames[monthIdx] || m._id,
                pooled,
                solo,
                rate: total > 0 ? parseFloat(((pooled / total) * 100).toFixed(1)) : 0,
                totalRequests: pooled,
                matched,
                successRate: pooled > 0 ? parseFloat(((matched / pooled) * 100).toFixed(1)) : 0,
            };
        });

        const totalPooled = monthly.reduce((s, m) => s + m.pooled, 0);
        const totalSolo = monthly.reduce((s, m) => s + m.solo, 0);
        const totalMatched = monthly.reduce((s, m) => s + m.matched, 0);
        const result = {
            current: {
                totalPooled,
                totalSolo,
                successRate: totalPooled > 0 ? parseFloat(((totalMatched / totalPooled) * 100).toFixed(1)) : 0,
                avgSavings: 28,
                avgOccupancy: totalPooled > 0 ? parseFloat((1 + Math.min(1.8, totalPooled / Math.max(totalPooled + totalSolo, 1) * 3)).toFixed(1)) : 1.0,
            },
            monthly,
        };

        await cacheSet('admin:pooling-stats', result, 300);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 6. FLEET / VEHICLE UTILIZATION (4.5)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/fleet/utilization', async(req, res) => {
    try {
        const { period } = req.query; // today, week, month
        const cacheKey = `admin:fleet:${period || 'week'}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const categories = ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'];
        const icons = { BIKE: 'two_wheeler', AUTO: 'electric_rickshaw', CAR: 'directions_car', BIG_CAR: 'airport_shuttle' };
        const labels = { BIKE: 'Bike', AUTO: 'Auto', CAR: 'Car', BIG_CAR: 'SUV' };

        let dateFilter = {};
        const now = new Date();
        if (period === 'today' || period === 'day') dateFilter = { createdAt: { $gte: new Date(now.toISOString().split('T')[0]) } };
        else if (period === 'month') dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
        else dateFilter = { createdAt: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } };

        const totalDrivers = await User.countDocuments({ role: 'DRIVER' });

        const result = await Promise.all(categories.map(async(cat) => {
            const rides = await Ride.countDocuments({ vehicleCategory: cat, ...dateFilter });
            const completedRides = await Ride.countDocuments({ vehicleCategory: cat, status: 'COMPLETED', ...dateFilter });
            const distAgg = await Ride.aggregate([
                { $match: { vehicleCategory: cat, status: 'COMPLETED', ...dateFilter } },
                { $group: { _id: null, totalKm: { $sum: { $toDouble: { $ifNull: ['$distance', '0'] } } }, totalFare: { $sum: '$fare' } } }
            ]);

            const total = Math.max(Math.floor(totalDrivers / categories.length) + Math.floor(Math.random() * 5), 12);
            const active = Math.min(total, Math.max(rides, Math.floor(total * 0.5)));
            const utilization = parseFloat(((active / total) * 100).toFixed(1));
            const maintenance = Math.max(1, Math.round(total * 0.08));
            const idle = Math.max(0, total - active - maintenance);
            const totalKm = distAgg.length > 0 ? distAgg[0].totalKm : Math.round(Math.random() * 20000 + 5000);
            const avgRevenue = distAgg.length > 0 && completedRides > 0 ? Math.round(distAgg[0].totalFare / completedRides) : Math.round(Math.random() * 2000 + 800);

            return {
                type: labels[cat],
                icon: icons[cat],
                total,
                active,
                idle,
                maintenance,
                utilization,
                avgHoursPerDay: parseFloat((4 + Math.random() * 5).toFixed(1)),
                totalKm: Math.round(totalKm),
                avgRevenue,
            };
        }));

        await cacheSet(cacheKey, result, 180);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 7. SUSTAINABILITY / ECO STATS (4.7)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/eco/stats', async(req, res) => {
    try {
        const cached = await cacheGet('admin:eco-stats');
        if (cached) return res.json(cached);

        const [monthlyAgg, totalRidesCount] = await Promise.all([
            Ride.aggregate([{
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                        co2Saved: { $sum: { $ifNull: ['$co2Saved', 0] } },
                        co2Emitted: { $sum: { $ifNull: ['$co2Emissions', 0] } },
                        poolSaved: { $sum: { $cond: ['$isPooled', { $ifNull: ['$co2Saved', 0] }, 0] } },
                        greenTrips: { $sum: { $cond: [{ $gt: ['$co2Saved', 0] }, 1, 0] } },
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 7 }
            ]),
            Ride.countDocuments()
        ]);

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthly = monthlyAgg.map(m => {
            const monthIdx = parseInt(m._id.split('-')[1]) - 1;
            const co2Saved = Number(m.co2Saved || 0);
            const co2Emitted = Number(m.co2Emitted || 0);
            const efficiency = co2Saved + co2Emitted > 0 ? parseFloat(((co2Saved / (co2Saved + co2Emitted)) * 100).toFixed(1)) : 0;
            return {
                month: monthNames[monthIdx] || m._id,
                saved: co2Saved,
                emitted: co2Emitted,
                co2Saved,
                co2Emitted,
                poolingSaved: Number(m.poolSaved || 0),
                treesEquivalent: Math.round(co2Saved / 22), // ~22kg CO2 per tree per year
                greenTrips: Number(m.greenTrips || 0),
                efficiency,
            };
        });

        const totalCO2Saved = monthly.reduce((s, m) => s + m.co2Saved, 0);
        const totalCO2Emitted = monthly.reduce((s, m) => s + m.co2Emitted, 0);
        const totalGreenTrips = monthly.reduce((s, m) => s + m.greenTrips, 0);
        const totalPoolingSaved = monthly.reduce((s, m) => s + m.poolingSaved, 0);
        const result = {
            current: {
                totalCO2Saved: parseFloat(totalCO2Saved.toFixed(1)),
                totalCO2Emitted: parseFloat(totalCO2Emitted.toFixed(1)),
                poolingImpact: totalCO2Saved > 0 ? parseFloat(((totalPoolingSaved / totalCO2Saved) * 100).toFixed(1)) : 0,
                avgEfficiency: monthly.length ? parseFloat((monthly.reduce((s, m) => s + m.efficiency, 0) / monthly.length).toFixed(1)) : 0,
                greenRidesPct: totalRidesCount > 0 ? parseFloat(((totalGreenTrips / totalRidesCount) * 100).toFixed(1)) : 0,
            },
            monthly,
        };

        await cacheSet('admin:eco-stats', result, 300);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 8. HISTORICAL RIDE LOGS FOR PATTERN ANALYSIS (4.6)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/rides/patterns', async(req, res) => {
    try {
        const cached = await cacheGet('admin:ride-patterns');
        if (cached) return res.json(cached);

        const [dayOfWeek, hourly, vehicleDist] = await Promise.all([
            Ride.aggregate([
                { $group: { _id: { $dayOfWeek: '$createdAt' }, count: { $sum: 1 }, avgFare: { $avg: '$fare' } } },
                { $sort: { _id: 1 } }
            ]),
            Ride.aggregate([
                { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            Ride.aggregate([
                { $group: { _id: '$vehicleCategory', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
        ]);

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const result = {
            byDayOfWeek: dayOfWeek.map(d => ({ day: dayNames[d._id - 1], rides: d.count, avgFare: Math.round(d.avgFare || 0) })),
            byHour: hourly.map(h => ({ hour: h._id, rides: h.count })),
            byVehicle: vehicleDist.map(v => ({ type: v._id, rides: v.count })),
        };

        await cacheSet('admin:ride-patterns', result, 600);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Utility ─────────────────────────────────────────────────────────
function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return `${seconds} sec ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

// ═══════════════════════════════════════════════════════════════════════
// 9. ML DEMAND PREDICTION (4.1.2, 4.6)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/ml/predict-demand', async(req, res) => {
    try {
        const region = typeof req.query.region === 'string' ? req.query.region.trim() : '';
        const scope = typeof req.query.scope === 'string' ? req.query.scope.trim() : '';
        const targetHour = Number.isFinite(parseInt(req.query.hour, 10)) ? parseInt(req.query.hour, 10) : new Date().getHours();
        const targetDay = Number.isFinite(parseInt(req.query.day, 10)) ? parseInt(req.query.day, 10) : new Date().getDay();

        const cacheKey = `admin:ml-predict:${scope || 'summary'}:${region || 'all'}:${targetHour}:${targetDay}`;
        const cached = await cacheGet(cacheKey);
        if (cached) return res.json(cached);

        const regionForecasts = await computeRegionDemandForecast(targetHour, targetDay, region || null);

        let result;
        if (scope === 'regions') {
            result = {
                predictions: regionForecasts.map(r => ({
                    region: r.region,
                    predicted: r.predicted,
                    confidence: r.confidence,
                    trend: r.trend,
                    heatLevel: r.heatLevel,
                    deficit: r.deficit,
                })),
                metadata: {
                    targetHour,
                    targetDay,
                    region: region || 'all',
                    dataPoints: regionForecasts.reduce((sum, r) => sum + (r.dataPoints || 0), 0),
                },
            };
        } else {
            const totalPrediction = regionForecasts.reduce((sum, r) => sum + r.predicted, 0);
            const averageConfidence = regionForecasts.length ?
                regionForecasts.reduce((sum, r) => sum + r.confidence, 0) / regionForecasts.length :
                0.55;
            const averageHourFactor = regionForecasts.length ?
                regionForecasts.reduce((sum, r) => sum + ((r.factors && r.factors.hourFactor) || 1), 0) / regionForecasts.length :
                1;
            const averageDayFactor = regionForecasts.length ?
                regionForecasts.reduce((sum, r) => sum + ((r.factors && r.factors.dayFactor) || 1), 0) / regionForecasts.length :
                1;
            const averageBaseDemand = regionForecasts.length ?
                Math.round(regionForecasts.reduce((sum, r) => sum + ((r.factors && r.factors.baseDemand) || 0), 0) / regionForecasts.length) :
                0;
            const totalDataPoints = regionForecasts.reduce((sum, r) => sum + (r.dataPoints || 0), 0);

            result = {
                prediction: totalPrediction,
                confidence: Math.round(averageConfidence * 100),
                factors: {
                    hourFactor: parseFloat(averageHourFactor.toFixed(2)),
                    dayFactor: parseFloat(averageDayFactor.toFixed(2)),
                    baseDemand: averageBaseDemand
                },
                metadata: {
                    dataPoints: totalDataPoints,
                    targetHour,
                    targetDay,
                    region: region || 'all'
                }
            };
        }

        await cacheSet(cacheKey, result, 300);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 10. BOTTLENECK ANALYSIS (4.6.2)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/ml/bottlenecks', async(req, res) => {
    try {
        const cached = await cacheGet('admin:bottlenecks');
        if (cached) return res.json(cached);

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const rides = await Ride.find({ createdAt: { $gte: thirtyDaysAgo } }).lean();

        const bottlenecks = [];

        // Check cancellation rate
        const canceled = rides.filter(r => r.status === 'CANCELED').length;
        const cancellationRate = rides.length > 0 ? (canceled / rides.length) * 100 : 0;
        if (cancellationRate > 15) {
            bottlenecks.push({
                type: 'HIGH_CANCELLATION',
                severity: cancellationRate > 25 ? 'critical' : 'warning',
                value: parseFloat(cancellationRate.toFixed(1)),
                message: `Cancellation rate at ${cancellationRate.toFixed(1)}% - investigate driver availability`,
                recommendation: 'Consider incentivizing drivers or improving ETA accuracy'
            });
        }

        // Check pool matching
        const pooled = rides.filter(r => r.isPooled);
        const poolCompleted = pooled.filter(r => r.status === 'COMPLETED').length;
        const poolRate = pooled.length > 0 ? (poolCompleted / pooled.length) * 100 : 100;
        if (poolRate < 60) {
            bottlenecks.push({
                type: 'LOW_POOL_MATCH',
                severity: poolRate < 40 ? 'critical' : 'warning',
                value: parseFloat(poolRate.toFixed(1)),
                message: `Pool match rate at ${poolRate.toFixed(1)}% - adjust matching algorithm`,
                recommendation: 'Expand matching radius or time window'
            });
        }

        // Check vehicle imbalance
        const byCategory = {};
        rides.forEach(r => { byCategory[r.vehicleCategory] = (byCategory[r.vehicleCategory] || 0) + 1; });
        const categories = Object.entries(byCategory);
        if (categories.length > 1) {
            const max = Math.max(...categories.map(c => c[1]));
            const min = Math.min(...categories.map(c => c[1]));
            if (max > min * 5) {
                bottlenecks.push({
                    type: 'CATEGORY_IMBALANCE',
                    severity: 'info',
                    value: parseFloat((max / min).toFixed(1)),
                    message: 'Significant demand imbalance between vehicle categories',
                    recommendation: 'Consider adjusting pricing or recruiting specific vehicle types'
                });
            }
        }

        // Check peak hour coverage
        const peakHours = [8, 9, 17, 18, 19];
        const peakRides = rides.filter(r => peakHours.includes(new Date(r.createdAt).getHours()));
        const peakCanceled = peakRides.filter(r => r.status === 'CANCELED').length;
        const peakCancelRate = peakRides.length > 0 ? (peakCanceled / peakRides.length) * 100 : 0;
        if (peakCancelRate > 20) {
            bottlenecks.push({
                type: 'PEAK_HOUR_SHORTAGE',
                severity: 'warning',
                value: parseFloat(peakCancelRate.toFixed(1)),
                message: `Peak hour cancellation at ${peakCancelRate.toFixed(1)}% - driver shortage during rush`,
                recommendation: 'Increase surge multiplier or pre-position drivers'
            });
        }

        const result = { bottlenecks, analyzedRides: rides.length, period: '30 days' };
        await cacheSet('admin:bottlenecks', result, 600);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════
// 11. FLEET OPTIMIZATION INSIGHTS (4.6.3)
// ═══════════════════════════════════════════════════════════════════════
app.get('/api/admin/ml/fleet-insights', async(req, res) => {
    try {
        const cached = await cacheGet('admin:fleet-insights');
        if (cached) return res.json(cached);

        const [dayAgg, hourAgg, categoryAgg] = await Promise.all([
            Ride.aggregate([
                { $group: { _id: { $dayOfWeek: '$createdAt' }, count: { $sum: 1 }, revenue: { $sum: '$fare' } } },
                { $sort: { count: -1 } }
            ]),
            Ride.aggregate([
                { $group: { _id: { $hour: '$createdAt' }, count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Ride.aggregate([
                { $group: { _id: '$vehicleCategory', count: { $sum: 1 }, revenue: { $sum: '$fare' } } },
                { $sort: { count: -1 } }
            ])
        ]);

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const peakDays = dayAgg.slice(0, 2).map(d => dayNames[d._id - 1]);
        const peakHours = hourAgg.slice(0, 4).map(h => h._id);
        const topCategory = (categoryAgg[0] && categoryAgg[0]._id) || 'CAR';

        const insights = [{
                type: 'PEAK_DEMAND_DAYS',
                title: 'Peak Demand Days',
                value: peakDays.join(', '),
                insight: `${peakDays[0]} has highest demand - schedule more drivers`,
                impact: 'high'
            },
            {
                type: 'PEAK_HOURS',
                title: 'Rush Hour Windows',
                value: `${peakHours[0]}:00 - ${peakHours[0] + 1}:00`,
                insight: 'Pre-position drivers 30 mins before peak',
                impact: 'high'
            },
            {
                type: 'TOP_VEHICLE',
                title: 'Most Requested Vehicle',
                value: topCategory,
                insight: `${topCategory} accounts for ${(categoryAgg[0] && categoryAgg[0].count) || 0} rides - ensure adequate supply`,
                impact: 'medium'
            },
            {
                type: 'REVENUE_OPPORTUNITY',
                title: 'Revenue Optimization',
                value: `₹${Math.round(((dayAgg[0] && dayAgg[0].revenue) || 0) / 100) * 100}/day potential`,
                insight: 'Dynamic pricing during peak can increase revenue 15-20%',
                impact: 'medium'
            }
        ];

        const result = { insights, generatedAt: new Date().toISOString() };
        await cacheSet('admin:fleet-insights', result, 600);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Health Check ────────────────────────────────────────────────────
app.get('/api/admin/health', (req, res) => {
    res.json({
        status: 'ok',
        mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        redis: redis ? 'connected' : 'not available',
        uptime: process.uptime(),
        features: ['demand-prediction', 'peak-detection', 'bottleneck-analysis', 'fleet-insights']
    });
});

// ═══════════════════════════════════════════════════════════════════════
// AUTO-SEED: 10K rides on every server start
// ═══════════════════════════════════════════════════════════════════════
async function autoSeedOnStart() {
    console.log('🗑️  Clearing existing data for fresh seed...');
    await Promise.all([
        Ride.deleteMany({}),
        Notification.deleteMany({}),
        User.deleteMany({ email: { $regex: /@leaflift\.test$/ } }),
    ]);
    if (redis) {
        const keys = await redis.keys('admin:*');
        if (keys.length > 0) await redis.del(...keys);
    }
    console.log('✅ Old data cleared.');

    const SEED_COUNT = 10000;
    const DRIVER_COUNT = 120;
    const RIDER_COUNT = 500;
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Create drivers (mix of active/inactive)
    const driverDocs = [];
    for (let i = 1; i <= DRIVER_COUNT; i++) {
        driverDocs.push({
            firstName: `Driver${i}`,
            lastName: 'Sim',
            email: `driver-seed-${i}@leaflift.test`,
            phone: `99${String(1000000000 + i).slice(-8)}`,
            role: 'DRIVER',
            gender: i % 2 === 0 ? 'Male' : 'Female',
            dob: '1990-01-15',
        });
    }
    await User.insertMany(driverDocs, { ordered: false }).catch(() => {});
    const drivers = await User.find({ role: 'DRIVER' }).select('_id').lean();

    // Create riders
    const riderDocs = [];
    for (let i = 1; i <= RIDER_COUNT; i++) {
        riderDocs.push({
            firstName: `Rider${i}`,
            lastName: 'Sim',
            email: `rider-seed-${i}@leaflift.test`,
            phone: `98${String(2000000000 + i).slice(-8)}`,
            role: 'RIDER',
            gender: i % 2 === 0 ? 'Male' : 'Female',
            dob: '1995-06-20',
        });
    }
    await User.insertMany(riderDocs, { ordered: false }).catch(() => {});
    const riders = await User.find({ role: 'RIDER' }).select('_id').lean();

    console.log(`👤 ${drivers.length} drivers, ${riders.length} riders ready.`);

    // Build 10K rides: completed, from 1 week ago to now, spread across all regions (NOT Coimbatore)
    const BATCH_SIZE = 2000;
    const timeSpanMs = now.getTime() - oneWeekAgo.getTime();
    let totalInserted = 0;

    for (let batch = 0; batch < Math.ceil(SEED_COUNT / BATCH_SIZE); batch++) {
        const batchRides = [];
        const batchSize = Math.min(BATCH_SIZE, SEED_COUNT - totalInserted);
        for (let i = 0; i < batchSize; i++) {
            const rideIndex = totalInserted + i;
            // Distribute time evenly across the week, with some noise
            const baseTimeOffset = (rideIndex / SEED_COUNT) * timeSpanMs;
            const noise = (Math.random() - 0.5) * 3600000; // ±30 min noise
            const createdAt = new Date(oneWeekAgo.getTime() + baseTimeOffset + noise);
            // Clamp to valid range
            const clampedCreatedAt = new Date(Math.max(oneWeekAgo.getTime(), Math.min(now.getTime() - 600000, createdAt.getTime())));

            const pickupRegion = SEED_REGION_POINTS[rideIndex % SEED_REGION_POINTS.length];
            const dropoffRegion = SEED_REGION_POINTS[(rideIndex + 3) % SEED_REGION_POINTS.length];
            const vehicleCategory = SEED_VEHICLE_CATEGORIES[rideIndex % SEED_VEHICLE_CATEGORIES.length];
            const isPooled = (vehicleCategory === 'CAR' || vehicleCategory === 'BIG_CAR') ? Math.random() > 0.45 : false;

            const waitMinutes = 2 + Math.floor(Math.random() * 8);
            const tripMinutes = 8 + Math.floor(Math.random() * 40);
            const distanceKm = 2 + Math.random() * 18;

            const startedAt = new Date(clampedCreatedAt.getTime() + waitMinutes * 60000);
            const endedAt = new Date(startedAt.getTime() + tripMinutes * 60000);

            // 85% completed, 10% canceled, 3% in progress, 2% searching/accepted
            let status;
            const roll = Math.random();
            if (roll < 0.85) status = 'COMPLETED';
            else if (roll < 0.95) status = 'CANCELED';
            else if (roll < 0.98) status = 'IN_PROGRESS';
            else status = Math.random() < 0.5 ? 'SEARCHING' : 'ACCEPTED';

            const rates = { BIKE: 7, AUTO: 10, CAR: 12, BIG_CAR: 16 };
            const bases = { BIKE: 15, AUTO: 25, CAR: 30, BIG_CAR: 45 };
            const co2Rates = { BIKE: 20, AUTO: 60, CAR: 120, BIG_CAR: 180 };

            let fare = Math.round(bases[vehicleCategory] + distanceKm * rates[vehicleCategory]);
            if (isPooled) fare = Math.round(fare * 0.67);
            const co2Emissions = Math.round(distanceKm * co2Rates[vehicleCategory]);
            const co2Saved = isPooled ? Math.round(distanceKm * (co2Rates[vehicleCategory] - 40)) : 0;

            const pickup = { address: pickupRegion.name, lat: randomOffset(pickupRegion.lat, 0.015), lng: randomOffset(pickupRegion.lng, 0.015) };
            const dropoff = { address: dropoffRegion.name, lat: randomOffset(dropoffRegion.lat, 0.015), lng: randomOffset(dropoffRegion.lng, 0.015) };
            const driverId = drivers[rideIndex % drivers.length]._id;
            const riderId = riders[rideIndex % riders.length]._id;

            let canceledAt = null,
                canceledBy = null,
                cancelReason = '';
            let rideEndedAt = null;
            if (status === 'COMPLETED') rideEndedAt = endedAt;
            else if (status === 'CANCELED') {
                canceledAt = new Date(startedAt.getTime() + (1 + Math.random() * tripMinutes / 2) * 60000);
                rideEndedAt = canceledAt;
                canceledBy = Math.random() < 0.55 ? 'RIDER' : 'DRIVER';
                cancelReason = canceledBy === 'RIDER' ? 'Changed plans' : 'Vehicle issue';
            }

            batchRides.push({
                userId: riderId,
                driverId: status === 'SEARCHING' ? null : driverId,
                status,
                pickup,
                dropoff,
                fare,
                distance: `${distanceKm.toFixed(1)} km`,
                duration: `${tripMinutes} min`,
                vehicleCategory,
                isPooled,
                co2Emissions,
                co2Saved,
                passengers: isPooled ? 2 + Math.floor(Math.random() * 3) : 1,
                maxPassengers: vehicleCategory === 'BIG_CAR' ? 6 : 4,
                paymentMethod: SEED_PAYMENT_METHODS[rideIndex % SEED_PAYMENT_METHODS.length],
                paymentStatus: status === 'COMPLETED' ? 'PAID' : 'PENDING',
                createdAt: clampedCreatedAt,
                bookingTime: clampedCreatedAt,
                startedAt,
                endedAt: rideEndedAt,
                canceledAt,
                canceledBy,
                cancelReason,
            });
        }
        await Ride.insertMany(batchRides, { ordered: false });
        totalInserted += batchRides.length;
        console.log(`   📦 Batch ${batch + 1}: ${totalInserted}/${SEED_COUNT} rides inserted`);
    }

    // Create notifications
    const notifDocs = [];
    for (let i = 0; i < 50; i++) {
        notifDocs.push({
            userId: drivers[i % drivers.length]._id,
            title: SEED_REGION_POINTS[i % SEED_REGION_POINTS.length].name,
            message: SEED_ALERT_MESSAGES[i % SEED_ALERT_MESSAGES.length],
            type: 'SYSTEM',
            createdAt: new Date(now.getTime() - Math.random() * 7 * 86400000),
        });
    }
    await Notification.insertMany(notifDocs, { ordered: false }).catch(() => {});

    const rideCount = await Ride.countDocuments();
    console.log(`🎉 Auto-seed complete: ${rideCount} rides, ${drivers.length} drivers, ${riders.length} riders, 50 notifications`);
}

// ─── Start Server ────────────────────────────────────────────────────
async function startServer() {
    console.log('🔄 Connecting to MongoDB...');
    await connectDB();

    // Auto-seed on every server start
    try {
        await autoSeedOnStart();
    } catch (err) {
        console.error('⚠️ Auto-seed failed (non-fatal):', err.message);
    }

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🟢 Admin backend running on http://0.0.0.0:${PORT}`);
        console.log(`📊 Access admin dashboard at http://localhost:3006`);
        console.log(`🔌 Socket.IO enabled for real-time updates`);
    });
}

startServer().catch(err => {
    console.error('❌ Failed to start admin server:', err.message);
    process.exit(1);
});
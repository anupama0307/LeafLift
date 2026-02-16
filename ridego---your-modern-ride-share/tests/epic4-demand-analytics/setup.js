/**
 * EPIC 4 — Test Setup (Pure Function Testing)
 * Demand Prediction & Usage Analytics
 * No MongoDB dependency - uses mock data for faster, more reliable tests.
 */

// ─── Region Definitions ───

export const REGIONS = [
    { name: 'RS Puram', lat: 11.0062, lng: 76.9495, radius: 2 },
    { name: 'Gandhipuram', lat: 11.0168, lng: 76.9666, radius: 2 },
    { name: 'Peelamedu', lat: 11.0250, lng: 77.0130, radius: 3 },
    { name: 'Saibaba Colony', lat: 11.0283, lng: 76.9570, radius: 2 },
    { name: 'Singanallur', lat: 10.9992, lng: 77.0325, radius: 3 },
    { name: 'Ukkadam', lat: 10.9915, lng: 76.9615, radius: 2 },
    { name: 'Town Hall', lat: 11.0005, lng: 76.9610, radius: 1.5 },
    { name: 'Avinashi Road', lat: 11.0280, lng: 77.0050, radius: 3 },
];

// ─── Dashboard Fallback Regions (mirrors admin/components/DemandScreen.tsx) ───

export const DASHBOARD_REGIONS = [
    { name: 'T. Nagar', rides: 48, drivers: 22, deficit: 26, heatLevel: 'critical', lat: 13.0418, lng: 80.2341 },
    { name: 'Adyar', rides: 35, drivers: 18, deficit: 17, heatLevel: 'critical', lat: 13.0012, lng: 80.2565 },
    { name: 'Velachery', rides: 28, drivers: 20, deficit: 8, heatLevel: 'high', lat: 12.9815, lng: 80.2180 },
    { name: 'Anna Nagar', rides: 22, drivers: 25, deficit: -3, heatLevel: 'low', lat: 13.0850, lng: 80.2101 },
    { name: 'Tambaram', rides: 31, drivers: 14, deficit: 17, heatLevel: 'critical', lat: 12.9249, lng: 80.1000 },
    { name: 'Guindy', rides: 19, drivers: 16, deficit: 3, heatLevel: 'medium', lat: 13.0067, lng: 80.2206 },
];

// ─── Dashboard 24-Hour Base Distribution (mirrors DemandScreen fallback) ───

export const DASHBOARD_HOURLY_BASE = [8, 5, 3, 2, 3, 7, 18, 42, 65, 48, 32, 28, 25, 22, 27, 35, 48, 68, 58, 40, 30, 22, 15, 10];

// ─── Chart Scaling Helper (1.1x y-axis max) ───

/**
 * Calculates the y-axis maximum for bar charts.
 * Uses 1.1x the data max so bars never touch the ceiling.
 *
 * @param {number[]} values - Array of data values
 * @returns {number} Scaled y-axis max
 */
export function chartYMax(values) {
    return Math.max(...values, 1) * 1.1;
}

// ─── Demand Prediction Algorithm (4.1.2) ───

/**
 * Predicts demand for a region based on historical data.
 * Uses weighted moving average + day-of-week factor + hour-of-day factor.
 * 
 * @param {Array} historicalData - Array of {date, hour, count} objects
 * @param {number} targetHour - Hour to predict (0-23)
 * @param {number} targetDay - Day of week (0=Sun, 6=Sat)
 * @returns {number} Predicted demand count
 */
export function predictDemand(historicalData, targetHour, targetDay) {
    if (!historicalData || historicalData.length === 0) return 0;

    // Calculate base average
    const avgDemand = historicalData.reduce((sum, d) => sum + d.count, 0) / historicalData.length;

    // If average demand is 0, return 0
    if (avgDemand === 0) return 0;

    // Hour factor: weight rides that occurred at similar hour more heavily
    const hourlyData = historicalData.filter(d => d.hour === targetHour);
    const hourFactor = hourlyData.length > 0 ?
        hourlyData.reduce((sum, d) => sum + d.count, 0) / hourlyData.length / avgDemand :
        1;

    // Day factor: weight rides that occurred on same day of week
    const dailyData = historicalData.filter(d => d.day === targetDay);
    const dayFactor = dailyData.length > 0 ?
        dailyData.reduce((sum, d) => sum + d.count, 0) / dailyData.length / avgDemand :
        1;

    // Apply weighted prediction with recency bias
    const recentData = historicalData.slice(-7);
    const recentAvg = recentData.length > 0 ?
        recentData.reduce((sum, d) => sum + d.count, 0) / recentData.length :
        avgDemand;

    const prediction = Math.round(recentAvg * hourFactor * dayFactor);
    return Math.max(0, prediction);
}

/**
 * Classifies a region's heat level based on driver deficit.
 * 
 * @param {number} deficit - Number of drivers short
 * @returns {'low' | 'medium' | 'high' | 'critical'}
 */
export function classifyHeatLevel(deficit) {
    if (deficit > 10) return 'critical';
    if (deficit > 5) return 'high';
    if (deficit > 0) return 'medium';
    return 'low';
}

// ─── Peak Hours Detection (4.2) ───

/**
 * Aggregates ride data by hour of day.
 * 
 * @param {Array} rides - Array of ride documents with createdAt
 * @returns {Array} Array of {hour: 0-23, count: number}
 */
export function aggregateByHour(rides) {
    const hourCounts = Array(24).fill(0);
    rides.forEach(ride => {
        const hour = new Date(ride.createdAt).getHours();
        hourCounts[hour]++;
    });
    return hourCounts.map((count, hour) => ({ hour, count }));
}

/**
 * Calculates statistical threshold for peak detection.
 * Uses mean + 1 standard deviation.
 * 
 * @param {Array} hourlyCounts - Array of {hour, count}
 * @returns {number} Peak threshold value
 */
export function calculatePeakThreshold(hourlyCounts) {
    const counts = hourlyCounts.map(h => h.count);
    if (counts.length === 0) return 0;

    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    return Math.round(mean + stdDev);
}

/**
 * Flags hours as peak based on threshold.
 * 
 * @param {Array} hourlyCounts - Array of {hour, count}
 * @param {number} threshold - Peak threshold
 * @returns {Array} Array of {hour, count, isPeak}
 */
export function flagPeakHours(hourlyCounts, threshold) {
    return hourlyCounts.map(h => ({
        ...h,
        isPeak: h.count > threshold,
        threshold
    }));
}

// ─── Driver Surge Management (4.3) ───

/**
 * Monitors demand vs available drivers for a zone.
 * 
 * @param {number} currentDemand - Current ride requests
 * @param {number} availableDrivers - Online drivers in zone
 * @param {number} ratio - Acceptable demand-to-driver ratio (default 5)
 * @returns {{needsDrivers: boolean, deficit: number, surgeMultiplier: number}}
 */
export function monitorZoneDemand(currentDemand, availableDrivers, ratio = 5) {
    const requiredDrivers = Math.ceil(currentDemand / ratio);
    const deficit = Math.max(0, requiredDrivers - availableDrivers);
    const needsDrivers = deficit > 0;

    // Calculate surge multiplier based on deficit severity
    let surgeMultiplier = 1.0;
    if (deficit > 15) surgeMultiplier = 2.5;
    else if (deficit > 10) surgeMultiplier = 2.0;
    else if (deficit > 5) surgeMultiplier = 1.5;
    else if (deficit > 0) surgeMultiplier = 1.2;

    return { needsDrivers, deficit, surgeMultiplier };
}

/**
 * Creates surge notification for drivers.
 * 
 * @param {string} zone - Zone name
 * @param {number} deficit - Driver deficit
 * @param {number} surgeMultiplier - Current surge rate
 * @returns {{title: string, message: string}}
 */
export function createSurgeNotification(zone, deficit, surgeMultiplier) {
    const title = zone;
    let message;

    if (surgeMultiplier >= 2.0) {
        message = `Critical demand: ${deficit} more drivers needed. ${surgeMultiplier}x surge active.`;
    } else if (surgeMultiplier >= 1.5) {
        message = `Demand rising in ${zone}. ${surgeMultiplier}x surge bonus available.`;
    } else {
        message = `Riders waiting in ${zone}. Go online to earn more.`;
    }

    return { title, message };
}

// ─── Pooling Statistics (4.4) ───

/**
 * Computes pooling success rate.
 * 
 * @param {number} matchedPools - Successfully matched pool rides
 * @param {number} totalRequests - Total pool requests
 * @returns {number} Success rate percentage (0-100)
 */
export function computePoolingSuccessRate(matchedPools, totalRequests) {
    if (totalRequests === 0) return 0;
    return parseFloat(((matchedPools / totalRequests) * 100).toFixed(1));
}

/**
 * Aggregates monthly pooling statistics.
 * 
 * @param {Array} rides - Array of ride documents
 * @returns {Array} Monthly stats with {month, totalRequests, matched, successRate}
 */
export function aggregateMonthlyPooling(rides) {
    const monthlyData = {};

    rides.forEach(ride => {
        if (!ride.isPooled) return;

        const date = new Date(ride.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData[key]) {
            monthlyData[key] = { totalRequests: 0, matched: 0 };
        }

        monthlyData[key].totalRequests++;
        if (ride.status === 'COMPLETED') {
            monthlyData[key].matched++;
        }
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return Object.entries(monthlyData).map(([key, data]) => {
        const monthIdx = parseInt(key.split('-')[1]) - 1;
        return {
            month: monthNames[monthIdx],
            totalRequests: data.totalRequests,
            matched: data.matched,
            successRate: computePoolingSuccessRate(data.matched, data.totalRequests)
        };
    });
}

// ─── Vehicle Utilization (4.5) ───

/**
 * Computes daily utilization percentage for a vehicle type.
 * 
 * @param {number} activeHours - Hours the vehicle was active
 * @param {number} totalHours - Total available hours (default 24)
 * @returns {number} Utilization percentage
 */
export function computeUtilization(activeHours, totalHours = 24) {
    if (totalHours === 0) return 0;
    return parseFloat(((activeHours / totalHours) * 100).toFixed(1));
}

/**
 * Aggregates vehicle utilization by category.
 * 
 * @param {Array} rides - Array of ride documents
 * @param {Object} totalFleetByCategory - Object with vehicle counts {BIKE: n, AUTO: n, ...}
 * @returns {Array} Utilization stats per vehicle type
 */
export function aggregateVehicleUtilization(rides, totalFleetByCategory) {
    const categories = ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'];
    const labels = { BIKE: 'Bike', AUTO: 'Auto', CAR: 'Car', BIG_CAR: 'SUV' };

    return categories.map(cat => {
        const catRides = rides.filter(r => r.vehicleCategory === cat);
        const completedRides = catRides.filter(r => r.status === 'COMPLETED');
        const totalKm = completedRides.reduce((sum, r) => {
            const distStr = r.distance || '0 km';
            const km = parseFloat(distStr.replace(' km', '') || 0);
            return sum + km;
        }, 0);
        const totalFare = completedRides.reduce((sum, r) => sum + (r.fare || 0), 0);

        const total = totalFleetByCategory[cat] || 10;
        const unique = new Set(catRides.map(r => r.driverId ? r.driverId.toString() : null).filter(Boolean));
        const active = unique.size;

        return {
            type: labels[cat],
            category: cat,
            total,
            active,
            utilization: computeUtilization(active, total),
            completedRides: completedRides.length,
            totalKm: Math.round(totalKm),
            avgRevenue: completedRides.length > 0 ? Math.round(totalFare / completedRides.length) : 0
        };
    });
}

/**
 * Generates CSV export string for utilization report.
 * 
 * @param {Array} utilizationData - Vehicle utilization array
 * @param {string} period - Report period label
 * @returns {string} CSV formatted string
 */
export function generateUtilizationCSV(utilizationData, period) {
    const header = 'Vehicle Type,Total,Active,Utilization %,Completed Rides,Total KM,Avg Revenue\n';
    const rows = utilizationData.map(v =>
        `${v.type},${v.total},${v.active},${v.utilization},${v.completedRides},${v.totalKm},${v.avgRevenue}`
    ).join('\n');

    return header + rows;
}

// ─── Pattern Analysis (4.6) ───

/**
 * Aggregates ride patterns by day of week.
 * 
 * @param {Array} rides - Array of ride documents
 * @returns {Array} Stats per day {day, rides, avgFare}
 */
export function analyzeByDayOfWeek(rides) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = Array(7).fill(null).map(() => ({ count: 0, totalFare: 0 }));

    rides.forEach(ride => {
        const day = new Date(ride.createdAt).getDay();
        days[day].count++;
        days[day].totalFare += ride.fare || 0;
    });

    return days.map((d, i) => ({
        day: dayNames[i],
        rides: d.count,
        avgFare: d.count > 0 ? Math.round(d.totalFare / d.count) : 0
    }));
}

/**
 * Identifies operational bottlenecks from ride data.
 * 
 * @param {Array} rides - Array of ride documents
 * @returns {Array} Bottleneck insights
 */
export function identifyBottlenecks(rides) {
    const bottlenecks = [];

    // Check for high cancellation rate
    const canceled = rides.filter(r => r.status === 'CANCELED').length;
    const cancellationRate = rides.length > 0 ? (canceled / rides.length) * 100 : 0;
    if (cancellationRate > 15) {
        bottlenecks.push({
            type: 'HIGH_CANCELLATION',
            severity: cancellationRate > 25 ? 'critical' : 'warning',
            message: `Cancellation rate at ${cancellationRate.toFixed(1)}% - investigate driver availability`
        });
    }

    // Check for low pool matching
    const pooled = rides.filter(r => r.isPooled);
    const poolCompleted = pooled.filter(r => r.status === 'COMPLETED').length;
    const poolRate = pooled.length > 0 ? (poolCompleted / pooled.length) * 100 : 100;
    if (poolRate < 60) {
        bottlenecks.push({
            type: 'LOW_POOL_MATCH',
            severity: poolRate < 40 ? 'critical' : 'warning',
            message: `Pool match rate at ${poolRate.toFixed(1)}% - adjust matching algorithm`
        });
    }

    // Check for vehicle category imbalance
    const byCategory = {};
    rides.forEach(r => {
        byCategory[r.vehicleCategory] = (byCategory[r.vehicleCategory] || 0) + 1;
    });
    const categories = Object.entries(byCategory);
    if (categories.length > 1) {
        const max = Math.max(...categories.map(c => c[1]));
        const min = Math.min(...categories.map(c => c[1]));
        if (max > min * 5) {
            bottlenecks.push({
                type: 'CATEGORY_IMBALANCE',
                severity: 'info',
                message: 'Significant demand imbalance between vehicle categories'
            });
        }
    }

    return bottlenecks;
}

// ─── Sustainability Metrics (4.7) ───

/** CO₂ emission rates per vehicle category (g/km) */
export const CO2_RATES = {
    BIKE: 20,
    AUTO: 60,
    CAR: 120,
    BIG_CAR: 180,
};

/** Pooled ride emission rate (g/km) */
export const POOL_RATE = 40;

/**
 * Calculates aggregate CO2 savings.
 * 
 * @param {Array} rides - Array of ride documents
 * @returns {{totalSaved: number, totalEmitted: number, netReduction: number}}
 */
export function calculateAggregateCO2(rides) {
    let totalSaved = 0;
    let totalEmitted = 0;

    rides.forEach(ride => {
        totalSaved += ride.co2Saved || 0;
        totalEmitted += ride.co2Emissions || 0;
    });

    const netReduction = totalEmitted + totalSaved > 0 ?
        parseFloat(((totalSaved / (totalEmitted + totalSaved)) * 100).toFixed(1)) :
        0;

    return { totalSaved, totalEmitted, netReduction };
}

/**
 * Aggregates monthly sustainability data.
 * 
 * @param {Array} rides - Array of ride documents
 * @returns {Array} Monthly environmental stats
 */
export function aggregateMonthlySustainability(rides) {
    const monthlyData = {};

    rides.forEach(ride => {
        const date = new Date(ride.createdAt);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData[key]) {
            monthlyData[key] = { co2Saved: 0, co2Emitted: 0, poolingSaved: 0, greenTrips: 0 };
        }

        monthlyData[key].co2Saved += ride.co2Saved || 0;
        monthlyData[key].co2Emitted += ride.co2Emissions || 0;
        if (ride.isPooled) {
            monthlyData[key].poolingSaved += ride.co2Saved || 0;
        }
        if ((ride.co2Saved || 0) > 0) {
            monthlyData[key].greenTrips++;
        }
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return Object.entries(monthlyData).map(([key, data]) => {
        const monthIdx = parseInt(key.split('-')[1]) - 1;
        return {
            month: monthNames[monthIdx],
            co2Saved: data.co2Saved,
            co2Emitted: data.co2Emitted,
            poolingSaved: data.poolingSaved,
            treesEquivalent: Math.round(data.co2Saved / 22), // ~22kg CO2 per tree/year
            greenTrips: data.greenTrips
        };
    });
}

/**
 * Haversine distance calculation between two points.
 * 
 * @param {number} lat1 - Latitude 1
 * @param {number} lng1 - Longitude 1
 * @param {number} lat2 - Latitude 2
 * @param {number} lng2 - Longitude 2
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Mock Data Helpers ───

/**
 * Creates a mock ride object for testing.
 */
export function createMockRide(overrides = {}) {
    return {
        _id: Math.random().toString(36).substr(2, 9),
        userId: 'user123',
        driverId: 'driver456',
        status: 'COMPLETED',
        pickup: { address: 'RS Puram', lat: 11.0062, lng: 76.9495 },
        dropoff: { address: 'Gandhipuram', lat: 11.0168, lng: 76.9666 },
        fare: 150,
        distance: '5 km',
        duration: '15 min',
        vehicleCategory: 'CAR',
        isPooled: false,
        co2Emissions: 600,
        co2Saved: 0,
        passengers: 1,
        createdAt: new Date(),
        completedAt: new Date(),
        ...overrides
    };
}

/**
 * Creates a mock notification object for testing.
 */
export function createMockNotification(overrides = {}) {
    return {
        _id: Math.random().toString(36).substr(2, 9),
        userId: 'driver123',
        title: 'Surge Alert',
        message: 'High demand in RS Puram!',
        type: 'ALERT',
        read: false,
        createdAt: new Date(),
        ...overrides
    };
}

/**
 * Generates an array of mock rides for testing.
 */
export function generateMockRides(count, options = {}) {
    const rides = [];
    const categories = ['BIKE', 'AUTO', 'CAR', 'BIG_CAR'];
    const statuses = ['COMPLETED', 'COMPLETED', 'COMPLETED', 'CANCELED'];

    for (let i = 0; i < count; i++) {
        const date = options.startDate ? new Date(options.startDate) : new Date();
        date.setHours(date.getHours() - Math.floor(Math.random() * 24 * 7));

        rides.push(createMockRide({
            vehicleCategory: options.category || categories[Math.floor(Math.random() * categories.length)],
            status: options.status || statuses[Math.floor(Math.random() * statuses.length)],
            isPooled: options.isPooled !== undefined ? options.isPooled : Math.random() > 0.7,
            createdAt: date,
            fare: 50 + Math.floor(Math.random() * 200),
            distance: `${Math.floor(Math.random() * 15) + 1} km`,
            co2Emissions: Math.floor(Math.random() * 500) + 100,
            co2Saved: Math.floor(Math.random() * 100),
            driverId: `driver${Math.floor(Math.random() * 5)}`
        }));
    }

    return rides;
}
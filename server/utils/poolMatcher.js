/**
 * Pool Matching Algorithm for LeafLift
 * Determines if a rider's pickup/dropoff points lie along a driver's route
 */

/**
 * Decode Google/OLA encoded polyline to array of {lat, lng} coordinates
 * @param {string} encoded - Encoded polyline string
 * @returns {Array<{lat: number, lng: number}>}
 */
function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
        lng += dlng;

        points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return points;
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 
 * @param {number} lng1 
 * @param {number} lat2 
 * @param {number} lng2 
 * @returns {number} Distance in kilometers
 */
function getDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371; // Earth's radius in km

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate minimum distance from a point to a line segment on Earth's surface
 * @param {{lat: number, lng: number}} point - The point to measure from
 * @param {{lat: number, lng: number}} segA - Start of line segment
 * @param {{lat: number, lng: number}} segB - End of line segment
 * @returns {number} Distance in kilometers
 */
function pointToSegmentDistance(point, segA, segB) {
    // Vector from A to B
    const AB = {
        lat: segB.lat - segA.lat,
        lng: segB.lng - segA.lng
    };

    // Vector from A to point Q
    const AQ = {
        lat: point.lat - segA.lat,
        lng: point.lng - segA.lng
    };

    // Project Q onto AB: t = dot(AQ, AB) / dot(AB, AB)
    const dotABAB = AB.lat * AB.lat + AB.lng * AB.lng;
    
    // Handle degenerate case where A and B are the same point
    if (dotABAB === 0) {
        return getDistanceKm(point.lat, point.lng, segA.lat, segA.lng);
    }

    const dotAQAB = AQ.lat * AB.lat + AQ.lng * AB.lng;
    let t = dotAQAB / dotABAB;

    // Clamp t to [0, 1] to keep the closest point on the segment
    t = Math.max(0, Math.min(1, t));

    // Calculate closest point on segment: P = A + t * AB
    const closestPoint = {
        lat: segA.lat + t * AB.lat,
        lng: segA.lng + t * AB.lng
    };

    // Return distance from point to closest point on segment
    return getDistanceKm(point.lat, point.lng, closestPoint.lat, closestPoint.lng);
}

/**
 * Find if a point lies within bufferKm of any segment in the polyline
 * @param {{lat: number, lng: number}} point - Point to check
 * @param {Array<{lat: number, lng: number}>} polylinePoints - Decoded polyline
 * @param {number} bufferKm - Maximum distance in km to consider a match
 * @returns {{found: boolean, segmentIndex?: number, distance?: number}}
 */
function findNearestSegment(point, polylinePoints, bufferKm) {
    if (!polylinePoints || polylinePoints.length < 2) {
        return { found: false };
    }

    let minDistance = Infinity;
    let nearestSegmentIndex = -1;

    // Check each segment
    for (let i = 0; i < polylinePoints.length - 1; i++) {
        const segA = polylinePoints[i];
        const segB = polylinePoints[i + 1];
        
        const distance = pointToSegmentDistance(point, segA, segB);

        if (distance < minDistance) {
            minDistance = distance;
            nearestSegmentIndex = i;
        }
    }

    // Check if minimum distance is within buffer
    if (minDistance <= bufferKm) {
        return {
            found: true,
            segmentIndex: nearestSegmentIndex,
            distance: minDistance
        };
    }

    return { found: false };
}

/**
 * Main matching function: Check if rider's pickup/dropoff lie along driver's route
 * @param {string} encodedPolyline - Encoded polyline from OLA Maps
 * @param {{lat: number, lng: number}} riderPickup 
 * @param {{lat: number, lng: number}} riderDropoff 
 * @param {number} bufferKm - Buffer radius in km (default 0.5)
 * @returns {{match: boolean, pickupSegment?: number, dropoffSegment?: number, pickupDistance?: number, dropoffDistance?: number}}
 */
function isRiderOnRoute(encodedPolyline, riderPickup, riderDropoff, bufferKm = 0.5) {
    if (!encodedPolyline || !riderPickup || !riderDropoff) {
        return { match: false };
    }

    // Decode polyline
    const polylinePoints = decodePolyline(encodedPolyline);

    if (polylinePoints.length < 2) {
        return { match: false };
    }

    // Check if pickup is on route
    const pickupResult = findNearestSegment(riderPickup, polylinePoints, bufferKm);
    if (!pickupResult.found) {
        return { match: false };
    }

    // Check if dropoff is on route
    const dropoffResult = findNearestSegment(riderDropoff, polylinePoints, bufferKm);
    if (!dropoffResult.found) {
        return { match: false };
    }

    // Directional check: dropoff must come after pickup
    if (dropoffResult.segmentIndex < pickupResult.segmentIndex) {
        return { match: false };
    }

    // All checks passed!
    return {
        match: true,
        pickupSegment: pickupResult.segmentIndex,
        dropoffSegment: dropoffResult.segmentIndex,
        pickupDistance: pickupResult.distance,
        dropoffDistance: dropoffResult.distance
    };
}

/**
 * Batch function: Filter active rides to find matches for a rider
 * @param {Array} activeRides - Array of ride objects with routePolyline
 * @param {{lat: number, lng: number}} riderPickup 
 * @param {{lat: number, lng: number}} riderDropoff 
 * @param {number} bufferKm - Buffer radius in km (default 0.5)
 * @returns {Array} Matching rides with match details
 */
function findMatchingRides(activeRides, riderPickup, riderDropoff, bufferKm = 0.5) {
    if (!activeRides || activeRides.length === 0) {
        return [];
    }

    const matches = [];

    for (const ride of activeRides) {
        // Skip rides without polyline
        if (!ride.routePolyline) continue;

        // Check if rider matches this ride's route
        const matchResult = isRiderOnRoute(
            ride.routePolyline,
            riderPickup,
            riderDropoff,
            bufferKm
        );

        if (matchResult.match) {
            matches.push({
                ride,
                matchDetails: matchResult
            });
        }
    }

    // Sort by pickup distance (closest first)
    matches.sort((a, b) => a.matchDetails.pickupDistance - b.matchDetails.pickupDistance);

    return matches;
}

module.exports = {
    decodePolyline,
    getDistanceKm,
    pointToSegmentDistance,
    findNearestSegment,
    isRiderOnRoute,
    findMatchingRides
};

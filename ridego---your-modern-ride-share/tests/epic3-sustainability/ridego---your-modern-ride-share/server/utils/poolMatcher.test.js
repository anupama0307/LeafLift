/**
 * Test/Example file for Pool Matching Algorithm
 * Run with: node server/utils/poolMatcher.test.js
 */

const {
    decodePolyline,
    getDistanceKm,
    pointToSegmentDistance,
    findNearestSegment,
    isRiderOnRoute
} = require('./poolMatcher');

// Example: Test with a simple encoded polyline
// This represents a route from point A to point B
const examplePolyline = 'u~l~Fd~cl@DuAzAyAjBmBzA_B'; // Example encoded polyline

// Test 1: Decode Polyline
console.log('=== Test 1: Decode Polyline ===');
const decodedPoints = decodePolyline(examplePolyline);
console.log('Decoded points:', decodedPoints);
console.log('Number of points:', decodedPoints.length);
console.log('');

// Test 2: Distance Calculation
console.log('=== Test 2: Haversine Distance ===');
const dist = getDistanceKm(11.0168, 76.9558, 11.0268, 76.9658);
console.log(`Distance between two points: ${dist.toFixed(3)} km`);
console.log('');

// Test 3: Point to Segment Distance
console.log('=== Test 3: Point to Segment Distance ===');
const segA = { lat: 11.0168, lng: 76.9558 };
const segB = { lat: 11.0268, lng: 76.9658 };
const point = { lat: 11.0218, lng: 76.9608 }; // Point near the middle
const segmentDist = pointToSegmentDistance(point, segA, segB);
console.log(`Distance from point to segment: ${segmentDist.toFixed(3)} km`);
console.log('');

// Test 4: Find Nearest Segment
console.log('=== Test 4: Find Nearest Segment ===');
const testRoute = [
    { lat: 11.0168, lng: 76.9558 },
    { lat: 11.0268, lng: 76.9658 },
    { lat: 11.0368, lng: 76.9758 },
    { lat: 11.0468, lng: 76.9858 }
];
const testPoint = { lat: 11.0300, lng: 76.9700 };
const nearestResult = findNearestSegment(testPoint, testRoute, 0.5);
console.log('Nearest segment result:', nearestResult);
console.log('');

// Test 5: Full Route Matching
console.log('=== Test 5: Full Route Matching ===');
const driverRoute = 'mzf~C_zp}M??aAl@cAt@iAr@mBhAoAxAyBjBkBnBsBxC}@pA}AtB{@pAo@dAo@`Ai@`AsApBwA~B'; // Example route

const riderPickup = { lat: 11.02, lng: 76.96 };
const riderDropoff = { lat: 11.04, lng: 76.98 };

const matchResult = isRiderOnRoute(driverRoute, riderPickup, riderDropoff, 0.5);
console.log('Match result:', JSON.stringify(matchResult, null, 2));
console.log('');

// Test 6: Edge Cases
console.log('=== Test 6: Edge Cases ===');

// Case 1: Rider going backwards (should fail)
const backwardMatch = isRiderOnRoute(
    driverRoute,
    { lat: 11.04, lng: 76.98 }, // Pickup at end
    { lat: 11.02, lng: 76.96 }, // Dropoff at start
    0.5
);
console.log('Backward match (should be false):', backwardMatch.match);

// Case 2: Rider too far from route (should fail)
const farMatch = isRiderOnRoute(
    driverRoute,
    { lat: 11.10, lng: 77.10 }, // Very far point
    { lat: 11.11, lng: 77.11 },
    0.5
);
console.log('Too far match (should be false):', farMatch.match);

console.log('');
console.log('=== All Tests Complete ===');
console.log('');
console.log('Usage Example for API:');
console.log(`
POST http://localhost:5001/api/rides/pool-match
Content-Type: application/json

{
  "pickupLat": 11.02,
  "pickupLng": 76.96,
  "dropoffLat": 11.04,
  "dropoffLng": 76.98,
  "bufferKm": 0.5
}
`);

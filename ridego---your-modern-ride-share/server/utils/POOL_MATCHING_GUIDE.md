 # Pool Matching Algorithm - Integration Guide

## Overview
The pool matching algorithm determines if a rider's pickup and dropoff points lie along a driver's existing route using encoded polylines from OLA Maps API.

## Components

### 1. Utility Module: `server/utils/poolMatcher.js`
Contains all the core matching logic:
- `decodePolyline(encoded)` - Decodes OLA/Google encoded polylines
- `getDistanceKm(lat1, lng1, lat2, lng2)` - Haversine distance calculation
- `pointToSegmentDistance(point, segA, segB)` - Distance from point to line segment
- `findNearestSegment(point, polylinePoints, bufferKm)` - Finds nearest polyline segment
- `isRiderOnRoute(encodedPolyline, riderPickup, riderDropoff, bufferKm)` - Main matching function
- `findMatchingRides(activeRides, riderPickup, riderDropoff, bufferKm)` - Batch matching

### 2. Database Schema: `server/models/Ride.js`
Added field:
```javascript
routePolyline: {
    type: String,
    default: ''
}
```

### 3. API Endpoint: `POST /api/rides/pool-match`
**Request Body:**
```json
{
  "pickupLat": 11.0168,
  "pickupLng": 76.9558,
  "dropoffLat": 11.0468,
  "dropoffLng": 76.9858,
  "bufferKm": 0.5  // Optional, default 0.5 km
}
```

**Response:**
```json
{
  "matches": [
    {
      "rideId": "60d5ec49f1b2c8b5f8e4a1b2",
      "driver": {
        "firstName": "John",
        "lastName": "Doe",
        "rating": 4.8,
        "vehicleMake": "Tata",
        "vehicleModel": "Nexon"
      },
      "currentPassengers": 1,
      "availableSeats": 3,
      "matchDetails": {
        "pickupSegment": 5,
        "dropoffSegment": 15,
        "pickupDistance": 0.35,
        "dropoffDistance": 0.42,
        "pickupDistanceMeters": 350,
        "dropoffDistanceMeters": 420
      }
    }
  ],
  "totalMatches": 1,
  "bufferKm": 0.5
}
```

## Integration Steps

### Step 1: Store Route Polyline When Ride is Accepted

When a driver accepts a ride, fetch the route from OLA Maps and store the polyline:

```javascript
// In /api/rides/:rideId/accept endpoint
app.post('/api/rides/:rideId/accept', async(req, res) => {
    try {
        const { driverId, driverLocation } = req.body;
        const ride = await Ride.findById(req.params.rideId);
        
        // ... existing acceptance logic ...
        
        // NEW: Fetch route polyline from OLA Maps if this is a pooled ride
        if (ride.isPooled && driverLocation && ride.pickup && ride.dropoff) {
            try {
                const routeResponse = await axios.post(
                    'https://api.olamaps.io/routing/v1/directions',
                    {
                        origin: `${driverLocation.lat},${driverLocation.lng}`,
                        destination: `${ride.dropoff.lat},${ride.dropoff.lng}`,
                        alternatives: false,
                        steps: false,
                        overview: 'full',
                        language: 'en',
                        api_key: process.env.OLA_MAPS_API_KEY
                    }
                );
                
                if (routeResponse.data?.routes?.[0]?.overview_polyline) {
                    ride.routePolyline = routeResponse.data.routes[0].overview_polyline;
                }
            } catch (routeError) {
                console.error('Error fetching route polyline:', routeError);
                // Continue without polyline - non-critical
            }
        }
        
        await ride.save();
        
        // ... rest of acceptance logic ...
    } catch (error) {
        // ... error handling ...
    }
});
```

### Step 2: Frontend Integration

#### In PlanRideScreen.tsx (or similar component):

```typescript
// When rider wants to find pool matches
const findPoolMatches = async () => {
    if (!pickupCoords || !dropoffCoords) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/rides/pool-match`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pickupLat: pickupCoords.lat,
                pickupLng: pickupCoords.lng,
                dropoffLat: dropoffCoords.lat,
                dropoffLng: dropoffCoords.lng,
                bufferKm: 0.5 // Adjustable
            })
        });
        
        const data = await response.json();
        
        if (data.matches && data.matches.length > 0) {
            setMatchedRides(data.matches);
            setShowPoolMatchModal(true);
        } else {
            // No matching rides, create new ride request
            handleConfirmRide();
        }
    } catch (error) {
        console.error('Error finding pool matches:', error);
        handleConfirmRide(); // Fallback to regular ride
    }
};
```

### Step 3: Update Ride Creation Flow

```typescript
// Modify handleConfirmRide to check for pool matches first
const handleConfirmRide = async () => {
    setIsRequesting(true);
    
    // If pooled ride, check for matches first
    if (rideMode === 'Pooled') {
        await findPoolMatches();
        return;
    }
    
    // ... rest of ride creation logic ...
};
```

## Algorithm Details

### How It Works

1. **Decode Polyline**: Convert encoded string to array of GPS coordinates
2. **Point-to-Segment Check**: For each segment in the route:
   - Calculate perpendicular distance from rider's point to segment
   - Use vector projection: `t = dot(AQ, AB) / dot(AB, AB)` (clamped to [0,1])
   - Find closest point on segment: `P = A + t * AB`
   - Calculate distance using Haversine formula

3. **Three Match Conditions**:
   - ✅ Pickup within buffer radius (default 0.5 km)
   - ✅ Dropoff within buffer radius
   - ✅ Dropoff segment index >= Pickup segment index (directional check)

### Buffer Radius Guidelines

- **0.3 km**: Strict matching, rider must be very close to route
- **0.5 km**: Recommended default, good balance
- **1.0 km**: Loose matching, more matches but longer detours

### Performance Considerations

- Polyline decoding: O(n) where n = encoded string length
- Point-to-segment check: O(m) where m = number of segments
- Total complexity: O(k * m) where k = number of active pooled rides

**Optimization**: The API first filters rides within 10km general vicinity before running the expensive polyline matching.

## Testing

Run the test file:
```bash
node server/utils/poolMatcher.test.js
```

Test the API endpoint:
```bash
curl -X POST http://localhost:5001/api/rides/pool-match \
  -H "Content-Type: application/json" \
  -d '{
    "pickupLat": 11.02,
    "pickupLng": 76.96,
    "dropoffLat": 11.04,
    "dropoffLng": 76.98,
    "bufferKm": 0.5
  }'
```

## Example Flow

1. **Driver A** accepts a ride from X → Y
   - System fetches route from OLA Maps
   - Stores `routePolyline` in database

2. **Rider B** requests ride from A → B
   - Frontend calls `/api/rides/pool-match` with A and B coordinates
   - Backend finds all active pooled rides with polylines
   - Runs matching algorithm on each
   - Returns sorted matches (closest pickup first)

3. **Rider B** sees matching rides
   - Can join existing ride (pool match)
   - Or create new ride request

## Edge Cases Handled

- ✅ Empty polylines → No match
- ✅ Rider going backwards → No match (directional check)
- ✅ Rider too far from route → No match (buffer check)
- ✅ Same pickup/dropoff points → Degenerate case handled
- ✅ Zero-length segments → Treated as points

## Future Enhancements

1. **Detour Calculation**: Calculate actual detour distance/time for driver
2. **Dynamic Pricing**: Adjust fare based on how well routes match
3. **Multi-Stop Optimization**: Consider existing pooled riders' routes
4. **Time Windows**: Factor in pickup time constraints
5. **Route Updates**: Recalculate polyline when route changes

## Troubleshooting

**No matches found:**
- Check if rides have `routePolyline` stored
- Verify buffer radius isn't too strict
- Ensure pickup/dropoff are in same general area
- Check ride status (must be ACCEPTED or IN_PROGRESS)

**Wrong matches:**
- Increase buffer radius
- Check polyline encoding/decoding
- Verify coordinate systems match (decimal degrees)

**Performance issues:**
- Add database index on `isPooled` and `status`
- Cache decoded polylines
- Reduce search radius for initial filtering

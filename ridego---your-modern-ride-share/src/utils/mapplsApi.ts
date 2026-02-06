import { MAPPLS_CONFIG } from '../../constants';
import { MapplsPlace, MapplsRoute, RouteInfo } from '../../types';

let accessToken: string | null = null;
let tokenExpiry: number = 0;

// Get OAuth token from our Backend Proxy
async function getAccessToken(): Promise<string> {
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    try {
        const response = await fetch('/api/mappls/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Token request failed: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        accessToken = data.access_token;
        tokenExpiry = Date.now() + (20 * 60 * 1000);

        console.log('✅ Access token retrieved');
        return accessToken!;
    } catch (error) {
        console.error('❌ Error getting access token:', error);
        throw error;
    }
}

// Autosuggest Search
export async function searchPlaces(query: string, location?: string): Promise<MapplsPlace[]> {
    if (query.length < 3) return [];

    try {
        let url = `/api/mappls/search?query=${encodeURIComponent(query)}`;
        if (location) {
            url += `&location=${location}`;
        }

        const response = await fetch(url, {
            method: 'GET',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Search request failed: ${response.status} - ${errorText}`);
            return [];
        }

        const data = await response.json();

        if (data.suggestedLocations && Array.isArray(data.suggestedLocations)) {
            return data.suggestedLocations.map((place: any) => ({
                eLoc: place.eLoc,
                placeName: place.placeName || '',
                placeAddress: place.placeAddress || '',
                // Parse coordinates with fallbacks
                latitude: parseFloat(place.latitude || place.lat || place.y || 0),
                longitude: parseFloat(place.longitude || place.lng || place.x || 0),
                type: place.type || '',
                distance: place.distance || 0
            }));
        }

        return [];
    } catch (error) {
        console.error('❌ Error searching places:', error);
        return [];
    }
}

// Get Place Details - only call if coordinates are missing
export async function getPlaceDetails(eloc: string): Promise<{ latitude: number; longitude: number; address: string } | null> {
    try {
        console.log(`🔍 Fetching details for eLoc: ${eloc}`);
        const url = `/api/mappls/place/${eloc}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`❌ Place details failed with status: ${response.status}`);
            const errorText = await response.text();
            console.error(`Error details: ${errorText}`);
            return null;
        }

        const data = await response.json();
        console.log(`📦 Received data:`, data);

        // Mappls fields (per docs) are usually: latitude, longitude, address, name, eloc.
        const rawLat = data.latitude;
        const rawLng = data.longitude;

        const lat = typeof rawLat === 'number' ? rawLat : Number.parseFloat(String(rawLat));
        const lng = typeof rawLng === 'number' ? rawLng : Number.parseFloat(String(rawLng));

        // Handles RESTRICTED / missing / NaN / 0,0
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
            console.warn(`Coordinates not available for eLoc ${eloc}. Raw:`, rawLat, rawLng);
            return null;
        }

        return {
            latitude: lat,
            longitude: lng,
            address: data.address || data.placeAddress || data.name || ''
        };
    } catch (error) {
        console.error('❌ Error getting place details:', error);
        return null;
    }
}

// Get Routes between two points
export async function getRoute(
    startLat: number,
    startLng: number,
    endLat: number,
    endLng: number
): Promise<MapplsRoute[]> {
    try {
        // Format: lng,lat
        const start = `${startLng},${startLat}`;
        const end = `${endLng},${endLat}`;

        const url = `/api/mappls/route?start=${start}&end=${end}`;

        const response = await fetch(url, {
            method: 'GET',
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Route request failed: ${response.status} - ${errorText}`);
            return [];
        }

        const data = await response.json();

        if (data.routes && Array.isArray(data.routes) && data.routes.length > 0) {
            return data.routes;
        }

        return [];
    } catch (error) {
        console.error('❌ Error getting route:', error);
        return [];
    }
}

// Calculate fare based on distance
export function calculateFare(distanceInMeters: number, rideType: 'go' | 'premier' | 'pool'): number {
    const distanceInKm = distanceInMeters / 1000;

    const baseFare = {
        go: 30,
        premier: 50,
        pool: 25
    };

    const perKmRate = {
        go: 12,
        premier: 16,
        pool: 8
    };

    const fare = baseFare[rideType] + (distanceInKm * perKmRate[rideType]);
    return Math.round(fare);
}

// Format route info for display
export function formatRouteInfo(route: MapplsRoute): RouteInfo {
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);

    return {
        distance: `${distanceKm} km`,
        duration: `${durationMin} min`,
        fare: calculateFare(route.distance, 'go')
    };
}

// Reverse Geocode
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const token = await getAccessToken();

        const response = await fetch(
            `https://apis.mappls.com/advancedmaps/v1/${MAPPLS_CONFIG.REST_API_KEY}/rev_geocode?lat=${lat}&lng=${lng}&access_token=${token}`,
            {
                method: 'GET',
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Reverse geocode request failed: ${response.status} - ${errorText}`);
            return "Unknown Location";
        }

        const data = await response.json();
        const places = data.results || data.places;

        if (places && Array.isArray(places) && places.length > 0) {
            const place = places[0];

            const components = [];
            if (place.poi) components.push(place.poi);
            else if (place.street) components.push(place.street);
            else if (place.houseNumber) components.push(place.houseNumber);

            if (place.subSubLocality) components.push(place.subSubLocality);
            else if (place.subLocality) components.push(place.subLocality);

            if (components.length > 0) {
                if (place.city && !components.join(',').includes(place.city)) {
                    components.push(place.city);
                }
                return components.join(', ');
            }

            return place.formatted_address || place.formattedAddress || "Unknown Location";
        }

        return "Unknown Location";
    } catch (error) {
        console.error('❌ Error reverse geocoding:', error);
        return "Unknown Location";
    }
}

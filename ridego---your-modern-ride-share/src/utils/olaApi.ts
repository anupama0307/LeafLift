import { OlaPlace, OlaRoute, RouteInfo } from '../../types';

// Note: OLA API key is handled by the backend proxy (/api/ola/*) - not needed here

// ✅ Autocomplete Search
export async function searchPlaces(query: string, location?: string): Promise<OlaPlace[]> {
    if (query.length < 3) return [];

    try {
        let url = `/api/ola/autocomplete?input=${encodeURIComponent(query)}`;
        if (location) {
            url += `&location=${location}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Search failed: ${response.status}`);
            return [];
        }

        const data = await response.json();

        // OLA Maps response format: { predictions: [...] }
        if (data.predictions && Array.isArray(data.predictions)) {
            return data.predictions.map((place: any) => ({
                placeId: place.place_id || '',
                description: place.description || '',
                structuredFormatting: {
                    mainText: place.structured_formatting?.main_text || place.description || '',
                    secondaryText: place.structured_formatting?.secondary_text || ''
                },
                geometry: place.geometry || null,
                latitude: place.geometry?.location?.lat || 0,
                longitude: place.geometry?.location?.lng || 0
            }));
        }

        return [];
    } catch (error) {
        console.error('❌ Search error:', error);
        return [];
    }
}

// ✅ Get Directions/Route
export async function getRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
): Promise<OlaRoute[]> {
    try {
        const origin = `${originLat},${originLng}`;
        const destination = `${destLat},${destLng}`;

        const response = await fetch('/api/ola/directions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ origin, destination, alternatives: true })
        });

        if (!response.ok) {
            console.error(`Route failed: ${response.status}`);
            return [];
        }

        const data = await response.json();

        // OLA Maps response format: { routes: [...] }
        if (data.routes && Array.isArray(data.routes)) {
            return data.routes.map((route: any) => ({
                summary: route.summary || '',
                distance: route.legs?.[0]?.distance || 0,
                duration: route.legs?.[0]?.duration || 0,
                geometry: route.overview_polyline || '',
                legs: route.legs || []
            }));
        }

        return [];
    } catch (error) {
        console.error('❌ Route error:', error);
        return [];
    }
}

// ✅ Reverse Geocode
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const latlng = `${lat},${lng}`;
        const response = await fetch(`/api/ola/reverse-geocode?latlng=${latlng}`);

        if (!response.ok) {
            console.error(`Reverse geocode failed: ${response.status}`);
            return "Unknown Location";
        }

        const data = await response.json();

        // OLA Maps response format: { results: [...] }
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
            const result = data.results[0];
            return result.formatted_address || result.name || "Unknown Location";
        }

        return "Unknown Location";
    } catch (error) {
        console.error('❌ Reverse geocode error:', error);
        return "Unknown Location";
    }
}

// ✅ Calculate Fare
export function calculateFare(distanceInMeters: number, rideType: 'go' | 'premier' | 'pool'): number {
    const distanceInKm = distanceInMeters / 1000;

    const baseFare = { go: 30, premier: 50, pool: 25 };
    const perKmRate = { go: 12, premier: 16, pool: 8 };

    return Math.round(baseFare[rideType] + (distanceInKm * perKmRate[rideType]));
}

// ✅ Format Route Info
export function formatRouteInfo(route: OlaRoute): RouteInfo {
    const distanceKm = (route.distance / 1000).toFixed(1);
    const durationMin = Math.round(route.duration / 60);

    return {
        distance: `${distanceKm} km`,
        duration: `${durationMin} min`,
        fare: calculateFare(route.distance, 'go')
    };
}

// ✅ Decode Polyline (for drawing route on map)
export function decodePolyline(encoded: string): Array<{ lat: number; lng: number }> {
    const points: Array<{ lat: number; lng: number }> = [];
    let index = 0, lat = 0, lng = 0;

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

import { LocationItem, SuggestionItem, ActivityItem, MessageItem } from './types';

// ✅ OLA Maps API Configuration from environment variables
export const OLA_CONFIG = {
  API_KEY: import.meta.env.VITE_OLA_MAPS_API_KEY || '',
  PROJECT_ID: import.meta.env.VITE_OLA_PROJECT_ID || '',
  get apiKey() {
    return this.API_KEY;
  }
};

// Default location (Coimbatore, India)
export const DEFAULT_CENTER = {
  lat: 11.0168,
  lng: 76.9558,
  zoom: 13
};

// CO₂ emission thresholds for eco-friendly flagging (US 3.5.2)
// Source: CO2_RATES_G_PER_KM constants in server/index.js
export const ECO_THRESHOLDS = {
  ECO_STAR:     25,   // ≤ 25 g/km  → "Eco Star"  (e.g. BIKE)
  ECO_FRIENDLY: 80,   // ≤ 80 g/km  → "Eco Friendly" (e.g. AUTO)
  // > 80 g/km        → no eco badge  (CAR, BIG_CAR)
} as const;

export type EcoTier = 'eco_star' | 'eco_friendly' | null;

/** 3.5.2 — flag a vehicle category as eco-friendly based on its emission rate */
export function getEcoTier(emissionRateGPerKm: number): EcoTier {
  if (emissionRateGPerKm <= ECO_THRESHOLDS.ECO_STAR)     return 'eco_star';
  if (emissionRateGPerKm <= ECO_THRESHOLDS.ECO_FRIENDLY) return 'eco_friendly';
  return null;
}

// Vehicle categories for ride booking
export const VEHICLE_CATEGORIES = [
  {
    id: 'BIKE',
    label: 'Bike',
    icon: 'two_wheeler',
    description: 'Quick & affordable',
    baseRate: 15,
    perKmRate: 7,
    capacity: 1,
    emissionRateGPerKm: 21,
    ecoTier: 'eco_star' as EcoTier,
  },
  {
    id: 'AUTO',
    label: 'Auto',
    icon: 'electric_rickshaw',
    description: 'Comfortable 3-wheeler',
    baseRate: 25,
    perKmRate: 10,
    capacity: 3,
    emissionRateGPerKm: 65,
    ecoTier: 'eco_friendly' as EcoTier,
  },
  {
    id: 'CAR',
    label: 'Car',
    icon: 'directions_car',
    description: 'Affordable rides',
    baseRate: 30,
    perKmRate: 12,
    capacity: 4,
    emissionRateGPerKm: 120,
    ecoTier: null as EcoTier,
  },
  {
    id: 'BIG_CAR',
    label: 'SUV',
    icon: 'airport_shuttle',
    description: 'For groups & luggage',
    baseRate: 50,
    perKmRate: 18,
    capacity: 6,
    emissionRateGPerKm: 170,
    ecoTier: null as EcoTier,
  }
];

export const RECENT_LOCATIONS: LocationItem[] = [
  {
    id: '1',
    name: 'Academic Block 3',
    address: '1.2 km away',
    icon: 'history'
  },
  {
    id: '2',
    name: 'Brookefields Mall',
    address: '67-71, Dr Krishnasamy Mudaliyar Rd',
    distance: '18 KM',
    icon: 'location_on'
  }
];

export const PLAN_SUGGESTIONS: LocationItem[] = [
  {
    id: 'p1',
    name: 'Brookefields Mall',
    address: '67-71, Dr Krishnasamy Mudaliyar Rd, Brookefields',
    distance: '18 KM',
    icon: 'location_on'
  },
  {
    id: 'p2',
    name: 'Coimbatore International Airport',
    address: 'Airport Road, Peelamedu - Pudur Main Rd, Coimbatore',
    distance: '28 KM',
    icon: 'location_on'
  },
  {
    id: 'p3',
    name: 'Codissia Trade Fair Complex',
    address: 'Nehru Nagar West, Coimbatore, Tamil Nadu',
    distance: '28 KM',
    icon: 'location_on'
  }
];

export const MAIN_SUGGESTIONS: SuggestionItem[] = [
  {
    id: 's1',
    label: 'Bike',
    iconUrl: 'two_wheeler',
    isCustomIcon: true
  },
  {
    id: 's2',
    label: 'Auto',
    iconUrl: 'electric_rickshaw',
    isCustomIcon: true
  },
  {
    id: 's3',
    label: 'Car',
    iconUrl: 'directions_car',
    promo: '15%',
    isCustomIcon: true
  },
  {
    id: 's4',
    label: 'SUV',
    iconUrl: 'airport_shuttle',
    isCustomIcon: true
  }
];

export const ACTIVITY_HISTORY: ActivityItem[] = [
  {
    id: 'act1',
    destination: 'Brookefields Mall',
    date: 'Oct 24, 4:32 PM',
    price: '₹245.00',
    status: 'Completed',
    carType: 'Car'
  },
  {
    id: 'act2',
    destination: 'Coimbatore Airport',
    date: 'Oct 22, 10:15 AM',
    price: '₹510.00',
    status: 'Completed',
    carType: 'SUV'
  },
  {
    id: 'act3',
    destination: 'Academic Block 3',
    date: 'Oct 21, 8:45 AM',
    price: '₹0.00',
    status: 'Canceled',
    carType: 'Bike'
  }
];

export const MESSAGES: MessageItem[] = [
  {
    id: 'msg1',
    driverName: 'Ramesh Kumar',
    lastMessage: 'I have arrived at the pickup location.',
    time: '2:45 PM',
    unread: true,
    driverPhoto: 'https://i.pravatar.cc/150?u=ramesh'
  },
  {
    id: 'msg2',
    driverName: 'Suresh Raina',
    lastMessage: 'Okay, see you soon!',
    time: 'Yesterday',
    driverPhoto: 'https://i.pravatar.cc/150?u=suresh'
  }
];

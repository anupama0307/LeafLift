export enum AppScreen {
  AUTH = 'AUTH',
  HOME = 'HOME',
  SERVICES = 'SERVICES',
  ACTIVITY = 'ACTIVITY',
  INBOX = 'INBOX',
  ACCOUNT = 'ACCOUNT',
  PLAN_RIDE = 'PLAN_RIDE',
  CHAT_DETAIL = 'CHAT_DETAIL',
  DRIVER_DASHBOARD = 'DRIVER_DASHBOARD'
}

export interface LocationItem {
  id: string;
  name: string;
  address: string;
  distance?: string;
  icon: string;
}

export interface SuggestionItem {
  id: string;
  label: string;
  iconUrl: string;
  promo?: string;
  isCustomIcon?: boolean;
}

export interface ActivityItem {
  id: string;
  destination: string;
  date: string;
  price: string;
  status: 'Completed' | 'Upcoming' | 'Canceled';
  carType: string;
}

export interface MessageItem {
  id: string;
  driverName: string;
  lastMessage: string;
  time: string;
  unread?: boolean;
  driverPhoto?: string;
}

// MapmyIndia specific types
export interface MapplsPlace {
  eLoc: string;
  placeName: string;
  placeAddress: string;
  latitude: number;
  longitude: number;
  type?: string;
  distance?: number;
}

export interface MapplsRoute {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: string; // encoded polyline
  legs: Array<{
    distance: number;
    duration: number;
    steps: Array<{
      distance: number;
      duration: number;
      instruction: string;
    }>;
  }>;
}

export interface RouteInfo {
  distance: string; // e.g., "18.5 km"
  duration: string; // e.g., "25 min"
  fare: number;
}

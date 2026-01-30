
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

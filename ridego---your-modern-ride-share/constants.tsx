
import { LocationItem, SuggestionItem, ActivityItem, MessageItem } from './types';

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
    label: 'Ride',
    iconUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCkmiqNr1ymgpGUQfR_BIAKAYAByrL_P4q_ld-vQ5_UKCxzHPVj2S-nO5CmBh3quS1U1VwB_tDgVy5LCmwq1LejOGy2EKsVhVm1rD-HKnnRaLewrSGgV-hqr86JTOMkgm3JO8Woqz_k0Tt9zE1E8rPQqQQVnnj1Nl_R1EEi6YNgHsg78TqVoyvYNhOdPHyD2DpnroqEY3CzzZl6RsuUPA3Yv_HBvxUijF4vy-ywoEyubQmVaHuCZGnQmwHAK6Ki8D5S-2Vh3PR1Its',
    promo: '15%'
  },
  {
    id: 's2',
    label: 'Moto',
    iconUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDosAne7lRqdzpIdiAhGs-Lsi7wDP4h6R-2H5e6zn17KtGC0E_Xucb4o5P5xX-ygLYeBcyTLU26R_wZ_bcp-J54AeVUfdC5o6dFh8sSosvFNl_eQ8qcUOiImV77QBrPLQ5k5PMjFe6HWCCPVZPl8vgXQ1CWBzjGqRC_CC3H4jT57_Gcorgikkj3wGcwAFLL2so8onGKKG21EbjJWUcvKukxF1qYhbidJINb_ecn9K8HRFUP-xp4MpUBsHm8IMUlVDBCP9_n8dQRo6s'
  },
  {
    id: 's4',
    label: 'Reserve',
    iconUrl: 'event',
    promo: 'Promo',
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
    carType: 'Uber Go'
  },
  {
    id: 'act2',
    destination: 'Coimbatore Airport',
    date: 'Oct 22, 10:15 AM',
    price: '₹510.00',
    status: 'Completed',
    carType: 'Premier'
  },
  {
    id: 'act3',
    destination: 'Academic Block 3',
    date: 'Oct 21, 8:45 AM',
    price: '₹0.00',
    status: 'Canceled',
    carType: 'Uber Go'
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

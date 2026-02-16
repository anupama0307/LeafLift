export enum AdminScreen {
  DASHBOARD = 'DASHBOARD',
  DEMAND = 'DEMAND',
  FLEET = 'FLEET',
  POOLING = 'POOLING',
  ECO = 'ECO',
  NOTIFICATIONS = 'NOTIFICATIONS',
}

export interface HourlyDemand {
  hour: string;
  rides: number;
  predicted: number;
}

export interface RegionDemand {
  region: string;
  current: number;
  predicted: number;
  drivers: number;
  deficit: number;
}

export interface PeakHourData {
  hour: number;
  label: string;
  rides: number;
  isPeak: boolean;
  threshold: number;
}

export interface DriverAllocation {
  zone: string;
  demand: number;
  available: number;
  gap: number;
  surgeActive: boolean;
}

export interface PoolingStats {
  month: string;
  totalRequests: number;
  matched: number;
  successRate: number;
}

export interface VehicleUtil {
  type: string;
  total: number;
  active: number;
  utilization: number;
  avgHoursPerDay: number;
}

export interface CO2Data {
  month: string;
  saved: number;
  emitted: number;
  poolingSaved: number;
}

export interface DashboardOverview {
  totalRides: number;
  activeDrivers: number;
  poolSuccessRate: number;
  co2Saved: number;
  revenue: number;
  avgWaitTime: number;
}

export interface MLPrediction {
  prediction: number;
  confidence: number;
  factors: {
    hourFactor: number;
    dayFactor: number;
    baseDemand: number;
  };
  metadata: {
    dataPoints: number;
    targetHour: number;
    targetDay: number;
    region: string;
  };
}

export interface Bottleneck {
  type: 'HIGH_CANCELLATION' | 'LOW_POOL_MATCH' | 'CATEGORY_IMBALANCE' | 'PEAK_HOUR_SHORTAGE';
  severity: 'critical' | 'warning' | 'info';
  value: number;
  message: string;
  recommendation: string;
}

export interface FleetInsight {
  type: string;
  title: string;
  value: string;
  insight: string;
  impact: 'high' | 'medium' | 'low';
}

export interface DriverAlert {
  zone: string;
  message: string;
  driversNotified: number;
  sentAt: string;
}

export interface MonthlyPooling {
  month: string;
  totalRequests: number;
  matched: number;
  successRate: number;
}

export interface MonthlyEco {
  month: string;
  co2Saved: number;
  co2Emitted: number;
  poolingSaved: number;
  treesEquivalent: number;
  greenTrips: number;
}

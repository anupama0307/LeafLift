export enum AdminScreen {
  DASHBOARD = 'DASHBOARD',
  DEMAND = 'DEMAND',
  FLEET = 'FLEET',
  POOLING = 'POOLING',
  ECO = 'ECO',
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

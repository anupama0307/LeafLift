# Epic 4 — Demand Prediction & Usage Analytics Tests

This directory contains unit tests for **Epic 4: Demand Prediction and Usage Analytics**.

## User Stories Covered

### User Story 4.1: Demand Forecasting
- **4.1.1** Admin dashboard to select regions for demand forecasting
- **4.1.2** Algorithm to predict demand based on historical data
- **4.1.3** Visualize predicted high-demand zones on heatmap

### User Story 4.2: Peak Hours Detection
- **4.2.1** Aggregate historical ride request data by time of day
- **4.2.2** Calculate statistical thresholds to define peak periods
- **4.2.3** Flag specific hours as "Peak" in system configuration

### User Story 4.3: Driver Surge Management
- **4.3.1** Monitor real-time zone demand against available driver count
- **4.3.2** Send push notifications to nearby off-duty drivers
- **4.3.3** Highlight high-demand surge areas on driver map

### User Story 4.4: Pooling Success Analytics
- **4.4.1** Admin widget to view pooling success statistics
- **4.4.2** Compute ratio of matched pools vs total requests
- **4.4.3** Display success rate trends on analytics dashboard

### User Story 4.5: Vehicle Utilization Reports
- **4.5.1** Admin interface to select report timeframes
- **4.5.2** Compute daily active usage percentage for each vehicle
- **4.5.3** Generate detailed utilization report with export options

### User Story 4.6: ML Pattern Learning
- **4.6.1** Aggregate historical ride logs for pattern analysis
- **4.6.2** Train ML models to identify operational bottlenecks
- **4.6.3** Apply insights to optimize fleet resource allocation

### User Story 4.7: Sustainability Impact Analytics
- **4.7.1** Develop admin dashboard view for environmental stats
- **4.7.2** Compute aggregate CO2 savings across all fleet activity
- **4.7.3** Visualize monthly sustainability trends in a graph

## Running Tests

```bash
cd tests/epic4-demand-analytics
npm install
npm test
```

## Test Files

| File | Description |
|------|-------------|
| `4.1-demand-forecast.test.js` | Demand prediction algorithm tests |
| `4.2-peak-hours.test.js` | Peak hours detection tests |
| `4.3-driver-surge.test.js` | Driver surge notification tests |
| `4.4-pooling-stats.test.js` | Pooling analytics tests |
| `4.5-vehicle-utilization.test.js` | Vehicle utilization report tests |
| `4.6-pattern-analysis.test.js` | ML pattern learning tests |
| `4.7-sustainability-metrics.test.js` | Sustainability impact tests |

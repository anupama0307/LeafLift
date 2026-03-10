"""
LeafLift Admin — ML / Analytics Microservice (FastAPI)
Provides:
  - Demand prediction (time-series) via Random Forest
  - Peak hour auto-detection using statistical thresholds
  - Operational bottleneck identification
  - Fleet resource optimization insights
  - CO₂ savings computation
"""

import asyncio
import os
import json
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

# ─── Load .env from project root ─────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

MONGODB_URI = os.getenv('MONGODB_URI', '')
REDIS_HOST = os.getenv('REDIS_HOST', '127.0.0.1')
REDIS_PORT = int(os.getenv('REDIS_PORT', '6379'))

# ─── MongoDB (Motor async driver) ────────────────────────────────────
from motor.motor_asyncio import AsyncIOMotorClient

mongo_client: Optional[AsyncIOMotorClient] = None
db = None
background_task: Optional[asyncio.Task] = None

MODEL_STATE: Dict[str, Any] = {
    "trained_at": None,
    "last_seen_count": 0,
    "last_train_count": 0,
    "model_snapshot": None,
    "logs": [],
    "config": {
        "retrain_interval_minutes": 5,
        "min_new_entries": 100,
        "default_horizon_hours": 24,
        "workers": 0,
    },
}

# ─── Redis (optional cache) ──────────────────────────────────────────
redis_client = None
try:
    import redis as redis_lib
    redis_client = redis_lib.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True, socket_connect_timeout=2)
    redis_client.ping()
    print("ML Service: Redis connected")
except Exception:
    redis_client = None
    print("ML Service: Redis not available - running without cache")

# ─── sklearn ──────────────────────────────────────────────────────────
from sklearn.ensemble import RandomForestRegressor, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from demand_pipeline import run_demand_pipeline, seed_demand_training_data, REGIONS

# ─── FastAPI App ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    global mongo_client, db, background_task
    if MONGODB_URI:
        mongo_client = AsyncIOMotorClient(MONGODB_URI)
        try:
            db = mongo_client.get_default_database()
        except Exception:
            db = mongo_client["leaflift"]
        print("ML Service: MongoDB connected")
    else:
        print("ML Service: No MONGODB_URI - using synthetic data")

    background_task = asyncio.create_task(periodic_retrain_worker())
    try:
        await train_demand_model(force=True)
        yield
    finally:
        if background_task:
            background_task.cancel()
            try:
                await background_task
            except asyncio.CancelledError:
                pass
        if mongo_client:
            mongo_client.close()


app = FastAPI(title="LeafLift ML Service", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ═══════════════════════════════════════════════════════════════════════
# HELPER: cache
# ═══════════════════════════════════════════════════════════════════════
def cache_get(key: str):
    if not redis_client:
        return None
    try:
        val = redis_client.get(key)
        return json.loads(val) if val else None
    except Exception:
        return None


def cache_set(key: str, data, ttl: int = 300):
    if not redis_client:
        return
    try:
        redis_client.set(key, json.dumps(data, default=str), ex=ttl)
    except Exception:
        pass


def add_log(message: str, level: str = "info"):
    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "level": level,
        "message": message,
    }
    MODEL_STATE["logs"].append(entry)
    MODEL_STATE["logs"] = MODEL_STATE["logs"][-200:]
    cache_set("ml:demand:logs", MODEL_STATE["logs"], ttl=3600)


def classify_heat_level(deficit: int) -> str:
    if deficit > 10:
        return "critical"
    if deficit > 5:
        return "high"
    if deficit > 0:
        return "medium"
    return "low"


async def get_total_ride_count() -> int:
    if db is None:
        return 0
    try:
        return int(await db.rides.count_documents({}))
    except Exception:
        return 0


async def train_demand_model(force: bool = False) -> Dict[str, Any]:
    ride_count = await get_total_ride_count()
    min_new = int(MODEL_STATE["config"]["min_new_entries"])
    should_retrain = force or MODEL_STATE["model_snapshot"] is None or (ride_count - MODEL_STATE["last_train_count"] >= min_new)

    if not should_retrain:
        return MODEL_STATE["model_snapshot"] or {}

    if MONGODB_URI and ride_count < 500:
        try:
            seed_info = await asyncio.to_thread(
                seed_demand_training_data,
                mongo_uri=MONGODB_URI,
                days=150,
                avg_rides_per_day=900,
                force=False,
            )
            add_log(f"Seed check executed before training: {seed_info}", "info")
        except Exception as exc:
            add_log(f"Seeding failed: {exc}", "warning")

    df = await get_ride_dataframe()
    horizon = int(MODEL_STATE["config"]["default_horizon_hours"])
    workers = int(MODEL_STATE["config"]["workers"])
    snapshot = await asyncio.to_thread(
        run_demand_pipeline,
        rides_df=df,
        horizon_hours=horizon,
        region_filter="all",
        max_workers=workers if workers > 0 else None,
    )

    MODEL_STATE["model_snapshot"] = snapshot
    MODEL_STATE["trained_at"] = datetime.utcnow().isoformat()
    MODEL_STATE["last_seen_count"] = ride_count
    MODEL_STATE["last_train_count"] = ride_count
    add_log(f"Model trained with {ride_count} rides across {snapshot['summary']['regions_modeled']} regions", "success")
    cache_set("ml:demand:latest-snapshot", snapshot, ttl=3600)
    return snapshot


async def periodic_retrain_worker():
    await asyncio.sleep(2)
    while True:
        try:
            await train_demand_model(force=False)
        except Exception as exc:
            add_log(f"Periodic retrain failed: {exc}", "error")
        interval = int(MODEL_STATE["config"]["retrain_interval_minutes"])
        await asyncio.sleep(max(1, interval) * 60)


# ═══════════════════════════════════════════════════════════════════════
# HELPER: load ride data from MongoDB or generate synthetic
# ═══════════════════════════════════════════════════════════════════════
async def get_ride_dataframe() -> pd.DataFrame:
    """Fetch rides from MongoDB and return as DataFrame."""
    if db is not None:
        cursor = db.rides.find(
            {},
            {"createdAt": 1, "fare": 1, "status": 1, "isPooled": 1,
             "vehicleCategory": 1, "co2Saved": 1, "co2Emissions": 1,
             "pickup": 1, "distance": 1, "_id": 0}
        ).limit(10000)
        rides = await cursor.to_list(length=10000)
        if len(rides) > 50:
            df = pd.DataFrame(rides)
            df['createdAt'] = pd.to_datetime(df['createdAt'])
            if 'pickup' in df.columns:
                df['pickup_lat'] = df['pickup'].apply(lambda p: p.get('lat') if isinstance(p, dict) else None)
                df['pickup_lng'] = df['pickup'].apply(lambda p: p.get('lng') if isinstance(p, dict) else None)
            return df

    # Synthetic data for demonstration
    np.random.seed(42)
    n = 3000
    dates = pd.date_range(end=datetime.now(), periods=n, freq='20min')
    region_points = [
        (19.1197, 72.8464), (28.6315, 77.2167), (12.9352, 77.6245), (17.4435, 78.3772),
        (13.0418, 80.2341), (22.5726, 88.4159), (18.5912, 73.7389), (26.9124, 75.7873),
    ]
    region_idx = np.random.randint(0, len(region_points), size=n)
    lat_noise = np.random.normal(0, 0.015, size=n)
    lng_noise = np.random.normal(0, 0.015, size=n)
    df = pd.DataFrame({
        'createdAt': dates,
        'fare': np.random.exponential(120, n) + 30,
        'status': np.random.choice(['COMPLETED', 'CANCELED', 'SEARCHING'], n, p=[0.75, 0.15, 0.10]),
        'isPooled': np.random.choice([True, False], n, p=[0.35, 0.65]),
        'vehicleCategory': np.random.choice(['BIKE', 'AUTO', 'CAR', 'BIG_CAR'], n, p=[0.35, 0.25, 0.30, 0.10]),
        'co2Saved': np.random.exponential(0.5, n),
        'co2Emissions': np.random.exponential(1.2, n),
        'pickup_lat': np.array([region_points[i][0] for i in region_idx]) + lat_noise,
        'pickup_lng': np.array([region_points[i][1] for i in region_idx]) + lng_noise,
    })
    return df


# ═══════════════════════════════════════════════════════════════════════
# 4.1.2  DEMAND PREDICTION (Random Forest)
# ═══════════════════════════════════════════════════════════════════════
@app.get("/api/ml/predict-demand")
async def predict_demand(
    region: str = Query("all", description="Region name or 'all'"),
    hours_ahead: int = Query(24, description="Hours to predict ahead"),
    workers: int = Query(0, description="Parallel worker processes. 0 = auto"),
    seed_if_needed: bool = Query(True, description="Seed MongoDB with synthetic training rides if data is insufficient"),
):
    """Hierarchical demand prediction: trained local regional models + global rollup."""
    if seed_if_needed and MONGODB_URI and MODEL_STATE["model_snapshot"] is None:
        try:
            await asyncio.to_thread(
                seed_demand_training_data,
                mongo_uri=MONGODB_URI,
                days=150,
                avg_rides_per_day=900,
                force=False,
            )
        except Exception as exc:
            add_log(f"Seed-on-request failed: {exc}", "warning")

    snapshot = await train_demand_model(force=False)
    if not snapshot:
        return {"region": region, "hours_ahead": hours_ahead, "predictions": [], "local_predictions": [], "global_forecast": {"timeline": [], "hotspots": []}}

    local = snapshot["local_predictions"]
    global_timeline = snapshot["global_forecast"]["timeline"]

    if region.lower() != "all":
        region_row = next((r for r in local if r["region"].lower() == region.lower()), None)
        legacy_predictions = (region_row or {}).get("predictions", [])
        confidence = int(round(((region_row or {}).get("confidence", 0.55)) * 100))
        total_training = int((region_row or {}).get("train_samples", 0))
        filtered_local = [region_row] if region_row else []
    else:
        legacy_predictions = [
            {
                "hour": datetime.fromisoformat(p["datetime"]).strftime("%H:00"),
                "datetime": p["datetime"],
                "predicted_rides": p["predicted_rides"],
            }
            for p in global_timeline[: max(1, min(72, hours_ahead))]
        ]
        confidence = int(round(np.mean([r["confidence"] for r in local]) * 100)) if local else 55
        total_training = int(sum(r["train_samples"] for r in local))
        filtered_local = local

    result = {
        "region": region,
        "hours_ahead": hours_ahead,
        "model": "RegionalRandomForestParallel",
        "predictions": legacy_predictions,
        "confidence": confidence,
        "total_training_samples": total_training,
        "local_predictions": filtered_local,
        "global_forecast": snapshot["global_forecast"],
        "summary": snapshot["summary"],
        "trained_at": MODEL_STATE["trained_at"],
        "config": MODEL_STATE["config"],
    }
    return result


# ═══════════════════════════════════════════════════════════════════════
# 4.2  PEAK HOUR AUTO-DETECTION (Statistical)
# ═══════════════════════════════════════════════════════════════════════
@app.get("/api/ml/peak-hours")
async def detect_peak_hours():
    """Identify peak hours using mean + 1.5 * std threshold."""
    cached = cache_get("ml:peak-hours")
    if cached:
        return cached

    df = await get_ride_dataframe()
    df['hour'] = df['createdAt'].dt.hour
    hourly_counts = df.groupby('hour').size()

    mean_rides = float(hourly_counts.mean())
    std_rides = float(hourly_counts.std())
    threshold = mean_rides + 1.5 * std_rides

    hours = []
    for h in range(24):
        count = int(hourly_counts.get(h, 0))
        hours.append({
            "hour": h,
            "label": f"{12 if h == 0 else h - 12 if h > 12 else h}{'AM' if h < 12 else 'PM'}",
            "rides": count,
            "is_peak": count > threshold,
            "z_score": round((count - mean_rides) / std_rides, 2) if std_rides > 0 else 0,
        })

    peak_hours = [h for h in hours if h['is_peak']]

    result = {
        "threshold": round(threshold, 1),
        "mean": round(mean_rides, 1),
        "std": round(std_rides, 1),
        "total_rides_analyzed": len(df),
        "peak_hours": peak_hours,
        "all_hours": hours,
    }
    cache_set("ml:peak-hours", result, 300)
    return result


# ═══════════════════════════════════════════════════════════════════════
# 4.6  OPERATIONAL BOTTLENECK IDENTIFICATION (ML Classification)
# ═══════════════════════════════════════════════════════════════════════
@app.get("/api/ml/bottlenecks")
async def identify_bottlenecks():
    """Identify operational bottlenecks using ride data patterns."""
    cached = cache_get("ml:bottlenecks")
    if cached:
        return cached

    df = await get_ride_dataframe()
    df['hour'] = df['createdAt'].dt.hour
    df['dayofweek'] = df['createdAt'].dt.dayofweek

    # Bottleneck = high cancellation rate or long search times
    hourly = df.groupby('hour').agg(
        total=('status', 'size'),
        canceled=('status', lambda x: (x == 'CANCELED').sum()),
        searching=('status', lambda x: (x == 'SEARCHING').sum()),
        avg_fare=('fare', 'mean'),
    ).reset_index()

    hourly['cancel_rate'] = (hourly['canceled'] / hourly['total'] * 100).round(1)
    hourly['search_rate'] = (hourly['searching'] / hourly['total'] * 100).round(1)

    # Flag bottlenecks
    cancel_threshold = hourly['cancel_rate'].mean() + hourly['cancel_rate'].std()
    search_threshold = hourly['search_rate'].mean() + hourly['search_rate'].std()

    bottlenecks = []
    for _, row in hourly.iterrows():
        issues = []
        severity = 'low'
        if row['cancel_rate'] > cancel_threshold:
            issues.append(f"High cancellation rate ({row['cancel_rate']}%)")
            severity = 'high'
        if row['search_rate'] > search_threshold:
            issues.append(f"Many rides stuck searching ({row['search_rate']}%)")
            severity = 'medium' if severity == 'low' else severity

        if issues:
            bottlenecks.append({
                "hour": int(row['hour']),
                "label": f"{12 if row['hour'] == 0 else row['hour'] - 12 if row['hour'] > 12 else row['hour']}{'AM' if row['hour'] < 12 else 'PM'}",
                "issues": issues,
                "severity": severity,
                "cancel_rate": float(row['cancel_rate']),
                "search_rate": float(row['search_rate']),
                "total_rides": int(row['total']),
                "suggestion": "Increase driver supply" if row['search_rate'] > search_threshold else "Reduce wait times / improve matching",
            })

    # Vehicle type analysis
    vehicle_stats = df.groupby('vehicleCategory').agg(
        total=('status', 'size'),
        canceled=('status', lambda x: (x == 'CANCELED').sum()),
    ).reset_index()
    vehicle_stats['cancel_rate'] = (vehicle_stats['canceled'] / vehicle_stats['total'] * 100).round(1)

    result = {
        "bottlenecks": bottlenecks,
        "cancel_threshold": round(float(cancel_threshold), 1),
        "search_threshold": round(float(search_threshold), 1),
        "vehicle_cancel_rates": vehicle_stats.to_dict(orient='records'),
        "optimization_suggestions": [
            "Deploy more drivers during hours 8-10 AM and 5-7 PM",
            "Incentivize BIG_CAR drivers during peak hours (low supply)",
            "Implement surge pricing to balance demand-supply mismatch",
            "Pool matching algorithm improvement can reduce cancellations by ~15%",
        ],
        "analyzed_rides": len(df),
    }
    cache_set("ml:bottlenecks", result, 600)
    return result


# ═══════════════════════════════════════════════════════════════════════
# 4.6.3  FLEET OPTIMIZATION INSIGHTS
# ═══════════════════════════════════════════════════════════════════════
@app.get("/api/ml/fleet-optimization")
async def fleet_optimization():
    """Compute optimal fleet allocation based on historical patterns."""
    cached = cache_get("ml:fleet-opt")
    if cached:
        return cached

    df = await get_ride_dataframe()
    df['hour'] = df['createdAt'].dt.hour
    df['dayofweek'] = df['createdAt'].dt.dayofweek

    # Demand by vehicle type and hour
    demand = df.groupby(['vehicleCategory', 'hour']).size().reset_index(name='rides')
    pivot = demand.pivot_table(index='hour', columns='vehicleCategory', values='rides', fill_value=0)

    categories = ['BIKE', 'AUTO', 'CAR', 'BIG_CAR']
    allocation = {}
    for cat in categories:
        if cat in pivot.columns:
            series = pivot[cat]
            total = int(series.sum())
            peak_demand = int(series.max())
            avg_demand = float(series.mean())
            recommended = int(np.ceil(peak_demand * 1.2))  # 20% buffer
            allocation[cat] = {
                "total_rides": total,
                "peak_demand_per_hour": peak_demand,
                "avg_demand_per_hour": round(avg_demand, 1),
                "recommended_fleet_size": recommended,
                "peak_hours": [int(h) for h in series.nlargest(3).index.tolist()],
            }

    result = {
        "allocations": allocation,
        "overall_recommendation": "Increase BIKE fleet by 15% and reduce BIG_CAR idle time by shifting drivers to CAR category during off-peak",
        "analyzed_period_days": int((df['createdAt'].max() - df['createdAt'].min()).total_seconds() / 86400),
        "total_rides_analyzed": len(df),
    }
    cache_set("ml:fleet-opt", result, 600)
    return result


# ═══════════════════════════════════════════════════════════════════════
# 4.7  CO₂ SUSTAINABILITY ANALYTICS
# ═══════════════════════════════════════════════════════════════════════
@app.get("/api/ml/sustainability")
async def sustainability_analytics():
    """Compute aggregate CO₂ savings and environmental metrics."""
    cached = cache_get("ml:sustainability")
    if cached:
        return cached

    df = await get_ride_dataframe()

    co2_saved = float(df['co2Saved'].sum()) if 'co2Saved' in df.columns else 0
    co2_emitted = float(df['co2Emissions'].sum()) if 'co2Emissions' in df.columns else 0

    pooled = df[df['isPooled'] == True] if 'isPooled' in df.columns else pd.DataFrame()
    pooling_co2_saved = float(pooled['co2Saved'].sum()) if len(pooled) > 0 and 'co2Saved' in pooled.columns else 0

    # Monthly trend
    if 'co2Saved' in df.columns:
        df['month'] = df['createdAt'].dt.to_period('M')
        monthly = df.groupby('month').agg(
            saved=('co2Saved', 'sum'),
            emitted=('co2Emissions', 'sum'),
        ).reset_index()
        monthly['month'] = monthly['month'].astype(str)
        trend = monthly.to_dict(orient='records')
    else:
        trend = []

    # Metrics
    trees_equivalent = round(co2_saved / 22, 1)  # 22 kg CO2 per tree per year
    cars_off_road = round(co2_saved / 4600, 1)  # avg car emits 4600 kg CO2/year
    net_reduction_pct = round((co2_saved / (co2_emitted + co2_saved) * 100), 1) if (co2_emitted + co2_saved) > 0 else 0

    result = {
        "total_co2_saved_kg": round(co2_saved, 1),
        "total_co2_emitted_kg": round(co2_emitted, 1),
        "pooling_co2_saved_kg": round(pooling_co2_saved, 1),
        "net_reduction_pct": net_reduction_pct,
        "trees_equivalent": trees_equivalent,
        "cars_off_road_equivalent": cars_off_road,
        "monthly_trend": trend,
        "total_rides": len(df),
        "pooled_rides": len(pooled),
        "sustainability_grade": "A+" if net_reduction_pct > 15 else "A" if net_reduction_pct > 10 else "B",
    }
    cache_set("ml:sustainability", result, 600)
    return result


# ═══════════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════
@app.post("/api/ml/demand-pipeline/seed")
async def seed_demand_data(
    days: int = Query(150, ge=30, le=365),
    avg_rides_per_day: int = Query(900, ge=200, le=4000),
    force: bool = Query(False),
):
    if not MONGODB_URI:
        return {"seeded": False, "reason": "MONGODB_URI missing"}
    try:
        info = await asyncio.to_thread(
            seed_demand_training_data,
            mongo_uri=MONGODB_URI,
            days=days,
            avg_rides_per_day=avg_rides_per_day,
            force=force,
        )
        if info.get("quota_exceeded"):
            add_log(f"Manual seed skipped due to Atlas quota: {info.get('error', 'quota exceeded')}", "warning")
            return {"status": "warning", "seed": info, "message": "Atlas quota exceeded. Seed skipped."}
        add_log(f"Manual seed completed: {info}", "success")
        return {"status": "ok", "seed": info}
    except Exception as exc:
        msg = str(exc)
        if "space quota" in msg.lower() or "over your space quota" in msg.lower():
            add_log(f"Manual seed skipped due to Atlas quota: {msg}", "warning")
            return {"status": "warning", "message": "Atlas quota exceeded. Seed skipped."}
        add_log(f"Manual seed failed: {exc}", "error")
        return {"status": "error", "message": msg}


@app.post("/api/ml/demand-pipeline/run")
async def run_parallel_demand_pipeline(
    region: str = Query("all"),
    hours_ahead: int = Query(24, ge=1, le=72),
    workers: int = Query(0, ge=0, le=32),
    seed_if_needed: bool = Query(True),
):
    if workers > 0:
        MODEL_STATE["config"]["workers"] = workers
    MODEL_STATE["config"]["default_horizon_hours"] = hours_ahead
    if seed_if_needed and MONGODB_URI:
        await asyncio.to_thread(seed_demand_training_data, mongo_uri=MONGODB_URI, days=150, avg_rides_per_day=900, force=False)
    snapshot = await train_demand_model(force=True)
    if region.lower() == "all":
        return {"status": "ok", **snapshot, "trained_at": MODEL_STATE["trained_at"]}
    local = [r for r in snapshot.get("local_predictions", []) if r["region"].lower() == region.lower()]
    return {"status": "ok", "local_predictions": local, "global_forecast": snapshot.get("global_forecast", {}), "summary": snapshot.get("summary", {}), "trained_at": MODEL_STATE["trained_at"]}


@app.get("/api/ml/demand/status")
async def demand_model_status():
    current_count = await get_total_ride_count()
    return {
        "trained_at": MODEL_STATE["trained_at"],
        "last_seen_count": current_count,
        "last_train_count": MODEL_STATE["last_train_count"],
        "new_entries_since_train": max(0, current_count - MODEL_STATE["last_train_count"]),
        "config": MODEL_STATE["config"],
        "regions_modeled": (MODEL_STATE["model_snapshot"] or {}).get("summary", {}).get("regions_modeled", 0),
    }


@app.post("/api/ml/demand/config")
async def update_demand_model_config(
    min_new_entries: int = Query(100, ge=1, le=50000),
    retrain_interval_minutes: int = Query(5, ge=1, le=120),
    default_horizon_hours: int = Query(24, ge=1, le=72),
    workers: int = Query(0, ge=0, le=32),
):
    MODEL_STATE["config"]["min_new_entries"] = min_new_entries
    MODEL_STATE["config"]["retrain_interval_minutes"] = retrain_interval_minutes
    MODEL_STATE["config"]["default_horizon_hours"] = default_horizon_hours
    MODEL_STATE["config"]["workers"] = workers
    add_log(
        f"Admin updated config: min_new_entries={min_new_entries}, retrain_interval_minutes={retrain_interval_minutes}, horizon={default_horizon_hours}, workers={workers}",
        "info",
    )
    return {"status": "ok", "config": MODEL_STATE["config"]}


@app.post("/api/ml/demand/retrain")
async def force_retrain():
    snapshot = await train_demand_model(force=True)
    return {"status": "ok", "trained_at": MODEL_STATE["trained_at"], "summary": snapshot.get("summary", {})}


@app.get("/api/ml/demand/live-zones")
async def demand_live_zones(region: str = Query("all"), top_n: int = Query(8, ge=1, le=20)):
    snapshot = await train_demand_model(force=False)
    local = snapshot.get("local_predictions", [])
    if region.lower() != "all":
        local = [r for r in local if r["region"].lower() == region.lower()]
    region_lookup = {r["name"]: {"lat": r["lat"], "lng": r["lng"]} for r in REGIONS}
    zones = []
    for item in local:
        predicted = int(item.get("aggregate_next_window", 0) / max(1, MODEL_STATE["config"]["default_horizon_hours"]))
        drivers = max(2, int(predicted / 5))
        deficit = max(0, int(predicted / 4) - drivers)
        coords = region_lookup.get(item["region"], {"lat": 20.5937, "lng": 78.9629})
        zones.append({
            "name": item["region"],
            "region": item["region"],
            "predicted": predicted,
            "rides": predicted,
            "drivers": drivers,
            "deficit": deficit,
            "heatLevel": classify_heat_level(deficit),
            "confidence": item.get("confidence", 0.6),
            "trend": item.get("trend", "stable"),
            "lat": coords["lat"],
            "lng": coords["lng"],
        })
    zones = sorted(zones, key=lambda z: z["predicted"], reverse=True)[:top_n]
    return {"zones": zones, "trained_at": MODEL_STATE["trained_at"]}


@app.get("/api/ml/demand/logs")
async def demand_logs(limit: int = Query(50, ge=1, le=200)):
    logs = MODEL_STATE["logs"][-limit:]
    return {"logs": logs, "count": len(logs)}


@app.get("/api/ml/health")
async def health():
    mongo_ok = db is not None
    redis_ok = redis_client is not None
    return {
        "status": "ok",
        "mongo": "connected" if mongo_ok else "not connected",
        "redis": "connected" if redis_ok else "not available",
        "demand_model_trained_at": MODEL_STATE["trained_at"],
        "demand_log_count": len(MODEL_STATE["logs"]),
    }


# ─── Run ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


from __future__ import annotations

import math
import os
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error

try:
    from pymongo import MongoClient
except Exception:  # pragma: no cover - fallback for environments without pymongo
    MongoClient = None


REGIONS: List[Dict[str, Any]] = [
    {"name": "Mumbai - Andheri", "lat": 19.1197, "lng": 72.8464, "radius_km": 15},
    {"name": "Delhi - Connaught Place", "lat": 28.6315, "lng": 77.2167, "radius_km": 15},
    {"name": "Bangalore - Koramangala", "lat": 12.9352, "lng": 77.6245, "radius_km": 15},
    {"name": "Hyderabad - HITEC City", "lat": 17.4435, "lng": 78.3772, "radius_km": 15},
    {"name": "Chennai - T. Nagar", "lat": 13.0418, "lng": 80.2341, "radius_km": 15},
    {"name": "Kolkata - Salt Lake", "lat": 22.5726, "lng": 88.4159, "radius_km": 15},
    {"name": "Pune - Hinjewadi", "lat": 18.5912, "lng": 73.7389, "radius_km": 15},
    {"name": "Jaipur - MI Road", "lat": 26.9124, "lng": 75.7873, "radius_km": 15},
]

_DEFAULT_HOUR_WEIGHTS = {
    0: 0.4, 1: 0.35, 2: 0.3, 3: 0.3, 4: 0.35, 5: 0.5,
    6: 0.8, 7: 1.35, 8: 1.55, 9: 1.35, 10: 1.0, 11: 0.95,
    12: 0.9, 13: 0.85, 14: 0.9, 15: 0.95, 16: 1.1, 17: 1.35,
    18: 1.5, 19: 1.3, 20: 1.0, 21: 0.85, 22: 0.7, 23: 0.55,
}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lng / 2) ** 2
    )
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _map_region(lat: Optional[float], lng: Optional[float]) -> Optional[str]:
    if lat is None or lng is None:
        return None
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return None
    for region in REGIONS:
        if _haversine_km(lat_f, lng_f, region["lat"], region["lng"]) <= region["radius_km"]:
            return region["name"]
    return None


def _feature_frame(time_index: pd.DatetimeIndex) -> pd.DataFrame:
    df = pd.DataFrame(index=time_index)
    df["hour"] = df.index.hour
    df["dayofweek"] = df.index.dayofweek
    df["month"] = df.index.month
    df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)
    df["is_peak_hour"] = df["hour"].isin([7, 8, 9, 17, 18, 19]).astype(int)
    df["hour_sin"] = np.sin((2 * np.pi * df["hour"]) / 24)
    df["hour_cos"] = np.cos((2 * np.pi * df["hour"]) / 24)
    return df


def _build_region_hourly_table(rides_df: pd.DataFrame) -> pd.DataFrame:
    if rides_df.empty:
        return pd.DataFrame(columns=["region", "ts", "rides"])

    rides_df = rides_df.copy()
    rides_df["ts"] = rides_df["createdAt"].dt.floor("h")
    grouped = (
        rides_df.groupby(["region", "ts"])
        .size()
        .reset_index(name="rides")
        .sort_values(["region", "ts"])
    )
    return grouped


def _estimate_confidence(mae: float, mean_demand: float) -> float:
    baseline = max(1.0, mean_demand)
    normalized_error = min(1.0, mae / baseline)
    confidence = 0.92 - normalized_error * 0.5
    return float(max(0.45, min(0.95, round(confidence, 2))))


@dataclass
class RegionTrainResult:
    region: str
    mae: float
    confidence: float
    train_samples: int
    predictions: List[Dict[str, Any]]


def _train_one_region(region: str, rows: List[Dict[str, Any]], horizon_hours: int) -> RegionTrainResult:
    region_df = pd.DataFrame(rows)
    region_df["ts"] = pd.to_datetime(region_df["ts"])
    region_df = region_df.sort_values("ts")

    full_idx = pd.date_range(region_df["ts"].min(), region_df["ts"].max(), freq="h")
    dense = pd.DataFrame({"ts": full_idx}).merge(region_df[["ts", "rides"]], how="left", on="ts")
    dense["rides"] = dense["rides"].fillna(0)

    features = _feature_frame(pd.DatetimeIndex(dense["ts"]))
    x = features[["hour", "dayofweek", "month", "is_weekend", "is_peak_hour", "hour_sin", "hour_cos"]].values
    y = dense["rides"].values

    split_idx = int(len(dense) * 0.85)
    split_idx = max(48, min(split_idx, len(dense) - 24))

    x_train, y_train = x[:split_idx], y[:split_idx]
    x_test, y_test = x[split_idx:], y[split_idx:]

    model = RandomForestRegressor(
        n_estimators=220,
        max_depth=16,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=1,
    )
    model.fit(x_train, y_train)

    y_pred_test = model.predict(x_test) if len(x_test) else np.array([])
    mae = float(mean_absolute_error(y_test, y_pred_test)) if len(y_test) else 0.0
    confidence = _estimate_confidence(mae, float(np.mean(y_train)) if len(y_train) else 1.0)

    last_ts = dense["ts"].max()
    future_idx = pd.date_range(last_ts + timedelta(hours=1), periods=horizon_hours, freq="h")
    future_feat = _feature_frame(future_idx)
    future_x = future_feat[["hour", "dayofweek", "month", "is_weekend", "is_peak_hour", "hour_sin", "hour_cos"]].values
    future_pred = np.maximum(0, np.round(model.predict(future_x))).astype(int)

    predictions = [
        {
            "datetime": ts.isoformat(),
            "hour": ts.strftime("%H:00"),
            "predicted_rides": int(value),
        }
        for ts, value in zip(future_idx, future_pred.tolist())
    ]

    return RegionTrainResult(
        region=region,
        mae=round(mae, 3),
        confidence=confidence,
        train_samples=int(len(x_train)),
        predictions=predictions,
    )


def _trend_label(values: List[int]) -> str:
    if len(values) < 4:
        return "stable"
    head = np.mean(values[: max(1, len(values) // 3)])
    tail = np.mean(values[-max(1, len(values) // 3):])
    if tail > head * 1.08:
        return "up"
    if tail < head * 0.92:
        return "down"
    return "stable"


def _predict_parallel(
    grouped_rows: Dict[str, List[Dict[str, Any]]],
    horizon_hours: int,
    max_workers: Optional[int] = None,
) -> List[RegionTrainResult]:
    import __main__

    main_file = str(getattr(__main__, "__file__", ""))
    workers = max_workers or max(1, min(len(grouped_rows), (os.cpu_count() or 2) - 1))
    if workers <= 1 or len(grouped_rows) <= 1 or "<stdin>" in main_file:
        return [_train_one_region(r, rows, horizon_hours) for r, rows in grouped_rows.items()]

    try:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            futures = [
                executor.submit(_train_one_region, region, rows, horizon_hours)
                for region, rows in grouped_rows.items()
            ]
            return [f.result() for f in futures]
    except Exception:
        return [_train_one_region(r, rows, horizon_hours) for r, rows in grouped_rows.items()]


def _build_global_view(local_results: List[RegionTrainResult]) -> Dict[str, Any]:
    if not local_results:
        return {"timeline": [], "hotspots": []}

    timeline_map: Dict[str, int] = {}
    for res in local_results:
        for point in res.predictions:
            timeline_map[point["datetime"]] = timeline_map.get(point["datetime"], 0) + int(point["predicted_rides"])

    timeline = [
        {"datetime": dt, "predicted_rides": timeline_map[dt]}
        for dt in sorted(timeline_map.keys())
    ]

    hotspots = []
    for point in timeline[: min(len(timeline), 24)]:
        dt = point["datetime"]
        ranking = sorted(
            (
                {
                    "region": res.region,
                    "predicted_rides": next(
                        (p["predicted_rides"] for p in res.predictions if p["datetime"] == dt),
                        0,
                    ),
                    "confidence": res.confidence,
                }
                for res in local_results
            ),
            key=lambda item: item["predicted_rides"],
            reverse=True,
        )[:3]
        hotspots.append({"datetime": dt, "top_regions": ranking})

    return {"timeline": timeline, "hotspots": hotspots}


def seed_demand_training_data(
    mongo_uri: str,
    db_name: Optional[str] = None,
    days: int = 150,
    avg_rides_per_day: int = 900,
    force: bool = False,
) -> Dict[str, Any]:
    if MongoClient is None:
        raise RuntimeError("pymongo is required for seeding demand training data.")
    client = MongoClient(mongo_uri)
    try:
        if db_name:
            db = client.get_database(db_name)
        else:
            try:
                db = client.get_default_database()
            except Exception:
                db = client.get_database("leaflift")
        rides_col = db["rides"]

        threshold_since = datetime.utcnow() - timedelta(days=days)
        existing = rides_col.count_documents({"createdAt": {"$gte": threshold_since}})
        if existing >= days * int(avg_rides_per_day * 0.5) and not force:
            return {"seeded": False, "existing_recent_records": int(existing)}

        rng = np.random.default_rng(42)
        batch: List[Dict[str, Any]] = []
        inserted_count = 0
        statuses = ["COMPLETED", "COMPLETED", "COMPLETED", "COMPLETED", "CANCELED", "SEARCHING"]
        categories = ["BIKE", "AUTO", "CAR", "BIG_CAR"]
        now = datetime.utcnow()

        region_base = {
            "Mumbai - Andheri": 1.35,
            "Delhi - Connaught Place": 1.25,
            "Bangalore - Koramangala": 1.15,
            "Hyderabad - HITEC City": 1.05,
            "Chennai - T. Nagar": 1.0,
            "Kolkata - Salt Lake": 0.9,
            "Pune - Hinjewadi": 0.85,
            "Jaipur - MI Road": 0.75,
        }

        for day_offset in range(days):
            day_dt = (now - timedelta(days=day_offset)).replace(minute=0, second=0, microsecond=0)
            dow = day_dt.weekday()
            weekend_mult = 0.9 if dow >= 5 else 1.0

            for region in REGIONS:
                region_mult = region_base.get(region["name"], 1.0)
                for hour in range(24):
                    base = avg_rides_per_day / (24 * len(REGIONS))
                    hour_mult = _DEFAULT_HOUR_WEIGHTS[hour]
                    # Keep generated volume close to avg_rides_per_day across all regions.
                    lam = max(0.05, base * region_mult * hour_mult * weekend_mult)
                    rides_this_hour = int(rng.poisson(lam))

                    for _ in range(rides_this_hour):
                        minute = int(rng.integers(0, 60))
                        second = int(rng.integers(0, 60))
                        created_at = day_dt.replace(hour=hour, minute=minute, second=second)
                        pickup_lat = float(region["lat"] + rng.normal(0, 0.015))
                        pickup_lng = float(region["lng"] + rng.normal(0, 0.015))
                        drop_region = REGIONS[int(rng.integers(0, len(REGIONS)))]
                        drop_lat = float(drop_region["lat"] + rng.normal(0, 0.02))
                        drop_lng = float(drop_region["lng"] + rng.normal(0, 0.02))
                        category = categories[int(rng.integers(0, len(categories)))]
                        dist_km = float(max(1.0, rng.normal(7.5, 2.8)))
                        fare = float(max(45, dist_km * (9 if category == "BIKE" else 12 if category == "AUTO" else 15 if category == "CAR" else 19)))
                        is_pooled = bool(rng.random() < 0.32)

                        batch.append(
                            {
                                "status": statuses[int(rng.integers(0, len(statuses)))],
                                "pickup": {"lat": pickup_lat, "lng": pickup_lng, "address": region["name"]},
                                "dropoff": {"lat": drop_lat, "lng": drop_lng, "address": drop_region["name"]},
                                "vehicleCategory": category,
                                "isPooled": is_pooled,
                                "distance": f"{dist_km:.1f} km",
                                "fare": round(fare, 2),
                                "co2Saved": round(max(0.0, dist_km * 0.7 if is_pooled else 0.0), 2),
                                "co2Emissions": round(dist_km * (0.09 if category == "BIKE" else 0.14 if category == "AUTO" else 0.19 if category == "CAR" else 0.24), 3),
                                "createdAt": created_at,
                                "updatedAt": created_at + timedelta(minutes=int(max(3, rng.normal(22, 8)))),
                            }
                        )

                        if len(batch) >= 5000:
                            try:
                                rides_col.insert_many(batch, ordered=False)
                                inserted_count += len(batch)
                            except Exception as exc:
                                msg = str(exc).lower()
                                if "space quota" in msg or "over your space quota" in msg:
                                    return {
                                        "seeded": False,
                                        "quota_exceeded": True,
                                        "inserted_before_stop": int(inserted_count),
                                        "error": str(exc),
                                    }
                                raise
                            finally:
                                batch.clear()

        if batch:
            try:
                rides_col.insert_many(batch, ordered=False)
                inserted_count += len(batch)
            except Exception as exc:
                msg = str(exc).lower()
                if "space quota" in msg or "over your space quota" in msg:
                    return {
                        "seeded": False,
                        "quota_exceeded": True,
                        "inserted_before_stop": int(inserted_count),
                        "error": str(exc),
                    }
                raise

        final_count = rides_col.count_documents({"createdAt": {"$gte": threshold_since}})
        return {"seeded": True, "records_last_window": int(final_count), "days": days, "inserted": int(inserted_count)}
    finally:
        client.close()


def run_demand_pipeline(
    rides_df: pd.DataFrame,
    horizon_hours: int = 24,
    region_filter: Optional[str] = None,
    max_workers: Optional[int] = None,
) -> Dict[str, Any]:
    if rides_df.empty:
        return {
            "local_predictions": [],
            "global_forecast": {"timeline": [], "hotspots": []},
            "summary": {"regions_modeled": 0, "horizon_hours": horizon_hours, "generated_at": datetime.utcnow().isoformat()},
        }

    rides_df = rides_df.copy()
    # Defensive type handling: Mongo can store coordinates as strings.
    rides_df["pickup_lat"] = pd.to_numeric(rides_df.get("pickup_lat"), errors="coerce")
    rides_df["pickup_lng"] = pd.to_numeric(rides_df.get("pickup_lng"), errors="coerce")
    rides_df["region"] = rides_df.apply(lambda row: _map_region(row.get("pickup_lat"), row.get("pickup_lng")), axis=1)
    rides_df = rides_df.dropna(subset=["region"])

    if region_filter and region_filter.lower() != "all":
        rides_df = rides_df[rides_df["region"].str.lower() == region_filter.lower()]

    grouped = _build_region_hourly_table(rides_df)
    if grouped.empty:
        return {
            "local_predictions": [],
            "global_forecast": {"timeline": [], "hotspots": []},
            "summary": {"regions_modeled": 0, "horizon_hours": horizon_hours, "generated_at": datetime.utcnow().isoformat()},
        }

    grouped_rows = {
        region: grp[["ts", "rides"]].to_dict(orient="records")
        for region, grp in grouped.groupby("region")
    }
    results = _predict_parallel(grouped_rows, horizon_hours=horizon_hours, max_workers=max_workers)

    local_predictions = []
    for res in sorted(results, key=lambda r: r.region):
        values = [p["predicted_rides"] for p in res.predictions]
        local_predictions.append(
            {
                "region": res.region,
                "mae": res.mae,
                "confidence": res.confidence,
                "trend": _trend_label(values),
                "train_samples": res.train_samples,
                "predictions": res.predictions,
                "aggregate_next_window": int(sum(values)),
            }
        )

    global_forecast = _build_global_view(results)
    return {
        "local_predictions": local_predictions,
        "global_forecast": global_forecast,
        "summary": {
            "regions_modeled": len(local_predictions),
            "horizon_hours": horizon_hours,
            "generated_at": datetime.utcnow().isoformat(),
            "parallel_workers": max_workers or max(1, min(len(local_predictions), (os.cpu_count() or 2) - 1)),
        },
    }

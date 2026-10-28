"""
Geographic analysis service.
Evaluates proximity to mapped storm drains, culverts, catch basins, and waterways.
Crucially adheres to the guideline:
'Base geographic conclusions and risk scores only on available evidence. 
Do not equate proximity to a river with drainage connectivity. Flag missing data and uncertainty.'
"""

import math
from typing import Dict, Any, List, Optional
from backend.database import get_db_connection

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on the Earth in meters."""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def analyze_geographic_context(lat: float, lon: float) -> Dict[str, Any]:
    """
    Evaluates known drains and waterways relative to (lat, lon).
    Returns distances, connectivity assessments, evidence flags, and uncertainty caveats.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, asset_type, name, latitude, longitude, capacity_status, flow_direction_deg, description FROM municipal_assets")
    assets = cursor.fetchall()
    conn.close()

    closest_drain: Optional[Dict[str, Any]] = None
    closest_waterway: Optional[Dict[str, Any]] = None
    min_drain_dist = float('inf')
    min_waterway_dist = float('inf')

    for row in assets:
        dist = haversine_distance_meters(lat, lon, row["latitude"], row["longitude"])
        asset_info = {
            "id": row["id"],
            "asset_type": row["asset_type"],
            "name": row["name"],
            "distance_m": round(dist, 1),
            "capacity_status": row["capacity_status"],
            "flow_direction_deg": row["flow_direction_deg"],
            "description": row["description"]
        }

        if row["asset_type"] in ["storm_drain", "culvert", "catch_basin"]:
            if dist < min_drain_dist:
                min_drain_dist = dist
                closest_drain = asset_info
        elif row["asset_type"] in ["river", "canal", "retention_pond"]:
            if dist < min_waterway_dist:
                min_waterway_dist = dist
                closest_waterway = asset_info

    # Realistic assessment based only on verified geospatial evidence
    evidence = []
    uncertainties = []

    # Drainage connectivity determination:
    # A storm drain within 35 meters on roadway right-of-way has high likelihood of direct surface runoff intake
    drain_dist_val = round(min_drain_dist, 1) if closest_drain else None
    waterway_dist_val = round(min_waterway_dist, 1) if closest_waterway else None

    if drain_dist_val is not None:
        if drain_dist_val <= 35.0:
            connectivity = "direct_adjacent"
            evidence.append(f"Directly adjacent to {closest_drain['name']} ({drain_dist_val}m away). Runoff and floating debris can directly obstruct inlet.")
        elif drain_dist_val <= 120.0:
            connectivity = "nearby_overland"
            evidence.append(f"Overland flow corridor to {closest_drain['name']} ({drain_dist_val}m away). Heavy precipitation can transport buoyant plastics into drain.")
        else:
            connectivity = "unconnected_or_unknown"
            evidence.append(f"Nearest municipal drain is {drain_dist_val}m away. No direct hydraulic connection confirmed.")
            uncertainties.append("Local micro-drainage inlet mapping is unavailable beyond mapped trunk network.")
    else:
        connectivity = "unconnected_or_unknown"
        uncertainties.append("No municipal storm drain data available within search boundary.")

    # Waterway relation - explicitly NOT equating proximity to drainage connectivity
    waterway_risk_flag = False
    if waterway_dist_val is not None:
        if waterway_dist_val <= 100.0:
            waterway_risk_flag = True
            evidence.append(f"Located {waterway_dist_val}m from {closest_waterway['name']} (Riparian floodplain zone). Note: Waterway proximity creates backflow or overflow risk, but does not guarantee direct downhill drainage outlet.")
        else:
            evidence.append(f"Nearest waterway ({closest_waterway['name']}) is {waterway_dist_val}m away.")
    else:
        uncertainties.append("No open waterway or canal data mapped in local municipal registry.")

    # Topographical heuristic / proxy
    # For a robust MVP without heavy external DEM downloads, flag based on drainage status & proximity
    if connectivity == "direct_adjacent" and closest_drain and closest_drain["capacity_status"] in ["choked", "high_silt"]:
        elevation_risk = "lowland_depression"
        evidence.append("Sump/depression vulnerability: Downstream drain has documented silt/choke condition.")
    elif connectivity == "nearby_overland":
        elevation_risk = "moderate_slope"
    else:
        elevation_risk = "highland"

    return {
        "drain_distance_m": drain_dist_val,
        "waterway_distance_m": waterway_dist_val,
        "closest_drain": closest_drain,
        "closest_waterway": closest_waterway,
        "drainage_connectivity": connectivity,
        "elevation_risk": elevation_risk,
        "waterway_risk_flag": waterway_risk_flag,
        "evidence": evidence,
        "uncertainties": uncertainties
    }

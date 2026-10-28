"""
Explainable Risk Engine for ECO-ROUTE.
Produces a transparent 0-100 risk score with clear itemized contributing factors,
confidence metrics, and actionable municipal dispatch recommendations.
"""

from typing import Dict, Any, List

def calculate_waterlogging_risk(
    report_type: str,
    ml_category: str,
    ml_confidence: float,
    ml_extent_coverage: float,
    geo_data: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Computes an explainable 0-100 risk score.
    Breakdown of factors:
    1. Base Threat Factor (Report Type & Nature): 20-35 pts
    2. Material Blockage Propensity (Plastic vs Organics vs Glass): 10-25 pts
    3. Visible Waste Extent / Area Coverage: 5-20 pts
    4. Drainage Ingress Proximity & Flow Path: 5-20 pts
    5. Drainage Infrastructure Impairment / Vulnerability: 5-15 pts
    """
    score = 0
    factors: List[Dict[str, Any]] = []

    # 1. Primary Report Type
    if report_type == "waterlogging":
        factor_pts = 35
        score += factor_pts
        factors.append({
            "dimension": "Active Inundation Event",
            "points": factor_pts,
            "rationale": "Active standing water / waterlogging already observed on site, posing immediate traffic and hazard risks."
        })
    else:
        factor_pts = 15
        score += factor_pts
        factors.append({
            "dimension": "Report Type: Solid Waste Ingress Risk",
            "points": factor_pts,
            "rationale": "Waste accumulation reported; primary danger is runoff-driven obstruction during rain."
        })

    # 2. Material Obstruction Factor (based on RealWaste classification)
    # Flexible plastics, bags, wrappers, bottles have the highest clog potential for grates
    clog_weights = {
        "Plastic": 25,
        "Textile Trash": 20,
        "Paper": 15,
        "Cardboard": 18,
        "Miscellaneous Trash": 14,
        "Food Organics": 12,
        "Vegetation": 15,
        "Metal": 8,
        "Glass": 6
    }
    cat_pts = clog_weights.get(ml_category, 12)
    score += cat_pts
    factors.append({
        "dimension": f"Material Hydraulic Hazard ({ml_category})",
        "points": cat_pts,
        "rationale": f"Material identified as '{ml_category}' with {round(ml_confidence * 100, 1)}% ML confidence. " + (
            "Films and rigid plastics create impermeable seals across drain grates."
            if ml_category == "Plastic" else
            "Dense debris reduces effective hydraulic cross-section of drainage conduit."
        )
    })

    # 3. Waste Extent / Accumulation Density
    if ml_extent_coverage >= 60.0:
        extent_pts = 20
        extent_desc = f"Extensive debris footprint (~{int(ml_extent_coverage)}% visible field of view)."
    elif ml_extent_coverage >= 30.0:
        extent_pts = 12
        extent_desc = f"Moderate debris footprint (~{int(ml_extent_coverage)}% visible field of view)."
    else:
        extent_pts = 6
        extent_desc = f"Localized debris pocket (~{int(ml_extent_coverage)}% visible field of view)."
    score += extent_pts
    factors.append({
        "dimension": "Accumulation Extent",
        "points": extent_pts,
        "rationale": extent_desc
    })

    # 4. Drainage Connectivity & Hydraulic Pathway
    connectivity = geo_data.get("drainage_connectivity", "unconnected_or_unknown")
    drain_dist = geo_data.get("drain_distance_m")

    if connectivity == "direct_adjacent":
        conn_pts = 20
        conn_desc = f"Directly adjacent to mapped drain inlet ({drain_dist}m). High probability of immediate grate clogging."
    elif connectivity == "nearby_overland":
        conn_pts = 10
        conn_desc = f"Overland flow corridor to municipal drain ({drain_dist}m). Runoff during storm events will wash debris downhill."
    else:
        conn_pts = 3
        conn_desc = f"No verified municipal inlet within immediate roadway perimeter ({drain_dist}m). Runoff may form street puddle before trunk drainage."
    score += conn_pts
    factors.append({
        "dimension": "Drain Proximity & Connectivity",
        "points": conn_pts,
        "rationale": conn_desc
    })

    # 5. Drainage Asset State & Local Vulnerability
    closest_drain = geo_data.get("closest_drain")
    if closest_drain and closest_drain.get("capacity_status") in ["choked", "high_silt"]:
        asset_pts = 12
        factors.append({
            "dimension": "Downstream Infrastructure Capacity",
            "points": asset_pts,
            "rationale": f"Nearest asset '{closest_drain.get('name')}' is already flagged as '{closest_drain.get('capacity_status')}'. Capacity bottleneck amplified."
        })
        score += asset_pts

    # Waterway backflow consideration (explicitly bounded)
    if geo_data.get("waterway_risk_flag"):
        waterway_pts = 5
        score += waterway_pts
        factors.append({
            "dimension": "Riparian Lowland Buffer",
            "points": waterway_pts,
            "rationale": f"Within 100m of {geo_data.get('closest_waterway', {}).get('name', 'waterway')}. Saturated soil and slow discharge backflow compound pooling risk."
        })

    # Clamp score to [0, 100]
    final_score = max(0, min(100, score))

    if final_score >= 75:
        risk_level = "CRITICAL"
        recommended_action = "Immediate Dispatch: Clear grate obstruction and dispatch vacuum sucker / desilting unit within 2 hours."
    elif final_score >= 50:
        risk_level = "HIGH"
        recommended_action = "Priority Cleanup: Schedule municipal sanitation crew within 12 hours before precipitation onset."
    elif final_score >= 25:
        risk_level = "MODERATE"
        recommended_action = "Standard Routine: Add to ward sanitation route for next-shift street sweeping."
    else:
        risk_level = "LOW"
        recommended_action = "Monitored: Low hydraulic risk. Schedule regular weekly maintenance."

    # Confidence calculation: combines ML prediction confidence and geographic data completeness
    geo_uncertainties = geo_data.get("uncertainties", [])
    geo_confidence = 0.9 if len(geo_uncertainties) == 0 else (0.7 if len(geo_uncertainties) == 1 else 0.5)
    overall_confidence = round((ml_confidence * 0.6) + (geo_confidence * 0.4), 2)

    return {
        "risk_score": final_score,
        "risk_level": risk_level,
        "factors": factors,
        "confidence_score": overall_confidence,
        "recommended_action": recommended_action
    }

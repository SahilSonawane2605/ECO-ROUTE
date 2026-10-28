import pytest
import io
from fastapi.testclient import TestClient
from backend.main import app
from backend.services.geo_service import haversine_distance_meters, analyze_geographic_context
from backend.services.risk_engine import calculate_waterlogging_risk

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

def test_model_info_returns_real_split_metrics():
    response = client.get("/api/model/info")
    assert response.status_code == 200
    data = response.json()
    assert "classes" in data
    assert "splits" in data
    assert "test_evaluation" in data
    assert "Plastic" in data["classes"]
    assert data["splits"]["total_samples"] == 4752
    assert "precision" in data["test_evaluation"]["per_class"]["Plastic"]

def test_citizen_registration_and_login():
    email = "citizen_test@pune.in"
    reg_res = client.post("/api/auth/register", json={
        "email": email,
        "password": "SecurePassword123!",
        "full_name": "Aarav Sharma",
        "ward": "Ward 9 - Kothrud"
    })
    # Either 201 or 400 if already created in earlier test run
    if reg_res.status_code == 201:
        assert "access_token" in reg_res.json()
        assert reg_res.json()["user"]["role"] == "citizen"

    # Login
    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": "SecurePassword123!"
    })
    assert login_res.status_code == 200
    assert "access_token" in login_res.json()
    token = login_res.json()["access_token"]

    # Verify /api/auth/me
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == email

def test_idor_protection_between_citizens():
    # Citizen 1 registers
    c1_email = "citizen1@pune.in"
    client.post("/api/auth/register", json={
        "email": c1_email, "password": "Password123!", "full_name": "Citizen One"
    })
    c1_token = client.post("/api/auth/login", json={
        "email": c1_email, "password": "Password123!"
    }).json()["access_token"]

    # Citizen 2 registers
    c2_email = "citizen2@pune.in"
    client.post("/api/auth/register", json={
        "email": c2_email, "password": "Password123!", "full_name": "Citizen Two"
    })
    c2_token = client.post("/api/auth/login", json={
        "email": c2_email, "password": "Password123!"
    }).json()["access_token"]

    # Citizen 1 submits a report
    fake_img = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 200)
    rep_res = client.post(
        "/api/reports",
        headers={"Authorization": f"Bearer {c1_token}"},
        data={
            "title": "Blocked storm drain near Paud Road",
            "report_type": "plastic_waste",
            "description": "Plastic bottles choking roadside curb",
            "latitude": "18.5074",
            "longitude": "73.8077",
            "address": "Paud Road Pune"
        },
        files={"file": ("test.jpg", fake_img, "image/jpeg")}
    )
    assert rep_res.status_code == 200
    rep_id = rep_res.json()["report_id"]

    # Citizen 1 can fetch report
    c1_fetch = client.get(f"/api/reports/{rep_id}", headers={"Authorization": f"Bearer {c1_token}"})
    assert c1_fetch.status_code == 200

    # Citizen 2 CANNOT fetch Citizen 1's report (IDOR check returns 403)
    c2_fetch = client.get(f"/api/reports/{rep_id}", headers={"Authorization": f"Bearer {c2_token}"})
    assert c2_fetch.status_code == 403

def test_citizen_cannot_access_admin_endpoints():
    # Citizen login
    c_token = client.post("/api/auth/login", json={
        "email": "citizen1@pune.in", "password": "Password123!"
    }).json()["access_token"]

    # Attempt to change report status as citizen
    patch_res = client.patch(
        "/api/reports/REP-NONEXISTENT/status",
        headers={"Authorization": f"Bearer {c_token}"},
        json={"status": "RESOLVED"}
    )
    # Must be 403 Forbidden
    assert patch_res.status_code == 403
    assert "Municipal Administrator credentials required" in patch_res.json()["detail"]

def test_admin_authorized_lifecycle():
    # Login as bootstrapped municipal administrator
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@pmc.gov.in",
        "password": "PuneCivic#2026"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]

    # Admin can view all reports
    admin_reports = client.get("/api/reports", headers={"Authorization": f"Bearer {admin_token}"})
    assert admin_reports.status_code == 200
    assert "reports" in admin_reports.json()

    # If there are reports, admin can update status
    reps = admin_reports.json()["reports"]
    if len(reps) > 0:
        target_id = reps[0]["id"]
        status_res = client.patch(
            f"/api/reports/{target_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "status": "UNDER_REVIEW",
                "assigned_to": "Ward 9 Engineering Crew",
                "authority_notes": "Assigned via administrative test suite"
            }
        )
        assert status_res.status_code == 200

        # Verify audit history
        hist_res = client.get(f"/api/reports/{target_id}/history", headers={"Authorization": f"Bearer {admin_token}"})
        assert hist_res.status_code == 200
        assert len(hist_res.json()["history"]) > 0

def test_explainable_risk_engine():
    geo_data = {
        "drainage_connectivity": "direct_adjacent",
        "drain_distance_m": 15.0,
        "closest_drain": {"name": "Culvert", "capacity_status": "choked"},
        "waterway_risk_flag": True,
        "closest_waterway": {"name": "Mutha River"},
        "uncertainties": []
    }
    
    result = calculate_waterlogging_risk(
        report_type="waterlogging",
        ml_category="Plastic",
        ml_confidence=0.88,
        ml_extent_coverage=65.0,
        geo_data=geo_data
    )

    assert 0 <= result["risk_score"] <= 100
    assert result["risk_level"] in ["CRITICAL", "HIGH"]
    assert len(result["factors"]) >= 4
    assert result["confidence_score"] > 0.6

def test_demo_credentials_and_logins():
    # Verify demo credentials endpoint
    demo_res = client.get("/api/auth/demo-credentials")
    assert demo_res.status_code == 200
    demo_data = demo_res.json()
    assert demo_data["enabled"] is True
    assert demo_data["citizen"]["email"] == "citizen.demo@ecoroute.local"
    assert demo_data["municipal"]["email"] == "municipal.demo@ecoroute.local"

    # Test login with citizen demo account
    c_login = client.post("/api/auth/login", json={
        "email": "citizen.demo@ecoroute.local",
        "password": "PuneEco#Demo2026"
    })
    assert c_login.status_code == 200
    c_user = c_login.json()["user"]
    assert c_user["role"] == "citizen"

    # Test login with municipal demo account
    m_login = client.post("/api/auth/login", json={
        "email": "municipal.demo@ecoroute.local",
        "password": "PuneEco#Demo2026"
    })
    assert m_login.status_code == 200
    m_user = m_login.json()["user"]
    assert m_user["role"] == "municipal_admin"

    # Test invalid email format returns 422 with array of validation detail objects
    invalid_email_res = client.post("/api/auth/login", json={
        "email": "notanemail",
        "password": "somepassword"
    })
    assert invalid_email_res.status_code == 422
    assert isinstance(invalid_email_res.json()["detail"], list)

    # Test incorrect password returns 401
    bad_pwd_res = client.post("/api/auth/login", json={
        "email": "citizen.demo@ecoroute.local",
        "password": "WrongPassword123"
    })
    assert bad_pwd_res.status_code == 401
    assert bad_pwd_res.json()["detail"] == "Invalid email or password."


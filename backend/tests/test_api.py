"""HTTP layer smoke tests (prewarm disabled)."""
import os

os.environ["RRR_PREWARM"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from api.main import app  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health_and_config(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    cfg = client.get("/api/config").json()
    assert cfg["defaults"]["market"]["R"] == 500
    assert "beta" in cfg["param_meta"]
    assert "cournot" in cfg["comparison_models"]


def test_solve_with_overrides_and_verification(client):
    r = client.post("/api/solve/cournot", json={"scenario": "Low", "params": {"market": {"beta": 0.2}}})
    assert r.status_code == 200
    body = r.json()
    assert body["verification"]["passed"]
    assert body["br_curves"]["A"] and body["outcome"]["efficiency"] <= 1.0 + 1e-9


def test_unknown_parameter_rejected(client):
    r = client.post("/api/solve/cournot", json={"scenario": "Low", "params": {"market": {"gamma": 1}}})
    assert r.status_code == 422
    assert client.post("/api/solve/nope", json={}).status_code == 404


def test_custom_matrix_matching_pennies(client):
    r = client.post("/api/matrix-game/custom", json={"payoff_row": [[1, -1], [-1, 1]],
                                                     "payoff_col": [[-1, 1], [1, -1]]})
    ne = r.json()["mixed_nash"][0]
    assert ne["row"] == pytest.approx([0.5, 0.5])


def test_market_matrix_and_repeated(client):
    mm = client.post("/api/matrix-game", json={"scenario": "Low"}).json()
    assert mm["low_high"]["classification"]["is_pd"]
    rep = client.post("/api/repeated", json={"scenario": "Low", "delta": 0.8, "noise": 0.05}).json()
    assert 0 < rep["delta_star"] < 1
    assert len(rep["tournament"]["ranking"]) == 5


def test_bayesian(client):
    r = client.post("/api/bayesian", json={"scenario": "Low", "prior_high": 0.3}).json()
    assert r["verification"]["passed"]


def test_simulation_payload(client):
    r = client.post("/api/simulate", json={"scenario": "Medium", "mc_runs": 2})
    assert r.status_code == 200
    assert len(r.content) < 5_000_000
    body = r.json()
    assert len(body["frames"]) == 180
    assert body["monte_carlo"]["runs"] == 2


def test_sensitivity_and_export(client):
    r = client.post("/api/sensitivity", json={"param": "k", "values": [1.8, 2.2, 2.6],
                                              "models": ["cournot", "planner"], "scenario": "Low"}).json()
    assert len(r["rows"]) == 3 and r["all_verified"]
    csv_text = client.post("/api/export", json={"kind": "sensitivity",
                                                 "options": {"param": "k", "values": [1.8, 2.2, 2.6],
                                                             "models": ["cournot", "planner"], "scenario": "Low"}}).text
    assert csv_text.splitlines()[0].startswith("value")
    assert len(csv_text.splitlines()) == 4

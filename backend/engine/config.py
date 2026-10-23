"""Configuration loading: one JSON file of defaults, deep-merged with request overrides."""
from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "defaults.json"


def load_defaults() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def deep_merge(base: dict, overrides: dict | None) -> dict:
    out = copy.deepcopy(base)
    for key, val in (overrides or {}).items():
        if isinstance(val, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], val)
        elif val is not None:
            out[key] = val
    return out


def build_config(overrides: dict | None = None) -> dict:
    return deep_merge(load_defaults(), overrides)


def config_key(*parts: Any) -> str:
    """Stable hash used for the in-memory result cache."""
    raw = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class MarketParams:
    R: float = 500
    w0: float = 25.0
    beta: float = 0.15
    k: float = 2.2
    rho_max: float = 0.97
    d0: float = 28.0
    s: float = 6.0
    a_A: float = 4.0
    a_B: float = 4.0
    dominant_bonus: float = 0.2
    b: float = 0.05
    c: float = 0.08
    m: float = 45.0
    p: float = 35.0
    F_A: float = 0.0
    F_B: float = 0.0
    delay_cost: float = 3.0
    delay_cost_basis: str = "excess"
    beta_homogeneous: float = 5.0

    @classmethod
    def from_config(cls, cfg: dict) -> "MarketParams":
        names = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in cfg["market"].items() if k in names})

    def with_(self, **changes) -> "MarketParams":
        data = {f.name: getattr(self, f.name) for f in fields(self)}
        data.update(changes)
        return MarketParams(**data)

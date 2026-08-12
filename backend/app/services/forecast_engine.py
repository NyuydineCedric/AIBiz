"""Lightweight forecasting using linear regression (numpy polyfit) over a
numeric series. Deliberately avoids heavier ML deps (e.g. scikit-learn/Prophet)
that may not be installable in constrained environments; swap in a fuller model
later without changing the function signature.
"""
from typing import Any, Dict, List

import numpy as np


def forecast_series(values: List[float], periods_ahead: int = 3) -> Dict[str, Any]:
    if len(values) < 2:
        return {"forecast": [], "trend": "flat", "note": "Not enough data points to forecast."}

    x = np.arange(len(values))
    y = np.array(values, dtype=float)

    slope, intercept = np.polyfit(x, y, 1)
    residuals = y - (slope * x + intercept)
    std_dev = float(np.std(residuals)) if len(residuals) > 1 else 0.0

    future_x = np.arange(len(values), len(values) + periods_ahead)
    predicted = slope * future_x + intercept

    trend = "up" if slope > 0.01 * (abs(y.mean()) or 1) else ("down" if slope < -0.01 * (abs(y.mean()) or 1) else "flat")

    return {
        "forecast": [round(float(v), 2) for v in predicted],
        "lower_bound": [round(float(v - std_dev), 2) for v in predicted],
        "upper_bound": [round(float(v + std_dev), 2) for v in predicted],
        "trend": trend,
        "slope_per_period": round(float(slope), 2),
    }

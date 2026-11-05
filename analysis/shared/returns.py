"""Shared nominal geometric/arithmetic return conversions."""

from __future__ import annotations

import numpy as np


def geometric_to_arithmetic(geometric, volatility):
    """Convert geometric return(s) and volatility to matching arithmetic return(s)."""
    one_plus_geo = 1.0 + np.asarray(geometric, dtype=float)
    vol = np.asarray(volatility, dtype=float)
    q2 = one_plus_geo * one_plus_geo
    one_plus_arith_sq = (q2 + np.sqrt(q2 * q2 + 4.0 * q2 * vol * vol)) / 2.0
    return np.sqrt(one_plus_arith_sq) - 1.0


def arithmetic_to_geometric(arithmetic, volatility):
    """Convert arithmetic return(s) and volatility to matching geometric return(s)."""
    one_plus_arith = 1.0 + np.asarray(arithmetic, dtype=float)
    vol = np.asarray(volatility, dtype=float)
    return one_plus_arith / np.sqrt(1.0 + (vol / one_plus_arith) ** 2) - 1.0

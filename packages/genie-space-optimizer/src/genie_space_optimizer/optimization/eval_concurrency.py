"""Adaptive concurrency tier ladder for mlflow.genai.evaluate retries.

Attempt 1 keeps full concurrency (production performance).
Attempts 2+ degrade scorer workers so a transient ContextVar/threadpool
hang in mlflow does not repeat with the same parallelism.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_TRUTHY = {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class EvalConcurrencyTier:
    data_workers: int
    scorer_workers: int


_DEFAULT_TIERS: dict[int, EvalConcurrencyTier] = {
    1: EvalConcurrencyTier(data_workers=1, scorer_workers=8),
    2: EvalConcurrencyTier(data_workers=1, scorer_workers=3),
    3: EvalConcurrencyTier(data_workers=1, scorer_workers=1),
}
_FLOOR_TIER = EvalConcurrencyTier(data_workers=1, scorer_workers=1)


def adaptive_concurrency_enabled() -> bool:
    """Production-on flag for the tier ladder. Set to false to fall back."""
    raw = os.getenv("GENIE_SPACE_OPTIMIZER_EVAL_ADAPTIVE_CONCURRENCY", "").strip().lower()
    if not raw:
        return True
    return raw in _TRUTHY


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        logger.warning("Invalid integer for %s=%r; using %d", name, raw, default)
        return default


def concurrency_tier_for_attempt(attempt: int) -> EvalConcurrencyTier:
    """Return the (data_workers, scorer_workers) pair for this attempt.

    When the adaptive flag is off, attempt 1's tier is returned for all
    attempts (preserves the always-full-concurrency behaviour).
    """
    if not adaptive_concurrency_enabled():
        attempt = 1
    base = _DEFAULT_TIERS.get(min(max(attempt, 1), 3), _FLOOR_TIER)
    data_workers = _env_int(
        f"GENIE_SPACE_OPTIMIZER_EVAL_DATA_WORKERS_ATTEMPT_{attempt}",
        base.data_workers,
    )
    scorer_workers = _env_int(
        f"GENIE_SPACE_OPTIMIZER_EVAL_SCORER_WORKERS_ATTEMPT_{attempt}",
        base.scorer_workers,
    )
    return EvalConcurrencyTier(
        data_workers=data_workers,
        scorer_workers=scorer_workers,
    )

"""Liveness watchdog for mlflow.genai.evaluate().

We cannot reliably kill a Python thread, but we *can* stop waiting on
one. The watchdog runs the evaluate call in a daemon worker thread and
raises EvalHangTimeoutError if the worker does not finish before the
deadline. The orphaned worker is left to be reaped by job teardown.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Callable

logger = logging.getLogger(__name__)

_TRUTHY = {"1", "true", "yes", "on"}


class EvalHangTimeoutError(TimeoutError):
    """Raised when the evaluation worker exceeds its deadline."""


def eval_watchdog_enabled() -> bool:
    """Production-on flag for the watchdog. Disable only for local debugging."""
    raw = os.getenv("GENIE_SPACE_OPTIMIZER_EVAL_WATCHDOG_ENABLED", "").strip().lower()
    if not raw:
        return True
    return raw in _TRUTHY


def compute_eval_deadline_seconds(
    *,
    row_count: int,
    scorer_count: int,
    per_call_budget_seconds: int = 90,
    floor_seconds: int = 600,
    cap_seconds: int = 7200,
) -> int:
    """Return a per-attempt deadline in seconds, with a floor and a cap."""
    rows = max(1, row_count)
    scorers = max(1, scorer_count)
    estimate = rows * scorers * max(1, per_call_budget_seconds)
    return max(floor_seconds, min(cap_seconds, estimate))


def run_with_watchdog(
    fn: Callable[[], Any],
    *,
    deadline_seconds: float,
    poll_interval: float = 5.0,
    on_progress: Callable[[float], None] | None = None,
) -> Any:
    """Run ``fn`` in a daemon worker thread; raise EvalHangTimeoutError on overrun.

    Inner exceptions are re-raised in the caller thread. When the watchdog
    is disabled via env, ``fn`` runs synchronously in the caller thread.
    """
    if not eval_watchdog_enabled():
        return fn()

    result_box: dict[str, Any] = {}

    def _runner() -> None:
        try:
            result_box["value"] = fn()
        except BaseException as exc:  # propagate everything, including SystemExit
            result_box["error"] = exc

    thread = threading.Thread(target=_runner, name="gso-eval-watchdog", daemon=True)
    start = time.monotonic()
    thread.start()
    while True:
        thread.join(timeout=poll_interval)
        if not thread.is_alive():
            break
        elapsed = time.monotonic() - start
        if on_progress is not None:
            try:
                on_progress(elapsed)
            except Exception:
                logger.debug("watchdog on_progress callback failed", exc_info=True)
        if elapsed >= deadline_seconds:
            raise EvalHangTimeoutError(
                f"mlflow.genai.evaluate exceeded watchdog deadline of "
                f"{deadline_seconds:.0f}s (elapsed={elapsed:.0f}s); "
                "treating as a hang and orphaning the worker thread."
            )

    if "error" in result_box:
        raise result_box["error"]  # type: ignore[misc]
    return result_box.get("value")

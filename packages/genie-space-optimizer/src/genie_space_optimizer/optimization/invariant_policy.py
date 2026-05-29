"""Pure invariant-violation policy for the lever loop.

The lever loop has invariants that historically raised
``AssertionError`` and aborted the run on the first drift event.
In CI and replay we still want loud failures so wiring bugs surface
immediately. In production we want a structured warning + safe
degradation so a single drift event does not cost the operator a
multi-iteration run.

This module is the single shared decision point: the env var
``GSO_INVARIANT_STRICT`` (or, as a fallback, the existing
``GSO_DECISION_EMITTER_STRICT``) controls whether
``handle_invariant_violation`` raises or returns. The caller supplies
a lenient callback that emits markers / decision records / safe-
degradation mutations.

Plan N4 — invariant warn-and-degrade policy.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Callable, Mapping


_STRICT_TRUTHY = frozenset({"1", "true", "True", "TRUE", "yes", "YES", "on", "ON"})


def is_invariant_strict_mode() -> bool:
    """Return True when invariants must raise instead of degrade.

    Reads ``GSO_INVARIANT_STRICT`` first (lever-loop-specific), then
    falls back to ``GSO_DECISION_EMITTER_STRICT`` so CI and replay
    tooling that already set the latter keep getting strict
    behaviour without any deploy change.
    """
    primary = str(os.environ.get("GSO_INVARIANT_STRICT", "")).strip()
    if primary in _STRICT_TRUTHY:
        return True
    fallback = str(os.environ.get("GSO_DECISION_EMITTER_STRICT", "")).strip()
    return fallback in _STRICT_TRUTHY


@dataclass(frozen=True)
class InvariantViolation:
    """Snapshot of an invariant violation.

    ``payload`` is wrapped in ``MappingProxyType`` after construction
    so callers cannot mutate the captured state. ``name`` is the
    closed-vocabulary identifier postmortems pivot on.
    """

    name: str
    payload: Mapping[str, Any]
    message: str

    def __post_init__(self) -> None:
        # Freeze payload to prevent post-construction mutation.
        # Use object.__setattr__ because the dataclass is frozen.
        object.__setattr__(
            self, "payload", MappingProxyType(dict(self.payload)),
        )


def handle_invariant_violation(
    violation: InvariantViolation,
    *,
    strict: bool,
    lenient_callback: Callable[[InvariantViolation], None],
) -> None:
    """Decide raise-vs-degrade.

    In strict mode raises ``AssertionError`` carrying the violation
    name, message, and payload. In lenient mode invokes
    ``lenient_callback(violation)`` and returns. The callback is the
    single seam where the harness wires in marker emission, decision
    records, and the safe-degradation mutation.
    """
    if strict:
        raise AssertionError(
            f"{violation.name}: {violation.message} | "
            f"payload={dict(violation.payload)!r}"
        )
    lenient_callback(violation)

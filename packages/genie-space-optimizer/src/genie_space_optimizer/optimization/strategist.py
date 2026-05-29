"""Cycle 10 W2.5 — strategist AG-emit prompt builders.

This module hosts pure prompt-block formatters used by the strategist
LLM call when surfacing per-cluster recommendations and constraints.
The actual LLM invocation continues to live in ``stages.action_groups``;
this module owns only the deterministic prompt-text construction so it
can be unit-tested without touching the strategist dataclasses.
"""
from __future__ import annotations

from typing import Iterable, Mapping


def build_ag_emit_prompt_clusters_block(
    clusters: Iterable[Mapping] | None,
) -> str:
    """Render the clusters-block for the AG-emit prompt with
    ``recommended_levers`` exposed as a soft constraint.

    When ``GSO_AG_LEVERS_UNION_RECOMMENDED`` is on, includes the
    constraint clause and renders ``recommended_levers=[...]`` per
    cluster line. When off, renders the legacy block without the
    clause for replay byte-stability.
    """
    from genie_space_optimizer.common.config import (
        ag_levers_union_recommended_enabled,
    )

    on = ag_levers_union_recommended_enabled()
    rows: list[str] = []
    for cluster in clusters or ():
        cid = str((cluster or {}).get("cluster_id") or "")
        root = str((cluster or {}).get("root_cause") or "unknown")
        levers = ",".join(
            str(lv) for lv in (cluster or {}).get("recommended_levers") or []
        )
        qids = ",".join(
            str(q) for q in (cluster or {}).get("question_ids", []) or []
            if str(q)
        )
        if on:
            rows.append(
                f"- cluster_id={cid} root_cause={root} "
                f"recommended_levers=[{levers}] qids=[{qids}]"
            )
        else:
            rows.append(
                f"- cluster_id={cid} root_cause={root} qids=[{qids}]"
            )
    body = "\n".join(rows)
    if on:
        body += (
            "\n\nConstraint: Levers must include every lever in "
            "recommended_levers for the cluster the AG covers."
        )
    return body

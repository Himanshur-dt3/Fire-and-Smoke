"""Safe normalization of model-specific labels to operational labels."""

from __future__ import annotations


def normalize_label(raw_label: str, aliases: dict[str, str]) -> str | None:
    """Return smoke or fire for an explicitly recognised configured model label."""
    cleaned = raw_label.strip().lower()
    normalized = aliases.get(cleaned)
    if normalized in {"smoke", "fire"}:
        return normalized
    return None

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in (
            "run_key",
            "source_slug",
            "content_family",
            "action",
            "duration_ms",
            "result",
            "candidate_count",
            "error_type",
            "requested_max_sources",
            "effective_max_sources",
            "available_sources_count",
            "selected_sources_count",
            "selected_source_slugs",
            "fingerprint_strategy",
            "catalog_count",
            "semantic_items_count",
            "fingerprint_hash_prefix",
            "changed",
            "processing_status",
        ):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(level)

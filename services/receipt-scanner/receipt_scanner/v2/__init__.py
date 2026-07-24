"""Generic receipt-understanding V2 foundation.

This package deliberately runs independently from the production parser.
Phase 1 is shadow-only: it creates hypotheses and diagnostics but never
changes the receipt returned to the application.
"""

from .shadow_parser import GenericReceiptParserV2

__all__ = ["GenericReceiptParserV2"]

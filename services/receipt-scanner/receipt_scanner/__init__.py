"""BudgetKazPei receipt scanner engine package."""

__all__ = ["__version__"]

__version__ = "0.1.0"


def _install_receipt_parser_extensions() -> None:
    from .super_u_patch import install_super_u_patch

    install_super_u_patch()


_install_receipt_parser_extensions()
del _install_receipt_parser_extensions

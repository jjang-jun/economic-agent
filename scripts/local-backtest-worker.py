#!/usr/bin/env python3
"""Optional local data worker for Korean stock backtests.

This worker intentionally keeps pykrx and FinanceDataReader as optional local
dependencies. Production collectors use official/contracted APIs; this script is
for ad-hoc local research and backfill experiments.
"""

import argparse
import importlib.util
import json
import sys
from datetime import datetime


def has_module(name):
    return importlib.util.find_spec(name) is not None


def print_json(payload, exit_code=0):
    print(json.dumps(payload, ensure_ascii=False, default=str))
    return exit_code


def provider_status():
    return {
        "ok": True,
        "providers": {
            "pykrx": has_module("pykrx"),
            "FinanceDataReader": has_module("FinanceDataReader"),
        },
        "usage": {
            "ohlcv": "scripts/local-backtest-worker.py ohlcv --ticker 005930 --from 2026-01-01 --to 2026-05-08 --provider pykrx",
        },
    }


def normalize_date(value):
    if not value:
        return value
    return datetime.strptime(value, "%Y-%m-%d").strftime("%Y%m%d")


def fetch_pykrx_ohlcv(ticker, start, end):
    from pykrx import stock  # pylint: disable=import-error,import-outside-toplevel

    frame = stock.get_market_ohlcv(normalize_date(start), normalize_date(end), ticker)
    rows = []
    for index, row in frame.reset_index().iterrows():
        date_value = row.get("날짜") if "날짜" in row else frame.index[index]
        rows.append({
            "date": str(date_value)[:10],
            "open": float(row.get("시가", 0) or 0),
            "high": float(row.get("고가", 0) or 0),
            "low": float(row.get("저가", 0) or 0),
            "close": float(row.get("종가", 0) or 0),
            "volume": float(row.get("거래량", 0) or 0),
        })
    return rows


def fetch_fdr_ohlcv(ticker, start, end):
    import FinanceDataReader as fdr  # pylint: disable=import-error,import-outside-toplevel

    frame = fdr.DataReader(ticker, start, end)
    rows = []
    for date_value, row in frame.iterrows():
        rows.append({
            "date": str(date_value)[:10],
            "open": float(row.get("Open", 0) or 0),
            "high": float(row.get("High", 0) or 0),
            "low": float(row.get("Low", 0) or 0),
            "close": float(row.get("Close", 0) or 0),
            "volume": float(row.get("Volume", 0) or 0),
        })
    return rows


def command_ohlcv(args):
    provider = args.provider
    if provider == "auto":
        provider = "pykrx" if has_module("pykrx") else "finance-data-reader"

    try:
        if provider == "pykrx":
            if not has_module("pykrx"):
                return print_json({"ok": False, "error": "dependency_missing", "provider": "pykrx"}, 2)
            rows = fetch_pykrx_ohlcv(args.ticker, args.start, args.end)
        elif provider == "finance-data-reader":
            if not has_module("FinanceDataReader"):
                return print_json({"ok": False, "error": "dependency_missing", "provider": "FinanceDataReader"}, 2)
            rows = fetch_fdr_ohlcv(args.ticker, args.start, args.end)
        else:
            return print_json({"ok": False, "error": "unknown_provider", "provider": provider}, 2)
    except Exception as exc:  # broad by design: local optional worker must fail as JSON
        return print_json({"ok": False, "error": "fetch_failed", "provider": provider, "message": str(exc)}, 1)

    return print_json({
        "ok": True,
        "provider": provider,
        "ticker": args.ticker,
        "from": args.start,
        "to": args.end,
        "rows": rows,
        "count": len(rows),
    })


def build_parser():
    parser = argparse.ArgumentParser(description="Optional local backtest data worker")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("providers", help="Show optional provider availability")

    ohlcv = subparsers.add_parser("ohlcv", help="Fetch OHLCV rows")
    ohlcv.add_argument("--ticker", required=True)
    ohlcv.add_argument("--from", dest="start", required=True)
    ohlcv.add_argument("--to", dest="end", required=True)
    ohlcv.add_argument("--provider", choices=["auto", "pykrx", "finance-data-reader"], default="auto")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "providers":
        return print_json(provider_status())
    if args.command == "ohlcv":
        return command_ohlcv(args)
    return print_json({"ok": False, "error": "unknown_command"}, 2)


if __name__ == "__main__":
    sys.exit(main())

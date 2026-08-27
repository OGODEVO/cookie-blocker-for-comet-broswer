#!/usr/bin/env python3
"""Export Comet Cookie Blocker logs as clean JSON for agents.

Reads the extension's storage directly out of the Comet browser profile
(LevelDB) and prints a JSON document: aggregate stats, cumulative per-host /
per-provider / per-cookie breakdown, and the raw recent history. No
dependencies, no running browser needed beyond the profile on disk.

Usage:
  python3 export-logs.py              # full JSON to stdout
  python3 export-logs.py --summary    # aggregate counts only (human-friendly)
  python3 export-logs.py --out logs.json
  python3 export-logs.py --ext-id <id> --comet-dir <path>   # override detection
"""

import argparse
import datetime
import json
import os
import re
import sys


def find_extension_id(comet_home):
    """Locate the unpacked extension ID from Comet's preferences."""
    for fname in ("Default/Preferences", "Default/Secure Preferences"):
        path = os.path.join(comet_home, fname)
        if not os.path.exists(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as f:
                prefs = json.load(f)
        except (OSError, ValueError):
            continue
        settings = prefs.get("extensions", {}).get("settings", {})
        for eid, meta in settings.items():
            p = meta.get("path") or ""
            if "comet-cookie-blocker" in p:
                return eid, meta.get("manifest", {}).get("name", "Comet Cookie Blocker")
    return None, None


def _extract_json(blob, needle):
    """Find the last occurrence of `needle` in `blob` and parse the JSON after it.

    Two passes: first a strict ``raw_decode`` (string-aware, survives nested
    brackets), then a lenient fallback for the history array — whose entries
    can contain raw non-UTF-8 bytes from tracking-beacon URLs that corrupt the
    surrounding JSON. The fallback re-parses each flat entry object individually
    and drops only the broken ones.
    """
    text = blob.decode("utf-8", "replace")
    idx = text.rfind(needle.decode())
    if idx < 0:
        return None

    starts = []
    for opener in ("[", "{"):
        p = text.find(opener, idx)
        if p != -1:
            starts.append((p, opener))
    if not starts:
        return None
    start, opener = min(starts, key=lambda x: x[0])

    try:
        value, _ = json.JSONDecoder().raw_decode(text, start)
        return value
    except ValueError:
        pass

    if opener == "[":
        end = text.find("]", start)
        region = text[start : end + 1] if end != -1 else text[start:]
        entries = []
        for m in re.finditer(r"\{[^{}]*\}", region):
            try:
                entries.append(json.loads(m.group(0)))
            except ValueError:
                continue
        return entries
    return None


def read_leveldb_json(db_dir, key):
    """Return the most-recent JSON value stored under `key` in a LevelDB dir.

    Fresh writes live in the numeric write-ahead log (``NNNNNNNN.log``); older
    compacted data lives in ``NNNNNNNN.ldb``. The WAL holds the newest value, so
    search it first and only fall back to the SSTables if the key isn't there.
    """
    if not db_dir or not os.path.isdir(db_dir):
        return None
    entries = sorted(os.listdir(db_dir))
    logs = sorted(e for e in entries if re.fullmatch(r"\d+\.log", e))
    ldbs = sorted(e for e in entries if re.fullmatch(r"\d+\.ldb", e))

    needle = key.encode()
    for group in (logs, ldbs):
        blob = b""
        for name in group:
            try:
                with open(os.path.join(db_dir, name), "rb") as fh:
                    blob += fh.read()
            except OSError:
                continue
        val = _extract_json(blob, needle)
        if val is not None:
            return val
    return None


def summarize(stats, breakdown, history):
    hist_types = {}
    for e in history:
        hist_types[e.get("type")] = hist_types.get(e.get("type"), 0) + 1
    return {
        "stats": stats or {},
        "recent_window": {
            "total_entries": len(history or []),
            "types": hist_types,
        },
        "breakdown": breakdown or {},
    }


def main():
    parser = argparse.ArgumentParser(description="Export Comet Cookie Blocker logs")
    parser.add_argument("--summary", action="store_true", help="aggregate counts only")
    parser.add_argument("--out", help="write JSON to a file instead of stdout")
    parser.add_argument("--ext-id", help="override extension ID detection")
    parser.add_argument(
        "--comet-dir",
        help="override Comet profile dir (default: ~/Library/Application Support/Comet)",
    )
    args = parser.parse_args()

    comet_home = args.comet_dir or os.path.expanduser(
        "~/Library/Application Support/Comet"
    )
    ext_id, ext_name = (args.ext_id, "Comet Cookie Blocker") if args.ext_id else find_extension_id(comet_home)

    if not ext_id:
        print(
            "ERROR: could not locate the Comet Cookie Blocker extension ID.\n"
            f"Looked in: {comet_home}\n"
            "Pass --ext-id <id> to override.",
            file=sys.stderr,
        )
        sys.exit(1)

    local_dir = os.path.join(comet_home, "Default", "Local Extension Settings", ext_id)
    sync_dir = os.path.join(comet_home, "Default", "Sync Extension Settings", ext_id)

    history = read_leveldb_json(local_dir, "history") or []
    breakdown = read_leveldb_json(local_dir, "breakdown") or {}
    stats = read_leveldb_json(sync_dir, "stats") or {}

    result = {
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "extension": {"id": ext_id, "name": ext_name},
        "stats": stats,
        "breakdown": breakdown,
        "history_count": len(history),
        "history": history,
    }

    if args.summary:
        result = summarize(stats, breakdown, history)

    out = json.dumps(result, indent=2, ensure_ascii=False)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(out + "\n")
        print(f"Wrote {args.out}", file=sys.stderr)
    else:
        print(out)


if __name__ == "__main__":
    main()

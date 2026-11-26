#!/usr/bin/env python3
"""Tokens used by Claude Code agents, for the herdr-board cards.

Usage: tokens.py t16 t1q ...   (herdr-core terminal addresses)
Prints JSON {address: tokens}. Counts new input (input + cache creation) and output;
cache reads are left out. Addresses that aren't Claude Code are left out.

How: `hc get <address>` gives the terminal's pid; Claude Code writes
~/.claude/sessions/<pid>.json (sessionId, cwd) for its own process, which is that pid or a
descendant of it; the transcript ~/.claude/projects/<cwd with / and . as ->/<sessionId>.jsonl
holds each response's usage. Transcripts can be large, so each file is read incrementally
from where the last run stopped (cache in ~/.cache/herdr-board-tokens.json).
"""
import glob
import json
import os
import subprocess
import sys

HOME = os.path.expanduser("~")
SESSIONS = os.path.join(HOME, ".claude", "sessions")
PROJECTS = os.path.join(HOME, ".claude", "projects")
CACHE = os.path.join(HOME, ".cache", "herdr-board-tokens.json")


def children_map():
    out = subprocess.run(["ps", "-A", "-o", "pid=,ppid="], capture_output=True, text=True).stdout
    kids = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) == 2:
            kids.setdefault(int(parts[1]), []).append(int(parts[0]))
    return kids


def session_of(pid, kids):
    """The Claude Code session file of pid or its nearest descendant."""
    todo, seen = [pid], set()
    while todo:
        p = todo.pop(0)
        if p in seen:
            continue
        seen.add(p)
        f = os.path.join(SESSIONS, f"{p}.json")
        if os.path.exists(f):
            try:
                with open(f) as fh:
                    return json.load(fh)
            except (OSError, ValueError):
                return None
        todo.extend(kids.get(p, []))
    return None


def transcript(session):
    sid, cwd = session.get("sessionId"), session.get("cwd") or ""
    if not sid:
        return None
    guess = os.path.join(PROJECTS, cwd.replace("/", "-").replace(".", "-"), f"{sid}.jsonl")
    if os.path.exists(guess):
        return guess
    found = glob.glob(os.path.join(PROJECTS, "*", f"{sid}.jsonl"))
    return found[0] if found else None


def count(path, cache):
    """Sum usage, one per message id (a response is written once per content block)."""
    entry = cache.get(path)
    size = os.path.getsize(path)
    if not entry or entry.get("offset", 0) > size:
        entry = {"offset": 0, "ids": {}}
    ids = entry["ids"]
    with open(path, "rb") as fh:
        fh.seek(entry["offset"])
        while True:
            start = fh.tell()
            line = fh.readline()
            if not line:
                break
            if not line.endswith(b"\n"):  # still being written: read it next time
                fh.seek(start)
                break
            try:
                msg = json.loads(line).get("message") or {}
            except ValueError:
                continue
            u = msg.get("usage") if isinstance(msg, dict) else None
            if not u or not msg.get("id"):
                continue
            ids[msg["id"]] = (u.get("input_tokens") or 0) + (u.get("cache_creation_input_tokens") or 0) + (u.get("output_tokens") or 0)
        entry["offset"] = fh.tell()
    cache[path] = entry
    return sum(ids.values())


def main():
    addresses = sys.argv[1:]
    try:
        with open(CACHE) as fh:
            cache = json.load(fh)
    except (OSError, ValueError):
        cache = {}
    kids = children_map()
    result, used = {}, set()
    for addr in addresses:
        try:
            info = json.loads(subprocess.run(["hc", "get", addr], capture_output=True, text=True, timeout=5).stdout)
        except (subprocess.SubprocessError, ValueError):
            continue
        pid = info.get("pid")
        session = session_of(pid, kids) if pid else None
        path = transcript(session) if session else None
        if not path:
            continue
        used.add(path)
        try:
            result[addr] = count(path, cache)
        except OSError:
            continue
    # Keep the cache to the transcripts still in use.
    cache = {p: e for p, e in cache.items() if p in used}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    tmp = CACHE + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(cache, fh)
    os.replace(tmp, CACHE)
    print(json.dumps(result))


if __name__ == "__main__":
    main()

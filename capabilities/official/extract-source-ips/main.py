#!/usr/bin/env python3
import json
import sys

def main() -> None:
    raw = sys.stdin.read() or "{}"
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"invalid JSON input: {exc}", file=sys.stderr)
        sys.exit(1)

    events = payload.get("events")
    if not isinstance(events, list):
        print("input.events must be a list", file=sys.stderr)
        sys.exit(1)

    seen = set()
    ordered = []
    for event in events:
        if not isinstance(event, dict):
            continue
        ip = event.get("ip")
        if not isinstance(ip, str):
            continue
        if ip in seen:
            continue
        seen.add(ip)
        ordered.append(ip)

    sys.stdout.write(json.dumps({"ips": ordered}))

if __name__ == "__main__":
    main()

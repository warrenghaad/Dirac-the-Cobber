"""Portable exports include snapshots, lineage and full audit records."""
import json


def markdown(run):
    lines = [f"# {run['title']}", "", f"Run: {run['id']}", f"Status: {run['status']}",
             f"Created: {run['createdAt']}", f"Revision of: {run['revisionOf'] or '—'}",
             "", "## Goal", run["goal"], "",
             "> Generated artifacts are proposals, not verified facts, executed tests or deployed code.",
             "", "## Source snapshots"]
    for i in run["inputs"]:
        lines.extend(["", f"### {i['title']} ({i['kind']}, {i['id']})", i["text"]])
        if i.get("imageData"):
            lines.append(f"![Source image]({i['imageData']})")
    for s in run["stages"].values():
        lines.extend(["", f"## {s['name']}", f"ID: {s['id']} · {s['status']} · attempts: {s['attempts']}",
                      f"Depends on: {', '.join(s['dependencies']) or 'source inputs'}",
                      f"Started: {s['startedAt']} · Finished: {s['finishedAt']} · Duration ms: {s['durationMs']}",
                      "", "### Stage instruction", s["prompt"]])
        if s["error"]:
            lines.extend(["", "### Error", s["error"]])
        if s["output"]:
            o = s["output"]
            lines.extend(["", o["summary"], "", o["artifact"], "", "### Claims"])
            for claim in o["claims"]:
                lines.append(f"- {claim['statement']} [{claim['confidence']}] — evidence: {', '.join(claim['evidence'])}")
            lines.append("\n### Decisions")
            for d in o["decisions"]:
                lines.append(f"- {d['decision']} — {d['rationale']}")
            lines.append("\n### Warnings")
            lines.extend(f"- {w}" for w in o["warnings"])
    lines.extend(["", "## Review feedback", "```json", json.dumps(run["feedback"], ensure_ascii=False, indent=2), "```",
                  "", "## Event history"])
    lines.extend(f"- {e['at']} · {e['type']} · {e.get('stageId') or 'run'} · {e['message']}" for e in run["events"])
    return "\n".join(lines)

"""Import the unabridged FigJam XML; retain original geometry and graph edges."""
from pathlib import Path
import argparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).parent
SOURCE = ROOT / "source" / "figjam.xml"
FILE_KEY = "CSXebcFtI1JyEq07xCJ3ko"

# These are actual labelled return paths from the source, not blocking DAG edges.
FEEDBACK = {"2:215", "2:219", "2:223", "2:227"}
INPUTS = {"2:3", "2:6", "2:9", "2:12"}
TASKS = {
    "2:16": "Normalize each source separately. Preserve provenance and exact quotations; extract facts, assumptions and unresolved questions. Describe attached screenshots faithfully without inventing text.",
    "2:19": "Reconcile claims across supplied sources. List agreements, contradictions and missing evidence. Never promote a disputed claim to a verified fact.",
    "2:22": "Build a canonical knowledge record with supported claims, their source references, uncertainty, and explicitly unresolved conflicts. These are source-supported claims, not independently verified truths.",
    "2:25": "Create an auditable decision log. Distinguish explicit user decisions from recommendations and assumptions. Each decision needs a rationale and source.",
    "2:29": "Identify trends and signals only in the supplied material. Do not imply live web research; provide candidate hypotheses and a research plan where evidence is missing.",
    "2:32": "Produce a prioritized product strategy: goals, users, scope, non-goals, measurable outcomes, risks and dependencies. Resolve review feedback explicitly.",
    "2:35": "Design domain architecture: entities, boundaries, data contracts, capability ownership, interfaces and failure modes. Keep it proportional to the documented need.",
    "2:39": "Specify reusable design tokens, hierarchy, components, states, accessibility and semantic rules grounded in the domain architecture.",
    "2:42": "Orchestrate the user interface: screens, routes, actions, data bindings, loading/empty/error states and accessibility behavior. Incorporate any visualization feedback.",
    "2:45": "Produce a contractor-readable wireframe and specification artifact with screen structure, component usage, interactions and acceptance criteria.",
    "2:49": "Produce a reviewable implementation artifact: concrete code snippets or file contents, interfaces, setup instructions and implementation sequence. Do not claim files were executed, deployed or tests passed.",
    "2:52": "Stress-review the implementation proposal. Identify concrete logic, security, concurrency, accessibility and failure-path issues; include runnable test proposals and feedback for claim reconciliation. Do not claim tests were executed.",
    "2:55": "Review scalability, capacity, bottlenecks, cost and operational efficiency. Supply refactor recommendations and feedback for product strategy.",
    "2:59": "Define LLM governance: authority boundaries, privacy, input trust, tool permissions, human approval gates, data handling, observability and failure behavior.",
    "2:62": "Produce actionable copilot rules derived from governance, with explicit allowed/prohibited behaviors and escalation requirements.",
    "2:65": "Create an intervention map: trigger, severity, owner, stop/resume rules and human-review points. Agents must never self-authorize irreversible actions.",
    "2:69": "Produce a portable CMS/documentation packet (not a live Notion write) including canonical knowledge, provenance and suggested memory updates for review.",
    "2:72": "Produce a Figma visualization and mapping specification derived from the design system. Do not claim that Figma nodes were created or modified.",
    "2:75": "Specify automations with input/output contracts, triggers, validation, idempotency, retries and human approval. Do not execute external actions.",
    "2:78": "Produce hiring/finance planning artifacts: responsibilities, contractor scope, assumptions, capacity and explicit cost unknowns. Do not invent quotes or spend money.",
    "2:82": "Produce an admin UI specification and implementation artifact incorporating wireframes and the governance intervention map.",
    "2:85": "Package the design-system output as a reusable specification with tokens, component contracts, accessibility and consistency checks.",
    "2:88": "Produce a prototype/handoff packet with implementation material, setup steps and acceptance checks. Label unexecuted code and assumptions honestly.",
    "2:91": "Produce a contractor-ready packet with scope, responsibilities, deliverables, acceptance criteria, dependencies, known risks and finance assumptions.",
}


def load_board():
    root = ET.parse(SOURCE).getroot()
    nodes, sections, edges = [], [], []
    # The outer section is the exported screenshot boundary.
    outer = root.find("section")
    ox, oy = float(outer.get("x")), float(outer.get("y"))
    width, height = float(outer.get("width")), float(outer.get("height"))

    def walk(el, px=0, py=0, section="Page 1"):
        x, y = px + float(el.get("x", 0)), py + float(el.get("y", 0))
        tag, ident = el.tag, el.get("id", "")
        name = el.get("name", "")
        item = dict(id=ident, type=tag, name=name, text=(el.text or "").strip(),
                    x=x - ox, y=y - oy, width=float(el.get("width", 0)),
                    height=float(el.get("height", 0)), section=section,
                    executable=ident in TASKS, role="input" if ident in INPUTS else "stage" if ident in TASKS else "reference",
                    prompt=TASKS.get(ident, ""), dependencies=[])
        if tag == "section" and el is not outer:
            section = name
            item["section"] = section
            sections.append({k: item[k] for k in ("id", "name", "x", "y", "width", "height")})
        if tag == "connector":
            edges.append(dict(id=ident, source=el.get("connectorStart"), target=el.get("connectorEnd"),
                              label=item["text"], feedback=ident in FEEDBACK))
        elif tag != "canvas":
            nodes.append(item)
        for child in el:
            walk(child, x, y, section)

    walk(root)
    by_id = {n["id"]: n for n in nodes}
    for e in edges:
        target = by_id.get(e["target"])
        if target and target["executable"] and e["source"] in TASKS and not e["feedback"]:
            target["dependencies"].append(e["source"])
    for n in nodes:
        if n["id"] in TASKS:
            n["name"] = n["text"] or n["name"]
    stages = {n["id"]: n for n in nodes if n["executable"]}
    resolved = set()
    while len(resolved) < len(stages):
        ready = {k for k, v in stages.items() if k not in resolved and set(v["dependencies"]) <= resolved}
        if not ready:
            raise ValueError("Execution graph is cyclic or references an unknown stage")
        resolved |= ready
    return dict(title="Engineering system · FigJam", fileKey=FILE_KEY, nodeId="0:1",
                sourceUrl=f"https://www.figma.com/board/{FILE_KEY}?node-id=0:1",
                imageUrl="/assets/figjam.webp", width=width, height=height,
                nodes=nodes, sections=sections, edges=edges,
                feedbackEdges=[e for e in edges if e["feedback"]])


if __name__ == "__main__":
    argparse.ArgumentParser().add_argument("--check", action="store_true")
    board = load_board()
    print(f"FigJam import valid: {len(board['nodes'])} elements, {len(board['edges'])} edges, "
          f"{len(TASKS)} executable stages, {len(board['feedbackEdges'])} explicit feedback paths")

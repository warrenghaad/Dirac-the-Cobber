"""Durable dependency scheduler with bounded concurrent runs and explicit revisions."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import RLock
import time
import uuid

from .provider import ModelProvider, ProviderError


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid.uuid4().hex


class Conflict(Exception):
    pass


class Engine:
    def __init__(self, store, board, provider=None):
        self.store, self.board = store, board
        self.provider = provider or ModelProvider()
        self.lock = RLock()
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="workflow")
        self.pending = set()
        self.templates = [n for n in board["nodes"] if n["executable"]]
        # Never automatically repeat paid work after a process restart.
        for run in store.list("runs"):
            if run["status"] in {"queued", "running"}:
                def interrupt(r):
                    r["status"] = "interrupted"
                    r["error"] = "Server restarted. Resume explicitly; completed stages were retained."
                    r["updatedAt"] = now()
                    for stage in r["stages"].values():
                        if stage["status"] == "active":
                            stage["status"] = "queued"
                            stage["error"] = "Previous request may have incurred provider cost; output was not committed."
                    self.event(r, "interrupted", r["error"])
                store.update("runs", run["id"], interrupt)

    @staticmethod
    def event(run, kind, message, stage_id=None):
        run["events"].append(dict(at=now(), type=kind, stageId=stage_id, message=message))
        run["updatedAt"] = now()

    def create(self, title, goal, inputs, revision_of=None):
        with self.lock:
            if len(self.store.list("runs")) >= 100:
                raise Conflict("Workspace run limit reached (100). Export and archive the database before creating more.")
            timestamp = now()
            run = dict(id=uid(), title=title, goal=goal, status="draft", createdAt=timestamp,
                       updatedAt=timestamp, revisionOf=revision_of, error=None, inputs=inputs,
                       stages={}, events=[], feedback=[])
            for node in self.templates:
                run["stages"][node["id"]] = dict(
                    id=node["id"], name=node["name"], status="queued",
                    dependencies=node["dependencies"], prompt=node["prompt"], output=None,
                    error=None, startedAt=None, finishedAt=None, attempts=0, durationMs=None)
            self.event(run, "created", "Run saved. No model requests made yet.")
            return self.store.put("runs", run)

    def start(self, ident):
        with self.lock:
            run = self.store.get("runs", ident)
            if ident in self.pending or run["status"] in {"running", "queued", "completed"}:
                raise Conflict("This run is already active or completed. Create a revision to run it again.")
            if not self.provider.ready():
                def block(r):
                    r["status"] = "blocked"
                    r["error"] = "Connect a model provider in Replit before running agents."
                    for stage in r["stages"].values():
                        if stage["status"] != "completed":
                            stage["status"] = "blocked"
                    self.event(r, "blocked", r["error"])
                self.store.update("runs", ident, block)
                raise Conflict("Connect a model provider in Replit before running agents. Your run is saved.")
            if len(self.pending) >= 2:
                raise Conflict("Two runs are already processing. Wait or cancel one before starting another.")
            def queue(r):
                r["status"], r["error"] = "queued", None
                for stage in r["stages"].values():
                    if stage["status"] != "completed":
                        stage.update(status="queued", output=None, error=None, startedAt=None,
                                     finishedAt=None, durationMs=None)
                self.event(r, "queued", "Execution queued. Completed stages will not be repeated.")
            run = self.store.update("runs", ident, queue)
            self.pending.add(ident)
            self.pool.submit(self._execute, ident)
            return run

    def cancel(self, ident):
        with self.lock:
            def stop(r):
                if r["status"] not in {"running", "queued"}:
                    raise Conflict("Only an active or queued run can be cancelled.")
                r["status"] = "cancelled"
                r["error"] = None
                for stage in r["stages"].values():
                    if stage["status"] in {"queued", "active", "blocked"}:
                        stage["status"] = "cancelled"
                        stage["finishedAt"] = now()
                self.event(r, "cancelled", "Scheduling stopped. In-flight model requests may still incur cost; their results are discarded.")
            return self.store.update("runs", ident, stop)

    def revise(self, ident, goal=None):
        with self.lock:
            original = self.store.get("runs", ident)
            if original["status"] in {"draft", "queued", "running", "blocked", "interrupted"}:
                raise Conflict("Finish, fail, or cancel the source run before creating a revision.")
            feedback = [f for f in original["feedback"] if f.get("output")]
            inputs = list(original["inputs"])
            if feedback:
                import json
                inputs.append(dict(id="feedback-" + uid(), kind="research", title="Prior review feedback",
                                   text=json.dumps(feedback, ensure_ascii=False), imageData=None,
                                   imageUrl=None, createdAt=now()))
            run = self.create(original["title"] + " · revision", goal or original["goal"], inputs, ident)
            return run

    def _execute(self, ident):
        try:
            with self.lock:
                if self.store.get("runs", ident)["status"] != "queued":
                    return
                def begin(r):
                    r["status"] = "running"
                    self.event(r, "started", "Workflow processing started.")
                self.store.update("runs", ident, begin)
            while True:
                with self.lock:
                    run = self.store.get("runs", ident)
                    if run["status"] != "running":
                        return
                    stages = run["stages"]
                    # Propagate failure to all descendants, not to unrelated branches.
                    changed = True
                    while changed:
                        changed = False
                        for stage in stages.values():
                            if stage["status"] == "queued" and any(stages[d]["status"] in {"failed", "blocked"} for d in stage["dependencies"]):
                                stage["status"] = "blocked"
                                stage["error"] = "An upstream stage failed. Retry the run after resolving it."
                                self.event(run, "stage_blocked", stage["error"], stage["id"])
                                changed = True
                    ready = next((s for s in stages.values() if s["status"] == "queued"
                                  and all(stages[d]["status"] == "completed" for d in s["dependencies"])), None)
                    if not ready:
                        run["status"] = "completed" if all(s["status"] == "completed" for s in stages.values()) else "failed"
                        if run["status"] == "failed":
                            run["error"] = "One or more stages failed. Inspect stage errors, then retry."
                        self.event(run, run["status"], "Workflow finished." if run["status"] == "completed" else run["error"])
                        self.store.put("runs", run)
                        return
                    ready.update(status="active", startedAt=now(), attempts=ready["attempts"] + 1, error=None)
                    self.event(run, "stage_started", ready["name"], ready["id"])
                    self.store.put("runs", run)
                    upstream = {d: stages[d]["output"] for d in ready["dependencies"]}
                start = time.monotonic()
                try:
                    output = self.provider.generate(ready, run, upstream)
                    error = None
                except ProviderError as exc:
                    output, error = None, str(exc)
                except Exception:
                    # Internal errors should not leak credentials or input content.
                    output, error = None, "Unexpected model adapter error. Inspect server diagnostics."
                with self.lock:
                    current = self.store.get("runs", ident)
                    if current["status"] != "running":
                        return
                    stage = current["stages"][ready["id"]]
                    stage.update(status="failed" if error else "completed", output=output, error=error,
                                 finishedAt=now(), durationMs=round((time.monotonic() - start) * 1000))
                    self.event(current, "stage_failed" if error else "stage_completed",
                               error or ready["name"], ready["id"])
                    for edge in self.board["feedbackEdges"]:
                        if edge["source"] == ready["id"] and output:
                            current["feedback"].append(dict(edgeId=edge["id"], source=edge["source"],
                                                            target=edge["target"], label=edge["label"], output=output))
                    self.store.put("runs", current)
        except Exception:
            def fail(r):
                if r["status"] not in {"cancelled", "completed"}:
                    r["status"], r["error"] = "failed", "Workflow scheduler failed. Retry to resume completed progress."
                    self.event(r, "error", r["error"])
            self.store.update("runs", ident, fail)
        finally:
            with self.lock:
                self.pending.discard(ident)


def public_input(item):
    return {k: v for k, v in item.items() if k != "imageData"}


def public_run(run):
    return {**run, "inputs": [public_input(i) for i in run["inputs"]]}


def summary(run):
    return {**{k: run[k] for k in ("id", "title", "status", "createdAt", "updatedAt", "revisionOf", "error")},
            "total": len(run["stages"]), "completed": sum(s["status"] == "completed" for s in run["stages"].values())}

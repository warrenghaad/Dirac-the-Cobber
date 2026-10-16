import base64
import io
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image

from workflow_system import server
from workflow_system.engine import Conflict, Engine, public_run
from workflow_system.import_board import load_board, TASKS
from workflow_system.provider import ModelProvider, ProviderError, validate_output
from workflow_system.store import Store


def result(stage_id="test"):
    return dict(summary=f"Fixture output for {stage_id}", artifact="Unit-test fixture, never a live model result.",
                claims=[dict(statement="Test fixture", evidence=["source-test"], confidence="uncertain")],
                decisions=[dict(decision="Fixture", rationale="Unit test")], warnings=[])


class FixtureProvider:
    def __init__(self, fail=None, ready=True, gate=None):
        self.calls = []
        self.fail = fail
        self.configured = ready
        self.gate = gate
        self.entered = threading.Event()

    def ready(self):
        return self.configured

    def generate(self, stage, run, upstream):
        self.calls.append(stage["id"])
        self.entered.set()
        if self.gate:
            self.gate.wait(3)
        if stage["id"] == self.fail:
            raise ProviderError("Explicit test provider failure")
        return result(stage["id"])


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / "db.sqlite")
        self.board = load_board()
        self.provider = FixtureProvider()
        self.engine = Engine(self.store, self.board, self.provider)
        self.input = dict(id="source-test", title="Test source", kind="notes", text="Source evidence",
                          imageData=None, imageUrl=None, createdAt="2026-01-01")

    def tearDown(self):
        self.engine.pool.shutdown(wait=True)
        self.temp.cleanup()

    def create(self):
        return self.engine.create("Test workflow", "Test goal", [self.input])

    def wait_run(self, ident, states=("completed", "failed", "cancelled")):
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            run = self.store.get("runs", ident)
            if run["status"] in states:
                # _execute finally removes the pending guard immediately after this write.
                with self.engine.lock:
                    if ident not in self.engine.pending:
                        return run
            time.sleep(.01)
        self.fail("Run did not settle")

    def test_full_import_and_acyclic_dependencies(self):
        self.assertEqual(len(self.board["nodes"]), 237)
        self.assertEqual(len(self.board["edges"]), 118)
        self.assertEqual(len(TASKS), 24)
        self.assertEqual(len(self.board["feedbackEdges"]), 4)
        labels = " ".join(n["name"] + n["text"] for n in self.board["nodes"])
        self.assertIn("Facebook", labels)
        self.assertIn("Truth Spine", labels)
        self.assertIn("Engineering diagram", labels)
        self.assertIn("Canonical truths", labels)
        nodes = {n["id"]: n for n in self.board["nodes"]}
        self.assertEqual(nodes["2:19"]["dependencies"], ["2:16"])
        self.assertNotIn("2:52", nodes["2:19"]["dependencies"])
        self.assertEqual(len(nodes), len(self.board["nodes"]))

    def test_all_stages_follow_dependencies_and_record_feedback(self):
        run = self.create()
        self.engine.start(run["id"])
        finished = self.wait_run(run["id"])
        self.assertEqual(finished["status"], "completed")
        self.assertEqual(len(self.provider.calls), 24)
        done = set()
        for ident in self.provider.calls:
            self.assertTrue(set(finished["stages"][ident]["dependencies"]) <= done)
            done.add(ident)
        self.assertEqual(len(finished["feedback"]), 4)
        self.assertTrue(all(s["attempts"] == 1 for s in finished["stages"].values()))
        self.assertEqual(Store(self.store.path).get("runs", run["id"])["status"], "completed")
        with self.assertRaises(Conflict):
            self.engine.start(run["id"])

    def test_failure_blocks_descendants_and_retry_preserves_completed(self):
        self.provider.fail = "2:39"
        run = self.create()
        self.engine.start(run["id"])
        failed = self.wait_run(run["id"])
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(failed["stages"]["2:39"]["status"], "failed")
        self.assertEqual(failed["stages"]["2:42"]["status"], "blocked")
        self.assertEqual(failed["stages"]["2:59"]["status"], "completed")
        completed = {s["id"] for s in failed["stages"].values() if s["status"] == "completed"}
        self.provider.fail = None
        self.engine.start(run["id"])
        final = self.wait_run(run["id"])
        self.assertEqual(final["status"], "completed")
        self.assertTrue(all(final["stages"][k]["attempts"] == 1 for k in completed))
        self.assertEqual(final["stages"]["2:39"]["attempts"], 2)

    def test_missing_provider_blocks_without_calls(self):
        self.provider.configured = False
        run = self.create()
        with self.assertRaises(Conflict):
            self.engine.start(run["id"])
        blocked = self.store.get("runs", run["id"])
        self.assertEqual(blocked["status"], "blocked")
        self.assertTrue(all(s["status"] == "blocked" for s in blocked["stages"].values()))
        self.assertEqual(self.provider.calls, [])

    def test_cancel_discards_inflight_result_and_resume(self):
        gate = threading.Event()
        self.provider.gate = gate
        run = self.create()
        self.engine.start(run["id"])
        self.assertTrue(self.provider.entered.wait(2))
        with self.assertRaises(Conflict):
            self.engine.start(run["id"])
        self.engine.cancel(run["id"])
        gate.set()
        cancelled = self.wait_run(run["id"])
        self.assertEqual(cancelled["status"], "cancelled")
        self.assertTrue(all(s["output"] is None for s in cancelled["stages"].values()))
        self.provider.gate = None
        self.engine.start(run["id"])
        self.assertEqual(self.wait_run(run["id"])["status"], "completed")

    def test_restart_requires_explicit_resume(self):
        run = self.create()
        def active(r):
            r["status"] = "running"
            r["stages"]["2:16"]["status"] = "active"
        self.store.update("runs", run["id"], active)
        recovered = Engine(self.store, self.board, self.provider)
        try:
            r = self.store.get("runs", run["id"])
            self.assertEqual(r["status"], "interrupted")
            self.assertEqual(r["stages"]["2:16"]["status"], "queued")
            self.assertEqual(self.provider.calls, [])
        finally:
            recovered.pool.shutdown()

    def test_revision_is_draft_and_carries_feedback(self):
        run = self.create()
        self.engine.start(run["id"])
        self.wait_run(run["id"])
        new = self.engine.revise(run["id"], "Resolve review concerns")
        self.assertEqual(new["revisionOf"], run["id"])
        self.assertEqual(new["status"], "draft")
        self.assertIn("Prior review feedback", new["inputs"][-1]["title"])
        self.assertEqual(len(self.provider.calls), 24)

    def test_source_snapshot_survives_input_delete(self):
        self.store.put("inputs", self.input)
        run = self.create()
        self.store.delete("inputs", self.input["id"])
        self.assertEqual(self.store.get("runs", run["id"])["inputs"][0]["text"], "Source evidence")
        self.assertNotIn("imageData", public_run(run)["inputs"][0])

    def test_output_schema_rejects_unstructured_or_invalid(self):
        for value in ("not JSON", {}, dict(result(), claims=[{"statement": "No evidence"}]),
                      dict(result(), warnings=[5]), dict(result(), decisions=["bad"])):
            with self.assertRaises(ProviderError):
                validate_output(value)
        self.assertEqual(validate_output(result())["summary"], result()["summary"])

    def test_image_validation(self):
        buf = io.BytesIO()
        Image.new("RGB", (2, 2), "green").save(buf, format="PNG")
        body = dict(kind="image", title="Sketch", text="A green test square.",
                    imageData="data:image/png;base64," + base64.b64encode(buf.getvalue()).decode())
        self.assertTrue(server.validate_input(body)["imageUrl"].startswith("/api/inputs/"))
        with self.assertRaises(ValueError):
            server.validate_input({**body, "imageData": "data:image/png;base64,bm90IGFuIGltYWdl"})
        with self.assertRaises(ValueError):
            server.validate_input(dict(kind="notes", title="Empty", text=" "))

    def test_provider_has_no_silent_fallback(self):
        with patch("workflow_system.provider.configuration", return_value=dict(key=None, base="https://example.com/v1", model="test", managed=False)):
            with self.assertRaises(ProviderError):
                ModelProvider().generate({}, {}, {})

    def test_model_adapter_request_and_schema(self):
        cfg = dict(key="unit-test-only", base="https://example.com/v1", model="test-model", managed=False)
        payload = {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(result())}}]}
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *args):
                pass
            def read(self, limit):
                return json.dumps(payload).encode()
        stage = dict(id="2:16", name="Intake", prompt="Normalize")
        run = dict(goal="Test", inputs=[self.input])
        with patch("workflow_system.provider.configuration", return_value=cfg), patch("urllib.request.urlopen", return_value=Response()) as call:
            self.assertEqual(ModelProvider().generate(stage, run, {})["artifact"], result()["artifact"])
            sent = json.loads(call.call_args.args[0].data)
            self.assertEqual(sent["model"], "test-model")
            self.assertEqual(sent["response_format"], {"type": "json_object"})
            self.assertNotIn("unit-test-only", json.dumps(sent))
        with patch("workflow_system.provider.configuration", return_value=cfg), patch("urllib.request.urlopen", side_effect=HTTPError("https://example.com", 429, "quota", {}, None)):
            with self.assertRaisesRegex(ProviderError, "rate limit"):
                ModelProvider().generate(stage, run, {})
        payload["choices"][0]["finish_reason"] = "length"
        with patch("workflow_system.provider.configuration", return_value=cfg), patch("urllib.request.urlopen", return_value=Response()):
            with self.assertRaisesRegex(ProviderError, "truncated"):
                ModelProvider().generate(stage, run, {})

    def test_two_run_capacity_limit(self):
        gate = threading.Event()
        self.provider.gate = gate
        runs = [self.create() for _ in range(3)]
        try:
            self.engine.start(runs[0]["id"])
            self.engine.start(runs[1]["id"])
            with self.assertRaisesRegex(Conflict, "Two runs"):
                self.engine.start(runs[2]["id"])
            self.engine.cancel(runs[0]["id"])
            self.engine.cancel(runs[1]["id"])
        finally:
            gate.set()


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        server.STORE = Store(Path(cls.temp.name) / "db.sqlite")
        server.BOARD = load_board()
        server.ENGINE = Engine(server.STORE, server.BOARD, FixtureProvider(ready=False))
        cls.http = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.http.server_port}"
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.thread.join()
        server.ENGINE.pool.shutdown()
        cls.temp.cleanup()

    def request(self, path, method="GET", body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        req = Request(self.base + path, data=data, method=method,
                      headers={"Content-Type": "application/json", **(headers or {})})
        try:
            response = urlopen(req, timeout=3)
        except HTTPError as e:
            response = e
        with response:
            raw = response.read()
            value = json.loads(raw) if "application/json" in response.headers.get("Content-Type", "") else raw
            return response.status, value

    def test_crud_blocked_start_export_and_validation(self):
        code, source = self.request("/api/inputs", "POST", {"kind": "notes", "title": "API test", "text": "Evidence"})
        self.assertEqual(code, 201)
        code, run = self.request("/api/runs", "POST", {"title": "HTTP run", "goal": "Test", "inputIds": [source["id"]]})
        self.assertEqual(code, 201)
        self.assertEqual(self.request(f"/api/runs/{run['id']}/start", "POST", {})[0], 409)
        self.assertEqual(self.request(f"/api/runs/{run['id']}")[1]["status"], "blocked")
        self.assertEqual(self.request(f"/api/runs/{run['id']}/export?format=json")[1]["inputs"][0]["text"], "Evidence")
        self.assertIn(b"Source snapshots", self.request(f"/api/runs/{run['id']}/export?format=md")[1])
        self.assertEqual(self.request(f"/api/inputs/{source['id']}", "DELETE")[0], 200)
        self.assertEqual(self.request("/api/runs", "POST", {"title": "No input", "goal": "test", "inputIds": []})[0], 400)
        self.assertEqual(self.request("/api/inputs", "POST", {"kind": "invalid", "title": "Bad", "text": "x"})[0], 400)
        self.assertEqual(self.request("/api/missing")[0], 404)
        self.assertEqual(self.request("/../../README.md")[0], 404)
        self.assertEqual(self.request("/api/inputs", "POST", {}, {"Origin": "https://hostile.example"})[0], 403)
        self.assertEqual(self.request("/api/board")[1]["fileKey"], "CSXebcFtI1JyEq07xCJ3ko")


if __name__ == "__main__":
    unittest.main()

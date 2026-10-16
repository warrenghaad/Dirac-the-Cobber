"""Same-origin web/API server. Intended for a single-owner workspace, not public use."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
import base64
import binascii
import io
import json
import mimetypes
import os
import re

from PIL import Image, UnidentifiedImageError

from .engine import Conflict, Engine, now, public_input, public_run, summary, uid
from .export import markdown
from .import_board import ROOT, load_board
from .provider import status as provider_status
from .store import Store

LIMITS = dict(maxInputs=100, maxTextLength=12000, maxImageBytes=4 * 1024 * 1024, maxRuns=100)
MAX_BODY = 6 * 1024 * 1024
STORE = None
ENGINE = None
BOARD = None


def text(value, field, maximum, required=True):
    if not isinstance(value, str) or len(value) > maximum or (required and not value.strip()):
        raise ValueError(f"{field} must be {'non-empty ' if required else ''}text of at most {maximum} characters.")
    return value.strip()


def validate_input(body):
    kind = body.get("kind")
    if kind not in {"notes", "chat", "research", "image"}:
        raise ValueError("Choose notes, chat, research or image.")
    item = dict(id=uid(), kind=kind, title=text(body.get("title"), "Title", 160),
                text=text(body.get("text", ""), "Text", LIMITS["maxTextLength"], required=kind != "image"),
                imageData=None, imageUrl=None, createdAt=now())
    if kind == "image":
        data = body.get("imageData")
        if not isinstance(data, str) or not re.fullmatch(r"data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+", data):
            raise ValueError("Upload a PNG, JPEG or WebP image.")
        try:
            raw = base64.b64decode(data.split(",", 1)[1], validate=True)
            if len(raw) > LIMITS["maxImageBytes"]:
                raise ValueError("Image exceeds the 4 MB limit.")
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"PNG", "JPEG", "WEBP"} or image.width * image.height > 20_000_000:
                    raise ValueError("Unsupported image or image exceeds 20 million pixels.")
                image.verify()
                fmt = {"PNG": "png", "JPEG": "jpeg", "WEBP": "webp"}[image.format]
        except (binascii.Error, UnidentifiedImageError, OSError, Image.DecompressionBombError):
            raise ValueError("The supplied image could not be decoded safely.") from None
        item["imageData"] = f"data:image/{fmt};base64," + base64.b64encode(raw).decode()
        item["imageUrl"] = f"/api/inputs/{item['id']}/image"
    return item


def snapshot_run(run):
    result = public_run(run)
    for item in result["inputs"]:
        if item.get("imageUrl"):
            item["imageUrl"] = f"/api/runs/{run['id']}/inputs/{item['id']}/image"
    return result


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # Log paths/status, never request bodies, credentials or image data.
        print(f"[http] {fmt % args}", flush=True)

    def send(self, body, code=200, mime="application/json; charset=utf-8", filename=None):
        if not isinstance(body, bytes):
            body = json.dumps(body, ensure_ascii=False).encode() if mime.startswith("application/json") else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def payload(self):
        if self.headers.get_content_type() != "application/json":
            raise ValueError("Send application/json.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Invalid request length.") from None
        if length < 0 or length > MAX_BODY:
            raise ValueError("Request exceeds the 6 MB limit.")
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, UnicodeDecodeError):
            raise ValueError("Request body must be valid JSON.") from None
        if not isinstance(body, dict):
            raise ValueError("Request body must be an object.")
        return body

    def same_origin(self):
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc != self.headers.get("Host"):
            raise PermissionError("Cross-origin writes are not allowed.")

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_DELETE(self):
        self.dispatch("DELETE")

    def dispatch(self, method):
        try:
            if method != "GET":
                self.same_origin()
            self.route(method)
        except KeyError:
            self.send({"error": "Record or route not found."}, 404)
        except Conflict as exc:
            self.send({"error": str(exc)}, 409)
        except ValueError as exc:
            self.send({"error": str(exc)}, 400)
        except PermissionError as exc:
            self.send({"error": str(exc)}, 403)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            print(f"[server] Internal error: {type(exc).__name__}", flush=True)
            self.send({"error": "An internal server error occurred. No model result was fabricated."}, 500)

    def image(self, item):
        if not item.get("imageData"):
            raise KeyError()
        header, data = item["imageData"].split(",", 1)
        self.send(base64.b64decode(data), mime=header.removeprefix("data:").split(";")[0])

    def route(self, method):
        url = urlsplit(self.path)
        path = url.path.rstrip("/") or "/"
        parts = path.strip("/").split("/")
        if method == "GET":
            if path == "/api/board":
                return self.send(BOARD)
            if path == "/api/settings":
                return self.send(dict(provider=provider_status(), limits=LIMITS,
                                      safety="Agents produce reviewable artifacts only. No external writes or code execution. Workspace access is not a substitute for app authentication; do not publish with private data.",
                                      persistence="SQLite workspace disk; export before publishing or migrating."))
            if path == "/api/inputs":
                return self.send([public_input(i) for i in STORE.list("inputs")])
            if path == "/api/runs":
                return self.send([summary(r) for r in STORE.list("runs")])
            if len(parts) == 4 and parts[:2] == ["api", "inputs"] and parts[3] == "image":
                return self.image(STORE.get("inputs", parts[2]))
            if len(parts) >= 3 and parts[:2] == ["api", "runs"]:
                run = STORE.get("runs", parts[2])
                if len(parts) == 3:
                    return self.send(snapshot_run(run))
                if len(parts) == 6 and parts[3] == "inputs" and parts[5] == "image":
                    return self.image(next((i for i in run["inputs"] if i["id"] == parts[4]), {}))
                if len(parts) == 4 and parts[3] == "export":
                    fmt = parse_qs(url.query).get("format", ["json"])[0]
                    if fmt not in {"json", "md"}:
                        raise ValueError("Export format must be json or md.")
                    return self.send(run if fmt == "json" else markdown(run),
                                     mime="application/json; charset=utf-8" if fmt == "json" else "text/markdown; charset=utf-8",
                                     filename=f"workflow-{run['id']}.{fmt}")
            if path == "/assets/figjam.webp":
                return self.send((ROOT / "source" / "figjam.webp").read_bytes(), mime="image/webp")
            if path == "/favicon.ico":
                return self.send((ROOT / "web" / "favicon.svg").read_bytes(), mime="image/svg+xml")
            if path == "/source/figjam.xml":
                return self.send((ROOT / "source" / "figjam.xml").read_bytes(), mime="application/xml",
                                 filename="figjam-source.xml")
            if path.startswith("/api/"):
                raise KeyError()
            relative = "index.html" if path == "/" else path.lstrip("/")
            web = (ROOT / "web").resolve()
            file = (web / relative).resolve()
            if not file.is_relative_to(web) or not file.is_file():
                raise KeyError()
            return self.send(file.read_bytes(), mime=mimetypes.guess_type(file.name)[0] or "application/octet-stream")
        if method == "DELETE" and len(parts) == 3 and parts[:2] == ["api", "inputs"]:
            STORE.delete("inputs", parts[2])
            return self.send({"deleted": True})
        if method != "POST":
            raise KeyError()
        body = self.payload()
        if path == "/api/inputs":
            with ENGINE.lock:
                if len(STORE.list("inputs")) >= LIMITS["maxInputs"]:
                    raise Conflict("Input limit reached (100). Remove an unused input first.")
                item = validate_input(body)
                STORE.put("inputs", item)
                return self.send(public_input(item), 201)
        if path == "/api/runs":
            title = text(body.get("title"), "Title", 160)
            goal = text(body.get("goal"), "Goal", 6000)
            ids = body.get("inputIds")
            if not isinstance(ids, list) or not 1 <= len(ids) <= 10 or not all(isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
                raise ValueError("Select 1–10 distinct source inputs.")
            inputs = [STORE.get("inputs", i) for i in ids]
            if sum(len(i["text"]) for i in inputs) > 30_000:
                raise ValueError("Selected source text exceeds 30,000 characters. Split it into separate runs.")
            if sum(bool(i.get("imageData")) for i in inputs) > 3:
                raise ValueError("Select at most three images per run.")
            return self.send(snapshot_run(ENGINE.create(title, goal, inputs)), 201)
        if len(parts) == 4 and parts[:2] == ["api", "runs"]:
            ident, action = parts[2:]
            if action == "start":
                return self.send(snapshot_run(ENGINE.start(ident)))
            if action == "cancel":
                return self.send(snapshot_run(ENGINE.cancel(ident)))
            if action == "revise":
                goal = body.get("goal")
                if goal is not None:
                    goal = text(goal, "Goal", 6000)
                return self.send(snapshot_run(ENGINE.revise(ident, goal)), 201)
        raise KeyError()


def main():
    global STORE, ENGINE, BOARD
    BOARD = load_board()
    STORE = Store()
    ENGINE = Engine(STORE, BOARD)
    port = int(os.environ.get("PORT", 5000))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"FigJam workflow workbench listening on {port}. Provider configured: {provider_status()['configured']}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        ENGINE.pool.shutdown(wait=False, cancel_futures=True)


if __name__ == "__main__":
    main()

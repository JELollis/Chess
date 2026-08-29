// Loads the Stockfish 18 Lite WASM engine as a Web Worker.
//
// Production works around a Cloudflare HTTP/3 (QUIC) issue: when the engine
// worker downloads its own 7 MB .wasm, the streaming fetch aborts mid-body with
// net::ERR_QUIC_PROTOCOL_ERROR and the worker dies silently (never emits
// `uciok`). Main-thread fetches of the same asset are reliable, so we fetch the
// bytes here and hand them to a thin wrapper worker that serves them from a
// local blob URL (no network, no QUIC), then loads the real engine via
// importScripts. See memory: stockfish-quic-wasm.

export type StockfishWorker = Worker;

// Create the engine worker and kick off the wasm handshake. The caller should
// attach `onmessage` synchronously (before the microtask that posts the bytes
// runs) and drive the UCI handshake from there — the worker only begins loading
// once it receives the wasm bytes, and `uci` is sent for it here.
export function createStockfishWorker(onLoadError?: () => void): StockfishWorker {
  const engineUrl = new URL("/stockfish/stockfish-18-lite-single.js", window.location.origin).href;
  const wasmUrl = new URL("/stockfish/stockfish-18-lite-single.wasm", window.location.origin).href;

  // The wrapper receives the wasm bytes, exposes them at a local blob URL, and
  // pins every fetch/XHR the engine makes to that blob (the single-file "lite"
  // engine only ever requests its own wasm, and derives a wrong path from the
  // blob-worker location which we ignore here).
  const wrapperSrc = `
    self.addEventListener("message", function init(ev) {
      var d = ev.data;
      if (!d || !d.__sfwasm) return;
      self.removeEventListener("message", init);
      var url = URL.createObjectURL(new Blob([d.__sfwasm], { type: "application/wasm" }));
      var of = self.fetch;
      self.fetch = function (u, opt) { return of(url, opt); };
      var OX = self.XMLHttpRequest;
      self.XMLHttpRequest = function () {
        var x = new OX(); var open = x.open;
        x.open = function (m, u, async, usr, pw) { return open.call(this, m, url, async !== false, usr, pw); };
        return x;
      };
      importScripts(${JSON.stringify(engineUrl)});
    });
  `;

  const worker = new Worker(URL.createObjectURL(new Blob([wrapperSrc], { type: "application/javascript" })));
  fetch(wasmUrl)
    .then((res) => { if (!res.ok) throw new Error(`wasm ${res.status}`); return res.arrayBuffer(); })
    .then((buf) => { worker.postMessage({ __sfwasm: buf }, [buf]); worker.postMessage("uci"); })
    .catch(() => { onLoadError?.(); });
  return worker;
}

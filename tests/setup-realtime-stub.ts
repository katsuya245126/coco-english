// Inert global WebSocket stub for the test runner.
//
// supabase-js constructs a RealtimeClient eagerly, which needs a global
// WebSocket. Node < 22 has none. The server tests only do DB queries (no
// realtime), so providing an inert constructor satisfies the client without
// pulling in the `ws` package or ever opening a socket. This lets the APP's
// createSupabaseServiceClient() be used directly from tests (e.g. unlockStudent,
// resolveClassById) instead of each test rebuilding a stubbed client.
if (typeof (globalThis as { WebSocket?: unknown }).WebSocket === "undefined") {
  class InertWebSocket {
    constructor() {}
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  }
  (globalThis as { WebSocket?: unknown }).WebSocket =
    InertWebSocket as unknown as typeof WebSocket;
}

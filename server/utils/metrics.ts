import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

/**
 * Prometheus metrics for the API.
 *
 * Pattern borrowed from the atproto matrix-bridge: one private Registry per
 * process, app metrics prefixed `apice_`, and a single /metrics endpoint that
 * dumps the registry text format. No collector scrapes this yet — the
 * endpoint is the contract; wiring Grafana/Prometheus later needs no server
 * changes.
 *
 * Cardinality rules: labels only carry bounded sets (methods, route patterns,
 * providers, check names). Never a user id, lesson id or raw URL — a
 * high-cardinality label can make a metrics store fall over all by itself.
 */
class ApiceMetrics {
  registry = new Registry();

  /** Latency histogram shared by the HTTP middleware in middleware/metrics.ts. */
  httpDuration: Histogram<string>;
  httpRequests: Counter<string>;

  /** Video delivery (Streamplace vs direct) — the platform's core path. */
  videoPlaybackRequests: Counter<string>;
  videoResolveDuration: Histogram<string>;

  /** Live Socket.IO connections, set from socketServer on connect/disconnect. */
  socketConnections: Gauge<string>;

  /** Result of the last /ready probe, so a scraper can alert on readiness. */
  readiness: Gauge<string>;

  constructor() {
    collectDefaultMetrics({
      register: this.registry,
      prefix: "apice_",
    });

    this.httpDuration = new Histogram({
      registers: [this.registry],
      name: "apice_http_request_duration_seconds",
      help: "HTTP request duration in seconds",
      labelNames: ["method", "route", "status"],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    });

    this.httpRequests = new Counter({
      registers: [this.registry],
      name: "apice_http_requests_total",
      help: "HTTP requests processed, excluding probes and /metrics itself",
      labelNames: ["method", "route", "status"],
    });

    this.videoPlaybackRequests = new Counter({
      registers: [this.registry],
      name: "apice_video_playback_requests_total",
      help: "Lesson playback URL resolutions by delivery provider",
      labelNames: ["provider", "outcome"],
    });

    this.videoResolveDuration = new Histogram({
      registers: [this.registry],
      name: "apice_video_resolve_duration_seconds",
      help: "Time spent resolving a playback URL through a provider",
      labelNames: ["provider"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 15],
    });

    this.socketConnections = new Gauge({
      registers: [this.registry],
      name: "apice_socket_connections",
      help: "Currently connected Socket.IO clients",
    });

    this.readiness = new Gauge({
      registers: [this.registry],
      name: "apice_ready",
      help: "1 when the last readiness probe passed, 0 otherwise",
    });
  }
}

export const metrics = new ApiceMetrics();

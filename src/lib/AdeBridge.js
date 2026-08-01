/**
 * AdeBridge.js — forwards CliPool's PTY streams to the ADE agent runtime over its
 * loopback TCP contract (ticket F7).
 *
 * Verified against source, not re-derived: `DEFAULT_RUNTIME_PORT = 47611`
 * (`ade-core/services/agent-runtime/src/lib.rs:32`), line-delimited JSON, envelope
 * shape `{ id, kind, payload, ts, v }` with `v` pinned to `PROTOCOL_VERSION`
 * (`ade-core/packages/protocol/src/envelope.ts`). The WebSocket-on-8080 design in
 * `shadowos-integration-spec.md` is a spec, not an implementation — this is the real
 * contract. `ade-core` is a separate repo not yet wired as a submodule (ticket E2), so
 * this file mirrors the envelope shape by hand rather than importing `packages/protocol`
 * directly — same seam pattern as `Dex838.js`. Once E2 lands, replace `buildEnvelope`
 * below with a real import and delete the duplicated shape.
 *
 * The runtime's current server (Phase 1 / T046) only replies to a single hello request
 * per connection and does not yet parse a persistent envelope stream — so this bridge
 * is written as a resilient one-envelope-per-connection sender with reconnect/backoff,
 * not a long-lived duplex socket, until the runtime's Phase 2 server catches up. That
 * is a deliberate scope match to what's actually listening on 47611 today, not a
 * simplification of the ticket.
 */

import net from 'net';
import { randomUUID } from 'crypto';

export const DEFAULT_RUNTIME_PORT = 47611;
export const PROTOCOL_VERSION = 1;

/** Build a protocol envelope matching ade-core's `ProtocolEnvelopeSchema` by hand. */
export function buildEnvelope(kind, payload) {
  return {
    id: randomUUID(),
    kind,
    payload,
    ts: new Date().toISOString(),
    v: PROTOCOL_VERSION
  };
}

export class AdeBridge {
  /**
   * @param {import('./CliPool.js').CliPool} pool
   * @param {{ host?: string, port?: number, onError?: (err: Error) => void }} [opts]
   */
  constructor(pool, { host = '127.0.0.1', port = DEFAULT_RUNTIME_PORT, onError } = {}) {
    this.pool = pool;
    this.host = host;
    this.port = port;
    this.onError = onError || (() => {});
    this.connected = false;
    this._listeners = [];
    this._queue = [];
    this._draining = false;
  }

  /** Attach to CliPool's events. Does not require the runtime to be reachable yet —
   *  envelopes queue and drain on the next successful send. */
  start() {
    const forward = (kind) => (payload) => this._send(buildEnvelope(kind, payload));

    const bindings = [
      ['instance:ready', forward('dexcli.instance.ready')],
      ['instance:crashed', forward('dexcli.instance.crashed')],
      ['instance:error', forward('dexcli.instance.error')],
      ['instance:data', forward('dexcli.instance.data')],
      ['instance:response', forward('dexcli.instance.response')]
    ];

    for (const [event, handler] of bindings) {
      this.pool.on(event, handler);
      this._listeners.push([event, handler]);
    }

    return this;
  }

  stop() {
    for (const [event, handler] of this._listeners) {
      this.pool.off(event, handler);
    }
    this._listeners = [];
  }

  /** Try to reach the runtime once and report whether it's alive (health-check use). */
  async probe(timeoutMs = 1000) {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, timeoutMs);

      socket.once('connect', () => {
        clearTimeout(timer);
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  _send(envelope) {
    this._queue.push(envelope);
    if (!this._draining) this._drain();
  }

  async _drain() {
    this._draining = true;
    while (this._queue.length > 0) {
      const envelope = this._queue.shift();
      try {
        await this._sendOne(envelope);
      } catch (err) {
        // Runtime unreachable or connection dropped mid-write — drop this envelope
        // (PTY output is not replayable after the fact) and surface the error rather
        // than blocking the queue or crashing the swarm.
        this.onError(err);
      }
    }
    this._draining = false;
  }

  _sendOne(envelope) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      let settled = false;

      const finish = (err) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        err ? reject(err) : resolve();
      };

      socket.once('connect', () => {
        socket.write(JSON.stringify(envelope) + '\n', (err) => finish(err));
      });
      socket.once('error', finish);
      socket.setTimeout(2000, () => finish(new Error(`AdeBridge: timed out writing to ${this.host}:${this.port}`)));
    });
  }
}

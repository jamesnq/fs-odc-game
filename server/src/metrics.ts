import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { Lobby } from './lobby.js';
import type { GameServer } from './socketTypes.js';

export function createMetrics() {
  const lag = monitorEventLoopDelay({ resolution: 20 });
  lag.enable();
  return {
    snapshot(lobby: Lobby, io: GameServer) {
      const result = {
        uptimeSeconds: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        connections: io.engine.clientsCount,
        rooms: lobby.rooms.size,
        identities: lobby.users.size,
        eventLoopMs: { p95: lag.percentile(95) / 1e6, p99: lag.percentile(99) / 1e6, max: lag.max / 1e6 },
      };
      lag.reset();
      return result;
    },
    close() { lag.disable(); },
  };
}

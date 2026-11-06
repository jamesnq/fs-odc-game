# Scalability rollout

## PR 1: single-node performance

- Room state builds the public envelope once, while each user's game view remains private.
- Gameplay/chat no longer cause lobby broadcasts unless summary or presence changed.
- Caro computation uses a bounded worker pool; outdated moves are discarded after state changes.
- `MAX_SPECTATORS_PER_ROOM` defaults to 30 (capacity is player seats + this allowance).
- A structured `runtime.metrics` log every minute reports event-loop delay, memory, sockets and rooms.

No Redis or hosting changes are required for this PR. Limits are protection, not a measured capacity guarantee.

Run `node server/test/load.mjs http://localhost:3001` against a disposable instance.
Set `APP_PASSWORD`, `LOAD_CLIENTS` (default 16), and `LOAD_ROUNDS` as needed.
The default IP limits intentionally constrain a single load generator. Do not disable production limits merely to run a benchmark.
Compare p95/p99 acknowledgments with `runtime.metrics`, outbound traffic and representative drawing/bot workloads.
This smoke load generator is not a production capacity certification.

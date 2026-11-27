# Observability

The server writes logs to stdout and timing spans to a local trace file. SSH-launched hosts also write a server log in their launch directory.

## Local traces and event-loop stalls

Default trace paths (`server.trace.ndjson`):

- Production / explicit `--home-dir` / `A4CODE_HOME`: `<home>/userdata/logs/server.trace.ndjson`
- Linked worktree dev run: `<worktree>/.a4code/userdata/logs/server.trace.ndjson`
- Non-worktree dev run: `~/.a4code/dev/logs/server.trace.ndjson`

Summarize counts, rates, and latency percentiles offline (even while a server is stalled or stopped):

```sh
a4code trace summary --since 30m --limit 40
# Set A4CODE_TRACE_FILE=/path/to/server.trace.ndjson for dev or copied traces
```

Logs emitted inside a span can appear as span events. Event-loop stalls over two seconds are also written to `event-loop-stalls.ndjson` next to the trace. Resource metrics are kept in process.

## Heap snapshots

On macOS and Linux (not Windows), send `SIGUSR2` to the server PID from `server-runtime.json` (in the server's state dir beside `logs/`) to write `<logsDir>/server-<pid>-<timestamp>.heapsnapshot` for Chrome DevTools Memory tab:

```sh
pid="$(jq .pid "${A4CODE_HOME:-$HOME/.a4code}/userdata/server-runtime.json")"
ps -p "$pid" -o command=   # verify it is the a4code server—never signal desktop or launcher
kill -USR2 "$pid"
```

- Writing pauses the server (up to a minute+ on large heaps) and needs roughly as much free RAM as the heap—send once, and avoid on a swapping host.
- Snapshots contain tokens, secrets, and thread content. Never share them publicly, and delete them manually when finished.

import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Database from "better-sqlite3"
import { AgentPiStore, canonicalizeSql } from "../src/store.js"

const stores: AgentPiStore[] = []
const directories: string[] = []

function databasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "claqueta-v2-"))
  directories.push(directory)
  return join(directory, "store.db")
}

function createMinimalV1Fixture(path: string) {
  const database = new Database(path)
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
    INSERT INTO schema_migrations(version) VALUES (1);
    CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, status TEXT NOT NULL DEFAULT 'idle', pi_session_id TEXT, pi_session_file TEXT, checkpoint_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE artifacts (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL, path TEXT, data_json TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
    CREATE INDEX idx_artifacts_thread_kind ON artifacts(thread_id, kind, version);
    CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
    CREATE INDEX idx_events_thread_seq ON events(thread_id, seq);
    CREATE TABLE pipeline_plans (thread_id TEXT PRIMARY KEY, plan_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
    CREATE TABLE pi_sessions (thread_id TEXT PRIMARY KEY, pi_session_id TEXT NOT NULL, pi_session_file TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
    CREATE TABLE action_attempts (schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1), action_key TEXT NOT NULL CHECK(length(trim(action_key)) > 0), thread_id TEXT NOT NULL, plan_id TEXT NOT NULL CHECK(length(trim(plan_id)) > 0), mode TEXT NOT NULL CHECK(mode IN ('new_video', 'revise_existing', 'render_only', 'recover_failed_render', 'audit_only', 'variant', 'asset_regeneration', 'question')), action TEXT NOT NULL CHECK(length(trim(action)) > 0), input_fingerprint TEXT NOT NULL CHECK(length(trim(input_fingerprint)) > 0), status TEXT NOT NULL CHECK(status IN ('started', 'succeeded', 'failed')), outcome_json TEXT, error_json TEXT, attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count > 0), started_at TEXT NOT NULL, finished_at TEXT, updated_at TEXT NOT NULL, artifact_metadata_json TEXT, effect_metadata_json TEXT, PRIMARY KEY(thread_id, action_key), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
    CREATE INDEX idx_action_attempts_thread_updated ON action_attempts(thread_id, updated_at DESC);
    CREATE INDEX idx_action_attempts_thread_status ON action_attempts(thread_id, status, updated_at DESC);
    INSERT INTO threads(id, title) VALUES ('rollback-migration-thread', 'Rollback fixture');
    INSERT INTO events(thread_id, type, payload_json) VALUES ('rollback-migration-thread', 'agent_end', '{}');
    CREATE TABLE event_dependents (event_id INTEGER NOT NULL, FOREIGN KEY(event_id) REFERENCES events(seq));
    INSERT INTO event_dependents(event_id) VALUES (1);
  `)
  return database
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe("store schema v2 migration", () => {
  it("creates markers {1, 2}, counters, triggers, and an empty outbox", () => {
    const store = new AgentPiStore(":memory:")
    stores.push(store)
    assert.deepEqual(store.db.prepare("SELECT version FROM schema_migrations ORDER BY version").all(), [
      { version: 1 },
      { version: 2 },
    ])
    assert.equal((store.db.prepare("SELECT COUNT(*) AS count FROM event_outbox").get() as { count: number }).count, 0)
    assert.equal(
      (
        store.db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger'").get() as {
          count: number
        }
      ).count,
      5,
    )
  })

  it("backfills a v1 fixture with local sequences and delivered historical outbox rows", () => {
    const path = databasePath()
    const database = new Database(path)
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
      INSERT INTO schema_migrations(version) VALUES (1);
      CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT, status TEXT NOT NULL DEFAULT 'idle', pi_session_id TEXT, pi_session_file TEXT, checkpoint_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE artifacts (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL, path TEXT, data_json TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE INDEX idx_artifacts_thread_kind ON artifacts(thread_id, kind, version);
      CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE INDEX idx_events_thread_seq ON events(thread_id, seq);
      CREATE TABLE pipeline_plans (thread_id TEXT PRIMARY KEY, plan_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE TABLE pi_sessions (thread_id TEXT PRIMARY KEY, pi_session_id TEXT NOT NULL, pi_session_file TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE TABLE action_attempts (schema_version INTEGER NOT NULL DEFAULT 1 CHECK(schema_version = 1), action_key TEXT NOT NULL CHECK(length(trim(action_key)) > 0), thread_id TEXT NOT NULL, plan_id TEXT NOT NULL CHECK(length(trim(plan_id)) > 0), mode TEXT NOT NULL CHECK(mode IN ('new_video', 'revise_existing', 'render_only', 'recover_failed_render', 'audit_only', 'variant', 'asset_regeneration', 'question')), action TEXT NOT NULL CHECK(length(trim(action)) > 0), input_fingerprint TEXT NOT NULL CHECK(length(trim(input_fingerprint)) > 0), status TEXT NOT NULL CHECK(status IN ('started', 'succeeded', 'failed')), outcome_json TEXT, error_json TEXT, attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count > 0), started_at TEXT NOT NULL, finished_at TEXT, updated_at TEXT NOT NULL, artifact_metadata_json TEXT, effect_metadata_json TEXT, PRIMARY KEY(thread_id, action_key), FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE);
      CREATE INDEX idx_action_attempts_thread_updated ON action_attempts(thread_id, updated_at DESC);
      CREATE INDEX idx_action_attempts_thread_status ON action_attempts(thread_id, status, updated_at DESC);
      INSERT INTO threads(id, title, pi_session_id, pi_session_file, checkpoint_json, created_at, updated_at)
        VALUES ('with-events', 'Populated', 'session-1', '/tmp/session-1', '{"id":"cp-1"}', '2026-07-01', '2026-07-02'), ('without-events', 'Empty', NULL, NULL, NULL, '2026-07-01', '2026-07-02');
      INSERT INTO artifacts(id, thread_id, kind, version, path, data_json, approved, created_at)
        VALUES ('artifact-1', 'with-events', 'script', 1, 'script.json', '{"title":"Original"}', 1, '2026-07-01');
      INSERT INTO pipeline_plans(thread_id, plan_json, created_at, updated_at)
        VALUES ('with-events', '{"id":"plan-1","threadId":"with-events","steps":[]}', '2026-07-01', '2026-07-02');
      INSERT INTO pi_sessions(thread_id, pi_session_id, pi_session_file, created_at, updated_at)
        VALUES ('with-events', 'session-1', '/tmp/session-1', '2026-07-01', '2026-07-02');
      INSERT INTO action_attempts(schema_version, action_key, thread_id, plan_id, mode, action, input_fingerprint, status, outcome_json, attempt_count, started_at, finished_at, updated_at, artifact_metadata_json, effect_metadata_json)
        VALUES (1, 'action-1', 'with-events', 'plan-1', 'new_video', 'run_copywriter', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'succeeded', '{"ok":true}', 1, '2026-07-01', '2026-07-02', '2026-07-02', '{"artifactId":"artifact-1"}', NULL);
      INSERT INTO events(thread_id, type, payload_json, created_at) VALUES ('with-events', 'message_delta', '{"n":1}', '2026-07-01'), ('with-events', 'agent_end', '{"n":2}', '2026-07-02');
    `)
    const preservedBefore = {
      threads: database.prepare("SELECT * FROM threads ORDER BY id").all(),
      artifacts: database.prepare("SELECT * FROM artifacts ORDER BY id").all(),
      plans: database.prepare("SELECT * FROM pipeline_plans ORDER BY thread_id").all(),
      sessions: database.prepare("SELECT * FROM pi_sessions ORDER BY thread_id").all(),
      actions: database.prepare("SELECT * FROM action_attempts ORDER BY action_key").all(),
      events: database.prepare("SELECT * FROM events ORDER BY seq").all(),
    }
    database.close()
    const store = new AgentPiStore(path)
    stores.push(store)
    assert.equal(store.getThread("with-events")?.revision, 2)
    assert.equal(store.getThread("with-events")?.lastEventSeq, 2)
    assert.equal(store.getThread("without-events")?.revision, 0)
    assert.deepEqual(
      store.db
        .prepare(
          "SELECT id, title, pi_session_id, pi_session_file, checkpoint_json, created_at, updated_at FROM threads ORDER BY id",
        )
        .all(),
      (preservedBefore.threads as Array<Record<string, unknown>>).map(
        ({ id, title, pi_session_id, pi_session_file, checkpoint_json, created_at, updated_at }) => ({
          id,
          title,
          pi_session_id,
          pi_session_file,
          checkpoint_json,
          created_at,
          updated_at,
        }),
      ),
    )
    assert.deepEqual(store.db.prepare("SELECT * FROM artifacts ORDER BY id").all(), preservedBefore.artifacts)
    assert.deepEqual(store.db.prepare("SELECT * FROM pipeline_plans ORDER BY thread_id").all(), preservedBefore.plans)
    assert.deepEqual(store.db.prepare("SELECT * FROM pi_sessions ORDER BY thread_id").all(), preservedBefore.sessions)
    assert.deepEqual(
      store.db.prepare("SELECT * FROM action_attempts ORDER BY action_key").all(),
      preservedBefore.actions,
    )
    assert.deepEqual(
      store.listEvents("with-events").map((event) => event.seq),
      [1, 2],
    )
    assert.equal(
      (
        store.db.prepare("SELECT COUNT(*) AS count FROM event_outbox WHERE delivered_at IS NOT NULL").get() as {
          count: number
        }
      ).count,
      2,
    )
  })

  it("rejects unexpected destructive triggers on every protected event path", () => {
    for (const [name, sql] of [
      [
        "attack_events_delete_outbox",
        "CREATE TRIGGER attack_events_delete_outbox AFTER INSERT ON events BEGIN DELETE FROM event_outbox WHERE event_id = NEW.event_id; END",
      ],
      [
        "attack_outbox_mutate_event",
        "CREATE TRIGGER attack_outbox_mutate_event AFTER INSERT ON event_outbox BEGIN UPDATE events SET payload_json = '{\\\"tampered\\\":true}' WHERE event_id = NEW.event_id; END",
      ],
    ] as const) {
      const path = databasePath()
      const initial = new AgentPiStore(path)
      initial.createThread({ id: `trigger-${name}` })
      initial.close()
      const database = new Database(path)
      database.exec(sql)
      database.close()
      assert.throws(() => new AgentPiStore(path), /Unexpected trigger|Incompatible trigger/i)
    }
  })

  it("rejects SQL changes inside literals and preserves escaped literal bytes", () => {
    assert.notEqual(
      canonicalizeSql("CREATE TABLE x (status TEXT CHECK(status = 'started'))"),
      canonicalizeSql("create table x(status text check(status='STARTED'))"),
    )
    assert.equal(
      canonicalizeSql("CREATE TABLE x (value TEXT CHECK(value = 'it''s ready'))"),
      canonicalizeSql("create   table x(value text check(value='it''s ready'))"),
    )

    for (const literal of ["'STARTED'"]) {
      const path = databasePath()
      const initial = new AgentPiStore(path)
      initial.createThread({ id: "literal-tamper-thread" })
      initial.close()
      const database = new Database(path)
      const actionTable = database
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'action_attempts'")
        .get() as {
        sql: string
      }
      database.exec("DROP TABLE action_attempts")
      database.exec(actionTable.sql.replace("'started'", literal))
      database.exec(
        "CREATE INDEX idx_action_attempts_thread_updated ON action_attempts(thread_id, updated_at DESC); CREATE INDEX idx_action_attempts_thread_status ON action_attempts(thread_id, status, updated_at DESC)",
      )
      database.close()
      assert.throws(() => new AgentPiStore(path), /incompatible schema/i)
    }
  })

  it("rejects same-name trigger and index replacements instead of trusting object names", () => {
    for (const tamper of [
      "DROP TRIGGER trg_events_outbox; CREATE TRIGGER trg_events_outbox AFTER INSERT ON events BEGIN SELECT 1; END",
      "DROP INDEX idx_events_thread_seq; CREATE INDEX idx_events_thread_seq ON events(thread_id, event_id)",
    ]) {
      const path = databasePath()
      const initial = new AgentPiStore(path)
      initial.createThread({ id: "tamper-thread" })
      initial.close()
      const database = new Database(path)
      database.exec(tamper)
      database.close()
      assert.throws(() => new AgentPiStore(path), /Incompatible (trigger|index) definition|columns/i)
    }
  })

  it("rejects altered event primary key and foreign-key delete action", () => {
    const path = databasePath()
    const initial = new AgentPiStore(path)
    initial.createThread({ id: "tamper-pk-fk-thread" })
    initial.close()
    const database = new Database(path)
    database.exec(`
      DROP TRIGGER trg_events_outbox;
      DROP TRIGGER trg_events_revision_current;
      DROP TRIGGER trg_events_thread_seq_current;
      DROP INDEX idx_events_thread_seq;
      DROP TABLE event_outbox;
      DROP TABLE events;
      CREATE TABLE events (event_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, thread_seq INTEGER NOT NULL, revision INTEGER NOT NULL, type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE SET NULL);
    `)
    database.close()
    assert.throws(() => new AgentPiStore(path), /Incompatible table definition: events/)
  })

  it("rolls back every v2 migration step after a mid-migration failure", () => {
    const path = databasePath()
    const database = createMinimalV1Fixture(path)
    database.close()

    assert.throws(() => new AgentPiStore(path), /foreign key|event_dependents|constraint/i)

    const afterFailure = new Database(path)
    try {
      assert.deepEqual(afterFailure.prepare("SELECT version FROM schema_migrations ORDER BY version").all(), [
        { version: 1 },
      ])
      assert.deepEqual(
        afterFailure
          .prepare("PRAGMA table_info(threads)")
          .all()
          .map((row) => (row as { name: string }).name),
        ["id", "title", "status", "pi_session_id", "pi_session_file", "checkpoint_json", "created_at", "updated_at"],
      )
      assert.deepEqual(
        afterFailure
          .prepare("PRAGMA table_info(events)")
          .all()
          .map((row) => (row as { name: string }).name),
        ["seq", "thread_id", "type", "payload_json", "created_at"],
      )
      assert.equal(
        afterFailure.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'event_outbox'").get(),
        undefined,
      )
      assert.equal(
        (afterFailure.prepare("SELECT payload_json FROM events WHERE seq = 1").get() as { payload_json: string })
          .payload_json,
        "{}",
      )
    } finally {
      afterFailure.close()
    }
  })

  it("rejects corrupt v2 JSON and leaves no partial migration state", () => {
    const path = databasePath()
    const store = new AgentPiStore(path)
    stores.push(store)
    store.createThread({ id: "corrupt" })
    store.appendEvent({ threadId: "corrupt", type: "error", payload: {} })
    store.db.pragma("ignore_check_constraints = ON")
    store.db.prepare("UPDATE events SET payload_json = ? WHERE thread_id = ?").run("{", "corrupt")
    store.close()
    stores.splice(stores.indexOf(store), 1)
    assert.throws(() => new AgentPiStore(path), /corrupt/i)
  })
})

// Existing nova_state JSONB is preserved. Responses wait for durable commits.
const fs = require("node:fs");
const path = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");
class Store {
  constructor({ file, seed, pool }) {
    this.file = file;
    this.seed = seed;
    this.pool = pool;
    this.context = new AsyncLocalStorage();
    this.queue = Promise.resolve();
  }
  async init() {
    if (this.pool) {
      await this.pool.query(
        "CREATE TABLE IF NOT EXISTS nova_state (id smallint PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())",
      );
      const found = await this.pool.query(
        "SELECT id FROM nova_state WHERE id=1",
      );
      if (!found.rowCount)
        await this.pool.query(
          "INSERT INTO nova_state(id,data) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING",
          [JSON.stringify(this.initial())],
        );
    } else {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      if (!fs.existsSync(this.file)) this.atomicWrite(this.seed);
      this.validate(JSON.parse(fs.readFileSync(this.file, "utf8")));
    }
  }
  initial() {
    return fs.existsSync(this.file)
      ? this.validate(JSON.parse(fs.readFileSync(this.file, "utf8")))
      : this.seed;
  }
  validate(s) {
    if (
      !s ||
      !s.settings ||
      !Array.isArray(s.products) ||
      !Array.isArray(s.orders)
    )
      throw Error("Invalid store data; refusing to replace it");
    return s;
  }
  atomicWrite(s) {
    const tmp = this.file + ".tmp";
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(s, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.file);
  }
  read() {
    return this.context.getStore().state;
  }
  write(s) {
    const c = this.context.getStore();
    if (!c.writable) throw Error("Read-only request");
    c.state = this.validate(s);
    c.dirty = true;
  }
  afterCommit(fn) {
    this.context.getStore().effects.push(fn);
  }
  async run(writable, fn) {
    const execute = async () => {
      const client = this.pool ? await this.pool.connect() : null;
      try {
        if (client) await client.query(writable ? "BEGIN" : "BEGIN READ ONLY");
        const state = client
          ? (
              await client.query(
                "SELECT data FROM nova_state WHERE id=1" +
                  (writable ? " FOR UPDATE" : ""),
              )
            ).rows[0]?.data
          : JSON.parse(fs.readFileSync(this.file, "utf8"));
        const ctx = {
          state: this.validate(state),
          writable,
          dirty: false,
          effects: [],
        };
        const result = await this.context.run(ctx, fn);
        if (ctx.dirty) {
          if (client)
            await client.query(
              "UPDATE nova_state SET data=$1::jsonb, updated_at=now() WHERE id=1",
              [JSON.stringify(ctx.state)],
            );
          else this.atomicWrite(ctx.state);
        }
        if (client) await client.query("COMMIT");
        for (const effect of ctx.effects)
          Promise.resolve()
            .then(effect)
            .catch(() => console.error("Post-commit notification failed"));
        return result;
      } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client?.release();
      }
    };
    if (this.pool) return execute();
    const result = this.queue.then(execute);
    this.queue = result.catch(() => {});
    return result;
  }
  async close() {
    await this.queue;
    await this.pool?.end();
  }
}
module.exports = Store;

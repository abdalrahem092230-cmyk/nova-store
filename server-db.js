// Production keeps Neon as the primary store; no local fallback on missing credentials.
if (!process.env.NEON_DATABASE_URL && process.env.NOVA_PREVIEW !== "true") {
  console.error(
    "NEON_DATABASE_URL is missing. Refusing to start without the primary Neon database.",
  );
  process.exit(1);
}
require("./server");

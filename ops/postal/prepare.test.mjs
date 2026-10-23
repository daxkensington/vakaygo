import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { prepareRuntime } from "./prepare.mjs";

const script = fileURLToPath(new URL("./prepare.mjs", import.meta.url));
const compose = fileURLToPath(new URL("./compose.yaml", import.meta.url));
const temporary = () => mkdtempSync(path.join(os.tmpdir(), "vakaygo-postal-offline-"));
const read = (root, name) => readFileSync(path.join(root, name), "utf8");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const cli = (args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", timeout: 30_000 });

test("offline fixture generates distinct RSA2048 keys and one consistent database secret", (t) => {
  const directory = temporary();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "runtime");
  const result = prepareRuntime(output, { fixture: true, adminIp: "192.0.2.10" });
  assert.deepEqual(result, {
    prepared: true,
    files: ["database-password", "Caddyfile", "config/postal.yml", "config/signing.key", "config/vakaygo-dkim.key"],
    servicesStarted: false,
    deliveryEnabled: false,
  });
  const password = read(output, "database-password").trim();
  const config = read(output, "config/postal.yml");
  assert.ok(/^[a-f0-9]{96}$/.test(password), "database password must be a random 48-byte hexadecimal secret");
  const configured = [...config.matchAll(/^  password: '([^']+)'$/gm)].map((match) => match[1]);
  assert.equal(configured.length, 2);
  // Boolean assertions deliberately prevent a failing test from printing a secret.
  assert.ok(configured.every((value) => value === password), "both database sections must reuse the password file");
  const keys = ["config/signing.key", "config/vakaygo-dkim.key"].map((name) => createPrivateKey(read(output, name)));
  for (const key of keys) {
    assert.equal(key.asymmetricKeyType, "rsa");
    assert.equal(key.asymmetricKeyDetails.modulusLength, 2048);
  }
  const publicFingerprints = keys.map((key) => digest(createPublicKey(key).export({ type: "spki", format: "der" })));
  assert.notEqual(publicFingerprints[0], publicFingerprints[1]);
  const proxy = read(output, "Caddyfile");
  assert.match(proxy, /not remote_ip 192\.0\.2\.10\/32/);
  assert.match(proxy, /not method POST/);
  assert.match(proxy, /reverse_proxy 127\.0\.0\.1:5000/);
  assert.match(config, /default_bind_address: 127\.0\.0\.1/);
});

test("a second preparation refuses to overwrite any existing runtime content", (t) => {
  const directory = temporary();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "runtime");
  const result = prepareRuntime(output, { fixture: true });
  const before = result.files.map((name) => digest(read(output, name)));
  assert.throws(() => prepareRuntime(output, { fixture: true }), /already exists; refusing to replace/);
  assert.deepEqual(result.files.map((name) => digest(read(output, name))), before);
});

test("production preparation rejects a noncanonical destination before filesystem writes", (t) => {
  const directory = temporary();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "runtime");
  assert.throws(() => prepareRuntime(output), /Production preparation requires root on the dedicated Linux host/);
  assert.equal(existsSync(output), false);
});

test("Windows production preparation is blocked even with a root-like identity", () => {
  const code = `
    import { prepareRuntime } from ${JSON.stringify(new URL("./prepare.mjs", import.meta.url).href)};
    Object.defineProperty(process, "platform", { value: "win32" });
    Object.defineProperty(process, "getuid", { value: () => 0 });
    if (process.platform !== "win32") throw new Error("Platform fixture failed");
    try { prepareRuntime("/opt/vakaygo-postal/runtime"); }
    catch (error) {
      if (!/Production preparation requires/.test(error.message)) throw new Error("Unexpected preparation rejection");
      process.exit(0);
    }
    throw new Error("Production preparation was not blocked");
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", code], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, "Windows guard subprocess must reject preparation");
  assert.equal(result.stdout, "");
});

test("invalid administrator addresses are rejected without creating a runtime", (t) => {
  const directory = temporary();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [index, adminIp] of ["0.0.0.0", "127.0.0.1/32", "::1", "example.com", "256.0.0.1", "192.0.2.1\nrespond 200", ""].entries()) {
    const output = path.join(directory, `invalid-${index}`);
    assert.throws(() => prepareRuntime(output, { fixture: true, adminIp }), /explicit administrator IPv4 address/);
    assert.equal(existsSync(output), false);
  }
  assert.deepEqual(readdirSync(directory), []);
});

test("CLI rejects missing output and unknown options without writing files", (t) => {
  const directory = temporary();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "runtime");
  assert.equal(cli([]).status, 1);
  const result = cli([output, "--fixture", "--enable-delivery"]);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unknown preparation option/);
  assert.equal(existsSync(output), false);
});

test("CLI reports metadata only, never generated secrets or private keys", (t) => {
  const directory = temporary();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = path.join(directory, "runtime");
  const result = cli([output, "--fixture"]);
  assert.equal(result.status, 0, "offline CLI fixture must succeed");
  assert.equal(result.stderr, "");
  const metadata = JSON.parse(result.stdout);
  assert.equal(metadata.servicesStarted, false);
  assert.equal(metadata.deliveryEnabled, false);
  const config = read(output, "config/postal.yml");
  const railsSecret = config.match(/^  secret_key: '([^']+)'$/m)?.[1];
  assert.ok(railsSecret && !result.stdout.includes(railsSecret), "Rails secret must not appear in output");
  assert.ok(!result.stdout.includes(read(output, "database-password").trim()), "database secret must not appear in output");
  assert.ok(!result.stdout.includes("PRIVATE KEY"), "private key material must not appear in output");
});

test("Compose enables only the database by default and requires explicit service profiles", (t) => {
  const version = spawnSync("docker", ["compose", "version"], { encoding: "utf8", timeout: 15_000 });
  if (version.status !== 0) return t.skip("Docker Compose is unavailable; configuration validation requires its CLI");
  const directory = temporary();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const fixtureCompose = path.join(directory, "compose.yaml");
  copyFileSync(compose, fixtureCompose);
  prepareRuntime(path.join(directory, "runtime"), { fixture: true });
  const configured = (profiles) => {
    const args = ["compose", "--file", fixtureCompose];
    for (const profile of profiles) args.push("--profile", profile);
    const result = spawnSync("docker", [...args, "config", "--format", "json"], {
      encoding: "utf8", timeout: 20_000,
      env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^COMPOSE_/i.test(name))),
    });
    assert.equal(result.status, 0, "Compose configuration must validate without starting containers");
    return JSON.parse(result.stdout);
  };
  assert.deepEqual(Object.keys(configured([]).services), ["database"]);
  assert.deepEqual(Object.keys(configured(["control"]).services).sort(), ["database", "proxy", "web"]);
  assert.deepEqual(Object.keys(configured(["delivery"]).services).sort(), ["database", "smtp", "worker"]);
  assert.deepEqual(Object.keys(configured(["tools"]).services).sort(), ["database", "runner"]);
  const all = configured(["control", "delivery", "tools"]);
  for (const [name, service] of Object.entries(all.services)) {
    assert.match(service.image, /@sha256:[a-f0-9]{64}$/);
    if (name !== "database") assert.equal(service.network_mode, "host");
  }
  assert.equal(all.services.database.ports[0].host_ip, "127.0.0.1");
  assert.equal(all.services.database.environment.MARIADB_ROOT_PASSWORD_FILE, "/run/secrets/database_password");
});

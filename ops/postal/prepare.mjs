import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, chownSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";

// Offline configuration only: no services, DNS, accounts or mail are created.
export function prepareRuntime(output, { fixture = false, adminIp = "127.0.0.1" } = {}) {
  const target = path.resolve(output);
  if (!fixture && (process.platform !== "linux" || process.getuid?.() !== 0 || target !== "/opt/vakaygo-postal/runtime")) throw new Error("Production preparation requires root on the dedicated Linux host at /opt/vakaygo-postal/runtime");
  if (isIP(adminIp) !== 4 || adminIp === "0.0.0.0") throw new Error("Use one explicit administrator IPv4 address; CIDR ranges are not accepted");
  if (existsSync(target)) throw new Error("Runtime already exists; refusing to replace configuration or keys");
  mkdirSync(target, { recursive: true, mode: 0o710 });
  const config = path.join(target, "config");
  mkdirSync(config, { mode: 0o700 });
  const save = (name, value, postalOwned = false) => {
    const filename = path.join(target, name);
    writeFileSync(filename, value, { flag: "wx", mode: 0o600 });
    if (process.platform === "linux" && process.getuid?.() === 0 && postalOwned) chownSync(filename, 999, 999);
  };
  const databasePassword = randomBytes(48).toString("hex");
  save("database-password", `${databasePassword}\n`);
  const rsa = () => generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs1", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey;
  save("config/signing.key", rsa(), true);
  save("config/vakaygo-dkim.key", rsa(), true);
  save("config/postal.yml", `version: 2
postal:
  web_hostname: postal.vakaygo.com
  web_protocol: https
  smtp_hostname: postal.vakaygo.com
web_server:
  default_bind_address: 127.0.0.1
  default_port: 5000
main_db:
  host: 127.0.0.1
  username: root
  password: '${databasePassword}'
  database: postal
message_db:
  host: 127.0.0.1
  username: root
  password: '${databasePassword}'
  prefix: postal
worker:
  threads: 2
  default_health_server_bind_address: 127.0.0.1
smtp_server:
  default_bind_address: 0.0.0.0
  default_health_server_bind_address: 127.0.0.1
dns:
  mx_records:
    - postal.vakaygo.com
  spf_include: spf.postal.vakaygo.com
  return_path_domain: rp.postal.vakaygo.com
  route_domain: routes.postal.vakaygo.com
  track_domain: track.postal.vakaygo.com
rails:
  secret_key: '${randomBytes(128).toString("hex")}'
# Management notifications are unconfigured until a reviewed local credential exists.
# This is not the existing support inbox SMTP.
smtp:
  host: 127.0.0.1
  port: 2525
  from_name: VakayGo mail operations
  from_address: postmaster@vakaygo.com
`, true);
  save("Caddyfile", `postal.vakaygo.com {
  request_body {
    max_size 512KB
  }
  @blockedAdmin {
    not path /api/v1/send/message /api/v1/messages/message
    not remote_ip ${adminIp}/32
  }
  respond @blockedAdmin 403
  @wrongApiMethod {
    path /api/v1/send/message /api/v1/messages/message
    not method POST
  }
  respond @wrongApiMethod 405
  reverse_proxy 127.0.0.1:5000
}
`);
  // Caddy runs as root in the pinned upstream image. Postal runs as uid999.
  if (process.platform === "linux" && process.getuid?.() === 0) {
    chownSync(target, 0, 999);
    chownSync(config, 999, 999);
    chmodSync(target, 0o710);
    chmodSync(config, 0o700);
  }
  return { prepared: true, files: ["database-password", "Caddyfile", "config/postal.yml", "config/signing.key", "config/vakaygo-dkim.key"], servicesStarted: false, deliveryEnabled: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const output = args[0];
    if (!output) throw new Error("Usage: node prepare.mjs /opt/vakaygo-postal/runtime [--admin-ip=<IPv4>] [--fixture]");
    const unknown = args.slice(1).find(arg => arg !== "--fixture" && !arg.startsWith("--admin-ip="));
    if (unknown) throw new Error("Unknown preparation option");
    const adminIp = args.find(arg => arg.startsWith("--admin-ip="))?.slice(11) || "127.0.0.1";
    console.log(JSON.stringify(prepareRuntime(output, { fixture: args.includes("--fixture"), adminIp })));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Preparation failed");
    process.exitCode = 1;
  }
}

#!/usr/bin/env node
/**
 * caranguejo — command-line client for the Caranguejo Developer API.
 * Built on @caranguejo/sdk. See `caranguejo help`.
 */
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { createInterface } from "node:readline";
import { CaranguejoClient, CaranguejoApiError } from "@caranguejo/sdk";
import type { ImageGenerationParams, GenerateParams, Generation } from "@caranguejo/sdk";
import { readConfig, writeConfig, clearConfig, configPath, resolveApiKey, resolveBaseUrl } from "./config.js";
import { c, info, fail, printJson, setColor } from "./ui.js";

const VERSION = "1.0.0";

// ── tiny flag parser ──────────────────────────────────────────────────────
interface Parsed {
  _: string[];
  flags: Record<string, string | boolean>;
}
function parse(argv: string[]): Parsed {
  const _: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      _.push(a);
    }
  }
  return { _, flags };
}
function str(v: string | boolean | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function multi(flags: Record<string, string | boolean>, key: string, argv: string[]): string[] {
  // collect every occurrence of --key <value>
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${key}` && typeof argv[i + 1] === "string" && !argv[i + 1]!.startsWith("--")) {
      out.push(argv[i + 1]!);
    }
  }
  if (out.length === 0 && typeof flags[key] === "string") out.push(flags[key] as string);
  return out;
}

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", heic: "image/heic", svg: "image/svg+xml",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
};
function mimeFor(file: string): string {
  return MIME[extname(file).slice(1).toLowerCase()] ?? "application/octet-stream";
}

function client(): CaranguejoClient {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    fail("not logged in. Run `caranguejo auth login` or set CARANGUEJO_API_KEY.");
  }
  return new CaranguejoClient({ apiKey, baseUrl: resolveBaseUrl() });
}

function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

const HELP = `${c.bold("caranguejo")} — Caranguejo Developer API CLI  ${c.dim("v" + VERSION)}

${c.bold("USAGE")}
  caranguejo <command> [options]

${c.bold("AUTH")}
  auth login [--key <ck_live_…>] [--base-url <url>]   Store your API key
  auth status                                         Show the active account/key
  auth logout                                         Remove the stored key

${c.bold("GENERATE")}
  generate <model-slug> [options]                     Any model or tool (image/video/tool)
      --prompt <text>
      --image <url-or-path>        (repeatable — references / tool source; auto-uploads)
      --start-frame <url-or-path>  (image→video first frame)
      --end-frame <url-or-path>    (video last frame)
      --audio <url-or-path>
      --aspect <1:1|16:9|9:16|…>   --duration <seconds>
      --quality <…>                --resolution <…>
      --param key=value            (repeatable — model-specific params)
      --webhook <https-url>        --wait   Block until the job finishes
  generate image --prompt <text> [--quality --resolution --size …]   Image shortcut

${c.bold("FILES & DATA")}
  upload <file>                                       Host a file, print its URL
  models list [--type image|video|audio|tool]         List models & tools
  models get <slug>                                   Model capabilities
  generations list [--limit N] [--cursor C]           Your API generations
  generations get <id>                                One generation
  balance                                             Credit balance

${c.bold("GLOBAL")}
  --json          Machine-readable JSON output
  --no-color      Disable ANSI colours
  --base-url <u>  Override the API base URL
  version | --version | help | --help

Docs: ${c.cyan("https://docs.caranguejo.art")}`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { _, flags } = parse(argv);
  if (flags["no-color"]) setColor(false);
  const json = flags.json === true;

  if (_.length === 0 || flags.help || _[0] === "help") { info(HELP); return; }
  if (flags.version || _[0] === "version") { process.stdout.write(VERSION + "\n"); return; }

  const [cmd, sub, ...rest] = _;

  try {
    switch (cmd) {
      case "auth":
        await auth(sub, flags, json);
        return;
      case "models":
        await models(sub, rest, flags, json);
        return;
      case "upload":
        await doUpload(sub, json);
        return;
      case "generate":
        await generate(sub, argv, flags, json);
        return;
      case "generations":
        await generations(sub, rest, flags, json);
        return;
      case "balance": {
        const b = await client().getBalance();
        json ? printJson(b) : info(`${c.bold(String(b.credits))} credits`);
        return;
      }
      default:
        fail(`unknown command '${cmd}'. Run \`caranguejo help\`.`);
    }
  } catch (e) {
    if (e instanceof CaranguejoApiError) {
      const err = e as CaranguejoApiError;
      if (json) { printJson({ success: false, error: { code: err.code, message: err.message } }); process.exit(1); }
      fail(`${err.code}: ${err.message}`);
    }
    fail((e as Error).message);
  }
}

async function auth(sub: string | undefined, flags: Parsed["flags"], json: boolean): Promise<void> {
  if (sub === "login") {
    let key = str(flags.key) ?? process.env.CARANGUEJO_API_KEY;
    if (!key) key = await prompt("Paste your API key (ck_live_…): ");
    if (!key || !key.startsWith("ck_")) fail("that doesn't look like a Caranguejo key (expected ck_live_…).");
    const cfg = readConfig();
    cfg.apiKey = key;
    if (str(flags["base-url"])) cfg.baseUrl = str(flags["base-url"]);
    writeConfig(cfg);
    // verify
    try {
      const b = await new CaranguejoClient({ apiKey: key, baseUrl: cfg.baseUrl }).getBalance();
      json ? printJson({ ok: true, credits: b.credits }) : info(c.green("✓ ") + `logged in — ${b.credits} credits. Saved to ${configPath()}`);
    } catch (e) {
      info(c.yellow("saved, but the key could not be verified: ") + (e as Error).message);
    }
    return;
  }
  if (sub === "status") {
    const key = resolveApiKey();
    if (!key) { json ? printJson({ loggedIn: false }) : info("not logged in."); return; }
    const masked = key.slice(0, 12) + "…";
    try {
      const b = await client().getBalance();
      json ? printJson({ loggedIn: true, key: masked, credits: b.credits, baseUrl: resolveBaseUrl() })
           : info(`${c.green("logged in")} — key ${masked}, ${b.credits} credits`);
    } catch (e) {
      json ? printJson({ loggedIn: true, key: masked, error: (e as Error).message })
           : info(`key ${masked} stored, but: ${(e as Error).message}`);
    }
    return;
  }
  if (sub === "logout") { clearConfig(); info(c.green("✓ ") + "logged out."); return; }
  fail("usage: caranguejo auth <login|status|logout>");
}

async function models(sub: string | undefined, rest: string[], flags: Parsed["flags"], json: boolean): Promise<void> {
  const cl = client();
  if (sub === "get") {
    const slug = rest[0];
    if (!slug) fail("usage: caranguejo models get <slug>");
    const m = await cl.getModel(slug);
    json ? printJson(m) : printModel(m);
    return;
  }
  // default: list (optionally filtered by --type image|video|audio|tool)
  const list = await cl.listModels(str(flags.type));
  if (json) { printJson(list); return; }
  for (const m of list) info(`${c.bold(m.model)}  ${c.dim(m.type)}  — ${m.name}`);
}

function printModel(m: { model: string; name: string; type: string; fields: { name: string; required: boolean; type: string; default: unknown; options: string[] | null }[] }): void {
  info(`${c.bold(m.model)} — ${m.name} (${m.type})`);
  for (const f of m.fields) {
    const req = f.required ? c.red("required") : c.dim("optional");
    const opts = f.options?.length ? ` [${f.options.join(", ")}]` : "";
    const def = f.default != null ? c.dim(` = ${JSON.stringify(f.default)}`) : "";
    info(`  ${f.name} ${c.dim("(" + f.type + ")")} ${req}${opts}${def}`);
  }
}

async function doUpload(file: string | undefined, json: boolean): Promise<void> {
  if (!file) fail("usage: caranguejo upload <file>");
  let data: Buffer;
  try { data = readFileSync(file); } catch { fail(`cannot read file: ${file}`); }
  const up = await client().upload({ data: data!, filename: basename(file), contentType: mimeFor(file) });
  json ? printJson(up) : process.stdout.write(up.url + "\n");
}

/** Resolve a --flag value that may be a URL or a local file (auto-uploaded). */
async function resolveMedia(cl: CaranguejoClient, ref: string): Promise<string> {
  if (/^https?:\/\//i.test(ref)) return ref;
  info(c.dim(`uploading ${ref}…`));
  const data = readFileSync(ref);
  const up = await cl.upload({ data, filename: basename(ref), contentType: mimeFor(ref) });
  return up.url;
}

async function generate(sub: string | undefined, argv: string[], flags: Parsed["flags"], json: boolean): Promise<void> {
  if (!sub) fail("usage: caranguejo generate <model-slug|image> [options]  — see `caranguejo models list`");
  const cl = client();
  const promptText = str(flags.prompt);

  // reference/source images (repeatable): URL or local path (auto-uploaded)
  const image_urls: string[] = [];
  for (const ref of multi(flags, "image", argv)) image_urls.push(await resolveMedia(cl, ref));
  for (const ref of multi(flags, "input", argv)) image_urls.push(await resolveMedia(cl, ref));

  // ── `generate image` sugar → gpt-image-2 via the image endpoint ──
  if (sub === "image") {
    if (!promptText) fail("--prompt is required.");
    const params: ImageGenerationParams = { prompt: promptText };
    if (str(flags.quality)) params.quality = str(flags.quality) as ImageGenerationParams["quality"];
    if (str(flags.resolution)) params.resolution = str(flags.resolution) as ImageGenerationParams["resolution"];
    if (str(flags.size)) params.size = str(flags.size) as ImageGenerationParams["size"];
    if (str(flags.format)) params.output_format = str(flags.format) as ImageGenerationParams["output_format"];
    if (str(flags.background)) params.background = str(flags.background) as ImageGenerationParams["background"];
    if (str(flags.webhook)) params.webhook_url = str(flags.webhook);
    if (image_urls.length) params.image_urls = image_urls;
    await runJob(cl, () => cl.generateImage(params), flags, json);
    return;
  }

  // ── generic: `generate <model-slug>` (any image/video/tool model) ──
  const gp: GenerateParams = { model: sub };
  if (promptText) gp.prompt = promptText;
  if (str(flags.aspect) ?? str(flags.size)) gp.aspect_ratio = str(flags.aspect) ?? str(flags.size);
  if (str(flags.quality)) gp.quality = str(flags.quality);
  if (str(flags.resolution)) gp.resolution = str(flags.resolution);
  if (str(flags.duration)) gp.duration_seconds = parseInt(str(flags.duration)!, 10);
  if (str(flags.webhook)) gp.webhook_url = str(flags.webhook);
  if (image_urls.length) gp.image_urls = image_urls;
  if (str(flags["start-frame"])) gp.start_frame_url = await resolveMedia(cl, str(flags["start-frame"])!);
  if (str(flags["end-frame"])) gp.end_frame_url = await resolveMedia(cl, str(flags["end-frame"])!);
  if (str(flags.audio)) gp.audio_url = await resolveMedia(cl, str(flags.audio)!);

  // --param key=value (repeatable) → params bag
  const params: Record<string, unknown> = {};
  for (const kv of multi(flags, "param", argv)) {
    const i = kv.indexOf("=");
    if (i === -1) continue;
    const k = kv.slice(0, i);
    const raw = kv.slice(i + 1);
    params[k] = raw === "true" ? true : raw === "false" ? false : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
  }
  if (Object.keys(params).length) gp.params = params;

  await runJob(cl, () => cl.generate(gp), flags, json);
}

/** Create a job, then either report the queued id or --wait for the result. */
async function runJob(cl: CaranguejoClient, create: () => Promise<Generation>, flags: Parsed["flags"], json: boolean): Promise<void> {
  const job = await create();
  if (!flags.wait) {
    json ? printJson(job) : info(`${c.green("queued")} ${job.id} — ${job.credits_charged} credits. Poll with \`caranguejo generations get ${job.id}\` or add --wait.`);
    return;
  }
  if (!json) info(c.dim(`waiting for ${job.id}…`));
  const done = await cl.waitForGeneration(job.id, {
    intervalMs: 3000,
    timeoutMs: 10 * 60_000,
    onPoll: (g: { status?: string }) => { if (!json && g.status === "processing") process.stderr.write("."); },
  });
  if (!json) process.stderr.write("\n");
  outputGeneration(done, json);
}

async function generations(sub: string | undefined, rest: string[], flags: Parsed["flags"], json: boolean): Promise<void> {
  const cl = client();
  if (sub === "get") {
    const id = rest[0];
    if (!id) fail("usage: caranguejo generations get <id>");
    outputGeneration(await cl.getGeneration(id), json);
    return;
  }
  // default: list
  const limit = str(flags.limit) ? parseInt(str(flags.limit)!, 10) : undefined;
  const res = await cl.listGenerations({ limit, cursor: str(flags.cursor) });
  if (json) { printJson(res); return; }
  for (const g of res.data) {
    const url = firstAssetUrl(g);
    info(`${g.id}  ${statusColor(g.status)}  ${c.dim(g.created_at)}  ${url}`);
  }
  if (res.next_cursor) info(c.dim(`next: --cursor ${res.next_cursor}`));
}

function statusColor(s: Generation["status"]): string {
  if (s === "completed") return c.green(s);
  if (s === "failed") return c.red(s);
  if (s === "canceled") return c.yellow(s);
  return c.cyan(s);
}

/** Collect every output URL (images + assets), deduped. */
function assetUrls(g: Generation): string[] {
  const urls = new Set<string>();
  for (const img of g.output?.images ?? []) if (img?.url) urls.add(img.url);
  for (const a of g.output?.assets ?? []) if (a?.url) urls.add(a.url);
  return [...urls];
}
function firstAssetUrl(g: Generation): string {
  return assetUrls(g)[0] ?? "";
}

function outputGeneration(g: Generation, json: boolean): void {
  if (json) { printJson(g); if (g.status === "failed") process.exitCode = 1; return; }
  info(`${c.bold(g.id)}  ${statusColor(g.status)}  ${g.credits_charged} credits`);
  if (g.status === "completed") for (const url of assetUrls(g)) process.stdout.write(url + "\n");
  if (g.status === "failed") { fail(g.error?.message ?? "generation failed"); }
}

main().catch((e) => fail((e as Error).message));

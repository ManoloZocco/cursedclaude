#!/usr/bin/env node

/**
 * CursedClaude CLI — Claude Code ↔ Cursor proxy.
 *
 * Commands:
 *   cclaude / cursedclaude   Launch Claude Code through the proxy (uses Cursor)
 *   start                    Start the proxy server (foreground)
 *   run                      Launch Claude Code through the proxy (uses Cursor)
 *   run --native             Launch Claude Code directly (uses Anthropic API)
 *   status                   Show proxy health + Cursor auth info
 *   models                   List available Cursor models
 */

import { Command } from "commander";
import { spawn, execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import type { Server } from "node:http";
import { extractCursorAuth } from "./auth/cursor.js";
import { startServer } from "./server/proxy.js";
import { setConfig, AVAILABLE_CURSOR_MODELS } from "./config.js";

const DEFAULT_PORT = 8080;
const RUNTIME_DIR = join(homedir(), ".cursedclaude");
const CLAUDE_HOME = join(homedir(), ".claude");
const CLAUDE_SETTINGS_PATH = join(CLAUDE_HOME, "settings.json");
const CLAUDE_INSTALLED_PLUGINS_PATH = join(CLAUDE_HOME, "plugins", "installed_plugins.json");

function log(msg: string) {
  const ts = new Date().toLocaleTimeString();
  console.log(`[CursedClaude ${ts}] ${msg}`);
}

function findClaude(): string {
  try {
    return execSync("which claude", { encoding: "utf-8" }).trim();
  } catch {
    throw new Error(
      "Claude Code CLI not found. Install it with: npm install -g @anthropic-ai/claude-code",
    );
  }
}

function getEnabledPluginInstallPaths(): string[] {
  try {
    const settingsRaw = readFileSync(CLAUDE_SETTINGS_PATH, "utf-8");
    const installedRaw = readFileSync(CLAUDE_INSTALLED_PLUGINS_PATH, "utf-8");

    const settings = JSON.parse(settingsRaw) as {
      enabledPlugins?: Record<string, boolean>;
    };
    const installed = JSON.parse(installedRaw) as {
      plugins?: Record<string, { installPath?: string }[]>;
    };

    const enabled = settings.enabledPlugins ?? {};
    const byPlugin = installed.plugins ?? {};
    const paths = new Set<string>();

    for (const [pluginKey, isEnabled] of Object.entries(enabled)) {
      if (!isEnabled) continue;
      const entries = byPlugin[pluginKey] ?? [];
      for (const entry of entries) {
        const p = entry.installPath;
        if (p && existsSync(p)) paths.add(p);
      }
    }
    return [...paths];
  } catch {
    return [];
  }
}

async function isProxyHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string };
    return data.status === "ok";
  } catch {
    return false;
  }
}

function findPidsListeningOnPort(port: number): number[] {
  try {
    const output = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
    if (!output) return [];
    return output
      .split("\n")
      .map((line) => parseInt(line.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function stopPortListeners(port: number): { stopped: number[]; failed: number[] } {
  const pids = findPidsListeningOnPort(port);
  const stopped: number[] = [];
  const failed: number[] = [];

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      stopped.push(pid);
    } catch {
      failed.push(pid);
    }
  }

  return { stopped, failed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function forceStopPortListeners(
  port: number,
  timeoutMs = 2000,
): Promise<{ stopped: number[]; failed: number[] }> {
  const { stopped, failed } = stopPortListeners(port);
  if (failed.length > 0) return { stopped, failed };

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const remaining = findPidsListeningOnPort(port);
    if (remaining.length === 0) return { stopped, failed: [] };
    await sleep(120);
  }

  // Fallback: hard kill stubborn listeners
  const stubborn = findPidsListeningOnPort(port);
  const hardFailed: number[] = [];
  for (const pid of stubborn) {
    try {
      process.kill(pid, "SIGKILL");
      stopped.push(pid);
    } catch {
      hardFailed.push(pid);
    }
  }
  return { stopped, failed: hardFailed };
}

function ensureRuntimeDir(): void {
  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

function pidFilePath(port: number): string {
  ensureRuntimeDir();
  return join(RUNTIME_DIR, `daemon-${port}.pid`);
}

function claudePidFilePath(port: number): string {
  ensureRuntimeDir();
  return join(RUNTIME_DIR, `claude-${port}.pid`);
}

function writePidFile(port: number, pid: number): void {
  writeFileSync(pidFilePath(port), `${pid}\n`, "utf-8");
}

function readPidFile(port: number): number | null {
  try {
    const raw = readFileSync(pidFilePath(port), "utf-8").trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removePidFile(port: number): void {
  try {
    rmSync(pidFilePath(port), { force: true });
  } catch {
    // ignore
  }
}

function writeClaudePidFile(port: number, pid: number): void {
  writeFileSync(claudePidFilePath(port), `${pid}\n`, "utf-8");
}

function readClaudePidFile(port: number): number | null {
  try {
    const raw = readFileSync(claudePidFilePath(port), "utf-8").trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removeClaudePidFile(port: number): void {
  try {
    rmSync(claudePidFilePath(port), { force: true });
  } catch {
    // ignore
  }
}

function runOrchestratorPidFilePath(port: number): string {
  ensureRuntimeDir();
  return join(RUNTIME_DIR, `run-${port}.pid`);
}

function writeRunOrchestratorPidFile(port: number, pid: number): void {
  writeFileSync(runOrchestratorPidFilePath(port), `${pid}\n`, "utf-8");
}

function readRunOrchestratorPidFile(port: number): number | null {
  try {
    const raw = readFileSync(runOrchestratorPidFilePath(port), "utf-8").trim();
    const pid = parseInt(raw, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function removeRunOrchestratorPidFile(port: number): void {
  try {
    rmSync(runOrchestratorPidFilePath(port), { force: true });
  } catch {
    // ignore
  }
}

type ProcRow = { pid: number; ppid: number; command: string };

function listProcesses(): ProcRow[] {
  try {
    const output = execSync("ps -axo pid=,ppid=,command=", { encoding: "utf-8" });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (!match) return null;
        return {
          pid: parseInt(match[1], 10),
          ppid: parseInt(match[2], 10),
          command: match[3],
        } as ProcRow;
      })
      .filter((row): row is ProcRow => Boolean(row));
  } catch {
    return [];
  }
}

function findCcProxyRunAndChildren(): { runPids: number[]; claudeChildPids: number[] } {
  const rows = listProcesses();
  const runPids = rows
    .filter((r) => /(^|\s)node\s+.*(cclaude|cursedclaude|cc-proxy)\s+run(\s|$)/.test(r.command))
    .map((r) => r.pid);
  const runPidSet = new Set(runPids);
  const claudeChildPids = rows
    .filter((r) => /\/\.local\/bin\/claude(\s|$)/.test(r.command) && runPidSet.has(r.ppid))
    .map((r) => r.pid);
  return { runPids, claudeChildPids };
}

const program = new Command();

program
  .name("cclaude")
  .description("CursedClaude — use Claude Code's orchestrator with Cursor Pro's inference")
  .version("0.1.0");

program
  .command("start")
  .description("Start the proxy server (foreground)")
  .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
  .option("-m, --model <model>", "Force all requests to use this Cursor model")
  .option("-v, --verbose", "Verbose logging")
  .option("--daemon", "Run proxy in background and return immediately")
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    setConfig({
      port,
      modelOverride: opts.model ?? null,
      verbose: opts.verbose ?? false,
    });

    if (opts.daemon) {
    const running = await isProxyHealthy(port);
      if (running) {
        log(`Proxy is already running on http://127.0.0.1:${port}`);
        const pid = readPidFile(port);
        if (pid) log(`PID file: ${pid}`);
        return;
      }

      const scriptPath = process.argv[1];
      const childArgs = [scriptPath, "start", "--port", String(port)];
      if (opts.model) childArgs.push("--model", String(opts.model));
      if (opts.verbose) childArgs.push("--verbose");

      const child = spawn(process.execPath, childArgs, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      writePidFile(port, child.pid!);

      log(`Daemon started on http://127.0.0.1:${port}`);
      log(`PID: ${child.pid}`);
      return;
    }

    log("Extracting Cursor authentication...");
    const auth = extractCursorAuth();
    log(`Cursor account: ${auth.email ?? "unknown"} (${auth.membershipType ?? "unknown"})`);
    if (opts.model) log(`Model override: ${opts.model}`);

    log(`Starting proxy on http://127.0.0.1:${port}`);
    log("Claude Code → Anthropic format → CursedClaude → Cursor backend\n");

    await startServer(auth, port);
    log(`Proxy ready on http://127.0.0.1:${port}`);
    log("Press Ctrl+C to stop.\n");
  });

program
  .command("run")
  .description(
    "Launch Claude Code through proxy. Claude's native flags (--resume, --permission-mode, --verbose, --dangerously-skip-permissions, etc.) are passed through.",
  )
  .option("-n, --native", "Bypass proxy, use Anthropic API directly")
  .option("-p, --port <number>", "Proxy port", String(DEFAULT_PORT))
  .option("-m, --model <model>", "Force Cursor model (e.g. claude-4.6-opus-high-thinking)")
  .option("--no-user-settings", "Isolated mode: do not load user settings/plugins/skills")
  .option(
    "--no-bare",
    "Disable default API-key auth mode and use Claude login flow (plugins still from user settings)",
  )
  .option("-v, --verbose", "Verbose logging")
  .allowUnknownOption(true)
  .action(async (opts, cmd) => {
    const claudePath = findClaude();

    if (opts.native) {
      log("🔌 Native mode — connecting directly to Anthropic API");
      log("   Token costs apply on your Anthropic account.\n");

      const claudeArgs = cmd.args.filter(
        (a: string) => a !== "--native" && a !== "-n",
      );
      const child = spawn(claudePath, claudeArgs, {
        stdio: "inherit",
        env: { ...process.env },
      });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }

    const port = parseInt(opts.port, 10);
    setConfig({
      port,
      modelOverride: opts.model ?? null,
      verbose: opts.verbose ?? false,
    });

    log("Extracting Cursor authentication...");
    const auth = extractCursorAuth();
    log(`Cursor: ${auth.email ?? "?"} (${auth.membershipType ?? "?"})`);
    if (opts.model) log(`Model: ${opts.model}`);

    const alreadyRunning = await isProxyHealthy(port);
    let ownedServer: Server | null = null;
    if (alreadyRunning) {
      log(`Proxy already running on port ${port}. Reusing existing instance.`);
    } else {
      log(`Starting proxy on port ${port}...`);
      try {
        ownedServer = await startServer(auth, port);
      } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err?.code === "EADDRINUSE") {
          throw new Error(
            `Port ${port} is already in use by another process.\n` +
              `- If it's an older cclaude instance, run: cclaude run --port ${port}\n` +
              `- Otherwise choose another port: cclaude run --port 8081`,
          );
        }
        throw error;
      }
      log("Proxy ready. Launching Claude Code...\n");
    }

    const claudeArgs = cmd.args.filter(
      (a: string) =>
        a !== "--port" &&
        a !== "-p" &&
        a !== "--model" &&
        a !== "-m" &&
        a !== "--no-user-settings" &&
        a !== "--no-bare" &&
        a !== "--verbose" &&
        a !== "-v",
    );
    // Forward --verbose to Claude too (proxy uses it for its own logging as well).
    if (opts.verbose && !claudeArgs.includes("--verbose")) {
      claudeArgs.push("--verbose");
    }
    // Default to API-key-only mode so proxy auth works without /login.
    if (opts.bare !== false && !claudeArgs.includes("--bare")) {
      claudeArgs.push("--bare");
    }

    // In bare mode, explicitly load user-enabled plugins from disk.
    // This keeps API-key auth path and restores plugin/skill slash commands.
    if (claudeArgs.includes("--bare")) {
      const pluginPaths = getEnabledPluginInstallPaths();
      const alreadyProvided = new Set<string>();
      for (let i = 0; i < claudeArgs.length; i += 1) {
        if (claudeArgs[i] === "--plugin-dir" && claudeArgs[i + 1]) {
          alreadyProvided.add(claudeArgs[i + 1]);
        }
      }
      for (const pluginPath of pluginPaths) {
        if (!alreadyProvided.has(pluginPath)) {
          claudeArgs.push("--plugin-dir", pluginPath);
        }
      }
    }

    // In bare mode we isolate setting sources to avoid user-level env overrides
    // (e.g. ANTHROPIC_BASE_URL in ~/.claude/settings.json).
    const shouldIsolateSettingSources = opts.noUserSettings || claudeArgs.includes("--bare");
    if (shouldIsolateSettingSources && !claudeArgs.includes("--setting-sources")) {
      claudeArgs.push("--setting-sources", "project,local");
    }
    const spawnAnthropicBaseUrl = `http://127.0.0.1:${port}`;

    const child = spawn(claudePath, claudeArgs, {
      stdio: "inherit",
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: spawnAnthropicBaseUrl,
        ANTHROPIC_API_KEY: "cursedclaude-cursor-bridge",
      },
    });
    writeRunOrchestratorPidFile(port, process.pid);
    if (child.pid) {
      writeClaudePidFile(port, child.pid);
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finishOnce = (
        code: number | null,
        signal: NodeJS.Signals | null,
        event: string,
      ) => {
        if (settled) return;
        settled = true;
        removeClaudePidFile(port);
        removeRunOrchestratorPidFile(port);
        const codeNum = code === null ? (signal ? 1 : 0) : code;
        const exitProcess = () => process.exit(codeNum);
        if (ownedServer) {
          ownedServer.close((err) => {
            if (err) log(`Warning: proxy server close error: ${err.message}`);
            exitProcess();
            resolve();
          });
        } else {
          exitProcess();
          resolve();
        }
      };

      child.once("exit", (code, signal) => finishOnce(code, signal ?? null, "exit"));
      child.once("error", (error) => {
        log(`Claude process error: ${error.message}`);
        finishOnce(1, null, "error");
      });
    });
  });

program
  .command("status")
  .description("Check proxy status and Cursor auth")
  .option("-p, --port <number>", "Proxy port", String(DEFAULT_PORT))
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);

    console.log("\n╔══════════════════════════════════════╗");
    console.log("║         cclaude status                ║");
    console.log("╚══════════════════════════════════════╝\n");

    console.log("  Cursor Auth");
    console.log("  ───────────");
    try {
      const auth = extractCursorAuth();
      console.log(`  Email:      ${auth.email ?? "N/A"}`);
      console.log(`  Membership: ${auth.membershipType ?? "N/A"}`);
      console.log(`  Token:      ${auth.accessToken.slice(0, 30)}...`);
      console.log(`  Machine ID: ${auth.machineId ? auth.machineId.slice(0, 20) + "..." : "N/A"}`);
    } catch (e) {
      console.log(`  Error: ${e instanceof Error ? e.message : String(e)}`);
    }

    console.log("\n  Proxy Server");
    console.log("  ────────────");
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const data = (await res.json()) as { status: string };
      console.log(`  Status:     ${data.status === "ok" ? "RUNNING" : data.status}`);
      console.log(`  Endpoint:   http://127.0.0.1:${port}/v1/messages`);
      const pid = readPidFile(port);
      if (pid) console.log(`  PID file:   ${pid}`);
    } catch {
      console.log(`  Status:     NOT RUNNING (port ${port})`);
      const pid = readPidFile(port);
      if (pid) console.log(`  Stale PID:  ${pid} (removable with: cclaude stop --port ${port})`);
    }

    console.log("\n  Claude Code");
    console.log("  ───────────");
    try {
      const path = findClaude();
      console.log(`  Binary:     ${path}`);
    } catch {
      console.log("  Binary:     NOT FOUND");
    }

    console.log("");
  });

program
  .command("models")
  .description("List available Cursor models")
  .action(() => {
    console.log("\nAvailable Cursor models:\n");
    for (const m of AVAILABLE_CURSOR_MODELS) {
      console.log(`  ${m}`);
    }
    console.log("\nUse with: cclaude run --model <model>");
    console.log("");
  });

program
  .command("stop")
  .description("Stop proxy process listening on a port")
  .option("-p, --port <number>", "Proxy port", String(DEFAULT_PORT))
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);

    const runOrchestratorPid = readRunOrchestratorPidFile(port);
    if (runOrchestratorPid) {
      try {
        process.kill(runOrchestratorPid, "SIGTERM");
        log(`Stopped cclaude run orchestrator PID: ${runOrchestratorPid}`);
      } catch {
        log(`Could not stop cclaude run orchestrator PID: ${runOrchestratorPid}`);
      } finally {
        removeRunOrchestratorPidFile(port);
        removeClaudePidFile(port);
      }
    }

    const claudePid = readClaudePidFile(port);
    if (claudePid) {
      try {
        process.kill(claudePid, "SIGTERM");
        log(`Stopped Claude PID from file: ${claudePid}`);
      } catch {
        log(`Could not stop Claude PID from file: ${claudePid}`);
      } finally {
        removeClaudePidFile(port);
      }
    }

    const daemonPid = readPidFile(port);
    if (daemonPid) {
      try {
        process.kill(daemonPid, "SIGTERM");
        log(`Stopped daemon PID from file: ${daemonPid}`);
      } catch {
        log(`Could not stop daemon PID from file: ${daemonPid}`);
      } finally {
        removePidFile(port);
      }
    }

    const pids = findPidsListeningOnPort(port);

    if (pids.length === 0) {
      const fallback = findCcProxyRunAndChildren();

      const fallbackTargets = [...fallback.claudeChildPids, ...fallback.runPids];
      if (fallbackTargets.length === 0) {
        log(`No process is listening on port ${port}.`);
        return;
      }

      const stopped: number[] = [];
      const failed: number[] = [];
      for (const pid of fallbackTargets) {
        try {
          process.kill(pid, "SIGTERM");
          stopped.push(pid);
        } catch {
          failed.push(pid);
        }
      }
      if (stopped.length > 0) log(`Stopped fallback PID(s): ${stopped.join(", ")}`);
      if (failed.length > 0) {
        log(`Could not stop fallback PID(s): ${failed.join(", ")}`);
        process.exitCode = 1;
      }
      return;
    }

    log(`Stopping process(es) on port ${port}: ${pids.join(", ")}`);
    const { stopped, failed } = await forceStopPortListeners(port);

    if (stopped.length > 0) {
      log(`Stopped PID(s): ${stopped.join(", ")}`);
    }
    if (failed.length > 0) {
      log(`Could not stop PID(s): ${failed.join(", ")}`);
      process.exitCode = 1;
    }
    if (failed.length === 0) {
      removePidFile(port);
    }
  });

program
  .command("restart")
  .description("Restart proxy server (foreground)")
  .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
  .option("-m, --model <model>", "Force all requests to use this Cursor model")
  .option("-v, --verbose", "Verbose logging")
  .option("--daemon", "Run proxy in background and return immediately")
  .action(async (opts) => {
    const port = parseInt(opts.port, 10);
    setConfig({
      port,
      modelOverride: opts.model ?? null,
      verbose: opts.verbose ?? false,
    });

    const running = findPidsListeningOnPort(port);
    if (running.length > 0) {
      log(`Restart: stopping existing process(es) on port ${port}: ${running.join(", ")}`);
      const { failed } = await forceStopPortListeners(port);
      if (failed.length > 0) {
        throw new Error(`Failed to stop existing process(es): ${failed.join(", ")}`);
      }
    } else {
      log(`Restart: no process on port ${port}, starting fresh.`);
    }

    if (opts.daemon) {
      const scriptPath = process.argv[1];
      const childArgs = [scriptPath, "start", "--port", String(port), "--daemon"];
      if (opts.model) childArgs.push("--model", String(opts.model));
      if (opts.verbose) childArgs.push("--verbose");
      const child = spawn(process.execPath, childArgs, {
        detached: false,
        stdio: "inherit",
      });
      child.on("exit", (code) => process.exit(code ?? 0));
      return;
    }

    log("Extracting Cursor authentication...");
    const auth = extractCursorAuth();
    log(`Cursor account: ${auth.email ?? "unknown"} (${auth.membershipType ?? "unknown"})`);
    if (opts.model) log(`Model override: ${opts.model}`);

    log(`Starting proxy on http://127.0.0.1:${port}`);
    await startServer(auth, port);
    log(`Proxy ready on http://127.0.0.1:${port}`);
    log("Press Ctrl+C to stop.\n");
  });

// When invoked as `cclaude` or `cursedclaude` without a subcommand, default to `run`.
const invocationName = basename(process.argv[1] ?? "");
const knownCommands = ["start", "run", "stop", "status", "models", "restart"];
if (
  (invocationName === "cclaude" || invocationName === "cursedclaude") &&
  !knownCommands.includes(process.argv[2])
) {
  process.argv.splice(2, 0, "run");
}

await program.parseAsync(process.argv);

# Troubleshooting

## Installation issues

### `better-sqlite3` fails to compile

**Error:**
```
gyp ERR! build error
npm ERR! code 1
```

**Fix by OS:**

macOS:
```bash
xcode-select --install
npm install -g cursedclaude
```

Linux (Ubuntu/Debian):
```bash
sudo apt-get install -y build-essential python3
npm install -g cursedclaude
```

Linux (Fedora/RHEL):
```bash
sudo dnf install -y gcc-c++ make python3
npm install -g cursedclaude
```

Windows:
```powershell
npm install -g windows-build-tools
npm install -g cursedclaude
```

**Universal fallback — skip global install:**
```bash
npx cursedclaude
```

---

### `EACCES: permission denied` during npm install -g

**Fix (recommended — configure user prefix):**
```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc   # or ~/.bashrc
source ~/.zshrc
npm install -g cursedclaude
```

**Quick fix:**
```bash
npx cursedclaude
```

---

### Node.js version too old

**Error:**
```
SyntaxError: Cannot use import statement outside a module
```

**Fix:**
```bash
# Install nvm if you don't have it
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# Install and use Node 18
nvm install 18
nvm use 18
nvm alias default 18
# Retry
npm install -g cursedclaude
```

---

### `cclaude` not found after install

**Error:**
```
zsh: command not found: cclaude
```

**Fix:**
```bash
# Find npm's global bin directory
npm bin -g

# Add it to your PATH (bash/zsh)
echo 'export PATH="'$(npm bin -g)':$PATH"' >> ~/.zshrc
source ~/.zshrc

# macOS Apple Silicon
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify
which cclaude
```

**Windows:** Close and reopen PowerShell after install.

---

## Authentication issues

### `No Cursor access token found`

**Error:**
```
Error: No Cursor access token found. Make sure you are logged in to Cursor.
```

**Steps:**
1. Open Cursor
2. Go to `File > Cursor Settings > Account`
3. Verify you are logged in
4. Restart Cursor if needed
5. Retry `cclaude`

**Where CursedClaude looks for the token (read-only access):**
- macOS: `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`
- Linux: `~/.config/Cursor/User/globalStorage/state.vscdb`
- Windows: `%APPDATA%\Cursor\User\globalStorage\state.vscdb`

If the file doesn't exist, Cursor has never been opened or the installation is non-standard.

---

### Membership shows `null` or `unknown`

**Symptom:** `cclaude status` shows membership as `null` or `unknown`.

This is not a blocker — CursedClaude works with any Cursor account. The membership field is informational only.

If you're hitting request limits sooner than expected, check your quota at [cursor.com/settings](https://cursor.com/settings). Free accounts have ~2000 completions/month; Pro has a much higher limit.

**If models are completely unavailable:**
1. Log out and back in inside Cursor
2. Restart Cursor completely (quit from the system tray/menu bar)
3. Retry `cclaude status`

---

## Proxy issues

### `Port 8080 is already in use`

**Error:**
```
Error: Port 8080 is already in use by another process.
```

**Option 1: use a different port**
```bash
cclaude --port 9090
```

**Option 2: stop the existing proxy first**
```bash
cclaude stop
cclaude
```

**Option 3: find and kill whatever is on 8080**
```bash
# macOS / Linux
lsof -i :8080
kill -9 <PID>

# Windows
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

---

### Proxy starts but Claude Code doesn't connect

**Symptom:** Proxy says "ready" but Claude Code throws API errors.

**Check:**
```bash
cclaude status   # verify proxy is running and auth is valid
```

**Fix:**
```bash
cclaude stop
cclaude          # fresh start
```

If you have `ANTHROPIC_BASE_URL` set globally in your shell profile, it may conflict. Check:
```bash
echo $ANTHROPIC_BASE_URL
```

If it's set to something other than `http://127.0.0.1:8080`, either unset it for CursedClaude sessions or CursedClaude will override it automatically for its child process (Claude Code).

---

### Proxy crashes immediately

**Check verbose output:**
```bash
cclaude --verbose
```

Common causes:
- Cursor not logged in → see Authentication issues above
- Port conflict → see Port section above
- Old Node.js version → upgrade to ≥ 18

---

## Claude Code issues

### `claude: command not found`

**Fix:**
```bash
npm install -g @anthropic-ai/claude-code
# if that fails:
npx @anthropic-ai/claude-code
```

Verify:
```bash
which claude
claude --version
```

---

### Claude Code uses wrong model / ignores proxy

**Symptom:** Claude Code connects to Anthropic directly instead of the proxy.

**Check:**
```bash
cclaude status   # is proxy running?
```

This can happen if `ANTHROPIC_BASE_URL` is set in your global environment and points elsewhere. CursedClaude always sets it correctly for the Claude Code child process — but if you're launching Claude Code separately, you must set it yourself:

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8080 ANTHROPIC_API_KEY=anything claude
```

---

## Platform-specific notes

### macOS

- On **Apple Silicon**, everything works natively — no Rosetta needed
- If `brew` installed Node.js, ensure `/opt/homebrew/bin` is in your PATH:
  ```bash
  echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
  ```

### Linux

- On systems without a GUI (headless servers), Cursor cannot be installed, so there is no auth token. CursedClaude requires Cursor to be installed locally.
- If you use `nvm`, make sure the correct Node version is active in your current shell session:
  ```bash
  nvm use 18
  ```

### Windows

- Use **PowerShell** or **Windows Terminal**, not `cmd.exe`
- After `npm install -g`, close and reopen your terminal for PATH changes to take effect
- **WSL2** is fully supported and behaves like Linux — follow the Linux instructions
- If using WSL2, install Cursor on **Windows** (not inside WSL), and point the Cursor database path manually if needed

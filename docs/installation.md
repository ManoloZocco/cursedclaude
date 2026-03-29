# Installation Guide

## Method 1 — npm (recommended)

```bash
npm install -g cursedclaude
cclaude
```

## Method 2 — npx (no global install)

No installation needed. Run directly with:

```bash
npx cursedclaude
```

Use `npx` if you prefer not to install globally, or if Method 1 fails.

## Method 3 — from source

```bash
git clone https://github.com/manolozocco/cursedclaude.git
cd cursedclaude
npm install
npm run build
npm install -g .
```

Use this method if you want to modify the source or pin to a specific commit.

---

## Prerequisites in Detail

### Node.js ≥ 18

Check your version:
```bash
node --version   # must be v18.0.0 or higher
```

Install or upgrade:

**macOS:**
```bash
brew install node
# or with nvm:
nvm install 18 && nvm use 18
```

**Linux:**
```bash
# with nvm (recommended):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 18 && nvm use 18

# Ubuntu/Debian via apt:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Windows:**
Download the installer from [nodejs.org](https://nodejs.org), or:
```powershell
winget install OpenJS.NodeJS.LTS
```

---

### Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
claude --version   # verify
```

If global install fails, use npx:
```bash
npx @anthropic-ai/claude-code --version
```

---

### Cursor

1. Download from [cursor.sh](https://cursor.sh)
2. Open Cursor → `File > Cursor Settings > Account` → log in

CursedClaude reads Cursor's local SQLite database to extract your auth token. Cursor must be installed and you must be logged in for this to work.

> **Free vs Pro:** The free plan works but has a monthly request limit (~2000 completions). Claude Code makes many calls per session, so the free quota runs out quickly. Pro is recommended for daily use.

---

## Platform Notes

### macOS

`better-sqlite3` (a dependency) requires Xcode Command Line Tools to compile:

```bash
xcode-select --install
```

If you see `gyp ERR! build error`, run the above and retry.

On **Apple Silicon (M1/M2/M3)**, `better-sqlite3` compiles natively for arm64 — no Rosetta needed.

### Linux

Install build tools before running `npm install`:

**Ubuntu / Debian:**
```bash
sudo apt-get install -y build-essential python3
```

**Fedora / RHEL:**
```bash
sudo dnf install -y gcc-c++ make python3
```

**Arch Linux:**
```bash
sudo pacman -S base-devel python
```

### Windows

Install Visual Studio Build Tools before `npm install`:

```powershell
npm install -g windows-build-tools
```

Or download manually from [visualstudio.microsoft.com](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

> **Tip:** Use **PowerShell** or **Windows Terminal**, not the classic `cmd.exe`.
> After `npm install -g`, close and reopen your terminal so the PATH update takes effect.

---

## Fallbacks

### If `npm install -g` fails — permission error

```
EACCES: permission denied, mkdir '/usr/local/lib/node_modules'
```

**Option 1: configure npm user prefix (recommended)**
```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
# Add to ~/.bashrc or ~/.zshrc:
export PATH=~/.npm-global/bin:$PATH
# Reload:
source ~/.bashrc   # or source ~/.zshrc
# Then install:
npm install -g cursedclaude
```

**Option 2: use npx (no install needed)**
```bash
npx cursedclaude
```

**Option 3: sudo (quick but not recommended)**
```bash
sudo npm install -g cursedclaude
```

---

### If `better-sqlite3` fails to compile

```
gyp ERR! build error
```

1. Install the build tools for your OS (see Platform Notes above)
2. Retry: `npm install -g cursedclaude`
3. If it still fails, use `npx cursedclaude` — this compiles locally in a temp directory and often succeeds

---

### If `cclaude` is not found after install

```
zsh: command not found: cclaude
```

Find where npm installs global binaries:
```bash
npm bin -g
```

Add that directory to your PATH. Example for bash/zsh:
```bash
export PATH="$(npm bin -g):$PATH"
# Persist by adding the line above to ~/.bashrc or ~/.zshrc
```

**macOS with Homebrew Node:**
```bash
export PATH="/usr/local/bin:$PATH"   # Intel
export PATH="/opt/homebrew/bin:$PATH"  # Apple Silicon
```

**Windows:** Close and reopen PowerShell/Terminal after install.

Verify:
```bash
which cclaude     # should print a path
cclaude --version
```

---

### If Node.js is too old

```
SyntaxError: Cannot use import statement outside a module
```

Upgrade to Node.js ≥ 18 using nvm, fnm, or your OS package manager (see Node.js section above).

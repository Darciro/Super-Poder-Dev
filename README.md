# SuperPoder Dev

A local development dashboard for macOS. It brings the pieces of a day-to-day dev setup into one place: Docker containers, the local Caddy reverse proxy, PHP dev servers, terminals and project documentation.

It runs as a regular Laravel app in the browser, and as a native macOS desktop app built with [NativePHP](https://nativephp.com).

## Features

### Dashboard

- **Docker containers**, grouped by Docker Compose project, with their status, ports and live CPU and memory stats. Start, stop and restart them from the dashboard.
- **Projects**: Compose projects and local projects with their folder, repository, notes and the URLs of each environment (local, dev, QA, staging, production).
    - Open a project's folder in your IDE.
    - Open a terminal in the project's folder.
- **Terminals** in the browser (xterm.js): a shell inside any container, or a local shell in a project's folder. Sessions keep running when the terminal is closed and are replayed when it's reopened.
- **Local PHP servers**: apps served with `php -S` / `php artisan serve` from any terminal, with their URL and folder.
- **Caddy**: the sites of your Caddyfile with their upstreams, and whether Caddy runs. Start it and stop it. It runs as your user: macOS lets any user listen on ports 80/443, so no password is needed.

### Documentation

Markdown pages, organized in categories, with GitHub Flavored Markdown (tables, task lists, etc.).

### Settings

- **Integrations**: where the app finds Docker (socket), Caddy (binary, Caddyfile, admin API) and your IDE (command). Each path shows whether it was found. An empty setting uses its default.
- **Data**: export projects, documentation and integration settings to a JSON file, and import such a file. Imports are merged into the existing data and never delete anything. This is also how you move data from the browser version into the desktop app, which has its own database.
- Profile, appearance (light/dark), and in the browser, password, two-factor authentication and passkeys.

### Desktop app

- Opens straight on the dashboard, with no login: a single local user, named after your macOS account. Only the app's own window can reach it.
- **Menu bar icon** with the status of Caddy and the running containers, Start/Stop Caddy (with a system notification of the result), and a way back to the window. Closing the window keeps the app running.
- **App menu** with shortcuts: Dashboard (⌘1), Documentation (⌘2), Settings (⌘,).
- External links open in your default browser.
- Programs started from the app (IDE, local shells) get your login shell's `PATH` and none of the app's own environment variables.
- Quitting the app ends its terminal sessions and everything started from them.

## Tech stack

| Layer        | Technologies                                                                                             |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| Backend      | PHP 8.3, Laravel 13, Laravel Fortify (authentication, 2FA, passkeys), SQLite                             |
| Frontend     | Inertia.js 3, React 19, TypeScript, Tailwind CSS 4, Radix UI, lucide-react, xterm.js, react-markdown     |
| Tooling      | Vite (Vite+), Laravel Wayfinder (typed routes), React Compiler, Pest 4, PHPStan (Larastan), Laravel Pint |
| Desktop      | NativePHP Desktop 2 (Electron), with its bundled static PHP binary                                       |
| Integrations | Docker Engine API (Unix socket), Caddy admin API                                                         |

## Requirements

- macOS (the app uses macOS tools such as `osascript`, `stty`, `script` and `lsof`)
- PHP 8.3+ with the `pdo_sqlite` and `curl` extensions, and Composer
- Node.js 22+ and npm
- [Docker Desktop](https://www.docker.com/products/docker-desktop/), for the containers
- [Caddy](https://caddyserver.com) (`brew install caddy`), for the local HTTPS setup and the Caddy panel

## Running locally

### 1. Install

```bash
git clone <repository-url> super-poder-dev
cd super-poder-dev

composer setup
```

`composer setup` installs the PHP and Node dependencies, creates `.env` from `.env.example`, generates the app key, creates the SQLite database, runs the migrations and builds the frontend.

### 2. Configure the local domain

The app is served at `https://super-poder-dev.test`, through Caddy. Set it in `.env`:

```dotenv
APP_URL=https://super-poder-dev.test
SERVER_PORT=8888
```

Point the domain to your machine:

```bash
echo "127.0.0.1 super-poder-dev.test" | sudo tee -a /etc/hosts
```

Add the app and the Vite dev server to your Caddyfile (`~/caddy/Caddyfile` by default):

```caddyfile
super-poder-dev.test {
	tls internal
	reverse_proxy 127.0.0.1:8888
}

# Vite dev server over HTTPS (avoids mixed content on the https app)
super-poder-dev.test:5173 {
	tls internal
	reverse_proxy 127.0.0.1:5174
}
```

Then start Caddy, and trust its local certificate authority once (this asks for your password):

```bash
caddy start --config ~/caddy/Caddyfile
caddy trust
```

Caddy runs as your user, without `sudo`. If it ran as root before, its data folder belongs to root: stop it and give the folder back to your user once:

```bash
caddy stop
sudo chown -R "$(whoami)" ~/Library/Application\ Support/Caddy
```

### 3. Start the app

```bash
composer dev
```

This runs the Laravel server, the queue worker, the log viewer (Pail) and the Vite dev server. Open <https://super-poder-dev.test> and register an account.

### Optional settings

These can also be set in the app, under **Settings → Integrations**.

```dotenv
# Docker Engine socket (default: ~/.docker/run/docker.sock)
DOCKER_SOCKET=/var/run/docker.sock

# Command that opens a folder in your IDE; the project path is appended
IDE_COMMAND="open -a 'Visual Studio Code'"

# Caddy
CADDY_BINARY=/opt/homebrew/bin/caddy
CADDY_CONFIG="${HOME}/caddy/Caddyfile"
CADDY_ADMIN=http://localhost:2019
```

## Desktop app

### Development

```bash
composer native:dev
```

This opens the app in a window, with hot reloading, next to the Vite dev server. In development the app uses its own database, `database/nativephp.sqlite`. NativePHP doesn't migrate it on its own while developing:

```bash
php artisan native:migrate
```

To bring your data over from the browser version: **Settings → Data → Export** in the browser, then **Import** in the app.

> If the window stays black, check that Vite is running. If Electron fails with `does not provide an export named 'BrowserWindow'`, your terminal sets `ELECTRON_RUN_AS_NODE` (terminals started by VS Code do): `composer native:dev` already unsets it, otherwise run `env -u ELECTRON_RUN_AS_NODE php artisan native:run`.

### Building

```bash
composer native:build-local          # this Mac's architecture
scripts/native-build-local.sh x64    # or a given one: arm64, x64
```

The `.dmg`, `.zip` and `.app` are written to `nativephp/electron/dist/`. Install the app by dragging it to `/Applications`. Its data lives in `~/Library/Application Support/superpoder-dev/`.

This build is signed ad hoc, for your own Mac. Distributing it to other Macs needs signing and notarization with an Apple Developer account.

Bump `NATIVEPHP_APP_VERSION` in `.env` for each release: the installed app runs its migrations when the version changes.

### Icons

The app and menu bar icons are rendered from `resources/icons/*.svg`:

```bash
scripts/native-icons.sh
```

## Tests and code quality

```bash
composer test          # Pint (check), PHPStan and the Pest test suite
php artisan test       # the test suite only
composer lint          # format PHP with Pint
npm run check          # lint and format check of the frontend
npm run types:check    # TypeScript
composer ci:check      # everything the CI runs
```

## Project structure

| Path                   | Contents                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `app/Services`         | Docker, Caddy, terminal sessions, local servers, integration settings, data export/import, the user's shell environment |
| `app/Native`           | The desktop app: main window, app menu and menu bar icon                                                                |
| `app/Http/Controllers` | Dashboard, projects, terminals, documentation and settings                                                              |
| `resources/js/pages`   | Inertia pages (React)                                                                                                   |
| `resources/icons`      | Sources of the app icons                                                                                                |
| `scripts`              | Desktop build, icons and Electron setup scripts                                                                         |
| `docs`                 | The plan and notes of the desktop app migration (in Portuguese)                                                         |

# Plano: Super Poder Dev como app desktop (NativePHP)

> Status: rascunho para validação · Data: 2026-10-05

## 1. Objetivo

Empacotar a aplicação Laravel 13 + Inertia/React atual como um app desktop nativo para **macOS**, usando **NativePHP Desktop v2** (`nativephp/desktop` ^2.3, que já suporta Laravel 13 e PHP ^8.3). O usuário abre o app pelo Dock/Spotlight, sem precisar de `php artisan serve`, Caddy ou Vite rodando para acessar o próprio painel.

### Por que só macOS (por enquanto)

O código atual depende de recursos específicos de macOS:

| Onde                                          | Dependência                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `app/Services/Caddy.php`                      | `osascript ... with administrator privileges`, binário em `/opt/homebrew`               |
| `app/Services/TerminalSessions.php`           | `/bin/stty -f` (sintaxe BSD), `posix_*`                                                 |
| `app/Console/Commands/TerminalRunCommand.php` | `pcntl_exec`, `posix_setsid`, PTY                                                       |
| `app/Services/LocalServers.php`               | `ps -axo`, `lsof`                                                                       |
| `config/services.php`                         | socket do Docker Desktop em `~/.docker/run/docker.sock`, `open -a "Visual Studio Code"` |

Linux é viável depois com pouco esforço; Windows exigiria reescrever terminais e Caddy. Fica fora do escopo.

## 2. Como o NativePHP roda a app (e o que isso muda)

- O Electron sobe um **PHP estático embutido** que serve a app em `127.0.0.1:<porta aleatória>` e abre uma janela apontando para ela.
- `storage/` fica no diretório de dados do app (`~/Library/Application Support/<app-id>/`). O banco SQLite fica ali no app empacotado; no `native:run` é `database/nativephp.sqlite` (separado do banco da versão web e ignorado pelo git). Migrations rodam automaticamente na inicialização.
- Processos iniciados pelo app herdam o ambiente do `launchd`: **`PATH` mínimo** (`/usr/bin:/bin:/usr/sbin:/sbin`) e sem as variáveis do shell do usuário. `docker`, `caddy`, `code`, `cursor` etc. não são encontrados pelo nome.
- O `.env` é empacotado no build (com as chaves de `cleanup_env_keys` removidas). Configurações que o usuário precisa mudar não podem viver no `.env`.
- O app é single-user, local e sem rede pública.

## 3. Riscos e pontos de atenção (levantados no código)

1. **Extensões do PHP embutido**: o terminal usa `pcntl`, `posix` e `proc_open`; o Docker usa `curl` com `CURLOPT_UNIX_SOCKET_PATH`. Precisamos confirmar que o binário estático do NativePHP inclui `pcntl`, `posix`, `sockets`, `curl`, `pdo_sqlite`, `intl`. Se faltar algo, usar binário PHP customizado (`NATIVEPHP_PHP_BINARY_PATH`). **Validar na Fase 1 antes de qualquer outra coisa.**
2. **`LocalServers` vai detectar o próprio app**: o servidor embutido do NativePHP é um `php -S`. Precisa ser filtrado (pelo PID do processo pai ou pelo caminho do binário embutido).
3. **`TerminalSessions::start`** usa `PhpExecutableFinder` + `nohup ... artisan terminal:run`. No app empacotado, `PHP_BINARY` é o binário embutido e `base_path()` fica dentro do `.app` (somente leitura) — funciona, mas precisa ser testado. Alternativa: `Native\Desktop\Facades\ChildProcess::artisan()`, que gerencia ciclo de vida e encerra os processos quando o app fecha.
4. **Terminais órfãos**: hoje os shells sobrevivem ao request de propósito. No desktop, ao fechar o app devemos encerrar (ou oferecer encerrar) as sessões ativas.
5. **`PATH` e `HOME`** nos `Process::run` de `ProjectController::openInIde`, `Caddy::start` e terminais locais: montar um ambiente com `PATH` incluindo `/opt/homebrew/bin:/usr/local/bin` e o `HOME` real.
6. **Autenticação**: Fortify (registro, reset de senha, verificação de e-mail, 2FA, passkeys) não faz sentido em um app local de usuário único. Ver decisão D1.
7. **Vite**: `vite.config.ts` aponta HMR para `https://super-poder-dev.test:5173` via Caddy. No app empacotado usamos assets buildados (`npm run build`); em `native:run` o HMR depende do Caddy estar no ar. Ver Fase 2.
8. **Caddy precisa de root** (portas 80/443) — o fluxo `sudo -n` → `osascript` continua válido dentro do app, mas o log vai para o `storage` do app.

## 4. Decisões a confirmar

| #   | Decisão                                   | Recomendação                                                                                                                                                                                  |
| --- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Autenticação                              | **Remover login**: criar/garantir um usuário local no boot e autenticar automaticamente (middleware). Desligar features do Fortify. Mantém o resto do código que depende de `auth()->user()`. |
| D2  | Configurações (Caddy, IDE, Docker socket) | **Tela de Settings** persistida no SQLite (tabela `settings` ou `Native\Desktop\Facades\Settings`), com fallback para os valores atuais de `config/services.php`.                             |
| D3  | Rodar em segundo plano                    | **Menu bar app** (ícone na barra com status de Caddy/containers + "Abrir painel"), janela principal fecha sem encerrar o app.                                                                 |
| D5  | `pcntl`/`posix` ausentes no PHP embutido  | **Decidido: (b) reescrever o terminal sem elas.** Implementado; ver "Terminal sem pcntl/posix" na Fase 1.                                                                                     |
| D4  | Distribuição                              | Build `.dmg` assinado e notarizado; auto-update via GitHub Releases. Pode ficar para depois do MVP.                                                                                           |

## 5. Fases

### Fase 0 — Preparação

- [ ] Commitar o trabalho em andamento (hoje há muitos arquivos modificados/não rastreados) e criar branch `feat/nativephp`.
- [ ] Garantir que `composer test` passa antes de começar.

### Fase 1 — Instalação e prova de vida ✅

- [x] `composer require nativephp/desktop` (fixado em `^2.3`)
- [x] `php artisan native:install` (gerou `config/nativephp.php`, `app/Providers/NativeAppServiceProvider.php` e scripts no `composer.json`).
- [x] `.env`/`.env.example`: `NATIVEPHP_APP_ID=dev.superpoder.app`, versão `0.1.0`, autor, descrição e updater desligado.
- [x] `NativeAppServiceProvider::boot()`: janela `main` de 1280×820 (mín. 960×600) na rota `dashboard`, com `rememberState()`.
- [x] `native:run` abre a janela (PHP embutido em `127.0.0.1:8100`; dados em `~/Library/Application Support/superpoder-dev-dev/`).
- [x] Teste de extensões do PHP embutido (8.3.31): ver resultado abaixo.

#### Resultados da Fase 1

**Extensões do PHP embutido**: `curl` (com `CURLOPT_UNIX_SOCKET_PATH`), `sockets`, `pdo_sqlite`, `intl`, `mbstring`, `openssl`, `zip` e `proc_open` estão disponíveis. **Faltam `pcntl` e `posix`**, usadas em:

- `TerminalRunCommand`: `posix_setsid`, `posix_ttyname` e `pcntl_exec` (wrapper do shell local), `pcntl_signal`/`pcntl_async_signals` (`detach()`), `posix_kill` (`hangUpLocalShell`).
- `TerminalSessions`: `posix_kill` (`stop()` e `isRunning()`).

Ver decisão D5.

**Terminal sem pcntl/posix (D5 = b)**:

- O shell local roda via `/usr/bin/script -q /dev/null /bin/sh -c 'tty > …; stty …; exec $SHELL -l'`. O script(1) cria a pty e põe o shell como líder de sessão, então o Ctrl+C e o job control continuam funcionando.
- `isRunning()`: o `terminal:run` segura um `flock` em `running.lock` enquanto vive, aberto com close-on-exec para os shells não herdarem a trava. A trava some junto com o processo, mesmo com SIGKILL.
- `stop()`: cria o arquivo `stop`, que o loop checa a cada 30 ms. Depois faz o mesmo hang-up de antes (`pkill -HUP/-KILL -t <tty>` + `proc_terminate`).
- `start()` só retorna quando a sessão já está rodando (cerca de 100 ms), para o frontend não mostrá-la como encerrada.
- Sobreviver ao Ctrl+C do `composer dev` já não depende de `setsid`: comandos `&` em `sh -c` ignoram SIGINT (POSIX) e o `nohup` ignora SIGHUP.
- Validado de ponta a ponta com o PHP embutido: shell local (tamanho, Ctrl+C, job em background, resize, stop sem processos órfãos) e shell em container (Docker exec + hang-up).

**Problemas de ambiente resolvidos**:

1. O `.npmrc` do projeto tem `ignore-scripts=true`, então o `postinstall` do Electron (que baixa o binário) não roda. Além disso, o `extract-zip` do Electron para no primeiro arquivo em versões recentes do Node. O `scripts/native-electron.sh` baixa o zip com `@electron/get` e extrai com `ditto`. Ele roda no `post-update-cmd` e no `composer native:dev`.
2. Terminais iniciados pelo VS Code/Claude Code herdam `ELECTRON_RUN_AS_NODE=1`, o que faz o Electron rodar como Node puro (`does not provide an export named 'BrowserWindow'`). O `composer native:dev` agora remove essa variável. Se for rodar `php artisan native:run` manualmente: `env -u ELECTRON_RUN_AS_NODE php artisan native:run`.
3. Pré-existente: `boost:update` falha no `post-update-cmd` ("set up Boost with boost:install first") e interrompe os scripts seguintes. Rodar `php artisan boost:install` ou remover a linha.

### Fase 2 — Frontend e assets ✅

- [x] **Tela preta no `native:run`**: com o `public/hot`, a página carrega os módulos do Vite de `https://super-poder-dev.test:5173`, mas a janela roda em `http://127.0.0.1:<porta>`, e o CORS do Vite só aceitava `https://super-poder-dev.test`. O `vite.config.ts` agora aceita também `http://127.0.0.1:*`, e o HMR funciona dentro da janela nativa.
- [x] `public/hot` excluído do build (`cleanup_exclude_files`), para o app empacotado nunca apontar para o Vite. Também foram excluídos `tests/`, `docs/`, `scripts/` e as pastas de agentes (`.claude`, `.agents`, `.cursor`, `.junie`).
- [x] Fontes: o `laravel-vite-plugin` já embute as fontes Bunny no build (`.woff2` locais). O app funciona offline.
- [x] Links externos: `resources/js/lib/native.ts` intercepta, dentro do app (`window.Native`), cliques em links para outro domínio ou com `target="_blank"` e chama `POST /native/open-external` (`NativeController`, `Shell::openExternal`, aceita só `http`/`https`). A janela usa `suppressNewWindows()` como garantia.
- [x] `fruitcake/laravel-debugbar` removido (não faz sentido no desktop).
- [x] Aviso do React no `app-logo-icon.tsx` (`stroke-width` → `strokeWidth` etc.).
- [ ] Barra de título customizada (`titleBarHidden()` + área arrastável): opcional, não feita (ver Fase 7).

### Fase 3 — Autenticação (D1) ✅

- [x] `AuthenticateDesktopUser` (grupo `web`, na lista de prioridade antes do `auth`): **só dentro do app** (`nativephp-internal.running`), faz login do primeiro usuário ou cria um na primeira execução, com o nome completo da conta do macOS (`id -F`) e `<conta>@localhost`. O e-mail é marcado como verificado.
- [x] **Navegador continua com login**: o painel abre shells nesta máquina e o Caddy pode estar acessível na rede. Dentro do app, o `PreventRegularBrowserAccess` do NativePHP já recusa requisições que não vêm da janela. Por isso as features do Fortify **continuam ligadas** (só valem no navegador).
- [x] Prop compartilhada `desktop`. No app ficam escondidos: "Log out", a aba **Security** (senha/2FA/passkeys exigem confirmar uma senha que não existe) e "Delete account".
- [x] Telas de login/registro redirecionam ao dashboard no app (o usuário já está logado).
- [x] A janela abre direto no dashboard. A rota `/` (welcome) nunca é aberta pela janela.
- [x] Testes: criação e login do usuário, verificação de e-mail, redirecionamento do login, navegador sem login automático, prop `desktop`.

### Fase 4 — Ambiente de processos do macOS ✅

- [x] `App\Services\ShellEnvironment`: ambiente "como se fosse o terminal do usuário".
    - `PATH` do shell de login interativo (`$SHELL -ilc`, inclui o `~/.zshrc`), lido com marcadores (ignora banners) e cacheado por 1 h. Se o shell não responder, usa o PATH atual + `/opt/homebrew/bin`, `/opt/homebrew/sbin`, `/usr/local/bin`.
    - Só as variáveis do usuário (`HOME`, `USER`, `LOGNAME`, `SHELL`, `LANG`, `LC_*`, `TMPDIR`, `SSH_AUTH_SOCK`). `replacing()` remove as demais para o `Process::env()`, já que o Symfony Process sempre herda o ambiente do processo pai.
- [x] **Vazamento corrigido**: "Abrir na IDE" passava `getenv()` inteiro (`APP_KEY`, `DB_*`, `NATIVEPHP_SECRET`...). Uma IDE aberta assim repassava essas variáveis aos terminais dela, e elas têm prioridade sobre o `.env` dos projetos Laravel.
- [x] Usado em `ProjectController::openInIde` e no shell local do `TerminalRunCommand` (que tinha sua própria lista de variáveis, agora unificada). O `TerminalSessions::start` continua repassando `getenv()` ao `terminal:run`, que precisa do ambiente do app (`NATIVEPHP_STORAGE_PATH` etc.).
- [x] `Caddy::start` não precisou mudar: `sudo`, `osascript` e `sh` estão no PATH do sistema e o binário do Caddy é absoluto.
- [x] `LocalServers` ignora, no app, o próprio `php -S` do NativePHP (`getmypid()`, servidor de processo único). No navegador, o `artisan serve` deste projeto continua listado.
- [x] Validado com o PHP embutido e ambiente de Dock simulado (`env -i`, PATH mínimo): `docker`/`caddy` encontrados no terminal local, `APP_KEY`/`NATIVEPHP_SECRET` ausentes.
- [x] Testes: PATH do shell de login, fallback, só variáveis do usuário, filtro do próprio servidor (app × navegador).

### Fase 5 — Configurações editáveis (D2) ✅

- [x] Tabela `settings` (chave/valor, migration `2026_10_06_120000`) + model `Setting`.
- [x] `App\Services\IntegrationSettings`: `get()` devolve o valor salvo ou o padrão de `config/services.php`. Valor vazio volta ao padrão.
- [x] `Docker`, `Caddy` e `ProjectController::openInIde` leem pelo serviço (eram 5 `config()` diretos).
- [x] Página **Settings → Integrations** (`settings/integrations`): socket do Docker, binário/Caddyfile/Admin API do Caddy e comando da IDE. Placeholder com o padrão, indicador "Found/Not found" para os caminhos.
- [x] Validação: caminhos absolutos, binário do Caddy executável, Admin API `http(s)`.
- [x] Testes: página, salvar/voltar ao padrão, validação e os serviços usando o valor salvo.

#### 🔒 Correção de segurança (afeta a Fase 3)

O `PreventRegularBrowserAccess` do NativePHP **não estava ativo**. O NativePHP o adiciona com `pushMiddleware()` no `register()` do provider, mas no Laravel 11+ a configuração de middlewares do `bootstrap/app.php` substitui a lista global depois. Com o login automático da Fase 3, qualquer processo ou página que alcançasse `127.0.0.1:8100` entrava logado, inclusive nos terminais.

- [x] Registrado em `bootstrap/app.php` (`$middleware->append(...)`, sem efeito fora do app).
- [x] Validado no app: 403 sem segredo ou com segredo errado, 200 com o segredo; a janela continua funcionando.
- [x] Teste de regressão `the desktop app only answers its own window` (falha sem a correção). Helper `inDesktopApp()` em `tests/Pest.php`.

#### Migrations no app

- Em `native:run` o NativePHP **não** roda migrations: `php artisan native:migrate`.
- No app empacotado, ele migra só quando a versão muda (`migrated_version` ≠ `NATIVEPHP_APP_VERSION`). **Toda release com migration nova precisa subir a versão.**

### Fase 6 — Terminais no ciclo de vida do app ✅

- [x] Remover a dependência de `pcntl`/`posix` (D5), validado com o PHP embutido.
- [x] O Laravel não recebe aviso de encerramento: no `before-quit`, o Electron mata o servidor PHP e depois os processos registrados pelo `ChildProcess` (árvore inteira, SIGTERM). Os terminais iniciados com `nohup ... &` eram adotados pelo launchd e **sobreviviam** ao app.
- [x] No app, `TerminalSessions::start` inicia o `terminal:run` com `ChildProcess::artisan(['terminal:run', $key], alias: "terminal-$key")`. O ambiente interno do NativePHP (storage, banco) é repassado pelo Electron. No navegador continua o `nohup` (sobrevive ao Ctrl+C do `composer dev`).
- [x] Validado no app rodando: terminal local aberto pelos endpoints, `terminal:run` como filho do Electron, `sleep 777 &` no shell. Depois do "Quit" (`App::quit()`), nenhum processo sobrou (`terminal:run`, shell, `sleep`, servidor PHP).
- [x] Testes: desktop usa `ChildProcess::artisan` (sem `Process`), navegador usa `nohup` e grava o pid.
- [ ] Rodar de novo no app **empacotado** (Fase 8): `base_path()` dentro do `.app` (somente leitura), sessões em `~/Library/Application Support/.../storage`.

### Fase 7 — Integração nativa (D3) ✅

- [x] **Barra de menu** (`App\Native\StatusMenu`): ícone template (monocromático, o macOS tinge) com "Open Dashboard", status do Caddy + "Start/Stop Caddy", quantidade de containers rodando e "Quit". O app continua no Dock (`showDockIcon()`: o padrão do NativePHP o esconderia).
    - Atualizado a cada minuto (o NativePHP roda o `schedule:run`; tarefa `status-menu:refresh`, só no app) e logo após ações de Caddy/containers no dashboard (`defer`).
    - Cliques tratados em `App\Listeners\HandleMenuItemClick` (evento `MenuItemClicked`). Ações do Caddy pela barra de menu mostram **notificação do macOS** (a janela pode estar fechada); na janela continuam os toasts.
    - **Bug do NativePHP contornado**: no modo `onlyShowContextMenu`, recriar a barra de menu não destrói o ícone anterior. Como o clique no Dock sem janela aberta roda o `boot()` de novo, o ícone é criado só uma vez por execução (marcador = `NATIVEPHP_SECRET`, aleatório a cada abertura).
- [x] Fechar a janela não encerra o app (padrão do Electron no macOS). Clicar no Dock ou em "Open Dashboard" reabre a janela (`App\Native\MainWindow::open()`, que só foca se já estiver aberta).
- [x] **Menu do app** (`App\Native\ApplicationMenu`): App, Edit, **Go** (Dashboard ⌘1, Documentation ⌘2, Settings ⌘, , Integrations), View, Window.
- [x] **Ícones**: fontes SVG em `resources/icons/` (`app.svg` no grid de ícones do macOS; `menu-bar.svg` = escudo com o raio vazado), renderizadas por `scripts/native-icons.sh` em `public/icon.png` (1024) e `public/IconTemplate.png`/`@2x` (22/44).
    - Correção: a primeira versão usava o QuickLook, que preenche a transparência com **branco opaco** (fundo branco no Dock; na barra de menu, um quadrado sólido, porque imagens template só usam o alfa). Agora `scripts/render-svg.swift` renderiza via AppKit (Command Line Tools), preservando a transparência.
- [x] Testes: conteúdo do menu (Caddy/Docker no ar ou não), criação única por execução, "Open Dashboard", notificação ao iniciar o Caddy, atualização após ação no dashboard.
- [ ] Barra de título customizada (`titleBarHidden()` + área arrastável): opcional, não feita.

### Exportar e importar dados ✅

- [x] `App\Services\DataTransfer`: arquivo JSON versionado (`format: superpoder-dev`, `version: 1`) com projetos, categorias, documentos (categoria pelo nome, datas preservadas) e configurações de integração. **Sem usuários, senhas nem IDs.**
- [x] Importação por **mesclagem, sem apagar nada**: projetos pela chave `project`, categorias pelo nome, documentos por categoria e título, configurações pela chave. Numa transação, com validação completa antes (nome de projeto, chaves de configuração permitidas, versão).
- [x] Página **Settings → Data** (`settings/data`) e item "Export & Import Data" no menu Go. O export é um download comum: no navegador baixa o arquivo; no app, o Electron abre o "Salvar como" do macOS.
- [x] Uso principal: levar os dados da versão web para o app, que tem banco próprio. Validado com os dados reais (10 projetos, 2 documentos) numa cópia do banco do app.
- [x] Testes: contagens, export sem usuários/IDs, ida e volta entre instalações, mesclagem, arquivos inválidos rejeitados sem alterar nada.

### Fase 8 — Build e distribuição (D4)

#### Build local sem assinatura ✅

- [x] `composer native:build-local` (`scripts/native-build-local.sh [arm64|x64]`): build do frontend → `native:build mac` → reassinatura → `.dmg` e `.zip` em `nativephp/electron/dist/` (ignorado pelo git).
- [x] **Reassinatura**: sem identidade Apple, o electron-builder assina ad-hoc **com hardened runtime**, que só carrega bibliotecas do mesmo Team ID. Uma assinatura ad-hoc não tem Team ID, então o app não abre (`Library not loaded: Electron Framework … different Team IDs`). O script assina de novo ad-hoc sem hardened runtime e refaz `.dmg`/`.zip` a partir desse `.app`.
- [x] `.env` embutido sem `APP_ENV`/`APP_DEBUG`/`APP_URL` (`cleanup_env_keys`): o app roda com `production` e debug desligado.
- [x] Fora do pacote (`cleanup_exclude_files`): `tests/`, `docs/`, `scripts/`, `public/hot`, pastas de agentes e **`storage/app/private/*`** (saída dos terminais de desenvolvimento, que o NativePHP copiaria para o app).
- [x] Validado no app empacotado, iniciado com ambiente mínimo (como pelo Dock): migrations na primeira execução, usuário local criado, proteção 403 sem segredo, dashboard com Docker, servidores locais sem o próprio app, terminal local (acha `docker`/`caddy`, sem `APP_KEY`), sessão em `~/Library/Application Support/superpoder-dev/`, e nada sobrando depois do Quit.
- [x] Fora do pacote também: `storage/inertia-devtools` (210 MB de payloads de páginas, com dados reais), `storage/debugbar`, `storage/pail`. O script de build **falha** se o `storage/` do pacote tiver algo além de `app`, `framework` e `logs`. Resultado: `.dmg` de 130 MB, `.app` de 392 MB (antes 383 MB e 616 MB).
- [x] Validado também o `.dmg`: montado, ícone com transparência no `icon.icns`, assinatura válida, app aberto com `open` a partir do volume.
- Abrir o app com `open` **a partir de um terminal do VS Code/Claude Code** falha em silêncio: o app herda `ELECTRON_RUN_AS_NODE=1` desse terminal e o Electron roda como Node puro. Pelo Dock/Finder não acontece. No terminal: `env -u ELECTRON_RUN_AS_NODE open "SuperPoder Dev.app"`.
- Rodando a partir do DMG (somente leitura), o NativePHP não consegue gravar o cache de config/rotas dentro do app; funciona igual, só sem esse cache. Instale em `/Applications`.
- Dados do app empacotado: `~/Library/Application Support/superpoder-dev/` (o `native:run` usa `superpoder-dev-dev`). Para levar os dados da web: Settings → Data → Export no navegador, Import no app.

#### Distribuição assinada (pendente: precisa de conta Apple Developer)

- [ ] Assinatura e notarização (`NATIVEPHP_APPLE_ID`, `NATIVEPHP_APPLE_ID_PASS`, `NATIVEPHP_APPLE_TEAM_ID`); com identidade, o `native:build` normal já funciona (sem a reassinatura).
- [ ] Build x64 (Macs Intel), se necessário.
- [ ] Auto-update via provider `github` em `config/nativephp.php` (`NATIVEPHP_UPDATER_ENABLED=true`). **Subir a `NATIVEPHP_APP_VERSION` a cada release**: é ela que dispara as migrations no app instalado.
- [ ] Workflow de CI (GitHub Actions, runner macOS) gerando o `.dmg` nas tags.

## 6. Critérios de pronto (MVP = Fases 0–6)

- App abre pelo `.app`, sem servidor externo, direto no dashboard e sem login.
- Containers Docker listados e controláveis; stats carregam.
- Caddy: status, start (com prompt de senha do macOS) e stop funcionam.
- Terminais de container e de projeto local abrem, redimensionam e são encerrados ao sair do app.
- "Abrir na IDE" funciona com o comando configurado.
- CRUD de projetos e documentação funcionando com o SQLite do app.
- `composer test` passa.

## 7. Comandos de referência

```bash
composer require nativephp/desktop
php artisan native:install
php artisan native:run            # desenvolvimento
php artisan native:build mac      # empacotar
```

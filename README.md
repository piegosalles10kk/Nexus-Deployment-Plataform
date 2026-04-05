# Nexus — Deployment Platform

O **Nexus** é uma solução self-hosted completa de CI/CD e gerenciamento de infraestrutura — o equivalente proprietário do Railway/Coolify. Controle total sobre deployments, containers, gateway reverso, auto-scaling e servidores cloud, sem depender de plataformas externas.

---

## Funcionalidades

### CI/CD Pipeline
- Integração nativa com GitHub via Webhooks (HMAC-SHA256)
- **Pipeline LOCAL automático:** `git clone` → `npm ci` → `testes` → `docker build` → `deploy` com labels de proxy
- **Pipeline CLOUD:** deploy é roteado ao agente remoto via WebSocket mTLS — o agente executa o build localmente no servidor e faz streaming dos logs de volta em tempo real
- Workflow steps customizados por projeto: `LOCAL_COMMAND` (spawn local) ou `REMOTE_SSH_COMMAND` (via ssh2)
- Container iniciado com labels `10kk.proxy.host` / `10kk.proxy.port` para auto-registro no gateway
- Histórico de deploys com logs completos, hash de commit, autor e resultado de testes
- Deploy manual pelo painel ou via API
- Cancelamento de deploy em andamento
- Secrets criptografados por projeto (AES-256-GCM), injetados como variáveis de ambiente no container

### Monitoramento em Tempo Real
- Métricas de CPU e memória por container via Socket.io (sem polling)
- Gráficos históricos (Recharts) com 20 pontos por instância
- Health check HTTP com latência em ms
- Status por instância: `RUNNING`, `UNHEALTHY`, `STOPPED`

### Auto-scaling Horizontal
- Política por projeto: thresholds de CPU, memória e latência
- Scale-out automático: cria réplicas e adiciona ao upstream nginx
- Scale-in: remove instâncias ociosas respeitando `minReplicas`
- Cooldown configurável entre operações de scaling

### API Gateway
- Proxy reverso por path (`/minha-api` → `http://container:3000`)
- **Auto-registro via Docker Labels** — containers sobem com `10kk.proxy.host` e `10kk.proxy.port`; o watcher de eventos Docker cria/remove a rota automaticamente
- Suporte a rotas para URLs externas
- Gerenciamento visual no painel

### Docker Socket Proxy
- O backend **nunca** acessa `/var/run/docker.sock` diretamente
- `tecnativa/docker-socket-proxy` media todas as operações Docker via TCP
- Permissões granulares configuráveis no painel (criar containers, remover volumes, remover imagens)

### Módulo Cloud
- Cadastro de provedores AWS e DigitalOcean (credenciais criptografadas)
- Provisionamento de servidores via **Terraform CLI** com cloud-init
- Cloud-init instala Docker + 10KK Agent automaticamente no servidor provisionado
- Destruição de servidores com `terraform destroy` pelo painel
- Status em tempo real: `PROVISIONING` → `RUNNING` / `ERROR`
- Projetos do tipo `CLOUD` associados a um servidor disparam o pipeline no agente remoto; o vínculo é feito pela setting `NODE_ID_<cloudServerId>` (preenchida automaticamente no enrollment do agente)

### Agente Distribuído (10KK Agent)
- Binário Go único, agnóstico de sistema operacional (Linux, macOS, Windows)
- Conecta ao backend via **mTLS WebSocket** (porta 8443)
- Certificados emitidos automaticamente no enrollment (CA interna)
- Roda como serviço nativo: systemd (Linux), Launchd (macOS), Windows Service
- Envia métricas de CPU/RAM/Disco a cada 10 segundos
- Stream de logs de containers em tempo real (`bufio.Scanner` + `stdcopy`)
- **Executa deploys remotos:** recebe `{ type: "command", action: "deploy", repo, branch, envVars }`, faz o build/run localmente e responde com `deploy_done` ou `deploy_failed`; logs intermediários são enviados como `log_line` em tempo real
- Auto-update sem downtime (workaround de file-lock no Windows)
- Reconexão automática com backoff exponencial (até 60s)

### Segurança
- Autenticação JWT com RBAC: `ADM`, `TECNICO`, `OBSERVADOR`
- Rate limiting e circuit breaker via Redis
- Secrets AES-256-GCM por projeto
- mTLS para comunicação com agentes remotos

---

## Estrutura do Projeto

```
10KK-PLATFORM-UNIFIED/
├── backend/                    # Express + TypeScript + Prisma (porta 4500)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/           # Login, reset de senha
│   │   │   ├── projects/       # CRUD de projetos
│   │   │   ├── deploys/        # Pipeline CI/CD
│   │   │   ├── secrets/        # Variáveis criptografadas
│   │   │   ├── gateway/        # Proxy reverso dinâmico
│   │   │   ├── lb/             # Load balancer nginx
│   │   │   ├── cloud/          # Providers AWS/DO + Terraform
│   │   │   ├── agent/          # Enrolamento e gerenciamento de agentes
│   │   │   ├── settings/       # Configurações + Docker permissions
│   │   │   └── users/          # Gestão de usuários (ADM)
│   │   └── services/
│   │       ├── docker.service.ts       # Dockerode via proxy TCP
│   │       ├── docker-watcher.service.ts # Docker Events → Gateway auto-register
│   │       ├── monitoring.service.ts   # Health check + métricas 15s
│   │       ├── pipeline.service.ts     # Executor do CI/CD
│   │       ├── terraform.service.ts    # Wrapper Terraform CLI
│   │       ├── ca.service.ts           # CA interna para mTLS
│   │       ├── agent-ws.service.ts     # Servidor WSS mTLS para agentes
│   │       └── crypto.service.ts       # AES-256-GCM
│   └── prisma/
│       └── schema.prisma
├── frontend/                   # React + Vite + Tailwind 4 (porta 5173)
│   └── src/
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── ProjectPage.tsx     # Instâncias, Deploys, Secrets, Config
│       │   ├── GatewayPage.tsx
│       │   ├── CloudPage.tsx
│       │   ├── SettingsPage.tsx
│       │   └── AdminUsersPage.tsx
│       └── components/
│           └── MetricsChart.tsx    # Recharts CPU/mem por instância
├── agent/                      # Binário Go cross-platform
│   ├── cmd/agent/main.go       # Entrypoint + flags de serviço
│   ├── internal/
│   │   ├── app/service.go      # Wrapper kardianos/service
│   │   ├── docker/             # Client.FromEnv + stream de logs
│   │   ├── network/            # mTLS + WebSocket reconnect
│   │   ├── metrics/            # gopsutil CPU/RAM/Disco
│   │   └── updater/            # Auto-update cross-platform
│   ├── scripts/
│   │   ├── install.sh          # Instalador Linux/macOS
│   │   └── install.ps1         # Instalador Windows (PowerShell)
│   └── Makefile
└── docker-compose.yml
```

---

## Como Iniciar

### Pré-requisitos

- Docker e Docker Compose
- Git
- `terraform` CLI (necessário apenas para o módulo Cloud)

### Subindo a plataforma

```bash
# 1. Clone o repositório
git clone <repo-url>
cd 10KK-PLATFORM-UNIFIED

# 2. Suba todos os serviços
docker-compose up -d --build

# 3. Aplique o schema do banco
docker exec -it 10kk-backend npx prisma db push

# 4. Crie o usuário ADM inicial
docker exec -it 10kk-backend npx prisma db seed
```

**Acesso:** `http://localhost:5173`
**Credenciais padrão:** `admin@cicd.local` / `admin123`

### Portas

| Serviço | Porta | Descrição |
|---|---|---|
| Frontend | 5173 | Interface web |
| Backend API | 4500 | REST API + Socket.io |
| Webhook GitHub | 4500/webhook/github | Endpoint para webhooks |
| API Gateway | 4500/\<path\> | Proxy dinâmico |
| Agent WSS | 8443 | WebSocket mTLS para agentes |
| PostgreSQL | 5432 | Banco de dados |
| Redis | 6379 | Cache + rate limit |

---

## Configurar Webhook no GitHub

No repositório do projeto, acesse **Settings → Webhooks → Add webhook**:

- **Payload URL:** `http://SEU-HOST:4500/webhook/github`
- **Content type:** `application/json`
- **Secret:** valor de `GITHUB_WEBHOOK_SECRET` no `docker-compose.yml`
- **Events:** `Just the push event`

---

## Provisionar Servidor Cloud (GCP / AWS / DigitalOcean)

### 1. Cadastrar Provider

**Painel: Cloud → Providers → Novo Provider**

| Provider | Campo "API Key" |
|---|---|
| DigitalOcean | Token da API (Personal Access Token) |
| AWS | `ACCESS_KEY_ID:SECRET_ACCESS_KEY` |
| GCP | Conteúdo completo do JSON da Service Account |
| Azure | Client Secret (+ Client ID, Tenant ID, Subscription ID) |

> **GCP:** gere a Service Account em **IAM → Service Accounts → [conta] → Keys → Add Key → JSON** e cole o conteúdo inteiro no campo API Key.

### 2. Gerar par de chaves SSH

O campo **SSH Public Key** no modal de provisionamento recebe sua chave pública SSH. Gere uma se ainda não tiver:

Linux / macOS:
```bash
ssh-keygen -t ed25519 -C "10kk-server"
cat ~/.ssh/id_ed25519.pub   # ← cole no campo SSH Public Key
```

Windows (PowerShell):
```powershell
ssh-keygen -t ed25519 -C "10kk-server"
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"   # ← cole no campo SSH Public Key
```

> A chave privada fica apenas na sua máquina. A chave pública é injetada no servidor via cloud-init e permite acesso SSH posterior: `ssh -i ~/.ssh/id_ed25519 root@<ip>`

### 3. Provisionar

**Painel: Cloud → Providers → [provider] → Novo Servidor**

Preencha nome, região, tipo de instância e cole a chave pública. O backend:
1. Cria o registro `Node` + JWT de enrollment (validade 2h)
2. Executa Terraform em background — retorna `202` imediatamente
3. Quando a VM sobe, o cloud-init instala Docker + 10KK Agent automaticamente
4. O agente conecta via mTLS WebSocket e o status muda para `ONLINE`

---

## Instalar o Agente em um Servidor Remoto

### 1. Gerar token de enrollment

Via painel em **Cloud → Agentes → Novo Agente**, ou via API:

```http
POST http://seu-host:4500/api/v1/agent/nodes
Authorization: Bearer <seu-jwt-adm>
Content-Type: application/json

{ "name": "Servidor-Web-1" }
```

O token retornado tem validade de **2h** (para servidores provisionados via Terraform o token é gerado automaticamente pelo backend).

---

### 2a. Instalação Automática (recomendado)

O script faz tudo: detecta OS/arch, baixa o binário, obtém os certificados mTLS via `/api/v1/agent/enroll` e instala como serviço nativo.

**Linux / macOS:**
```bash
curl -sSL http://seu-host:4500/install.sh | sudo bash -s -- \
  --token SEU_TOKEN \
  --master wss://seu-host/ws/agent
```

**Windows (PowerShell como Administrador):**
```powershell
Invoke-WebRequest -Uri "http://seu-host:4500/install.ps1" -OutFile install.ps1
.\install.ps1 -Token "SEU_TOKEN" -Master "wss://seu-host/ws/agent"
```

O binário é salvo em `/usr/local/bin/10kk-agent` (Linux/macOS) ou `C:\Program Files\10KK-Agent\` (Windows).  
Os certificados mTLS ficam em `/etc/10kk/certs/` (Linux/macOS) ou `C:\Program Files\10KK-Agent\certs\` (Windows).

---

### 2b. Instalação Manual

**1. Baixar o binário:**
```bash
# Substitua <os> por linux ou darwin, e <arch> por amd64 ou arm64
curl -fsSL http://seu-host:4500/downloads/10kk-agent-<os>-<arch> \
  -o /usr/local/bin/10kk-agent
chmod +x /usr/local/bin/10kk-agent
```

**2. Obter certificados mTLS:**
```bash
mkdir -p /etc/10kk/certs
curl -fsSL -X POST \
  -H "Authorization: Bearer SEU_TOKEN" \
  http://seu-host:4500/api/v1/agent/enroll \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
open('/etc/10kk/certs/ca.crt','w').write(d['ca_crt'])
open('/etc/10kk/certs/client.crt','w').write(d['client_crt'])
open('/etc/10kk/certs/client.key','w').write(d['client_key'])
print('Certificados salvos.')
"
chmod 600 /etc/10kk/certs/client.key
```

**3. Instalar e iniciar o serviço:**
```bash
sudo /usr/local/bin/10kk-agent -service install \
  -master wss://seu-host/ws/agent \
  -token SEU_TOKEN

sudo systemctl enable 10kk-agent
sudo systemctl start  10kk-agent
```

---

### 3. Verificar logs

```bash
# Linux
journalctl -u 10kk-agent -f

# macOS
tail -f /var/log/10kk-agent.log

# Windows (PowerShell)
Get-EventLog -LogName Application -Source '10kk-agent'
```

---

### 4. Controle do serviço

```bash
10kk-agent -service stop
10kk-agent -service start
10kk-agent -service restart
10kk-agent -service uninstall
```

> **Instalação via Terraform (Cloud Module):** ao provisionar um servidor pelo painel, o cloud-init executa o script `install.sh` automaticamente — nenhuma ação manual é necessária.

---

## Build do Agente

```bash
cd agent
go mod tidy
make all

# Binários gerados em agent/dist/
# 10kk-agent-linux-amd64
# 10kk-agent-linux-arm64
# 10kk-agent-darwin-arm64
# 10kk-agent-darwin-amd64
# 10kk-agent-windows-amd64.exe
```

---

## Variáveis de Ambiente

Configuradas no `docker-compose.yml`:

| Variável | Descrição |
|---|---|
| `JWT_SECRET` | Segredo para assinatura de tokens JWT |
| `GITHUB_WEBHOOK_SECRET` | Segredo HMAC-SHA256 para validar webhooks do GitHub |
| `ENCRYPTION_KEY` | Chave AES-256 para criptografia de secrets (hex, 64 chars) |
| `DOCKER_PROXY_HOST` | URL do Docker Socket Proxy (ex: `tcp://docker-proxy:2375`) |
| `AGENT_WS_PORT` | Porta do servidor WSS mTLS para agentes (padrão: `8443`) |

---

## Stack Tecnológica

| Camada | Tecnologias |
|---|---|
| Backend | Node.js, Express, TypeScript, Prisma ORM, Socket.io, Dockerode, Zod |
| Frontend | React 18, Vite, Tailwind CSS 4, TanStack Query, Recharts, Lucide |
| Banco de dados | PostgreSQL 16, Redis 7 |
| Agente | Go 1.25, kardianos/service, gorilla/websocket, Docker SDK, gopsutil |
| Infra | Docker Compose, tecnativa/docker-socket-proxy, nginx, Terraform CLI |

---

## Licença

Projeto Privado — Todos os direitos reservados.

# Vercel com Next.js e Supabase

O mesmo `web/app` executa interface, SSR/RSC e BFF em Route Handlers, sem backend separado. Next.js 16.3.4 e React 19.2.6 já estavam no lockfile; não houve troca de dependências. As rotas ativas usam Request/Response, Web Crypto e fetch, disponíveis no Node da Vercel. `cloudflare:workers` aparece somente no scaffold D1 não importado pela aplicação. O snapshot `data/analytics.json` é uma dependência de servidor, importada depois do guard, e precisa integrar o build.

## Configuração do projeto

- Root Directory: **web**. Não usar a raiz dbt.
- Framework: **Next.js**, Node **24.x** (local validado com 24.14.1).
- Install Command: `npm ci`; Build Command: `npm run build:vercel`.
- Output Directory: padrão Next (`.next`), sem override para `dist` ou export estático.
- `web/vercel.json` fixa framework e comandos. Executar CLI a partir de `web/`; coordenador cuida de link, deploy e configurações remotas.

`typescript.ignoreBuildErrors: true` está definido antes de qualquer build. Isso desliga a validação de tipos, mantendo a compilação TypeScript necessária. Next 16 não executa lint durante `next build`; não adicionar hooks de typecheck/lint. O layout raiz usa `force-dynamic`, inclusive para login, confirmação, 404 e redirects privados. Nenhum dado ou segredo é necessário para prerenderização.

Comandos locais para o alvo Vercel:

```sh
npm ci
npm run dev:vercel -- --hostname localhost --port 3000
npm run build:vercel
npm run start:vercel -- --hostname localhost --port 3000
```

Em desenvolvimento, usar `AUTH_ORIGIN=http://localhost:3000` e abrir exatamente esse host. O Next normaliza IPs loopback para localhost em NextURL; misturar `127.0.0.1` com localhost causa `invalid_origin`. Em produção, o auth recusa origem HTTP, mesmo local. Teste integrado usa HTTPS lógico de proxy com transporte HTTP local.

## Ambiente e Supabase

Copiar os nomes de `.env.example` para o armazenamento de ambiente Vercel. Todos são **server-only**, sem prefixo `NEXT_PUBLIC_`:

| Variável | Valor/condição |
| --- | --- |
| `AUTH_ENABLED` | `true` após SMTP/templates/banco prontos; ausente ou false bloqueia login e dados |
| `AUTH_ORIGIN` | `https://clube-do-valor.vercel.app`, sem barra final; confirmar alias real antes da ativação |
| `SUPABASE_URL` | URL HTTPS do projeto dedicado |
| `SUPABASE_ANON_KEY` | Chave pública do projeto, usada somente pelo BFF |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret de servidor para RPC; nunca navegador/logs |
| `AUTH_COOKIE_KEY` | 32 bytes aleatórios em 64 caracteres hex; manter estável entre deploys da mesma origem |
| `AUTH_OTP_LENGTH` | `6`; código visual do PC continua com oito dígitos |
| `AUTH_TRUST_CLOUDFLARE` | **false** na Vercel direta |

Next lê `.env.local` localmente; `.dev.vars` é exclusivo do caminho Worker. Não copiar secrets entre arquivos via logs. `.vercelignore` exclui ambientes locais, estado Sites, testes e evidências visuais da publicação, preservando o JSON analítico de servidor. Preview deve ter origem exata e ambiente próprio ou auth desabilitada; não inferir origem de header nem liberar callbacks wildcard para qualquer preview. Cookies `__Host-`, HttpOnly, Secure, SameSite=Lax são restritos à origem, portanto sessões Sites não migram para Vercel.

`supabase/config.toml` prepara `site_url` Vercel e adiciona seu `/api/auth/confirm**`, preservando callback Sites e localhost. Coordenador confirma alias, revisa e aplica a configuração remota após deploy. As migrations existentes já foram aplicadas; não executar reset, db push ou reaplicação automática. Os templates existentes usam a origem do redirect enviado pelo BFF. Não é necessário novo SMTP, banco analítico ou servidor HTTP.

## Headers, proxy e limites

Respostas privadas, inclusive redirects, mantêm `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, nosniff, frame denial, CSP e Permissions-Policy. APIs/CSV mantêm `Vary: Cookie`. **Diferença comprovada:** Next 16.3.4 substitui `Vary` em páginas HTML/RSC por suas variantes RSC e compressão, descartando Cookie configurado. `force-dynamic` e no-store continuam impedindo cache compartilhado. Não sobrescrever todo `Vary` na borda eliminando variantes RSC. Exigir Cookie literal também em HTML demanda uma camada final de resposta; o wrapper Worker Sites já oferece isso. Um proxy Next experimental foi testado e removido porque não corrigiu essa substituição.

Na Vercel direta, não confiar em `cf-connecting-ip` enviado pelo visitante. Com `AUTH_TRUST_CLOUDFLARE=false`, o rate limiter existente usa bucket global de endereço; continua seguro, porém pode limitar usuários diferentes em conjunto (por exemplo, dez inícios/15 min nesse bucket). Não foi introduzida confiança implícita em `x-forwarded-for`. Antes de aumentar tráfego, decidir com evidência do ambiente remoto uma fonte de IP garantida pela Vercel e cobertura por testes.

Preferir conexão DNS direta à Vercel. Se Cloudflare for colocado à frente: garantir origem inacessível por bypass antes de habilitar confiança Cloudflare, encaminhar host/protocolo canônicos, preservar múltiplos Set-Cookie, query do callback e headers privados; desabilitar cache de HTML, RSC e `/api/*`, sem regras Cache Everything. Vercel pode sobrescrever X-Forwarded-For e um proxy pode prejudicar mitigação/visibilidade e gerar custo duplicado. Não habilitar recurso pago para contornar esses limites. Callback carrega token descartável na query: verificar retenção/redação de URL nos logs Vercel, pois o controle de invocation logs do Worker não se transfere automaticamente.

Fontes oficiais: [TypeScript ignoreBuildErrors](https://nextjs.org/docs/app/api-reference/config/next-config-js/typescript), [Next 16: remoção de lint do build](https://nextjs.org/docs/app/guides/upgrading/version-16), [headers Next](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers), [Vercel e reverse proxies](https://vercel.com/docs/security/reverse-proxy), [request headers Vercel](https://vercel.com/docs/headers/request-headers).

## Validação e continuidade Sites

Build Next local aprovado, com `Skipping validation of types`, todas as páginas/APIs dinâmicas. `node --test tests/auth-core.test.mjs tests/auth-provider.test.mjs tests/authz.test.mjs`: 21 testes passaram. Após build, `node --test tests/next-production.test.mjs`: 205 asserções HTTP com provider offline, cobrindo HTML/RSC anônimo, sem role e analyst; APIs e três CSVs; polling pendente/aprovado; callback, confirmação entre dispositivos, OTP, cookies múltiplos e logout; CSRF, headers e bloqueio de fontes privadas. O fixture proíbe OTP de envio e qualquer fetch externo. Não prova SMTP, configuração remota ou jornada real no domínio Vercel.

Os comandos originais `dev`, `build` e `start`, Vite, Worker e `.openai/hosting.json` continuam sendo o caminho Sites/Cloudflare. O build `node scripts/run-framework.mjs build` também passou após os ajustes. `vercel.json` seleciona os comandos adicionais somente para Vercel. Não houve edição de auth compartilhado, migração, commit, push ou deploy nesta preparação. Após publicação, validar no alias real 401/403/200, HTML/RSC, CSV, headers, cookies e polling; só enviar e-mail real com autorização específica.

## Publicação pelo coordenador — 23/10/2026

O coordenador publicou [https://clube-do-valor.vercel.app](https://clube-do-valor.vercel.app), deployment `dpl_CQU7f2AbjUi6h5sQUC3SvS6oxqzB`, com estado **READY**. O build remoto executou `npm ci` e `next build` com sucesso, sem typecheck ou lint.

No Supabase, `site_url` e a allowlist `/api/auth/confirm**` foram aplicados via `config push`: duas propriedades alteradas e 12 propriedades remotas preservadas. O SMTP existente foi mantido. O coordenador também atualizou a description e a homepage do GitHub; nenhum README integra essa atualização.

O smoke do coordenador confirmou login HTTP 200, health HTTP 200, auth com `configured: true`, analytics anônimo HTTP 401 e sessão anônima HTTP 200. A QA real do backend ainda estava em andamento neste registro; esses resultados não antecipam sua conclusão nem comprovam a jornada completa de autenticação no domínio publicado.

## Login único e contrassenha após OTP — 24/10/2026

Publicado no deployment `dpl_GnV1cPv75FS4i1WeZgNAzFMrK4XK`, no mesmo alias de produção. A entrada tem somente e-mail/OTP. Após autenticar, contas sem permissão informam a contrassenha em `/acesso-negado`; a nova API `/api/auth/invite/activate` ativa o acesso na sessão existente, sem novo OTP. Contas já autorizadas seguem para o dashboard.

A migration aditiva `202610240001_session_invite.sql` foi aplicada diretamente ao projeto dedicado via `supabase db query --file`, sem reaplicar migrations anteriores. A função nova é exclusiva de service_role, valida sessão/e-mail confirmado, limita tentativas e preserva revogações. Não executar novamente a criação da função sem verificar o estado remoto. A permissão continua verificada no servidor para páginas, APIs e CSVs.

Build remoto aprovado sem typecheck/linter. Os 24 testes locais de autenticação passaram; a QA HTTP em produção está em `docs/qa/vercel-auth.json`. A contrassenha privada de entrega foi conferida como ativa no banco; não está versionada.

## E-mail minimalista e link automático — 24/10/2026

Deployment `dpl_JBJJ3FDSchdzhRUqC6dz3TPPQMv1`, alias de produção preservado. Templates de confirmação e magic link publicados via Supabase config push (somente dois conteúdos alterados; SMTP e demais propriedades preservados). E-mail: código de seis dígitos, botão Autenticar navegador e instruções curtas.

Abrir o botão carrega `/confirm`, que aprova automaticamente por POST sem digitar código, marcar caixa ou clicar novamente. O polling autentica o navegador original; o dispositivo que abre o link não recebe essa sessão. A migration aditiva `202610240002_email_link.sql` foi aplicada ao projeto dedicado. Referência de comportamento: Cecchin `confirmarLink` e rota operacional de confirmação, consultados sem alteração.

27 testes locais de autenticação e 25 verificações dos templates passaram. Build remoto sem typecheck/linter. A QA de produção inclui Chromium abrindo a confirmação sem interação adicional e polling HTTP no PC. Não houve envio de e-mail de teste nesta rodada; a entrega SMTP anterior permanece evidência histórica.

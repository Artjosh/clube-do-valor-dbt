# Dashboard — contrato de integração

Extensão autorizada em 22/10/2026, com revisão de acesso às 21:10 UTC. O pipeline dbt, seeds e banco DuckDB existente são somente leitura nesta missão. O dashboard não acrescenta operações nem cotações. Copper/Silver/Gold são profundidades analíticas, sem cobrança. **O contrato anterior de demonstração pública foi substituído:** a entrada é aberta, os dados exigem sessão verificada e role `analyst`. Primeiro login cria conta sem acesso; somente a contrassenha concede essa role após comprovar o e-mail.

## Ownership

- Coordenador: scaffold/config/package, `web/lib/analytics.ts`, `web/data/analytics.json`, `scripts/export_dashboard.py`, hosting, documentação geral.
- Frontend: `web/app/**` exceto `api`, `web/components/**`, estilos, assets visuais.
- Backend: `web/app/api/**`, `web/lib/auth/**`, `web/supabase/**`, `web/tests/auth*`, `docs/web-auth.md`.
- QA: `scripts/qa/web*`, `docs/qa/web*`.

## Leitura analítica

`web/lib/analytics.ts` exportará `getAnalytics(filters?: Filters)` síncrono e `getSnapshot()` para Server Components/route handlers. `Filters = {client?: string, asset?: string, from?: string, to?: string, operation?: 'BUY'|'SELL', q?: string}`. O frontend pode importar tipos, mas deve receber o resultado serializado de um Server Component ou buscar `/api/analytics` para filtros. Formato:

```
{ meta: { dataset: string, generatedAt: string, sourceHash: string,
  sourceFiles: [{path,sha256}], dateRange:{from,to},
  originalTransactions:100, originalClients:27, validTransactions:98,
  canonicalClients:25, tests:{pass:71,warn:6,total:77}, warnings: [...],
  semantics: string },
  filters: {...},
  options: {clients:[{client_id,client_name}],assets:string[],dateRange:{from,to}},
  summary: {transactionCount,activeClients,registeredClients,assetCount,
    buyCount,sellCount,buyAmount,sellAmount,netAmount,grossAmount,
    portfolioCount,negativePositions},
  transactions: [{transaction_id,client_id,client_name,city,state,asset_ticker,
    operation,quantity,unit_price,transaction_date,transaction_amount,signed_quantity,signed_amount}],
  clients: [{client_id,client_name,city,state,created_at,transactionCount,buyAmount,sellAmount,netAmount}],
  portfolios: [{client_id,client_name,asset_ticker,net_quantity,net_financial_amount,transaction_count,last_transaction_date}],
  daily:[{date,buyAmount,sellAmount,netAmount,cumulativeNet,transactionCount}],
  assets:[{asset_ticker,buyAmount,sellAmount,netAmount,grossAmount,transactionCount}],
  quality:{negativePositions:[...portfolios],rejectedTransactions:[{transaction_id,reason}],
    duplicatePayloadIds:string[],testResults:[{name,status,failures}]}
}
```

Valores financeiros no JSON serão numbers derivados de decimais exatos e agregações em escala fixa (8 casas); UI BRL 2 casas. CSV conserva precisão original. `meta.tests` é evidência histórica da validação dbt, não monitoramento ao vivo. `quality.negativePositions` segue filtros, demais alertas são do dataset completo e devem estar identificados. `summary.registeredClients` é cadastro completo, clientes sem atividade permanecem visíveis. Filtro de data/operação produz saldo do recorte, não posição total histórica. Não chamar de patrimônio, lucro, rentabilidade ou risco real.

APIs backend: GET `/api/analytics` aceita filtros e retorna esse objeto; GET `/api/export?kind=transactions|portfolios|clients` aceita mesmos filtros e CSV. **Ambas exigem role `analyst`, que corresponde a `analytics:read`, antes de carregar o snapshot ou validar filtros.** Sem sessão: 401; sessão sem role: 403; configuração/provedor indisponível: 503. GET `/api/health` informa disponibilidade básica sem snapshot, métricas, hashes ou metadata analítica. Backend importa `analyticsCsv(kind,filters)` e `parseFilters(URLSearchParams)` somente no ramo autorizado. Erros de filtro de usuário autorizado retornam 400. Respostas privadas não podem entrar em cache compartilhado.

## Autenticação e autorização

- GET `/api/auth/session`: `{configured:boolean,authenticated:boolean,authorized:boolean,role:null|'analyst',permissions:string[],user?:{email:string},reason?:string}`. Sem configuração, UI informa indisponibilidade real e **não libera dados**. Uma conta verificada sem role continua autenticada e vê “Você não tem acesso”.
- POST `/api/auth/invite/claim` JSON `{code}`: `{accepted:true,expiresAt}` e cookie HttpOnly de reivindicação temporária. Não cria sessão nem concede permissão. Somente após essa etapa a interface pede o e-mail do convite.
- POST `/api/auth/device/start` JSON `{email,useInvite?:boolean}`: `{challengeId,displayCode,expiresAt,pollInterval:3,otpLength:number}`; cookie HttpOnly vincula navegador solicitante. Envia OTP por e-mail e link opcional para aprovar no celular. `useInvite:true` exige a reivindicação válida e a vincula ao desafio/e-mail.
- POST `/api/auth/device/verify` JSON `{challengeId,code}`: `{authenticated:true,authorized:boolean,role:null|'analyst',permissions:string[]}` e sessão HttpOnly. E-mail é lido do desafio, nunca escolhido no POST de verificação. Comprimento do OTP segue a configuração real do provedor e é retornado por start; a UI não o fixa.
- GET `/api/auth/device/poll?challengeId=...`: `{status:'pending'|'approved'|'expired'}`; aprovado estabelece sessão cookie no PC atomicamente. Polling respeita intervalo e encerra na expiração.
- GET `/api/auth/confirm` recebe token_hash, tipo e desafio via redirect configurado, prepara confirmação e redireciona para `/confirm`; não concede acesso ao PC automaticamente.
- GET `/api/auth/device/confirmation`: `{challengeId,displayCode:null,email,expiresAt}` para tela celular. O código visual permanece somente no PC; GET não verifica nem consome o token.
- POST `/api/auth/device/approve` JSON `{displayCode}`: `{approved:true}`; confirmação explícita do código exibido no PC.
- POST `/api/auth/logout`: encerra sessão.

Callback e aprovação precisam do origin confiável, token temporário HttpOnly para celular e consumo atômico, TTL, rate limit durável e comparação do e-mail original. A concessão da role vem exclusivamente da reivindicação válida de convite, depois da verificação de identidade, em transação. Login normal não concede role. A contrassenha é reutilizável para avaliadores e revogável; somente hash no banco, texto fora do Git. Grant e revogação são consultados no servidor a cada leitura, nunca derivados de `user_metadata`, props ou estado React.

`web/lib/auth/guard.ts` exporta `requireAnalyticsAccess(request:Request)` para APIs e `readAnalyticsAccess(cookieHeader:string|null)` para SSR. Este retorna `{status:200|401|403|503,authenticated,authorized,user?,reason?}`. A página usa `next/headers`, força renderização dinâmica e consulta o guard **antes de importar dinamicamente analytics ou obter o snapshot**. Status 401 leva a login, 403 à tela sem acesso e 503 à indisponibilidade. Assets, HTML anônimo, prefetch e payloads RSC não podem conter o dataset. Não reservar `/callback` (rota da hospedagem).

Projeto Supabase dedicado configurado; SMTP Brevo será conectado pelo usuário. Enquanto isso, `AUTH_ENABLED=false`: nenhum acesso analítico ou login é simulado. Após validar as barreiras, a hospedagem poderá expor a entrada conforme autorização explícita do usuário, sem exigir sua conta ChatGPT. A proteção dos dados continuará no servidor da aplicação. Referências: [OTP Supabase](https://supabase.com/docs/guides/auth/auth-email-passwordless), [configuração OTP](https://supabase.com/docs/guides/local-development/cli/config) e [Vinext](https://github.com/cloudflare/vinext).

## Validação

Nunca rodar typecheck/linter (nem implicitamente). Build Vite e testes funcionais são permitidos. Não rodar dbt nem alterar o banco nesta missão. Verificar hashes antes/depois, métricas, filtros, export CSV, comportamento sem auth configurado, replay/expiry/origin, desktop/mobile e ausência de overflow. Não afirmar email/auth remota validados sem prova real.

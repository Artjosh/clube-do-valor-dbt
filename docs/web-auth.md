# Dashboard privado: identidade e autorização no servidor

O dashboard exige sessão válida **e** papel `analyst` com permissão `analytics:read`. Entrar por e-mail prova identidade e cria a conta implicitamente, sem senha e sem acesso automático aos dados. A Contrassenha é um convite compartilhado de alta entropia, não uma senha pessoal: só habilita o processo de comprovação de e-mail. Nenhum estado do cliente ou `user_metadata` concede permissão.

Identidade, desafios, convites, sessões e permissões ficam no PostgreSQL do Supabase dedicado `igucxanapndewkbtarfn`. DuckDB continua exclusivamente analítico; os handlers não escrevem nele. Os access/refresh tokens do Supabase ficam apenas no escopo da verificação server-side, nunca são persistidos pelo aplicativo ou retornados ao navegador.

## Estado comprovado e pendências

Em 22/10/2026 o coordenador aplicou as migrations [001](../web/supabase/migrations/202610220001_device_auth.sql) e [002 aditiva](../web/supabase/migrations/202610220002_private_analytics.sql). A 001 aplicada permanece inalterada. A suíte atual passou **19 testes locais de core/autorização**, mais **2 testes focados de provider**, e **46 verificações com Supabase/PostgreSQL reais**, sem enviar e-mail. Evidência sanitizada: [authz-live-results.json](../web/tests/authz-live-results.json). O provedor gerou OTP de **oito dígitos**. As 7/42 verificações anteriores em [auth-live-results.json](../web/tests/auth-live-results.json) são evidência histórica do fluxo inicial, não a validação da autorização atual.

As fixtures principais e as duas sessões temporárias de QA foram removidas. A consulta final confirmou zero usuários, desafios, sessões, claims, entitlements, roles e convites próprios restantes; o arquivo ignorado de cookies também foi removido, conforme o relatório live. O convite de entrega não foi alterado. O coordenador confirmou QA independente aprovado com 205 verificações HTTP e 54 Edge: veja [revisão independente](qa/web_access_review.md) e [HTTP com sessões reais](qa/web_access_http_production_sessions.json). Nenhum segredo ou cookie consta dos relatórios versionados.

**SMTP Brevo e templates ainda pendentes.** O provedor recusou templates personalizados com seu serviço de e-mail padrão gratuito; SMTP próprio autorizado é necessário. Não houve upgrade nem envio alternativo. Produção e `.dev.vars` permanecem `AUTH_ENABLED=false`; apenas processos de teste expressamente autorizados habilitam auth. Isso bloqueia analytics e export com **503**, sem fallback público ou login simulado. A validação atual não certifica entrega SMTP nem o fluxo completo em PC/celular físicos. Ver [ativação Brevo](brevo-activation.md).

## Contrato HTTP

Todos os endpoints de identidade são server-side. Mutações exigem JSON e `Origin` exato. Cookies são HttpOnly; o JavaScript da página não recebe segredos de sessão, convite ou dispositivo.

| Método e rota | Entrada e resultado |
|---|---|
| GET `/api/analytics` | Guard obrigatório antes de importar snapshot e interpretar filtros; resposta privada |
| GET `/api/export` | Mesmo guard antes de `kind` e filtros; CSV privado |
| GET `/api/health` | Estado mínimo e `auth.configured`, `providerHealth:not_probed`; sem snapshot, contagens ou metadata analítica |
| GET `/api/auth/session` | `{configured,authenticated,authorized,role,permissions,user?:{email},reason?}`; 503 indisponível, 200 para estados consultáveis |
| POST `/api/auth/invite/claim` | `{code}` (64 hex) → `{accepted:true,expiresAt}` e cookie de claim; não autentica |
| POST `/api/auth/device/start` | `{email,useInvite?:boolean}` → `{challengeId,displayCode,expiresAt,pollInterval:3,otpLength}` e cookie device |
| POST `/api/auth/device/verify` | `{challengeId,code}` (OTP e-mail) → `{authenticated:true,authorized,role,permissions}` e sessão no PC |
| GET `/api/auth/confirm` | Callback do link → 303 `/confirm` e cookie cifrado; não verifica token |
| GET `/api/auth/device/confirmation` | `{challengeId,displayCode:null,email,expiresAt}`; e-mail mascarado |
| POST `/api/auth/device/approve` | `{displayCode}` (código visual PC de 8 dígitos) → `{approved:true}` |
| GET `/api/auth/device/poll?challengeId=…` | `{status:pending\|approved\|expired}`; aprovado inclui `authorized,role,permissions` e cookie de sessão |
| POST `/api/auth/logout` | Revoga sessão, cancela desafio/claim conhecidos, limpa cookies → `{authenticated:false}` |

Para analytics/export: **401** sem sessão válida, **403** com sessão sem autorização e **503** sem configuração ou com falha do provedor. Só depois do guard os filtros podem gerar 400. Não existe rota analítica pública alternativa. Respostas usam `Cache-Control: no-store, private`, `Vary: Cookie`, `Pragma: no-cache` e, quando autorizadas, `X-CDV-Data-Access: private`.

Demais erros usam `{error:codigo_estavel}`: 400 formato, 401 OTP/vínculo inválido, 403 origem/convite/e-mail divergente, 410 desafio expirado ou tentativas esgotadas, 413 corpo excessivo, 415 formato não JSON, 429 limite durável, 503 indisponibilidade. Nenhum erro ecoa resposta interna do provedor.

## Guard SSR/RSC e revogação imediata

[guard.ts](../web/lib/auth/guard.ts) exporta `readAnalyticsAccess(cookieHeader)` e `requireAnalyticsAccess(request)`. O primeiro retorna `status,configured,authenticated,authorized,role,permissions` e e-mail opcional; o segundo lança `AuthError` se o status não for 200. São helpers somente de servidor, sem import de analytics e sem cache. Um módulo de auth lança erro caso seja carregado no browser.

A página SSR/RSC deve ler o header Cookie no servidor, chamar `readAnalyticsAccess`, retornar a tela de entrada/sem acesso/indisponibilidade para 401/403/503 e **só então importar e chamar `getAnalytics`**. Nunca serializar snapshot em HTML/RSC de usuário negado. Não confiar num guard cliente nem apenas em `session.authenticated`. O owner da UI implementa essa integração e os headers privados/no-store da página. As APIs aplicam o guard independentemente da UI.

Cada leitura consulta a sessão, usuário atual, role, entitlement e convite de origem no PostgreSQL. Sem cache de permissão em JWT/cookie: revogar role, entitlement ou convite impede a próxima leitura. Sessão expirada/revogada, usuário excluído/banido, e-mail alterado ou confirmação removida também impedem acesso.

## Login OTP no PC e concessão por convite

1. Login normal chama `start` sem `useInvite`; não concede role/permissão. Não há senha nem cadastro separado.
2. Contrassenha chama `claim` com segredo aleatório de 256 bits em 64 caracteres hex. O servidor normaliza para minúsculas, calcula SHA-256 de `cdv-invite-v1:<segredo>` e consulta somente o hash. O banco registra claim de 10 minutos com ID aleatório e hash de segredo do navegador. O segredo bruto só fica no cookie HttpOnly.
3. `start` com `useInvite:true` exige esse cookie. A RPC bloqueia a claim e a vincula uma única vez ao desafio e ao e-mail solicitado. IDs de claim, role, permissões ou hashes enviados no JSON são ignorados. Claim expirada, revogada, reutilizada ou de outro browser é recusada.
4. Desafio e segredo device têm 256 bits; o desafio dura cinco minutos. O e-mail recebe OTP (`{{ .Token }}`) e link para confirmação em outro dispositivo. A resposta informa o tamanho esperado do OTP, sem expor o OTP.
5. `verify` exige desafio e cookie device originais. A RPC limita tentativas e devolve ao servidor o e-mail armazenado; o e-mail enviado pelo cliente não é usado. O servidor verifica o OTP real no Supabase e compara identidade/e-mail confirmado.
6. A transação `complete_otp`/`consume` cria sessão e, somente se havia claim válida, insere `analyst` e `analytics:read` e consome a claim. `FOR UPDATE` e chaves únicas impedem concessão duplicada na corrida. Login normal resulta em sessão sem grant.
7. Sessão dura até oito horas e usa segredo derivado por HMAC do segredo device, domínio separado e ID do desafio. Só o hash de sessão vai ao banco. Retry por polling devolve a mesma sessão; um segundo POST OTP não recria a sessão.

Revogações individuais são tombstones: `ON CONFLICT DO NOTHING` não reativa role/entitlement revogados nem mediante novo convite e OTP. Restaurar acesso exige decisão administrativa explícita. Revogar o convite compartilhado invalida todos os grants associados; **expirar** o convite impede novas admissões/concessões, mas conserva grants já duráveis. Não apagar registros de revogação para “limpar” histórico enquanto a identidade permanecer ativa.

## Link PC → celular → PC preservado

O link contém `challengeId`, `token_hash` descartável e `type=email`. GET do callback **não chama verify**, não aprova e não cria sessão: sela o token em cookie AES-256-GCM e redireciona para `/confirm` sem parâmetros. O celular recebe e-mail mascarado, nunca o código visual; a pessoa precisa digitar o código de oito dígitos exibido no PC. Esse código é independente do OTP recebido por e-mail.

POST approve valida código visual, TTL e limite antes de consumir o token no Supabase; compara o e-mail confirmado com o desafio. O PC consulta poll a cada três segundos, com seu cookie original e evidência same-origin. A RPC consome a aprovação e eventual claim atomicamente. O celular não recebe a sessão do PC. PKCE não é usado, evitando exigir no celular verifier preso ao PC. Scanners que apenas fazem GET não consomem a verificação.

Logout revoga a sessão e cancela o desafio; replay não ressuscita sessão. Uma falha após consumir o token Supabase pode exigir novo desafio. Novo start substitui o cookie device e não estende desafios anteriores. Sessões e segredos device nunca entram em URL ou JSON.

## Variáveis e implantação

Modelo sem credenciais: [auth.env.example](../web/supabase/auth.env.example). Todas são server-only; jamais usar prefixos `NEXT_PUBLIC_`/`VITE_`, incluir no bundle ou imprimir em logs.

| Variável | Condição |
|---|---|
| `AUTH_ENABLED` | `false` até SMTP/templates e revisão; auth desligada bloqueia dados |
| `AUTH_ORIGIN` | Origin exato, sem slash final; HTTPS em produção |
| `SUPABASE_URL` | `https://igucxanapndewkbtarfn.supabase.co`, identidade dedicada |
| `SUPABASE_ANON_KEY` | Chave pública usada pelo servidor para OTP/verify |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret só de servidor para RPC/admin, nunca cliente |
| `AUTH_COOKIE_KEY` | 32 bytes aleatórios em 64 hex; AES-GCM e HMAC |
| `AUTH_OTP_LENGTH` | `8` no projeto observado; aceita 6 ou 8, deve coincidir com o provedor |
| `AUTH_TRUST_CLOUDFLARE` | `true` apenas se a borda sobrescreve CF-Connecting-IP e bloqueia acesso direto ao origin |

Em HTTPS: cookies `__Host-`, Secure, HttpOnly, SameSite=Lax, Path=/ e sem Domain. HTTP só é aceito em loopback fora de produção, com nomes sem prefixo e sem Secure. Origin localhost e 127.0.0.1 não são intercambiáveis. `.dev.vars` permanece ignorado. Rotacionar cookie key invalida confirmações pendentes e muda pseudônimos dos limites; sessões emitidas ainda exigem revogação no banco.

As migrations foram aplicadas pelo coordenador e não devem ser reaplicadas como CREATE idempotente. Mudanças posteriores exigem migration aditiva revisada. `cdv_private` não deve ser exposto pelo PostgREST. Todas as tabelas têm RLS habilitado, sem políticas públicas, privilégios revogados para PUBLIC/anon/authenticated. `cdv_auth` e `cdv_authz` são executáveis somente por service_role; funções SECURITY DEFINER têm search_path vazio e nomes qualificados. A service role continua sendo um segredo de alta confiança.

## Provisionar e revogar Contrassenha

O coordenador gera um segredo aleatório de 32 bytes fora do Git e o entrega em canal autorizado. [provision-invite.mjs](../web/supabase/provision-invite.mjs) lê o segredo de 64 hex por **stdin** e emite SQL contendo somente o hash; não executa migration/SQL, não envia mensagens e não imprime o segredo. Evitar segredo em argumentos/histórico do shell. O SQL revisado deve ser aplicado pelo administrador apenas ao projeto dedicado, preservando o segredo no gerenciador seguro. Nunca versionar a Contrassenha ou colá-la no relatório.

Operações administrativas exemplificativas (substituir IDs por identidades autorizadas; não são executadas automaticamente):

```sql
-- Revogar um usuário imediatamente:
update cdv_private.entitlements set revoked_at=now()
where user_id='<UUID>' and permission='analytics:read';
-- Revogar o convite compartilhado e todos os acessos originados dele:
update cdv_private.analytics_invites set revoked_at=now() where id='<UUID>';
-- Expirar somente novas admissões, preservando grants existentes:
update cdv_private.analytics_invites set expires_at=now() where id='<UUID>';
```

O convite reutilizável não é identificação pessoal, nem substitui verificação de e-mail. Não existe fluxo WhatsApp/senha pessoal importado de outro projeto.

## Limites duráveis e manutenção

Contadores atômicos no PostgreSQL: start 30/min global, 10/15min por endereço e 3/15min por e-mail; claim 60/min global, 10/15min por endereço e 30/15min por hash de código; OTP 120/min global e 20/15min por endereço, no máximo cinco tentativas por desafio. Código visual também tem cinco tentativas; callbacks/consulta/confirmação têm 300/min global e 30/min por endereço; poll tem intervalo mínimo de três segundos. Não confiar X-Forwarded-For fornecido pelo cliente. Sem proxy confiável, endereço usa bucket global conservador, podendo limitar disponibilidade compartilhada.

Validade é verificada em toda operação, independentemente de limpeza. Não há cron presumido. Administrador deve revisar retenção/limpeza de contadores antigos, claims vencidas, sessões expiradas e desafios sem sessão ativa. Não apagar convite referenciado ou tombstones de revogação para contornar decisões de acesso. Excluir desafio pode excluir sessão por cascade; nunca remover desafio com sessão ativa.

## E-mail e proteção de logs

[config.toml](../web/supabase/config.toml), [magic_link.html](../web/supabase/templates/magic_link.html) e [confirmation.html](../web/supabase/templates/confirmation.html) estão preparados. Ambos os templates devem exibir `{{ .Token }}` e link `{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email`; RedirectTo já contém challengeId. Não usar ConfirmationURL, pois verificaria o token antes do POST explícito. Alinhar OTP length=8 e validade300s no provedor antes de ativar. Aplicação depende do SMTP Brevo autorizado, domínio/remetente verificados, credenciais protegidas, hostname/porta/TLS e limites do serviço. Desabilitar tracking/reescrita de links. Não enviar e-mail antes de autorização.

O token_hash é segredo descartável inevitável no link; o handler o remove no primeiro redirect, cifra no cookie e não o registra. Não guardar query strings do callback em observabilidade/CDN ou enviar a analytics; usar Referrer-Policy:no-referrer. O coordenador desativou invocation logs/traces na configuração do runtime, mas isso não certifica a retenção interna do provedor. Revisar toda a cadeia de logs antes da ativação. Não existe redirect aberto: destino fixo `/confirm` no origin configurado.

## Testes e limites da evidência

```sh
node --test web/tests/auth-core.test.mjs web/tests/authz.test.mjs web/tests/auth-provider.test.mjs
```

19 testes passaram, incluindo falha fechada, cookies/cifra, origem, guard e revogação, distinção sessão/permissão, OTP vinculado ao e-mail armazenado e rejeição de import analítico nas rotas negadas. Dois testes adicionais passaram para o transporte do provedor: no runtime Worker, `redirect:error` é incompatível; o backend usa `redirect:manual` e rejeita todos os 3xx sem seguir Location ou encaminhar credenciais. Nenhum typecheck ou linter foi executado.

Harness live atual, somente com autorização explícita e credenciais ignoradas do projeto dedicado:

```sh
node web/tests/authz-live.mjs --allow-dedicated-project
# Somente para QA integrado autorizado; conserva duas sessões no arquivo ignorado:
node web/tests/authz-live.mjs --allow-dedicated-project --keep-http-fixtures
# Depois do aviso do coordenador de que QA terminou:
node web/tests/authz-live.mjs --allow-dedicated-project --cleanup-http-fixtures
```

O harness intercepta **exclusivamente entrega OTP**, substituindo-a por admin/generate_link (nenhum SMTP); verify e RPC usam serviços reais. Cria somente identidades @example.test e convite próprios e limpa por IDs exatos. Não toca convite de entrega nem limpa buckets globais compartilhados. Reexecuções rápidas podem ser corretamente limitadas por rate limits. `CDV_NPM_CLI` permite indicar outro caminho npm-cli.js para a operação SQL autorizada.

46 verificações reais cobrem: conta normal sem grant; convite/vínculo/claim única; OTP real correto/incorreto; e-mail/role cliente ignorados; grant somente após prova; role/entitlement/convite revogados; tombstone não ressuscitado; expiração de convite e claim; crossdevice sem consumir GET; corrida de polls com exatamente uma sessão/grant; retry idempotente; logout; bloqueio após cinco OTP incorretos. Durante QA, o arquivo ignorado continha `analyst.cookie` e `noRole.cookie`; ele foi removido após a revisão. Em uma nova execução autorizada, nunca copiar esse arquivo para relatório, Git ou mensagens.

Esta evidência não substitui revisão independente de HTTP/SSR nem teste de entrega e-mail após configuração SMTP. A presença de configuração preparada não significa serviço de e-mail operacional.

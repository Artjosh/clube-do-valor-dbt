# QA — acesso privado ao dashboard

Estado: QA concluída. Build de produção local validado com sessões reais (205 checks HTTP + 54 Edge); versão 3 hospedada validada com autenticação explicitamente desabilitada (53 checks de rede Edge + 20 de UI). A autorização real foi comprovada localmente com Supabase real; o envio de e-mail e a autenticação habilitada no endereço hospedado dependem da futura configuração Brevo e não foram comprovados. Resultados da demonstração pública anterior não foram usados como prova de autorização privada.

## Invariantes de aceite

| Superfície | Anônimo | Identidade verificada sem grant | Identidade com analytics:read vigente |
|---|---|---|---|
| API analytics e CSV | 401, nenhum dado | 403, nenhum dado | Dados no escopo permitido |
| SSR e RSC/prefetch dos três níveis | Redirecionamento/tela de login sem snapshot | Tela de acesso pendente sem snapshot | Dashboard |
| Assets/chunks/sourcemaps públicos | Nenhum registro analítico embutido | Idem | Dados não dependem de bundle público |
| Configuração ausente/provedor indisponível | Falha fechada | Falha fechada | Nenhum fallback para demo pública |

Primeiro login é e-mail + OTP, pode criar identidade, não cria grant. Não existe ação pública separada de criar conta/senha. A contrassenha é validada antes de pedir e-mail/OTP e não equivale a autorização por si só; apenas o e-mail efetivamente verificado recebe analytics:read. Copper/Silver/Gold são níveis de análise, não níveis pagos.

## Ataques e transições a verificar

- Cookie ausente, inventado, duplicado ou adulterado; user_metadata e campos extras não podem atribuir scopes.
- Conta criada por OTP sem convite: leitura 403 em todos os caminhos, inclusive URL direta, filtros, export e RSC/prefetch.
- Contrassenha inválida, expirada ou revogada; não revelar nem armazenar segredo em query string, HTML, logs ou respostas. O contrato revisado permite contrassenha reutilizável para avaliadores; isso não permite reutilizar uma reivindicação/OTP já consumida para conceder grant a outro e-mail.
- Troca do e-mail depois de validar convite, reuso de desafio em outro navegador, troca de propósito entre login e concessão de grant.
- OTP incorreto, vencido, repetido e limite de tentativas; validação de e-mail do provedor precisa coincidir com o vínculo persistido.
- Concorrência no consumo da reivindicação/grant: cada reivindicação fica vinculada ao navegador/e-mail e é consumida atomicamente. Múltiplas reivindicações da contrassenha reutilizável são legítimas somente com as verificações exigidas em cada uma.
- Revogação de grant e logout: próxima leitura deve negar; cache de SSR/API não pode servir dados de uma sessão anterior a outra.
- CSRF: POSTs exigem origem confiável e vínculo do navegador; GET não concede grant; ausência de configuração não produz identidade simulada.
- PostgreSQL: grants/RLS/RPC somente service_role, search_path seguro e autorização consultada server-side a cada acesso relevante.
- UI: login sem senha, sem botão de cadastro; contrassenha antes do e-mail; conta verificada sem acesso tem estado honesto; autorizado acessa três níveis e CSV.

## Evidência inicial independente

`node scripts/qa/web_access_guard.mjs`: exit 0, 18 verificações sintéticas server-side aprovadas. O processo substitui integralmente fetch por respostas locais e usa configuração fictícia; não acessa provedor nem envia e-mail. Cobre 401 anônimo/cookie inválido/duplicado, 403 de identidade sem grant mesmo com metadata forjada, guard antes do parsing em analytics/CSV, 200 com permission explícita, revogação refletida na próxima leitura e 503 em configuração/provedor inválido. Evidência em `docs/qa/web_access_guard_results.json`. Não substitui teste do PostgreSQL real, SSR/RSC ou versão publicada.

Migration `202610220002_private_analytics.sql` revisada estaticamente: tabelas privadas com RLS/grants restritos, RPC service-only, vínculo claim/browser/challenge/e-mail, locks e consumo de claim ao conceder role/entitlement, consulta de revogação em cada sessão e tombstone que impede regrant por replay. Sem bloqueador estático identificado nesta revisão; testes remotos continuam necessários. Semântica observada enviada ao coordenador para explicitar: expiração da contrassenha impede concessões novas, enquanto grants existentes dependem de revogação e não expiram automaticamente com a contrassenha.

## Preview com AUTH_ENABLED=false — 2026-10-22

`python -B scripts/qa/web_access_http.py http://localhost:3000 --label preview_disabled --unconfigured`: exit 1; 69 checks, uma falha concreta. `/data/analytics.json` respondeu 200 application/json com 63.992 caracteres, nomes e T001 sem cookie. APIs analytics/CSV negaram com 503, mas a exposição direta do arquivo contorna esses guards. Reportado ao coordenador como bloqueador do preview; investigar separadamente o runtime de produção, pois Vite dev pode servir arquivos da raiz. Evidência preservada em `web_access_http_preview_disabled.json`.

`node scripts/qa/web_access_browser.mjs http://127.0.0.1:3000 preview_disabled`: exit 0, 40 checks no Edge externo, desktop 1440 e mobile 390, sem pageerror. Páginas dos três tiers não exibiram dados; login sem campo senha/botão cadastro, convite antes do e-mail e sem overflow. Não houve submissão de formulários ou envio de e-mail. Isto comprova comportamento visual indisponível, não autorização real.

Inspeção local dos 22 arquivos do build `web/dist/client` não encontrou os marcadores Ana Souza, Bruno Lima, T001, 297849 ou 215915 (`web_access_bundle.json`). Busca de marcadores é complementar e não prova ausência de toda codificação possível; não invalida o vazamento HTTP constatado no dev server. Novo build/runtime e sessões reais ainda pendentes.

Após correção do coordenador em `server.fs.deny` e reinício: `python -B scripts/qa/web_access_files.py` exit 0, 9 probes negados (403/404), incluindo JSON direto, raw/import, @fs absoluto e arquivos de configuração/auth/SQL. Nenhum corpo sensível foi impresso ou persistido. Evidência `web_access_files.json`; falha original permanece registrada, resolução confirmada no dev server. O guard atualizado também passou em 19 checks sintéticos (`web_access_guard_role_results.json`), acrescentando negação quando existe permission sem role analyst.

O primeiro bloqueio via fs.deny impediu também o import interno de handlers no dev: GET session retornava 500 HTML e a UI não exibia o estado esperado (4 falhas de 20, `web_access_browser_disabled_message.json`). Após middleware HTTP externo preservar imports SSR, os 9 probes de arquivos continuaram negados e o reteste `node scripts/qa/web_access_browser.mjs http://127.0.0.1:3000 disabled_fixed --login-only --disabled` passou 20/20, exit 0: indisponibilidade explícita e nenhum formulário de envio, desktop/mobile. Evidência final deste ajuste `web_access_browser_disabled_fixed.json` e screenshots correspondentes.

## Build de produção em processo QA local — primeira passagem

URL `http://127.0.0.1:3001`, AUTH_ENABLED=true apenas no processo separado, origem local; não equivale a deploy hospedado. `python -B scripts/qa/web_access_http.py http://127.0.0.1:3001 --label production_anonymous --assets-dir web/dist/client`: 101 checks, exit 1, cinco divergências de status: cookie inventado sintaticamente válido respondeu 503 auth_unavailable em vez de 401, indicando falha de integração RPC ainda a esclarecer. Anônimo sem cookie respondeu 401 e nenhum HTML/RSC/asset trouxe marcadores de dados; 20 assets examinados via HTTP. Não houve envio de e-mail.

Inspeção adicional dos headers identificou `/.rsc?tier=...` (formato válido do Vinext) sem Cache-Control nos três tiers; raiz HTML/header RSC tinha private,no-store. Reportado para cobertura explícita do formato alternativo antes de validar identidade autorizada. O scanner foi ampliado para exigir no-store também em todas as páginas/RSC. `node scripts/qa/web_access_browser.mjs http://127.0.0.1:3001 production_anonymous`: 40 checks aprovados, exit 0, Edge desktop/mobile. Resultados não concluem autorização de usuários reais, ainda pendente de fixtures.

## Integração real após correções de runtime

O coordenador/Backend corrigiram fetch do Worker (`redirect:error` incompatível, substituído por manual com rejeição de 3xx) e ampliaram no-store para formatos alternativos. Após rebuild/restart autorizado, executei:

```powershell
python -B scripts/qa/web_access_http.py http://127.0.0.1:3001 --label production_sessions --assets-dir web/dist/client --fixtures web/.sites-runtime/authz-http-fixtures.json
```

Exit 0: **205 checks aprovados, nenhum skip**, evidência `web_access_http_production_sessions.json`. Sessões isoladas criadas por Backend e lidas somente em memória: nenhum cookie/token persistido no relatório. Anônimo e cookie inventado 401; sessão autenticada sem grant 403; analista autorizado 200. SSR, RSC via header e `/.rsc` nos três tiers respeitaram autorização e no-store; 20 assets públicos sem marcadores, snapshot direto negado. CSVs comparados por grão e em todas as colunas presentes no baseline independente: 98 fatos, 25 clientes e 55 posições; decimais comparados com Decimal, inclusive seis posições negativas. Isso preserva fluxo BUY−SELL e não calcula lucro ou valor de mercado.

Fonte e resultado `web/tests/authz-live.mjs` / `authz-live-results.json` revisados, sem repetir suas mutações: 46 checks reais Supabase, OTP de oito dígitos, sem SMTP/email; apenas entrega substituída por admin generate_link, verificação/RPC/PostgreSQL reais. Evidência cobre identidade sem grant, convite inválido/expirado, vínculo browser/e-mail, metadata extra sem privilégio, replay, cinco tentativas OTP, concorrência (um grant/uma sessão), revogação independente de role/entitlement/convite, tombstone contra regrant e logout. RPC negado para anon e permissões service-only/RLS revisadas no SQL. CSRF é coberto no teste sintético do Backend e revisão de sameOrigin; a bateria HTTP desta QA foi GET-only conforme autorização do coordenador. Esta passagem ainda não é evidência de deploy hospedado.

`node scripts/qa/web_access_sessions.mjs http://127.0.0.1:3001`: exit 0, **54 checks Edge aprovados**, nenhum pageerror (`web_access_sessions.json`). Sessões reais separadas por BrowserContext, três tiers desktop/mobile; analista vê análise/auditoria, conta sem grant vai a `/acesso-negado` e recebe 403 nas APIs/CSVs, anônimo vai a `/login` e recebe 401. Teste inicial teve cinco falsos negativos por esperar KPI financeiro em Gold e nomes do menu mobile recolhido; expectativas foram corrigidas para auditoria Gold e abrir menu, sem mudar implementação (`web_access_sessions_initial.json` preservado).

## Versão 3 hospedada — resultado final

Endereço: https://clube-do-valor-intelligence.artjosh.chatgpt.site . Deploy informado pelo coordenador: `appgdep_6ada826a650c8191be2b100d84e84ffd`, source `50298452be5a6b57f73a98f6c8fffb9deff88dc3`, env revision 3. QA executada depois da confirmação de deploy succeeded, 2026-10-22; timestamps exatos constam nos JSONs.

```powershell
node scripts/qa/web_access_hosted.mjs https://clube-do-valor-intelligence.artjosh.chatgpt.site v3
node scripts/qa/web_access_browser.mjs https://clube-do-valor-intelligence.artjosh.chatgpt.site hosted_v3 --login-only --disabled
```

Ambos exit 0: **53 checks de rede e 20 de UI**, nenhum erro. Rede pelo Edge externo real, sem cookies/sessão: cinco endpoints analytics/CSV retornam 503 JSON auth_not_configured e no-store; HTML/RSC por header, prefetch e sufixo .rsc nos três tiers não expõem dataset e têm no-store; três caminhos de snapshot negados; nove chunks realmente carregados pelo browser retornam 200 sem marcadores do dataset. Entrada pública chega ao app sem gate/login ChatGPT. Login/convite desktop1440/mobile390 mostram indisponibilidade explícita, nenhum formulário de envio, sem overflow. Evidências: `web_access_hosted_v3.json`, `web_access_browser_hosted_v3.json` e screenshots `web_access_hosted_v3_*`.

A tentativa anterior via urllib padrão recebeu 403 infraestrutura Cloudflare code1010, não resposta do guard. Uma varredura com User-Agent explícito terminou antes de sua interrupção e permanece como registro histórico (`web_access_http_hosted_browser_agent.json`); não foi usada como evidência final. Após orientação do coordenador, a prova hospedada usou exclusivamente Edge real, sem alterar proteções. O texto de erro OTP foi ajustado pelo coordenador para código ou link; nenhuma lógica de autorização mudou nesse último deploy.

## Integridade final e limites

Verificações inicial, após integração e após QA hospedada `.venv/Scripts/python.exe -B scripts/qa/web_dataset.py --verify`: exit 0, **23 arquivos protegidos byte a byte iguais** ao baseline da missão anterior. Nenhum dbt, typecheck, linter, envio real de e-mail, commit ou deploy executado por QA. Escrita exclusiva em `scripts/qa/web_access*` e `docs/qa/web_access*`. Backend reportou cleanup=true e manifesto ignorado das sessões QA não existe mais; nenhum token/cookie persistido nas evidências desta auditoria.

A existência de material público da versão anterior também precisa ser considerada: tornar o app privado não torna secretos os CSVs que já foram publicados anteriormente. Esta auditoria comprova os controles e superfícies testados; busca por marcadores em assets não constitui prova universal contra toda codificação possível. SMTP/Brevo e autenticação habilitada no domínio publicado exigem validação posterior quando configurados.

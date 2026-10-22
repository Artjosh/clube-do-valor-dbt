# QA independente — dashboard Clube do Valor

## Escopo e estado

**QA aprovada para a demonstração analítica pública com login desativado.** Validação local de analytics, HTTP, autenticação e Edge externo concluída em 22/10/2026. Preview `http://127.0.0.1:3000`. O contrato é `docs/web-contract.md`; Copper/Silver/Gold representam profundidades analíticas públicas, sem cobrança ou privilégios adicionais. Nenhum typecheck, linter, dbt, commit, deploy ou envio de e-mail foi executado por QA. Os dois achados concretos (overflow mobile e headers da raiz) foram corrigidos pelos respectivos owners e retestados; não permanece defeito aberto no escopo verificado.

O coordenador informou que o provedor gratuito recusou personalização do template sem SMTP. A configuração real foi habilitada temporariamente pelo coordenador para o harness do Backend; QA não submeteu o formulário real nem chamou start enquanto configurado. Após reinício, QA confirmou o estado final `configured:false, authenticated:false`, formulário de envio ausente e aviso real de indisponibilidade em desktop/mobile. A conexão Brevo/SMTP será feita posteriormente pelo usuário; não bloqueia a demonstração analítica pública, mas bloqueia a jornada real de e-mail.

## Dataset e cálculo independente

`scripts/qa/web_dataset.py` capturou SHA-256 de 23 arquivos protegidos (DuckDB, seeds, modelos, macros, testes e configuração/dependências dbt) antes da execução. A conexão DuckDB foi exclusivamente `read_only=True`. Baseline em `docs/qa/web_dataset.json`: 98 fatos, 25 clientes e 55 posições. Os hashes permaneceram iguais imediatamente após a leitura e na comparação final após os testes.

`scripts/qa/web_module.py` comparou todos os campos da exportação com o baseline independente e o sourceHash com o arquivo DuckDB. Executou Node diretamente para 36 recortes, cobrindo todos os 25 clientes, seis ativos, BUY, SELL, uma data com dois eventos e período vazio. **610 verificações passaram**, incluindo posições por cliente/ativo, agregações por cliente/ativo, série diária e acumulados calculados em Python com Decimal.

O baseline reconcilia quantidade líquida 10900 e financeiro líquido 215915.00, 67 compras / 31 vendas, compra 297849.00, venda 81934.00, volume absoluto 379783.00. Os seis negativos permanecem em C1/BBDC4, C3/WEGE3, C5/BBDC4, C6/ITUB4, C7/WEGE3 e C8/VALE3. T035/T036 são mantidas como eventos de IDs distintos; clientes sem atividade continuam disponíveis. Valores são saldos do recorte BUY−SELL, não patrimônio, lucro, rentabilidade ou cotação atual.

## HTTP analítico

`python -B scripts/qa/web_http.py http://127.0.0.1:3000` saiu com **exit 0 / 295 verificações aprovadas**. Evidência: `docs/qa/web_http_results.json`.

Foram comparados 12 recortes: geral; C1; C11 sem atividade; BBDC4; SELL; data 27/03; C5/BBDC4; período vazio; filtro combinado C1/BUY/data; busca com acento `Ána`; ID T035; texto semelhante a script. Para cada recorte: IDs e multiplicidades dos fatos, 12 métricas de resumo, todos os pares e campos do portfolio, CSV de transações com precisão decimal original e CSV de clientes/portfolio com campos correspondentes ao JSON. Filtros inválidos/data inexistente/intervalo invertido e espécie de export inválida retornam 400; POST nas rotas analíticas retorna 405.

## Autenticação e segurança

`node scripts/qa/web_auth_core.mjs` saiu com **exit 0 / 27 verificações**. Dados exclusivamente sintéticos: configuração incompleta/desativada falha fechada, HTTP de produção e URL com credenciais são rejeitados, origem e metadados de fetch protegem mutações/poll, cookies duplicados são rejeitados, cookie HTTPS usa __Host/HttpOnly/SameSite/Secure, estado AES-GCM é vinculado à origem, adulteração/ausência/expiração falham, corpo acima do limite e JSON array são rejeitados, erros de provedor são sanitizados. Não chamou Supabase nem alterou variáveis do processo da aplicação.

`python -B scripts/qa/web_auth_http.py http://127.0.0.1:3000`, executado **antes de habilitar o harness real**, saiu com **exit 0 / 55 verificações**. Sem configuração: sessão anônima explícita, health sem comprovação remota, start/poll/confirmation/approve/logout/callback respondem 503 e não criam cookies, cookie falso não autentica, métodos GET de mutação retornam 405. Origem estrangeira recebe 403 do servidor de desenvolvimento antes dos handlers. O dev server permite CORS para sua própria origem, não para a origem estrangeira; isso foi distinguido de concessão cross-origin insegura. As respostas dos handlers têm no-store e nosniff.

`node scripts/qa/web_auth_ui.mjs http://127.0.0.1:3000` saiu com **exit 0 / sete verificações**. Todas as chamadas `/api/auth/*` foram interceptadas no navegador, sem envio real: estado desativado sem formulário; código exibido; polling começa após pelo menos três segundos e encerra após aprovação; expiração encerra sem polling; confirmação exige checkbox explícito, mesmo com código digitado; um único POST ao aprovar. Esta evidência valida lógica de UI, não uma jornada real de e-mail/sessão.

Revisão estática de migration/handlers comunicada ao coordenador: schema privado com grants revogados, RLS sem policies públicas, RPC restrita a service_role e search_path vazio, vínculo por hash do navegador, row locks em transições, unicidade de sessão por challenge, TTL, revogação e checagem do usuário confirmado/não banido e e-mail original. Não se identificou bloqueador estático. Concorrência PostgreSQL, replay remoto, entrega de e-mail e template do provedor não foram executados por QA. Retenção/limpeza das tabelas de identidade e limitação global quando não há proxy confiável permanecem observações operacionais, agora descritas em `docs/web-auth.md`.

Evidência do Backend revisada, sem repetição: `web/tests/auth-live-results.json`, executada às 20:49:42 UTC, registra `result:passed`, `cleanup:true`, `emailSent:false`, duas verificações reais de token e quatro links administrativos gerados. A lista cobre negação à role anônima, identidade divergente, corrida de consumidores, retry idempotente, expiração, logout/replay e limite de tentativas. Trata-se de harness do Backend com Supabase/PostgreSQL reais, não execução independente de QA nem comprovação SMTP ou PC/celular físicos. `docs/web-auth.md` registra a recusa do template gratuito e a condição SMTP antes da ativação.

## Edge externo e correção de mobile

`node scripts/qa/web_browser.mjs http://127.0.0.1:3000 --auth` usa Puppeteer local e **Microsoft Edge externo headless 155**, perfil isolado, sem browser integrado Orca. Resultado atual **exit 0 / 23 checks, nenhum pageerror**. Desktop 1440×1000 e mobile 390×844: três níveis, métricas, filtros cliente/ativo, URL e retorno pelo histórico, CSV respeitando filtros/view, paginação, ordenação, modal de detalhes/Escape, cliente sem atividade, estado vazio, menu mobile e ausência de overflow documental. Login configurado foi somente aberto, sem submissão; confirmação sem cookie mostra erro de expiração, sem aprovação.

As screenshots `docs/qa/web_desktop_*.png` e `docs/qa/web_mobile_*.png` foram inspecionadas visualmente. Houve bug real encontrado e encaminhado: mobile tinha clientWidth390 e scrollWidth560/575, com faixa vazia e redução visual. A primeira asserção inadequadamente comparava scrollWidth a innerWidth, que expandia junto; revisão visual identificou o falso positivo. A asserção foi corrigida para comparar clientWidth e viewport; o Frontend corrigiu a implementação e o rerun passou. Tabelas mantêm rolagem interna sem expandir documento. A resposta 500 inicial da raiz, durante construção, foi resolvida pelo reinício do preview; não reapareceu no teste completo.

## Reprodução e limites

Gate final após reinício: `web_auth_http.py` passou novamente 55 verificações com o contrato atualizado `providerHealth:not_probed`. O primeiro `web_final.mjs` encontrou a raiz `/` sem X-Frame-Options/CSP/Referrer-Policy/nosniff, embora as demais páginas os recebessem; foram 22 de 25 checks naquele momento. O coordenador corrigiu `next.config.ts` com regra explícita `/` além de `/:path*`. O reteste pontual saiu **exit 0, 25 de 25 checks aprovados, nenhum pageerror**: raiz/login/confirm/session com headers, sessão desativada e UI desktop/mobile sem formulário de envio ou confirmação válida. Evidência final em `docs/qa/web_final_results.json`. Não se repetiram as suítes analíticas sem relação com essa correção.

Comparação de integridade após a bateria final: `.venv/Scripts/python.exe -B scripts/qa/web_dataset.py --verify` retornou **exit 0, `PASS: 23 protected files byte-identical`**. O banco e os arquivos do pipeline não foram modificados.

```powershell
.\.venv\Scripts\python.exe -B scripts/qa/web_dataset.py --verify
python -B scripts/qa/web_module.py
python -B scripts/qa/web_http.py http://127.0.0.1:3000
node scripts/qa/web_auth_core.mjs
node scripts/qa/web_auth_ui.mjs http://127.0.0.1:3000
node scripts/qa/web_browser.mjs http://127.0.0.1:3000 --auth
node scripts/qa/web_final.mjs http://127.0.0.1:3000
```

`web_dataset.py` sem --verify cria baseline somente se inexistente; não sobrescreve evidência prévia. O teste `web_auth_http.py` exige configuração desativada e interrompe antes de chamar start se configurada. Puppeteer é reutilizado de `presentation/node_modules/puppeteer-core`; não houve instalação de ferramentas. Não se afirma compatibilidade com Safari/Firefox, auditoria WCAG completa, teste de carga, produção publicada ou jornada entre dispositivos reais. As capturas não contêm sessão real, tokens ou credenciais.

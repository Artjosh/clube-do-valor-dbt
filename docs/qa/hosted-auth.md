# Validação de autorização no domínio hospedado

Em 22/10/2026, a matriz HTTP no domínio `https://clube-do-valor-intelligence.artjosh.chatgpt.site` comprovou acesso separado para visitante anônimo, conta autenticada sem role e conta `analyst`. Foram **140 asserções aprovadas na matriz completa** e **13 na verificação focada de CSV/logout**. O resultado consolidado é aprovado com observação sobre headers de redirects; [resumo estruturado](hosted-auth-summary.json).

O alvo informado pelo coordenador foi envrev4, `AUTH_ENABLED=true`, deploy `appgdep_6ada9064f1bc8191b60c95ab16a9b248`. O identificador de deploy é a referência recebida, não uma versão inferida do corpo das respostas. O coordenador assumiu separadamente a correção/publicação dos headers de redirects, sem necessidade de repetir esta matriz de autorização.

## Resultado por identidade

| Superfície | Anônimo | Autenticado sem role | Analyst |
|---|---|---|---|
| `/api/analytics` | 401, sem dados | 403, sem dados | 200, JSON integral igual ao cálculo local do snapshot |
| CSV transactions/clients/portfolios | 401, sem dados | 403, sem dados | 200, conteúdo completo reconciliado após normalização de BOM |
| Página HTML copper/silver/gold | Redirect `/login`, corpo vazio | Redirect `/acesso-negado`, corpo vazio | 200 com dados e `no-store` |
| RSC por header, `/.rsc` e prefetch | Redirect de acesso no protocolo, sem dataset | Redirect de acesso no protocolo, sem dataset | 200 com dataset e `no-store` |
| Filtros inválidos | 401 antes da validação | 403 antes da validação | 400 |

Páginas usam redirects de navegação, não necessariamente status HTTP 401/403: HTML retornou 307, e RSC retornou a instrução NEXT_REDIRECT do framework. APIs/CSV retornaram os códigos de autorização exatos. Todos os resultados negados foram verificados quanto à ausência de marcadores do dataset.

As consultas analíticas filtradas por cliente, operação, ativo e período também coincidiram integralmente com `getAnalytics(parseFilters(...))`. Depois de consultas autorizadas, repetir a mesma API como anônimo e sem role continuou retornando 401/403. POST de logout no domínio real retornou 200; replay do cookie revogado retornou 401 tanto na API hospedada quanto no guard com consulta ao PostgreSQL.

## Observações e correções do harness

1. **Headers de redirects:** a rodada inicial identificou HTML 307 vazio sem Cache-Control/Vary. A matriz final registrou seis redirects de acesso sem Cache-Control explícito. Nenhum continha dados. A exigência de `no-store` continuou aplicada às respostas de conteúdo, APIs e RSC. O coordenador aceitou o achado e assumiu a correção no wrapper Worker e verificação em novo deploy; esta entrega não afirma essa correção já publicada.
2. **Canonicalização RSC:** a hospedagem normaliza `_rsc=hostedqa` para `_rsc` com redirect de mesma rota. O harness passou a seguir apenas essa canonicalização no mesmo origin/path, mantendo os redirects de acesso explícitos para avaliação. Foram 18 canonicalizações na matriz, sem desafio ou bypass de WAF.
3. **BOM do CSV:** o gerador local inclui U+FEFF, enquanto `Response.text()` o remove durante a decodificação. A comparação textual inicial produziu três falsos negativos. A verificação focada normalizou somente esse BOM e confirmou igualdade de todo o restante dos três CSVs, inclusive ordem, colunas, valores e quebras de linha. O relatório original permanece como evidência histórica, sem reescrever falha como sucesso.

## Evidências preservadas

- [Primeira rodada](hosted-auth-initial-results.json): 17 asserções positivas; interrompida pela expectativa de no-store no redirect HTML; cleanup concluído.
- [Diagnóstico de canonicalização](hosted-auth-canonical-redirect-results.json): 20 asserções positivas; interrupção antes de seguir o redirect canônico RSC; cleanup concluído.
- [Matriz completa](hosted-auth-results.json): 140 positivas e três comparações CSV inicialmente falsas por BOM; todos os demais guards, RSC, filtros, cache de conteúdo e logout passaram; cleanup concluído.
- [CSV focado](hosted-auth-csv-results.json): 13 positivas, zero falhas; três CSVs reconciliados e logout repetido com sucesso; cleanup concluído.
- [Resumo consolidado](hosted-auth-summary.json): relaciona as resoluções e confirma limpeza de todas as rodadas.

## Método, escopo e limpeza

[web/tests/hosted-auth.mjs](../../web/tests/hosted-auth.mjs) reutiliza os helpers do harness anterior sem repetir seus 46 testes de segurança e sem alterar runtime. Cada rodada completa cria apenas duas identidades e um convite QA; a repetição focada cria somente um analyst e um convite QA. As sessões são obtidas via handlers em processo, RPC/verify Supabase reais e `admin/generate_link` no lugar da entrega OTP. **Nenhuma chamada de device/start foi feita no domínio hospedado e nenhum e-mail foi enviado.** Não foi usado o convite de entrega.

As requisições ao domínio real utilizaram Node fetch normal, sem navegador integrado ou bypass de WAF. Cookies HTTPS usaram `__Host-cdv-session` e ficaram apenas em memória e no arquivo ignorado `web/.sites-runtime/hosted-auth-fixtures.json`, protegido previamente por ACL exclusiva do usuário. O harness recusa executar sem essa proteção. Nenhum cookie/token foi escrito nos relatórios.

O bloco finally removeu somente IDs criados por cada rodada e consultou o PostgreSQL para confirmar **zero usuários, desafios, sessões, claims, entitlements, roles e convites QA restantes**. O arquivo de cookies foi removido e sua ausência foi verificada no resumo. Contadores operacionais de rate limit foram preservados; nenhuma tabela foi truncada e o convite real não foi alterado.

Com autorização explícita e arquivo vazio previamente protegido/ignorado, os comandos do harness são:

```sh
node web/tests/hosted-auth.mjs --allow-dedicated-project
node web/tests/hosted-auth.mjs --allow-dedicated-project --csv-only
```

Nenhum typecheck, linter, commit, migration, alteração de ambiente ou deploy foi executado nesta tarefa. SMTP/config/templates foram aplicados pelo coordenador, mas **entrega SMTP ao destinatário e jornada real de e-mail continuam não verificadas por esta prova**.

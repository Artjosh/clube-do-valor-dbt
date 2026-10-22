# Publicação do dashboard — 22/10/2026

[Entrada publicada](https://clube-do-valor-intelligence.artjosh.chatgpt.site/login). A audiência da hospedagem é pública por solicitação explícita do usuário: visitantes podem chegar ao login sem uma conta ChatGPT. A aplicação exige sessão válida, role `analyst` e permissão `analytics:read` para qualquer leitura analítica. Cadastro implícito por OTP não concede acesso; somente o fluxo de contrassenha com e-mail comprovado concede o privilégio.

**Brevo ainda pendente.** `AUTH_ENABLED=false` na revisão de ambiente 3 mantém login e dados indisponíveis, com APIs analíticas em 503. Não há fallback público. [Ativação e verificação SMTP](brevo-activation.md) são necessárias antes de enviar o link aos avaliadores como entrega utilizável. Nenhum e-mail foi enviado nesta validação.

## Proveniência da versão publicada

| Item | Valor |
|---|---|
| Site | `appgprj_6ada745fbfe4819192622a625963f64f` |
| Versão | 3 |
| Saved version | `appgprj_6ada745fbfe4819192622a625963f64f~appgver_67a333ed10c0819191440e259b2a3181` |
| Deployment concluído | `appgdep_6ada826a650c8191be2b100d84e84ffd` |
| Commit do repositório de publicação Sites | `50298452be5a6b57f73a98f6c8fffb9deff88dc3` |
| SHA-256 do pacote | `acf8d848763f8e19b1b1447891d6c4c9fdd53f791c4ea131132a20164bbb2ce8` |
| Ambiente | Revisão 3, OTP de oito dígitos, auth desabilitada até SMTP |
| Audiência da hospedagem | `public`, revisão 2; dados privados na aplicação |

O pacote foi produzido do código enviado ao repositório Sites, com build Vinext concluído. O repositório público da entrega é [Artjosh/clube-do-valor-dbt](https://github.com/Artjosh/clube-do-valor-dbt); seu commit é distinto do commit de publicação acima. Credenciais, cookies, contrassenha e arquivos locais de teste não integram o código publicado. Não foram executados typecheck ou linter.

## Banco e convites

Supabase gratuito dedicado `igucxanapndewkbtarfn`, região `sa-east-1`. PostgreSQL guarda identidade, desafios, sessões, convites, roles e permissões. DuckDB e as fontes originais permanecem somente analíticos, sem alteração nesta missão web.

As migrations `202610220001_device_auth.sql` e `202610220002_private_analytics.sql` já foram aplicadas por SQL via CLI. A aplicação por `db query` não registra automaticamente o histórico de migrations da CLI: **não executar db push/reset nem reaplicá-las sem reconciliar esse histórico**. Hash SHA-256 da migration 002 aplicada: `076605CACB6F1F15F09E86888DB9B4021FD03D3E4CAD37FD1178FF63F269969C`.

O convite dos avaliadores foi provisionado. A contrassenha está exclusivamente no arquivo local ignorado `web/.sites-runtime/acesso-avaliadores.txt`, protegido por ACL do usuário; compartilhar somente com os destinatários pretendidos. O banco armazena apenas seu hash. Expirar o convite impede novas concessões; revogá-lo bloqueia também os privilégios associados na próxima leitura. Não publicar o conteúdo desse arquivo.

## Evidências e continuidade

- [Revisão independente e resultados atuais](qa/web_access_review.md): 205 verificações HTTP com sessões reais e 54 verificações no Edge, cobrindo 401 anônimo, 403 sem privilégio e 200 autorizado; páginas, RSC, APIs e CSVs. Na versão 3 publicada, passaram outras 53 verificações de rede e 20 de interface, com auth desabilitada: entrada pública sem gate ChatGPT e nenhuma leitura analítica disponível.
- [Backend real](../web/tests/authz-live-results.json): 46 verificações Supabase/PostgreSQL, sem SMTP; 19 testes locais e 2 focados no provider. Todas as fixtures próprias foram removidas e a ausência confirmada.
- [Checagem antes de abrir a audiência](qa/web_private_deployment_results.json): 21 verificações aprovadas na versão 2 protegida. A versão 3 alterou apenas o texto de erro de código/link inválido.
- 23 arquivos originais protegidos permaneceram byte a byte idênticos; CSVs autorizados reconciliados em 98 fatos, 25 clientes e 55 posições. [Evidências históricas](qa/web_validacao.md) não substituem a validação da autorização atual.

Run nativo Orca `run_87cea103aabe`. Tasks de autorização Backend `task_a5e4be04055c`, Frontend `task_1c5c93ba3145` e QA `task_6f358721226f`. Workers principais permanecem retidos para continuidade, sem release ou reinício. A próxima etapa operacional é conectar Brevo, aplicar os templates preparados, ativar auth e validar uma jornada real por OTP e entre PC/celular.

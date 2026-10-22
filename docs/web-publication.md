# Publicação do dashboard — 22/10/2026

[Entrada publicada](https://clube-do-valor-intelligence.artjosh.chatgpt.site/login). A audiência da hospedagem é pública por solicitação explícita do usuário: visitantes podem chegar ao login sem uma conta ChatGPT. A aplicação exige sessão válida, role `analyst` e permissão `analytics:read` para qualquer leitura analítica. Cadastro implícito por OTP não concede acesso; somente o fluxo de contrassenha com e-mail comprovado concede o privilégio.

**Brevo configurado; login habilitado.** A versão 5 usa a revisão de ambiente 5, com `AUTH_ENABLED=true` e `AUTH_OTP_LENGTH=6`. Os templates HTML responsivos de confirmação e magic link e o OTP de seis dígitos foram aplicados ao Supabase. O usuário confirmou o primeiro recebimento real; a jornada atual PC/celular está em validação. O código visual de oito dígitos no PC é independente do OTP do e-mail. [Estado operacional](brevo-activation.md).

## Proveniência da versão publicada

| Item | Valor |
|---|---|
| Site | `appgprj_6ada745fbfe4819192622a625963f64f` |
| Versão | 5 |
| Saved version | `appgprj_6ada745fbfe4819192622a625963f64f~appgver_fa8747938c148191a246dffafb2c9e24` |
| Deployment concluído | `appgdep_6ada9494b95c8191a4d51f23b75e184a` |
| Commit do repositório de publicação Sites | `3c2614d384ef84c766b522b94c295636b20a5466` |
| SHA-256 do pacote | `0e0f909ca62aa1a9375b1c8db64edec6fe0ae92fd78353498a3071bb453e2863` |
| Ambiente | Revisão 5, OTP de seis dígitos e validade de 300s, auth habilitada com SMTP Brevo |
| Audiência da hospedagem | `public`, revisão 2; dados privados na aplicação |

O pacote foi produzido do código enviado ao repositório Sites, com build Vinext concluído. O repositório público da entrega é [Artjosh/clube-do-valor-dbt](https://github.com/Artjosh/clube-do-valor-dbt); seu commit é distinto do commit de publicação acima. Credenciais, cookies, contrassenha e arquivos locais de teste não integram o código publicado. Não foram executados typecheck ou linter.

## Banco e convites

Supabase gratuito dedicado `igucxanapndewkbtarfn`, região `sa-east-1`. PostgreSQL guarda identidade, desafios, sessões, convites, roles e permissões. DuckDB e as fontes originais permanecem somente analíticos, sem alteração nesta missão web.

As migrations `202610220001_device_auth.sql` e `202610220002_private_analytics.sql` já foram aplicadas por SQL via CLI. A aplicação por `db query` não registra automaticamente o histórico de migrations da CLI: **não executar db push/reset nem reaplicá-las sem reconciliar esse histórico**. Hash SHA-256 da migration 002 aplicada: `076605CACB6F1F15F09E86888DB9B4021FD03D3E4CAD37FD1178FF63F269969C`.

O convite dos avaliadores foi provisionado. A contrassenha está exclusivamente no arquivo local ignorado `web/.sites-runtime/acesso-avaliadores.txt`, protegido por ACL do usuário; compartilhar somente com os destinatários pretendidos. O banco armazena apenas seu hash. Expirar o convite impede novas concessões; revogá-lo bloqueia também os privilégios associados na próxima leitura. Não publicar o conteúdo desse arquivo.

## Evidências e continuidade

- [Autorização no domínio real](qa/hosted-auth.md): 140 asserções na matriz e 13 focadas em CSV/logout. Anônimo 401, conta sem role 403, analyst 200; HTML/RSC sem vazamento, CSV reconciliado e logout efetivo. Todas as identidades temporárias foram removidas.
- O wrapper do Worker agora aplica `private, no-store` e `Vary: Cookie` inclusive em redirects. [Seis verificações na versão 4](qa/web_redirect_headers_final.json) aprovaram a correção; [nove verificações focadas na versão 5](qa/web_otp6_deployment.json) confirmaram configuração ativa e bloqueio anônimo.
- [OTP6 e HTML responsivo](../web/tests/auth-email-render-results.json): 19 testes locais de auth e 25 verificações de templates/render em 320/720px; código legível, CTA e parâmetros preservados, sem recursos remotos.

- [Revisão independente e resultados atuais](qa/web_access_review.md): 205 verificações HTTP com sessões reais e 54 verificações no Edge, cobrindo 401 anônimo, 403 sem privilégio e 200 autorizado; páginas, RSC, APIs e CSVs. Na versão 3 publicada, passaram outras 53 verificações de rede e 20 de interface, com auth desabilitada: entrada pública sem gate ChatGPT e nenhuma leitura analítica disponível.
- [Backend real](../web/tests/authz-live-results.json): 46 verificações Supabase/PostgreSQL, sem SMTP; 19 testes locais e 2 focados no provider. Todas as fixtures próprias foram removidas e a ausência confirmada.
- [Checagem antes de abrir a audiência](qa/web_private_deployment_results.json): 21 verificações aprovadas na versão 2 protegida. A versão 3 alterou apenas o texto de erro de código/link inválido.
- 23 arquivos originais protegidos permaneceram byte a byte idênticos; CSVs autorizados reconciliados em 98 fatos, 25 clientes e 55 posições. [Evidências históricas](qa/web_validacao.md) não substituem a validação da autorização atual.

Run nativo Orca `run_87cea103aabe`. Tasks de autorização Backend `task_a5e4be04055c`, Frontend `task_1c5c93ba3145` e QA `task_6f358721226f`. A missão seguinte reutiliza essas sessões para descoberta SMTP `task_784685d5ce66`, autorização hospedada `task_ccf6544d5177`, requisitos de entrega `task_7401a1550234` e vídeos `task_332aaef8b5e6`; a correção OTP6/HTML é `task_cc66a55e665d`. Workers principais são preservados, sem release ou reinício. A próxima validação de e-mail é comprovar uma jornada real por OTP e entre PC/celular.

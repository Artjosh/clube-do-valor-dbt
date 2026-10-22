# Frontend privado — entrega de 22/10/2026

Task `task_1c5c93ba3145`, Dispatch `ctx_c35265c5a0ba`.

O contrato público anterior foi substituído por sessão verificada e permissão `analytics:read` no servidor. A referência Nicolas foi consultada somente em leitura, sem copiar senha pessoal, WhatsApp ou criação explícita de conta.

## Implementação

- `app/page.tsx`: Server Component dinâmico consulta `readAnalyticsAccess` usando cookies antes do import dinâmico de analytics. 401 redireciona a login; 403 a acesso-negado; 503 ou resultado sem autorização mostra indisponibilidade sem carregar snapshot.
- `app/acesso-negado/page.tsx`: também verifica o servidor; nunca importa analytics. A tela oferece contrassenha e logout, sem métricas.
- `private-login.tsx`: Login por e-mail sem senha e sem botão de cadastro; primeiro login não promete permissão. Contrassenha abre somente o campo do convite; e-mail aparece após `invite/claim` aceito. `device/start` vincula `useInvite`; `device/verify` envia somente challengeId/code. OTP usa o comprimento retornado pelo servidor, testado com seis e oito dígitos. Reivindicação expirada exige nova validação.
- Confirmação por link no celular preservada: código de oito dígitos do PC é separado do OTP do e-mail, checkbox explícito obrigatório, polling mínimo de três segundos termina após aprovação, expiração ou erro. Depois de aprovação pelo celular, consulta a sessão antes de escolher destino.
- `dashboard.tsx`: rótulos privados; nenhuma entrada de demonstração. 401/403 limpam o estado antes de navegar; indisponibilidade também fecha o acesso. Exportação CSV trata negativas de acesso. Logout apaga dados e aborta requests antes de aguardar o servidor. `pagehide` apaga o estado, retorno de bfcache recarrega a página para passar pelo guard.
- `auth-client.ts`, `auth-shell.tsx`, `access-denied.tsx` e estilos preservam o design editorial, mensagens de erro, disponibilidade honesta e responsividade. Códigos ficam apenas no estado temporário, sem storage ou URL.

## Evidências funcionais

Executados via CLI com Microsoft Edge externo headless contra o preview do coordenador em `http://127.0.0.1:3000`, sem iniciar/reiniciar seu processo.

1. `node web/components/private-auth-check.mjs`: **27/27 checks aprovados**, sem erros de execução no navegador. Verifica SSR real anônimo/configuração desativada sem payload analítico, login sem cadastro/senha, OTP6/8, convite aceito/rejeitado, destinos por autorização, indisponibilidade, expiração, polling encerrado, consentimento no celular e overflow mobile.
2. `node web/components/private-dashboard-check.mjs`: **14/14 checks aprovados**, sem erros de execução no navegador. Monta os componentes reais via módulos do preview com fixture sintética vazia e interrompe a navegação para inspecionar o DOM: 401/403/503 removem dados, logout apaga antes de terminar o request, export403 fecha o acesso, tela negada oferece convite/logout e cabe em 390px.

Resultados: `private-auth-checks.json` e `private-dashboard-checks.json`. Snapshots inspecionados: `private-login-desktop.png`, `private-otp-mobile.png`, `private-denied-mobile.png`.

Os scripts usam o puppeteer-core já instalado em `presentation/node_modules` somente em leitura e o Edge do Windows; não instalaram dependências. São ferramentas locais de QA e não integram o grafo de importação do produto.

## Limites de validação

As APIs de autenticação dos testes de UI foram interceptadas; nenhum e-mail real foi enviado, convite real consumido ou permissão real concedida. Os testes de dashboard usam dados sintéticos de UI, não uma sessão autorizada real. A resposta SSR com `AUTH_ENABLED=false` foi testada sem interceptação. A integração completa dos guards 401/403/200, revogação durável, cache/RSC e banco de permissões deve ser consolidada pelo Backend/QA/coordenador; a UI não substitui essas barreiras.

SMTP/provedor ainda precisa da configuração e validação operacional do coordenador/usuário. Instalação, build, publicação e commits não foram executados por este worker. Nenhum typecheck/linter foi executado. Pipeline dbt, CSVs, banco e repositórios Nicolas permaneceram fora das alterações.

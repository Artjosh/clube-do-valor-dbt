> Histórico da primeira entrega. O acesso público descrito abaixo foi substituído em 22/10/2026; consulte [PRIVATE-AUTH.md](./PRIVATE-AUTH.md) para a implementação privada atual.

# Frontend — entrega de 22/10/2026

Implementação exclusivamente em `web/app` (sem `api/`), `web/components` e `web/public/favicon.svg`. Não foram modificados pipeline, dados, snapshot, biblioteca analítica, auth backend, configurações, dependências ou apresentação.

## Interface

- Copper: saldo financeiro, volume bruto, transações, clientes ativos, fluxo financeiro acumulado/diário, volume por ativo e carteira.
- Silver: carteiras, transações e cadastro completo; ordenação, paginação, detalhes em dialog nativo e investigação por cliente/ativo.
- Gold: seis quantidades negativas do dataset completo, evidência histórica 71 PASS / 6 WARN, alertas detalhados, fonte preservada, linhagem e hashes SHA-256 do banco de origem e arquivos.
- Filtros cliente/ativo/período/pesquisa/operação, estado de tier/view/filtros na URL, restauração pelo histórico, exportação CSV com mesmos filtros.
- Gráficos SVG com valores do contrato e tabela alternativa acessível. Nenhuma cotação ou métrica financeira inventada. Recortes e semântica financeira explícitos.
- Menu responsivo com foco contido e Escape; skip link, focus-visible, regiões de carregamento/erro, estados vazios, dialog nativo e controles de ordenação com aria-sort.

## Autenticação

`/login` lê sessão/configuração real, inicia desafio, exibe código somente no PC e consulta o estado respeitando intervalo mínimo de três segundos, interrompendo polling em aprovação/expiração/erro. `/confirm` não mostra código: exige digitar os oito dígitos vistos no PC e marcar consentimento explícito antes de chamar approve. Erros do backend têm mensagens em português. Sem configuração, o formulário é substituído por explicação e link para demonstração pública.

Nenhum e-mail real foi enviado. Segundo coordenação, SMTP ainda impede habilitação pública; `AUTH_ENABLED=false` deve permanecer até configuração. Não há auth alternativa, sessão falsa ou sucesso simulado na implementação.

## Verificação

Preview existente `http://127.0.0.1:3000`, sem iniciar/reiniciar servidor. Microsoft Edge externo headless via CLI, sem browser integrado do Orca. Não executados instalação, build, typecheck, linter ou dbt por este worker; instalação/build ficam com o coordenador.

`frontend-checks.json`: **22 checks aprovados**, zero pageerrors na passagem principal. Métricas do dataset, filtro C1/URL/back, export, ordenação, paginação, detalhe/Escape, seis negativos, empty state, quatro rotas mobile e menu teclado. Em 390 px: viewport/clientWidth/scrollWidth = 390 após corrigir containing block dos textos sr-only na tabela. O scroll horizontal interno da tabela continua disponível.

Os caminhos felizes de auth e estado não configurado foram testados com interceptação isolada de respostas no browser de teste: nenhuma chamada a provedor, e-mail ou validação remota foi realizada. O teste verificou uma solicitação, dois polls e parada depois da aprovação; confirmou ausência de approve automático e necessidade de código/consentimento. Isso valida a interface, não certifica a integração real do provedor.

Snapshots inspecionados: `desktop-review.png`, `mobile-review.png`, `gold-review.png`, `login-review.png`. Corrigidos durante a revisão: hidratação por múltiplos nós textuais no `<title>` SVG, overflow mobile de sr-only, contraste/tamanho de textos e labels precisos de evidência.

## Arquivos principais

`app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/login/page.tsx`, `app/confirm/page.tsx`; `components/dashboard.tsx`, `analytics-charts.tsx`, `analytics-types.ts`, `data-table.tsx`, `device-auth.tsx`; `public/favicon.svg`.

Limites: nenhum teste real de envio SMTP por este worker; nenhuma publicação ou alteração de processos/commits. O resultado é uma demonstração analítica, sem cobrança e sem inferência de patrimônio/lucro/risco real. A sessão principal permanece preservada.

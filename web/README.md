# Clube do Valor — dashboard Vinext

Copper, Silver e Gold são níveis gratuitos de profundidade analítica sobre o dataset técnico. Veja [arquitetura](../docs/web-architecture.md), [contrato](../docs/web-contract.md), [autenticação](../docs/web-auth.md) e [ativação com Brevo](../docs/brevo-activation.md).

## Executar

Node 24.14.1 validado; requisito Node >=22.13. A partir desta pasta:

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 3000
```

Abra http://127.0.0.1:3000. O snapshot incluído dispensa Python/DuckDB no servidor web, mas as análises exigem sessão Supabase verificada e role `analyst`. Sem configuração, o servidor bloqueia dados e o login informa indisponibilidade. Não existe bypass de demonstração.

```sh
npm run build
npm start
```

O build usa Vinext/Vite, sem typecheck ou linter. Nesta máquina, o wrapper npm do helper de hospedagem falhou; `node scripts/run-framework.mjs build` executou o mesmo build diretamente com sucesso.

## Dados

Na raiz, com a venv existente, execute `./.venv/Scripts/python.exe scripts/export_dashboard.py`. A conexão DuckDB usa `read_only=True`; hashes são verificados antes/depois e somente `web/data/analytics.json` é escrito. Requer banco e auditorias já materializados; não roda dbt automaticamente. Republicar após exportar. O snapshot não é uma consulta em tempo real.

## Identidade

Rotas em `app/api/auth`, código de servidor em `lib/auth` e schema em `supabase/migrations`. A migration inicial já foi aplicada ao projeto dedicado; não a reaplique. Consulte o relatório de publicação antes de aplicar migrations posteriores. SMTP próprio é necessário: o Supabase Free recusou templates personalizados com o provedor padrão. A publicação mantém `AUTH_ENABLED=false` até configurar SMTP; isso bloqueia login e acesso aos dados. Não há envio/login simulado.

Login normal por OTP cria uma conta sem privilégio. O botão Contrassenha inicia um convite; após verificar o e-mail, a role `analyst` permite ler todos os níveis. A permissão é verificada no servidor em SSR/RSC, APIs e exportações; mudar o estado do frontend não concede acesso.

Configure `.dev.vars` localmente conforme [web-auth.md](../docs/web-auth.md). Nunca exponha chaves de serviço com prefixo NEXT_PUBLIC_. Na hospedagem, valores ficam em secrets nativos, fora do código. `.openai/hosting.json` registra a identidade do Site sem credenciais.

## Evidências

Testes de análise/API e browser estão em `../scripts/qa/web_*`, com resultados e screenshots em `../docs/qa/web*`. Testes auth em `tests/auth*` distinguem mocks, PostgreSQL/Supabase real e envio de e-mail (este ainda não validado). Os arquivos analíticos e o banco original foram preservados.

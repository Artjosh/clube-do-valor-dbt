# Clube do Valor — Engenharia de Dados

Projeto dbt + DuckDB com dois CSVs originais, seis modelos em três camadas, testes e documentação.

## Instalação e execução

Pré-requisitos: Python **3.12**, `pip` e acesso à internet para instalar as dependências. Execute os comandos na raiz do repositório. `requirements.txt` fixa dbt-core **1.10.11**, dbt-duckdb **1.9.6** e duckdb **1.3.2**; `requirements-lock.txt` fixa também as dependências transitivas. Não é necessário `dbt deps`.

**Windows PowerShell** (sem ativar o ambiente):

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
.\.venv\Scripts\dbt.exe seed --profiles-dir .
.\.venv\Scripts\dbt.exe run --profiles-dir .
.\.venv\Scripts\dbt.exe test --profiles-dir .
.\.venv\Scripts\dbt.exe docs generate --profiles-dir .
```

**Linux/macOS (POSIX):**

```sh
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-lock.txt
dbt seed --profiles-dir .
dbt run --profiles-dir .
dbt test --profiles-dir .
dbt docs generate --profiles-dir .
```

`profiles.yml` aponta para `clube_do_valor.duckdb`, schema `main`; a variável de ambiente `DBT_DUCKDB_PATH` permite outro caminho. Execute um escritor por vez e feche conexões concorrentes ao banco.

Resultado comprovado em Windows/Python 3.12.10: **2 seeds, 6 modelos, 71 PASS / 6 WARN / 0 ERROR**, com exit 0. Os comandos POSIX são equivalentes, mas não foram executados nesta máquina. Os seis alertas abaixo expõem problemas reais da fonte.

## Estrutura e regras

| Camada / arquivos | Responsabilidade |
|---|---|
| `seeds/clients.csv`, `seeds/transactions.csv` | Preservam os 27 cadastros e 100 transações originais, inclusive defeitos |
| `models/staging/stg_clients.sql` | Normaliza campos e escolhe um cadastro por cliente: 25 linhas |
| `models/staging/stg_transactions.sql` | Tipagem, nomes snake_case e filtros de validade: 98 linhas |
| `models/intermediate/int_transactions.sql` | Associa cliente e calcula valores e quantidades com sinal |
| `models/marts/dim_clients.sql` | Dimensão com os 25 clientes, inclusive sem negociação |
| `models/marts/fact_transactions.sql` | Fato incremental com 98 transações, chave `transaction_id` |
| `models/marts/mart_client_portfolio.sql` | 55 posições no grão `client_id` + `asset_ticker` |
| `models/schema.yml`, `tests/`, `macros/` | Descrições, testes genéricos/singulares e lógica reutilizável |

O staging usa `try_cast`, normaliza textos e rejeita IDs/cliente/ativo ausentes, operação fora de BUY/SELL, quantidade/preço não positivos, datas inválidas e cliente sem cadastro. Na fonte fornecida, rejeita T021 (cliente ausente) e T037 (quantidade negativa), sem apagar as linhas brutas.

Clientes duplicados são canonizados por completude, depois data mais antiga, nome, cidade e UF, com nulos por último. C6 conserva Brasília; as cópias idênticas de C1 têm o mesmo resultado. T035/T036 permanecem porque têm IDs distintos: payload igual gera alerta, não exclusão automática.

`quantity` e `unit_price` usam `decimal(18,4)`, valores financeiros usam `decimal(28,8)` e datas usam `date`. Para cada cliente/ativo:

- `net_quantity = SUM(BUY.quantity) - SUM(SELL.quantity)`.
- `net_financial_amount = SUM(BUY.quantity * unit_price) - SUM(SELL.quantity * unit_price)`.

O valor financeiro líquido não representa lucro, saldo de caixa ou valor de mercado: faltam preços atuais, custos e saldo inicial. Clientes sem transações permanecem na dimensão, sem posições artificiais.

## Qualidade

O enunciado pede execução sem erro e detecção dos defeitos intencionais. A interpretação adotada mantém invariantes dos modelos como `error` e somente seis diagnósticos como `warn`, com `store_failures: true`. **Exit 0 não significa fonte limpa nem todos os testes em PASS.**

| Diagnóstico | Resultado esperado |
|---|---|
| `assert_no_negative_position` | 6 posições com `net_quantity < 0` |
| `audit_invalid_transactions` | T021 e T037 |
| `audit_duplicate_transaction_payload` | T035 e T036 |
| `unique_clients_client_id` | C1 e C6 duplicados |
| `not_null_clients_city` | 1 cadastro C6 incompleto |
| `not_null_transactions_client_id` | T021 |

`not_null`, `unique`, `accepted_values` e relacionamentos verificam as invariantes aplicáveis. O singular exigido está em `tests/assert_no_negative_position.sql`. As linhas apontadas ficam no schema `main_dbt_test__audit`; essas tabelas são substituídas a cada teste.

Para promover avisos a falhas, use no PowerShell:

```powershell
.\.venv\Scripts\dbt.exe --warn-error test --profiles-dir .
```

Ou, no ambiente POSIX ativado:

```sh
dbt --warn-error test --profiles-dir .
```

Resultado esperado com a fonte original: **71 PASS / 6 FAIL, exit 1**. O modo estrito também promove outros avisos do dbt, caso existam. Nenhum problema foi removido da fonte para obter aprovação.

## Incremental e macros (bônus)

`fact_transactions` usa `delete+insert` por `transaction_id`. A seleção inclui datas a partir de `max(transaction_date)` já carregada menos **30 dias**, inclusive; `incremental_lookback_days` permite configurar a janela. A primeira execução e o full-refresh leem todo o staging.

Reexecução, novos IDs no mesmo dia, chegadas atrasadas e correções dentro da janela são tratadas sem duplicar IDs. Atrasos/correções fora da janela, exclusões, invalidações ou mudanças de data para fora dela exigem reconstrução. Datas futuras podem avançar o limite; a data de negócio não substitui um registro de alterações. Após revisar a fonte, reconstrua no PowerShell:

```powershell
.\.venv\Scripts\dbt.exe seed --full-refresh --profiles-dir .
.\.venv\Scripts\dbt.exe run --full-refresh --profiles-dir .
.\.venv\Scripts\dbt.exe test --profiles-dir .
```

No POSIX ativado, substitua `.\.venv\Scripts\dbt.exe` por `dbt`. Execute o `run` completo para atualizar os marts; selecionar apenas o fato não atualiza seus descendentes.

`clean_text` é reutilizada nos dois stagings; `typed_transactions` e `valid_transaction` compartilham tipagem e validação entre staging e auditoria. A suíte funcional isolada está em `scripts/verify_pipeline.py`, com evidência existente em `scripts/validation_results.json`.

## Documentação

`models/schema.yml` descreve os seis modelos, duas seeds e suas **55 colunas**. O comando `docs generate` acima produz `target/index.html`, `manifest.json` e `catalog.json`, incluindo as dependências entre modelos. Para consultar o catálogo, use `.\.venv\Scripts\dbt.exe docs serve --profiles-dir . --no-browser` no PowerShell, ou `dbt docs serve --profiles-dir . --no-browser` no POSIX ativado, e abra o endereço local informado.

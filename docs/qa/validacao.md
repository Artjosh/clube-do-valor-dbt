# Validação independente da implementação dbt

**Resultado: aprovado para o contrato documentado.** A reprodução local confirmou 98 fatos, 25 clientes, 55 posições e seis posições negativas, com valores exatamente iguais ao oracle extraído do HTML. Não foi encontrado bug nos cenários executados. Limitações do incremental fora da janela foram reproduzidas e estão documentadas no README.

Execução em 22/10/2026, 20:15:36 a 20:16:11 UTC (17:15:36 a 17:16:11 em São Paulo). Evidência estruturada: `docs/qa/validation_results.json`. Driver independente: `scripts/qa/validate_implementation.py`. Logs, run_results, exports CSV e banco isolado ficaram em `target/qa/validation_20261022T201536196520/`.

## Isolamento e reprodução

Foi criado um projeto vazio, sem artefatos dbt prévios ou banco, copiando explicitamente apenas `models/`, `macros/`, `tests/`, `seeds/`, `dbt_project.yml`, `profiles.yml`, `README.md`, `requirements.txt` e `requirements-lock.txt`. Não foram copiados `.venv`, `node_modules`, `.git`, apresentação ou banco principal. O banco da fixture foi criado pelo profile padrão dentro da cópia. Variáveis `DBT_*` herdadas foram removidas do subprocesso; telemetria foi desabilitada.

Comando reprodutível na raiz:

```powershell
.\.venv\Scripts\python.exe -B scripts/qa/validate_implementation.py
```

O driver agora resolve a fonte como `docs/entrega/enunciado.html` a partir da raiz do projeto, sem depender de um arquivo externo no Desktop; se ausente, informa esse caminho em erro explícito. Para verificar apenas a fonte e os seeds, sem dbt:

```powershell
python scripts/qa/audit_source.py docs/entrega/enunciado.html --seeds-dir seeds
```

Ajuste posterior de portabilidade: a cópia incluída tem o mesmo SHA-256 `42794781c81193e097686a75f14cebe6009d57647e4ab8161f3a87c1bcf99f33` da fonte histórica. A validação pontual conferiu resolução do caminho, erro de ausência e auditoria stdlib contra seeds (exit 0); a suíte dbt não foi repetida. Os horários, resultados e JSON da execução histórica abaixo permanecem preservados.

O runtime foi reutilizado da instalação local: Python 3.12.10, dbt-core 1.10.11, dbt-duckdb 1.9.6 e duckdb 1.3.2. As versões de **55 dependências instaladas** foram verificadas contra cada pin de `requirements-lock.txt`, todas iguais. O ambiente de **projeto, artefatos e banco estava limpo**; não se afirma uma reinstalação limpa dos pacotes: instalação via pip/rede não foi repetida, por escopo local e disponibilidade das dependências. Os comandos POSIX não foram executados.

O driver chamou o executável absoluto `.venv/Scripts/dbt.exe` da raiz original com cwd na cópia e `--profiles-dir .`, equivalente aos comandos de execução do README. Cada comando teve stdout/stderr e `run_results.json` preservados. A geração do catálogo também passou.

| Etapa / comando (todos com `--profiles-dir .`) | Exit code | Resultado |
|---|---:|---|
| 01 `dbt seed` | 0 | 2 seeds |
| 02 `dbt run` | 0 | 6 modelos |
| 03 `dbt test` | 0 | 71 PASS, 6 WARN |
| 04 `dbt --warn-error test` | 1 esperado | 71 PASS, 6 FAIL |
| 05 `dbt docs generate` | 0 | Catálogo gerado |
| 06 `dbt run` sem alteração | 0 | 6 modelos |
| 07 `dbt seed` fixture no watermark | 0 | 2 seeds |
| 08 `dbt run` fixture no watermark | 0 | 6 modelos |
| 09 `dbt seed` futuro/janela/correção | 0 | 2 seeds |
| 10 `dbt run` futuro/janela/correção | 0 | 6 modelos |
| 11 `dbt run` reexecução da fixture | 0 | 6 modelos |
| 12 `dbt seed` atraso fora da janela | 0 | 2 seeds |
| 13 `dbt run` atraso fora da janela | 0 | 6 modelos |
| 14 `dbt run --full-refresh` | 0 | 6 modelos reconstruídos |

## Comparação independente da fonte e dos resultados

Seeds da cópia foram comparados com arrays extraídos diretamente do HTML UTF-8, preservando valores e multiplicidades: 100 transações e 27 cadastros. Não foi usado SQL do projeto para calcular o esperado. O `audit_source.py` da primeira fase forneceu as 98 transações válidas, 25 cadastros canônicos e 55 posições esperadas. As sete colunas originais de todos os fatos foram comparadas por multiconjunto; todos os valores derivados também foram recalculados com Decimal. A dimensão foi comparada nas cinco colunas, mapeando `client_name` para `name`.

Todos os pares cliente/ativo foram reconciliados em quantidade e financeiro, e ainda em `transaction_count` e `last_transaction_date`. Duplicatas de grão, linhas faltantes/extras e divergências numéricas seriam falha. As comparações monetárias não usam float nem tolerância. T035 e T036 permanecem; T021 e T037 são rejeitadas. C6 conserva Brasilia e os 15 clientes sem transações continuam na dimensão.

| Medida de baseline | Resultado exato |
|---|---:|
| Fatos | 98 |
| Dimensão de clientes | 25 |
| Grãos cliente/ativo | 55 |
| Quantidade líquida total, checksum | 10900.0000 |
| Financeiro líquido BUY − SELL | 215915.00000000 |

O financeiro líquido representa aquisições menos alienações no histórico fornecido; não é lucro nem valor de mercado. A soma de quantidades de ativos diferentes é apenas um checksum técnico.

| Cliente/ativo negativo | Quantidade | Financeiro |
|---|---:|---:|
| C1 / BBDC4 | -50 | -800.00 |
| C3 / WEGE3 | -30 | -1194.00 |
| C5 / BBDC4 | -400 | -6140.00 |
| C6 / ITUB4 | -50 | -1445.00 |
| C7 / WEGE3 | -60 | -2430.00 |
| C8 / VALE3 | -30 | -2130.00 |

## Alertas e modo estrito

A lista de testes em WARN foi comparada por identidade e número de falhas com a lista em FAIL no modo estrito; não houve falha adicional. Os seis alertas são:

| Teste | Linhas / grupos sinalizados |
|---|---:|
| assert_no_negative_position | 6 |
| audit_invalid_transactions | 2 |
| audit_duplicate_transaction_payload | 2 |
| not_null_clients_city | 1 |
| not_null_transactions_client_id | 1 |
| unique_clients_client_id | 2 |

O comportamento resolve de forma explícita a ambiguidade do enunciado: o comando padrão sai com zero, mas expõe problemas conhecidos; a fiscalização estrita sai com 1. Não se trata de ausência de problemas na fonte.

## Cobertura documental

O `manifest.json` compilado foi confrontado com as colunas físicas em `information_schema.columns` do banco isolado. Os seis modelos e duas seeds têm descrição não vazia, correspondência exata entre colunas físicas e documentadas e descrição não vazia em **55 de 55 colunas** (43 dos modelos e 12 das seeds).

| Relação | Colunas documentadas / físicas |
|---|---:|
| stg_transactions | 7 / 7 |
| stg_clients | 5 / 5 |
| int_transactions | 10 / 10 |
| fact_transactions | 10 / 10 |
| dim_clients | 5 / 5 |
| mart_client_portfolio | 6 / 6 |
| transactions | 7 / 7 |
| clients | 5 / 5 |

Inspeção do schema confirmou testes not_null, unique, accepted_values e relacionamentos; os resultados de execução confirmaram os testes compilados. Não houve linter ou typecheck.

## Incremental com fixtures independentes

Apenas os CSVs da cópia foram modificados, e cada mutação foi recarregada por `dbt seed`. O esperado foi calculado em Python a partir dos fatos válidos originais mais a fixture. **Cada cenário compara a fato inteira e o mart inteiro**, incluindo aritmética por evento, unicidade, quantidade, financeiro, contagem e última data por cliente/ativo.

1. **Sem mudanças:** reexecução mantém todas as colunas dos 98 fatos e as 55 posições exatamente iguais.
2. **Novo ID no watermark:** `QA_WATERMARK`, C1/PETR4 BUY, quantidade 2.5000, preço 40.1250 e data 2024-08-10. Incluído uma única vez, evidenciando o operador inclusivo e precisão fracionária.
3. **Futuro, atraso e correção:** adicionados `QA_FUTURE` em 2024-08-11 (1.2500), `QA_LATE` em 2024-07-20 (4) e `QA_BOUNDARY` em 2024-07-11 (3), todos a 40.1250. A data 11/07 é exatamente 30 dias antes do watermark existente 10/08 no início da execução; foi incluída. T100 corrigida de 230 para 231.1250 substituiu o mesmo ID. O máximo avança para 11/08 somente após essa carga.
4. **Reexecução da fixture:** mantém os 102 fatos e todos os valores; o evento de borda já carregado não desaparece ao sair da nova janela.
5. **Fora da janela:** `QA_OUTSIDE`, quantidade 5 e preço 40.1250, data 2024-07-11, chega quando o watermark já é 11/08. Agora está a 31 dias e não entra no incremental, conforme contrato. Nenhum outro fato ou posição muda.
6. **Full refresh:** reconstrói a mesma fixture e inclui o atrasado, totalizando 103 fatos. O resultado inteiro coincide com a reconstrução Decimal independente, inclusive as 55 posições.

| Snapshot | Fatos | Pares | Quantidade líquida | Financeiro líquido |
|---|---:|---:|---:|---:|
| Baseline / sem mudanças | 98 | 55 | 10900.0000 | 215915.00000000 |
| Novo ID na mesma data | 99 | 55 | 10902.5000 | 216015.31250000 |
| Futuro + atrasos + correção | 102 | 55 | 10911.8750 | 216365.80625000 |
| Reexecução | 102 | 55 | 10911.8750 | 216365.80625000 |
| Fora da janela diferido | 102 | 55 | 10911.8750 | 216365.80625000 |
| Reconstrução completa | 103 | 55 | 10916.8750 | 216566.43125000 |

A suíte prévia de Dados (`scripts/verify_pipeline.py`, `scripts/validation_results.json`, artefatos em `target/evidence/`) foi lida e tem evidência de 17 verificações, incluindo exclusão, invalidação e correção histórica seguida de recuperação por full-refresh. Esses casos adicionais não foram duplicados aqui. A presente execução acrescenta a data exatamente no watermark, a borda exata de 30 dias, frações e reconciliação integral independente em cada snapshot.

## Preservação e limites

Hashes SHA-256 antes e depois de 24 arquivos originais, incluindo código, seeds, configuração, README, dependências e banco principal, permaneceram iguais. O banco principal não foi aberto por DuckDB: apenas seus bytes foram lidos para hash. Hash preservado do banco: `09c612d5817b7ca7ad0cbb7efca40e8470db6fc823c92748c4a034dd9656d5a8`.

Os atrasos fora da janela, deleções, invalidações e correções históricas continuam exigindo reconstrução, como o README informa. A fiscalização estrita promove qualquer novo warning, não somente os seis atuais. Esta validação não certifica instalação via rede, execução POSIX, volumes grandes, concorrência de escritores, vídeo, publicação ou envio externo. Nenhum serviço externo, browser, typecheck ou linter foi usado. Os artefatos da fixture permanecem sob `target/qa/` para inspeção, sem necessidade de alterar o banco principal.

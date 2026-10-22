# Auditoria independente da fonte

Fonte lida integralmente em UTF-8: `C:/Users/josh/Desktop/Teste Técnico_Engenheiro-Dados-CDV.html`.
SHA-256: `42794781c81193e097686a75f14cebe6009d57647e4ab8161f3a87c1bcf99f33`.
O HTML não foi alterado. Nenhum dbt, banco, typecheck ou linter foi executado nesta auditoria.

## Método e decisões

O script `scripts/qa/audit_source.py` extrai os arrays JSON das duas funções de download sem executar JavaScript, interpreta CSV com a biblioteca padrão e calcula quantidades e valores com `Decimal`. Não depende do SQL implementado. O grão de transações é `transaction_id`; o de posições é `(client_id, asset_ticker)`. O oracle completo, incluindo as 55 posições, está em `docs/qa/oracle.json`.

Validade de transação exige campos preenchidos, cliente conhecido, operação BUY/SELL, quantidade e preço positivos e data ISO válida. T021 é inválida por cliente ausente; T037 por quantidade -50. Não existem outros IDs de transações inválidos nem IDs repetidos. Posições negativas são anomalias analíticas preservadas, não justificativa para excluir vendas.

Clientes: 27 linhas brutas, 26 linhas completas, 25 IDs canônicos. C1 tem duas linhas idênticas; C6 tem duas versões, uma sem cidade. A regra canônica escolhe o registro mais completo (Brasilia para C6), e conserva a primeira ocorrência em empate. Isso é suficiente para esta fonte; conflitos futuros entre versões completas exigem regra explícita de atualização. Não classificar todos os registros de C6 como inválidos. C11 a C25 são 15 clientes sem transações e devem continuar na dimensão.

T035 e T036 repetem o payload `(C4, ITUB4, BUY, 120, 28.50, 2024-03-27)` com IDs diferentes. Não há evidência suficiente para concluir que são o mesmo evento. A decisão conservadora é manter as duas e sinalizar suspeita em teste de qualidade da fonte. Se houver deduplicação por payload explicitamente escolhida, os números alternativos são 97 fatos, quantidade líquida 10780 e valor líquido 212495.00; C4/ITUB4 passa de 240 / 6840.00 para 120 / 3420.00. Os demais grupos e seis negativos não mudam. Não misturar as duas políticas na validação.

## Reconciliação esperada

| Medida | Resultado |
|---|---:|
| Transações brutas | 100 |
| Transações rejeitadas | 2 |
| Transações válidas / fatos | 98 |
| BUY válidas | 67 |
| SELL válidas | 31 |
| Clientes canônicos | 25 |
| Clientes com transações | 10 |
| Pares cliente/ativo | 55 |
| Quantidade BUY | 13970 |
| Quantidade SELL | 3070 |
| Quantidade líquida | 10900 |
| Valor BUY = soma(quantity * unit_price) | 297849.00 |
| Valor SELL | 81934.00 |
| Valor financeiro líquido BUY - SELL | 215915.00 |

Somar quantidades entre ativos serve somente como checksum técnico; não significa uma posição econômica homogênea. O financeiro líquido é custo de aquisições menos receitas de alienações nos dados disponíveis, sem cotação atual, custo realizado ou saldo inicial. Não é lucro, patrimônio ou valor de mercado. As posições são líquidas do período fornecido, não necessariamente a carteira real completa.

| Cliente | Ativo | Quantidade líquida | Financeiro líquido |
|---|---|---:|---:|
| C1 | BBDC4 | -50 | -800.00 |
| C3 | WEGE3 | -30 | -1194.00 |
| C5 | BBDC4 | -400 | -6140.00 |
| C6 | ITUB4 | -50 | -1445.00 |
| C7 | WEGE3 | -60 | -2430.00 |
| C8 | VALE3 | -30 | -2130.00 |

O teste singular deve retornar estes seis pares por `net_quantity < 0`. Agregar só por cliente esconde as anomalias; verificar apenas valor financeiro pode sinalizar situações economicamente diferentes. Esta auditoria verifica o saldo final, não todas as posições históricas negativas intermediárias.

## Critérios de aceite e ambiguidade do enunciado

1. Seeds mantêm os 100 e 27 registros originais, inclusive problemas intencionais; saneamento ocorre em modelos, nunca manualmente nos seeds.
2. Os seis modelos pedidos existem nas três camadas, com nomes em snake_case, tipos apropriados e descrição de todas as colunas em YAML.
3. A dimensão é única por cliente; join com ela não multiplica as 98 transações. A fato é única por transação. Portfolio é único por cliente/ativo e reconcilia cada par com a fato usando aritmética decimal exata.
4. Testes genéricos incluem not_null, unique e accepted_values pertinentes; testes da fonte observam os defeitos antes dos filtros. Testes de integridade dos modelos não devem falhar por defeitos que os filtros já rejeitaram.
5. O teste singular obrigatório detecta os seis negativos, preservados no mart. O enunciado pede simultaneamente que tudo passe e que o teste detecte o problema. Recomenda-se `severity: warn` para anomalias conhecidas da fonte e posições negativas, deixando erros de integridade como error. Documentar explicitamente que WARN não é ausência de problemas; oferecer execução estrita com `dbt test --warn-error` se compatível com a versão utilizada. Não suprimir linhas ou esconder defeitos para forçar PASS.
6. A execução seed/run/test pelo procedimento documentado deve ser reproduzível posteriormente. A auditoria da fonte não certifica essa execução, ainda pendente de coordenação com o worker de dados.
7. Incremental e macro reutilizável são bônus; vídeo com até cinco minutos é obrigatório. Publicação e envio de e-mail constam do enunciado, mas estão fora da autorização desta tarefa.

## Como reproduzir e verificar exports

Na raiz do workspace, com Python padrão:

```powershell
python scripts/qa/audit_source.py docs/entrega/enunciado.html
python scripts/qa/audit_source.py docs/entrega/enunciado.html --seeds-dir seeds
python scripts/qa/audit_source.py docs/entrega/enunciado.html --fact-csv docs/qa/fact_export.csv --clients-csv docs/qa/clients_export.csv --portfolio-csv docs/qa/portfolio_export.csv
```

Para reprodução portátil, os comandos usam a cópia incluída em `docs/entrega/enunciado.html`, com SHA-256 idêntico ao original registrado acima. O primeiro comando imprime o oracle sem sobrescrever a evidência histórica em `docs/qa/oracle.json`.

Os exports devem conter os sete campos originais para fato, cinco campos originais para clientes e `client_id,asset_ticker,net_quantity,net_financial_value` para portfolio. Colunas extras são toleradas. Nomes diferentes das duas métricas podem ser informados com `--quantity-column` e `--value-column`. Datas devem estar no formato ISO sem horário. Valores numéricos são comparados exatamente com Decimal, sem tolerância de float. O verificador usa multiconjuntos, detectando linhas faltantes, extras e duplicação, e termina com código não zero em divergência. Não abre nem altera banco. A comparação de seeds preserva valores e multiplicidades, tolerando ordem de linhas e diferenças de terminação de linha.

O oracle é específico à política acima; diferenças de regra devem ser resolvidas, não aceitas ajustando o resultado esperado silenciosamente. A extração é deliberadamente restrita ao formato dos arrays deste HTML. Para dados futuros diferentes, reavaliar regras e conflitos cadastrais.

Validação executada: extração do HTML e geração do JSON com saída zero; checks independentes de 100/98 transações, 55 pares, seis negativos e 215915.00; comparação de posições e injeção em memória de linha faltante, linha duplicada e valor incorreto, todas detectadas pelo comparador. Exports reais do dbt ainda não foram comparados. Uma primeira chamada de teste via pipe PowerShell perdeu o acento no caminho; a repetição resolveu o caminho pelo glob do nome e passou, sem mudar o HTML ou o script.

## Revisão incremental posterior, com execução serializada

Usar um banco/target de teste independente ou coordenar acesso exclusivo com o worker de dados; não modificar a base em uso dele. Preservar os seeds entregues e fazer fixtures isoladas. Em todos os cenários comparar fato inteira e portfolio por grão contra reconstrução completa da mesma fixture.

| Cenário | Critério |
|---|---|
| Carga inicial | 98 fatos, 25 clientes, 55 pares e seis negativos |
| Reexecução sem mudanças | Mesmos IDs, multiplicidades, valores e totais; nenhuma duplicação |
| Nova transação na data máxima (2024-08-10) | Incluir novo ID exatamente uma vez; `>` na data máxima perde a linha |
| Nova transação futura | Incluir e atualizar apenas agregações afetadas sem perder histórico |
| Chegada atrasada anterior ao watermark | Incluir conforme contrato declarado; lookback finito só cobre sua janela, não atrasos arbitrários |
| Correção de ID existente | Atualizar sem duplicar; mudança de data também deve ter política explícita |
| Full-refresh | Resultado idêntico ao incremental para a mesma fonte sob o contrato adotado |

`transaction_date` é controle de extração, não chave única de evento. Usar transaction_id para idempotência, com merge/delete-insert ou outra estratégia compatível com o adapter. Um filtro `>= max(date)` sozinho cobre a borda do mesmo dia, mas não chegadas antigas; lookback documentado, anti-join por IDs novos ou reprocessamento completo são alternativas com limitações distintas. Não declarar suporte a alterações/deleções históricas sem teste e mecanismo correspondente.

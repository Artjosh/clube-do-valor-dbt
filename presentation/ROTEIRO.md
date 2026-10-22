# Roteiro da apresentação

Narração sintética local, Kokoro pf_dora, pt-br, velocidade 1.05. Não simula a voz do candidato.

## 0s — Dados confiáveis começam na origem

Como transformar arquivos com defeitos em uma carteira confiável? Esta apresentação gerada explica a solução com dbt e DuckDB. Os arquivos originais são preservados nos seeds. O tratamento acontece nos modelos, enquanto testes mantêm os problemas da fonte visíveis para auditoria.

## 19s — Uma responsabilidade por camada

A arquitetura tem três camadas. Staging padroniza textos, converte tipos e filtra transações inválidas. Clientes repetidos são resolvidos por completude e desempate determinístico. Intermediate relaciona transações e clientes, sem multiplicar eventos. Marts publica a fato, a dimensão e a carteira por cliente e ativo.

## 40s — Compra soma. Venda subtrai.

Na carteira, compras somam e vendas subtraem quantidade e valor financeiro. Por exemplo, as duas primeiras operações de C1 em PETR4, compra de cem e venda de quarenta, deixam sessenta unidades nesse recorte. O saldo financeiro usa preços das operações. Não representa valor de mercado nem lucro realizado.

## 60s — Alertar também é validar

Testes genéricos protegem chaves, campos obrigatórios e domínios. Auditorias expõem registros inválidos e possíveis duplicidades. O teste singular retorna carteiras com posição negativa. Esses defeitos conhecidos geram avisos no fluxo padrão. No modo estrito, avisos viram falhas. Portanto, execução concluída não significa dados sem problemas.

## 82s — Incremental com limites claros

A fato é incremental: a data da transação controla uma janela retrospectiva de trinta dias. A chave de transação permite substituir registros sem duplicar identificadores. Correções antigas e exclusões exigem reconstrução completa. Macros reutilizam limpeza, tipagem e validação, mantendo a mesma regra entre transformação e auditoria.

## 104s — Reproduza pelo README

Para reproduzir, siga o README na raiz: crie o ambiente Python, instale os requisitos e configure o perfil local. Execute dbt seed, dbt run e dbt test. Revise os avisos e as tabelas de falhas. Use o modo estrito para exigir bloqueio por qualidade. A entrega mantém decisões, código e evidências verificáveis.

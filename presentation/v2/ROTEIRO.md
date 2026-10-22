# Roteiro por cena — versão 2

Mesmo roteiro e timecodes para narração pessoal da versão sem áudio. Voz sintética da versão narrada: Kokoro pf_dora, pt-BR, velocidade 1.12; não imita o candidato. Legendas alinhadas por frase de modo aproximado.

Facecam: área livre sem marcador visual em x=1470, y=770, largura=360, altura=230 no canvas 1920×1080.

## 00:00:00,000 a 00:00:19,000 — Da fonte à análise confiável.

Esta apresentação explica a solução do teste de engenharia de dados do Clube do Valor. O núcleo é um projeto dbt com DuckDB, executável localmente a partir do README. A extensão web transforma os resultados em análise navegável. O foco é preservar a fonte, explicitar decisões e mostrar os limites dos dados.

**Na tela:** dbt + DuckDB; Dados preservados, decisões explícitas; Vinext como extensão analítica.

## 00:00:19,000 a 00:00:43,000 — Corrigir a leitura. Preservar a origem.

Os arquivos originais foram preservados: cem transações e vinte e sete cadastros. O staging produz noventa e oito transações válidas e vinte e cinco clientes canônicos. Registros rejeitados continuam auditáveis na fonte. A escolha de cadastro prioriza completude, com desempate determinístico. Transações de conteúdo igual, mas identificadores distintos, não são apagadas sem confirmação de negócio.

**Na tela:** 100 transações e 27 cadastros nas seeds; 98 transações válidas e 25 clientes canônicos; T035 e T036: IDs distintos, fatos preservados.

## 00:00:43,000 a 00:01:06,000 — Três camadas, uma responsabilidade por etapa.

A estrutura separa três responsabilidades. Staging normaliza textos, converte tipos e filtra registros inválidos. Intermediate junta transações ao cliente canônico e calcula quantidades e valores com sinal. Marts entrega dimensão de clientes, fato de transações e carteira por cliente e ativo. Macros reutilizam regras, e testes e documentação acompanham os modelos.

**Na tela:** Staging: tipos, filtros e cadastro canônico; Intermediate: join e sinais BUY / SELL; Marts: dimensão, fato e carteira cliente × ativo.

## 00:01:06,000 a 00:01:29,000 — Quantidade e valor têm sinais explícitos.

A carteira soma compras menos vendas em quantidade e valor financeiro. Valores usam tipos decimais, evitando cálculos aproximados no núcleo. Esse resultado não representa patrimônio, lucro ou valor de mercado: faltam cotações atuais, taxas e saldo inicial. Clientes sem negociação permanecem na dimensão, sem gerar posições artificiais. As seis posições negativas ficam visíveis.

**Na tela:** Quantidade líquida = compras − vendas; Valor financeiro = Σ quantidade × preço, com sinal; Não é patrimônio, lucro ou valor de mercado.

## 00:01:29,000 a 00:01:55,000 — Os alertas fazem parte da entrega.

A validação registrada teve setenta e um testes aprovados e seis alertas. Eles expõem posições negativas, transações inválidas, duplicidades e cadastro incompleto. Invariantes dos modelos continuam sendo erros. Os diagnósticos conhecidos usam avisos, com linhas de falha persistidas. No modo estrito, os seis avisos viram falhas esperadas. Código de saída zero no modo normal não significa fonte sem problemas.

**Na tela:** 71 PASS / 6 WARN no conjunto original; T021 e T037 rejeitadas; duplicidades sinalizadas; Modo estrito: 71 PASS / 6 FAIL esperados.

## 00:01:55,000 a 00:02:18,000 — Reprocessamento limitado e previsível.

O fato é incremental pela chave da transação, usando delete mais insert. A janela padrão reprocessa trinta dias em relação à maior data já carregada, não ao relógio atual. Isso permite repetir a entrada sem duplicar identificadores e aplicar correções dentro da janela. Alterações antigas, exclusões e invalidações exigem reconstrução completa. Esses limites estão documentados e testados.

**Na tela:** Chave transaction_id · estratégia delete+insert; Janela de 30 dias a partir da maior data carregada; Fora da janela, exclusões e invalidações: full-refresh.

## 00:02:18,000 a 00:02:39,000 — O README é o ponto de partida.

Para reproduzir, siga o README da raiz: crie o ambiente Python três ponto doze e instale as dependências fixadas. Com o ambiente ativado, execute dbt seed, dbt run e dbt test, usando profiles dir ponto. O README também traz os caminhos completos para PowerShell, geração de documentação e full refresh. O pipeline não depende da autenticação do site.

**Na tela:** `dbt seed --profiles-dir .`; `dbt run --profiles-dir .`; `dbt test --profiles-dir .`

## 00:02:39,000 a 00:03:01,000 — Do número ao registro que o explica.

A extensão Vinext oferece três profundidades, sem planos pagos. Copper resume os movimentos. Silver permite investigar clientes, ativos e transações, com filtros, detalhes e exportação CSV. Gold expõe qualidade, linhagem e evidências. O site lê um snapshot exportado do DuckDB em modo somente leitura. Não é uma consulta de mercado em tempo real, nem altera o pipeline.

**Na tela:** Copper · visão executiva; Silver · clientes, ativos e transações; Gold · qualidade, linhagem e evidências.

## 00:03:01,000 a 00:03:24,000 — Entrar não é receber permissão.

DuckDB guarda a análise; Supabase e PostgreSQL cuidam da identidade e das permissões. O login por código de e-mail cria uma conta sem acesso. A contrassenha é um convite, e só concede permissão depois da verificação do e-mail. Página, APIs e CSV exigem sessão e role de analista no servidor. A confirmação pelo celular preserva comparação de código e aprovação explícita.

**Na tela:** DuckDB → snapshot analítico → Vinext; Supabase / PostgreSQL → identidade e permissões; Sessão + role analyst + analytics:read no servidor.

## 00:03:24,000 a 00:03:51,000 — Entrega reproduzível. Estado transparente.

A integração local registrou duzentas e cinco verificações HTTP e cinquenta e quatro no navegador Edge com sessões reais. Esses testes comprovam as jornadas avaliadas, mas não substituem a validação operacional do envio de e-mail. O repositório reúne comandos, decisões, evidências e limitações. Consulte a documentação para o estado da publicação. Assim, o avaliador pode reproduzir o pipeline e conferir a extensão separadamente.

**Na tela:** 205 verificações HTTP + 54 no Edge: integração local real; Envio de e-mail: validação operacional separada; README · docs/qa · web/README.md · código editável.

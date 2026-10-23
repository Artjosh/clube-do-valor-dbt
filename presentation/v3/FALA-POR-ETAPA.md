# Fala por etapa — versão 3

Sem legendas sobrepostas. Mesma edição nas versões narrada e sem áudio. Voz sintética local Kokoro pf_dora, pt-BR, velocidade 1.12; não imita o candidato. Cada fala começa 0,5 segundo após a entrada da etapa.

Área livre para facecam: x=1470, y=770, largura=360, altura=230 em 1920×1080.

## 01 — Da fonte à análise confiável.

**Tela:** 00:00:00,000 a 00:00:19,000. **Fala:** 00:00:00,500 a 00:00:17,439.

Esta apresentação explica a solução do teste de engenharia de dados do Clube do Valor. O núcleo é um projeto dbt com DuckDB, executável localmente a partir do README. A extensão web transforma os resultados em análise navegável. O foco é preservar a fonte, explicitar decisões e mostrar os limites dos dados.

## 02 — Corrigir a leitura. Preservar a origem.

**Tela:** 00:00:19,000 a 00:00:43,000. **Fala:** 00:00:19,500 a 00:00:41,175.

Os arquivos originais foram preservados: cem transações e vinte e sete cadastros. O staging produz noventa e oito transações válidas e vinte e cinco clientes canônicos. Registros rejeitados continuam auditáveis na fonte. A escolha de cadastro prioriza completude, com desempate determinístico. Transações de conteúdo igual, mas identificadores distintos, não são apagadas sem confirmação de negócio.

## 03 — Três camadas, uma responsabilidade por etapa.

**Tela:** 00:00:43,000 a 00:01:06,000. **Fala:** 00:00:43,500 a 00:01:03,916.

A estrutura separa três responsabilidades. Staging normaliza textos, converte tipos e filtra registros inválidos. Intermediate junta transações ao cliente canônico e calcula quantidades e valores com sinal. Marts entrega dimensão de clientes, fato de transações e carteira por cliente e ativo. Macros reutilizam regras, e testes e documentação acompanham os modelos.

## 04 — Quantidade e valor têm sinais explícitos.

**Tela:** 00:01:06,000 a 00:01:29,000. **Fala:** 00:01:06,500 a 00:01:27,599.

A carteira soma compras menos vendas em quantidade e valor financeiro. Valores usam tipos decimais, evitando cálculos aproximados no núcleo. Esse resultado não representa patrimônio, lucro ou valor de mercado: faltam cotações atuais, taxas e saldo inicial. Clientes sem negociação permanecem na dimensão, sem gerar posições artificiais. As seis posições negativas ficam visíveis.

## 05 — Os alertas fazem parte da entrega.

**Tela:** 00:01:29,000 a 00:01:55,000. **Fala:** 00:01:29,500 a 00:01:53,878.

A validação registrada teve setenta e um testes aprovados e seis alertas. Eles expõem posições negativas, transações inválidas, duplicidades e cadastro incompleto. Invariantes dos modelos continuam sendo erros. Os diagnósticos conhecidos usam avisos, com linhas de falha persistidas. No modo estrito, os seis avisos viram falhas esperadas. Código de saída zero no modo normal não significa fonte sem problemas.

## 06 — Reprocessamento limitado e previsível.

**Tela:** 00:01:55,000 a 00:02:18,000. **Fala:** 00:01:55,500 a 00:02:16,833.

O fato é incremental pela chave da transação, usando delete mais insert. A janela padrão reprocessa trinta dias em relação à maior data já carregada, não ao relógio atual. Isso permite repetir a entrada sem duplicar identificadores e aplicar correções dentro da janela. Alterações antigas, exclusões e invalidações exigem reconstrução completa. Esses limites estão documentados e testados.

## 07 — O README é o ponto de partida.

**Tela:** 00:02:18,000 a 00:02:39,000. **Fala:** 00:02:18,500 a 00:02:37,892.

Para reproduzir, siga o README da raiz: crie o ambiente Python três ponto doze e instale as dependências fixadas. Com o ambiente ativado, execute dbt seed, dbt run e dbt test, usando profiles dir ponto. O README também traz os caminhos completos para PowerShell, geração de documentação e full refresh. O pipeline não depende da autenticação do site.

## 08 — Do número ao registro que o explica.

**Tela:** 00:02:39,000 a 00:03:10,000. **Fala:** 00:02:39,500 a 00:03:08,785.

Esta página é completamente desnecessária para cumprir os requisitos do teste. Foi criada apenas para tornar mais visual o processo e seus resultados. O projeto dbt com DuckDB local atende toda a avaliação técnica, sem conta ou serviço externo. Como extensão opcional, Vinext organiza três profundidades: Copper, visão executiva; Silver, investigação de clientes, ativos e transações; e Gold, qualidade, linhagem e evidências. O site consulta um snapshot somente leitura, sem alterar o pipeline.

## 09 — Entrar não é receber permissão.

**Tela:** 00:03:10,000 a 00:03:33,000. **Fala:** 00:03:10,500 a 00:03:31,001.

DuckDB guarda a análise; Supabase e PostgreSQL cuidam da identidade e das permissões. O login por código de e-mail cria uma conta sem acesso. A contrassenha é um convite, e só concede permissão depois da verificação do e-mail. Página, APIs e CSV exigem sessão e role de analista no servidor. A confirmação pelo celular preserva comparação de código e aprovação explícita.

## 10 — Entrega reproduzível. Estado transparente.

**Tela:** 00:03:33,000 a 00:04:03,000. **Fala:** 00:03:33,500 a 00:04:00,950.

A entrega técnica se encerra no núcleo local: duas fontes preservadas, seis modelos em três camadas e regras documentadas. O README reúne os comandos para instalar, executar e testar. As evidências registram setenta e um testes aprovados e seis alertas conhecidos, com modo estrito para tratá-los como falhas. O incremental explicita seus limites e o caminho de reconstrução. Assim, o avaliador pode reproduzir os resultados e conferir cada decisão sem depender da extensão web.

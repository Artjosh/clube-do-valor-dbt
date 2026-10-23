# Conferência dos requisitos — revisão do README

Revisão documental em 22/10/2026. Fonte: leitura integral, em UTF-8, de `docs/entrega/enunciado.html`, cópia do original local `C:/Users/josh/Desktop/Teste Técnico_Engenheiro-Dados-CDV.html`. SHA-256 esperado: `42794781c81193e097686a75f14cebe6009d57647e4ab8161f3a87c1bcf99f33`.

## Escopo e evidência

Esta revisão altera somente `README.md` e este relatório. Não executa novamente o pipeline, não altera severidades e não modifica dados ou implementação. O README foi reduzido aos requisitos técnicos de execução e entendimento do dbt, sem referências à extensão web ou à apresentação, conforme solicitação expressa. A exigência de vídeo permanece registrada aqui, fora do README.

A evidência de execução abaixo é **anterior a esta revisão documental**, não um novo teste: `scripts/qa/delivery_results.json`, de **2026-10-22T22:34:31.943486+00:00 a 22:34:47.236471+00:00**. Usou cópia explícita do projeto em `target/delivery-check/20261022T223431942486/project`, banco novo e ambiente Python existente. Não comprova instalação nova das dependências nem execução POSIX.

| Comando anterior (com `--profiles-dir .`) | Exit | Evidência |
|---|---:|---|
| `dbt seed` | 0 | 2 seeds carregadas |
| `dbt run` | 0 | 6 modelos construídos |
| `dbt test` | 0 | 71 PASS / 6 WARN |
| `dbt docs generate` | 0 | index, manifest e catalog gerados |
| `dbt --warn-error test` | 1 esperado | 71 PASS / 6 FAIL |

Essa execução reconciliou as **55 posições cliente/ativo com Decimal e oracle independente**, 98 fatos, 25 clientes e seis posições negativas; comprovou descrições de 55 colunas e preservação dos 23 hashes protegidos. Evidências complementares: `docs/qa/oracle.json`, `docs/qa/auditoria.md`, `docs/qa/validation_results.json`, `scripts/validation_results.json`. Os dois últimos registram os cenários incrementais já executados, sem necessidade de repetição nesta edição textual.

## Matriz requisito / implementação / comprovação

| Exigência do enunciado | Arquivos e resultado | Situação |
|---|---|---|
| Projeto dbt funcional sobre dois CSVs | `dbt_project.yml`, `profiles.yml`, `requirements-lock.txt`, `seeds/clients.csv`, `seeds/transactions.csv`; seed 2/2 | Atendido |
| Fonte problemática preservada, não limpa manualmente | Seeds conservam 27 cadastros/100 transações; oracle independente extraído do HTML; rejeitados T021/T037 permanecem na fonte | Atendido |
| Nomes/estrutura exigidos | `models/staging/stg_transactions.sql`, `stg_clients.sql`; `models/intermediate/int_transactions.sql`; `models/marts/fact_transactions.sql`, `dim_clients.sql`, `mart_client_portfolio.sql` | Atendido: seis modelos |
| Staging: snake_case, tipos, filtros | `stg_clients.sql`, `stg_transactions.sql`, macros `clean_text`, `typed_transactions`, `valid_transaction`; nome renomeado para `client_name`, DATE e DECIMAL, 25 clientes/98 transações | Atendido |
| Quantidade e valor financeiro BUY−SELL por cliente/ativo | `int_transactions.sql` calcula sinais e quantidade × preço; `mart_client_portfolio.sql` agrupa cliente/ativo; 55 posições conciliadas individualmente | Atendido; não confundir com lucro/valor de mercado |
| Testes genéricos `not_null`, `unique`, `accepted_values` | `models/schema.yml`, além de relacionamentos | Atendido |
| Singular retorna quantidade líquida negativa | `tests/assert_no_negative_position.sql`; seis linhas reais, preservadas e armazenadas na auditoria | Atendido; severity WARN explícita |
| Descrever cada modelo e coluna | `models/schema.yml`; seis modelos + duas seeds, 55 colunas descritas; catálogo gerado | Atendido |
| Execução sem ajuda a partir do README | Instalação Python 3.12/lockfile, PowerShell sem ativação, POSIX ativado, seed/run/test/docs, strict e full-refresh | Atendido documentalmente; Windows comprovado, POSIX não executado |
| Execução limpa / todos os testes passando | Exit 0 no padrão, mas seis WARN reais; strict exit 1 | Interpretação necessária, não alegar 77 PASS |
| Incremental controlado por `transaction_date` | `fact_transactions.sql`, chave ID, delete+insert e janela inclusiva de 30 dias relativa à maior data carregada | **Bônus atendido**, limites abaixo |
| Macro reutilizada em mais de um modelo | `macros/clean_text.sql` usada nos dois stagings (transações via `typed_transactions`); tipagem/validade compartilhadas com auditoria | **Bônus atendido** |
| Vídeo de até cinco minutos explicando decisões, estrutura e execução; link junto do repositório | MP4s v3 conferidos: 243 segundos, roteiro e amostras coerentes; detalhes abaixo | **Obrigatório**, não bônus; arquivo atendido, publicação do link a cargo do coordenador; fora do README por instrução do usuário |
| Repositório GitHub e envio do link ao destinatário indicado | Repositório informado: `https://github.com/Artjosh/clube-do-valor-dbt`; destinatário no enunciado: `fernando@clubedovalor.com.br` | Publicação/envio não executados nem certificados nesta revisão; envio depende do responsável |

O diagrama não aparece como exigência independente no enunciado; o catálogo gerado oferece o DAG. A extensão web não é necessária para a avaliação do núcleo e não integra o README revisado.

## Alertas, interpretação e limites reais

O enunciado combina fonte intencionalmente defeituosa, detecção de problemas e “todos passando”. A implementação mantém os defeitos detectáveis, com seis diagnósticos WARN e invariantes restantes ERROR. Essa escolha permite sucesso de processo, mas **não satisfaz uma leitura literal de zero testes não aprovados**. É uma ambiguidade de aceite exposta ao avaliador, não uma fonte limpa nem falhas escondidas.

Alertas: seis posições negativas; duas transações inválidas (T021/T037); dois payloads iguais com IDs distintos (T035/T036); dois IDs de cliente duplicados (C1/C6); uma cidade nula (C6); um cliente nulo em transação (T021). Não remover esses registros nem rebaixar novas falhas para alterar o resultado.

O incremental cobre reexecução, mesmo dia, futuro, atraso e correção dentro da janela. Não é CDC: chegada/correção fora da janela, exclusão, invalidação e data movida para fora dela exigem full-refresh; data futura pode avançar o watermark. Esses limites estão declarados no README e nas evidências funcionais anteriores. Os valores financeiros são fluxos assinados BUY−SELL, sem suporte a lucro, patrimônio ou cotação atual.

## Revisão nova das cenas v3

Leitura de `presentation/v3/scenes.json` nesta revisão: etapas 01–07 cobrem decisões, fonte, três camadas, semântica, WARN/strict, incremental e execução. A etapa 08 declara explicitamente que a página é desnecessária para os requisitos; o fechamento retorna ao núcleo local e aos comandos. Não identifiquei contradição com a implementação dbt ou os resultados comprovados. A etapa 09 descreve acesso privado: não é recertificação de autenticação por esta revisão documental.

A revisão final abaixo confere os arquivos v3 diretamente; nenhuma evidência de duração dos vídeos v1/v2 foi transferida para a v3.

### Conferências novas executadas

Verificação somente leitura com Python stdlib, exit 0: README sem termos/referências proibidos; os **23 arquivos protegidos** coincidem com `docs/qa/web_dataset.json`; SHA-256 do HTML coincide com o valor acima. Nenhum comando dbt foi repetido.

`FALA-POR-ETAPA.md` e `timing.json` v3 foram lidos integralmente após ficarem disponíveis. Verificador stdlib, exit 0: dez falas coincidem literalmente com `scenes.json`, numeração 01–10 presente, intervalos contíguos, cada áudio mais atraso de 0,5s cabe na respectiva cena, soma **243s (4min03s)**. Etapas 08 e 10 deixam claro o caráter opcional da página e a suficiência do núcleo local. Esse check comprova roteiro/timeline; o MP4 renderizado foi conferido separadamente a seguir.

## Conferência final dos MP4s v3

Em 22/10/2026, aproximadamente 21h BRT (23/10 00h UTC), executei `ffprobe -v error -show_format -show_streams -of json <arquivo>` diretamente nos dois MP4s, via subprocess stdlib. Exit 0 em ambos: **243,000s (4min03s), H.264, 1920×1080, 30 fps, 7290 frames**. A versão narrada possui um stream AAC, 48 kHz, estéreo; a versão silenciosa possui zero streams de áudio.

| Arquivo em `presentation/v3/renders/` | Bytes | SHA-256 independente |
|---|---:|---|
| `apresentacao-cdv-v3-narrada.mp4` | 11104683 | `5dd65ba01c511d4541f2fb6c800a491f75f849c6935ee5a229f1f9f88fc73e24` |
| `apresentacao-cdv-v3-sem-audio.mp4` | 5582294 | `9d7026a06d5e1843d87555dc9eb325203816d3143d88fc4f34387f0fb3bd99ef` |

Conferi visualmente a contact sheet das dez etapas em `presentation/v3/evidence/decoded/contact-sheet.jpg`: numeração, números do conjunto, semântica financeira, WARN/strict, comandos e fechamento estão coerentes e sem cortes aparentes nas amostras. Para conferir a procedência das imagens, decodifiquei diretamente do MP4 os frames em **148s, 174s e 228s** (etapas 07, 08, 10) com `ffmpeg -v error -ss <segundo> -i <mp4> -frames:v 1 -pix_fmt rgb24 -f rawvideo -` e comparei os bytes RGB com os PNGs correspondentes: três comparações idênticas, exit 0. Nenhum arquivo de mídia foi escrito ou alterado por esta QA.

Também calculei independentemente o hash do stream de vídeo de ambos com `ffmpeg -v error -i <mp4> -map 0:v:0 -c:v copy -f hash -hash sha256 -`, exit 0: ambos `fb16dc3ffe62e80f450bcc1da228bd63b0c899c6e2770e3f2cabf4636b8dba90`. Portanto, compartilham os mesmos pacotes de vídeo. Evidência complementar do Frontend, claramente separada desta QA: `presentation/v3/evidence/verification.json` registra decode integral exit 0, v2 preservada e áudio -21,7 LUFS / pico -1,5 dBFS. Não repeti o decode integral nem afirmo audição humana completa; metadados e texto não comprovam cada pronúncia da voz sintética.

**Situação final:** README restrito ao core, matriz concluída, roteiro e arquivos locais v3 conferidos. Nenhuma nova divergência funcional identificada nesta revisão. Persistem apenas o risco de interpretação do critério “todos passando”, os limites incrementais declarados e as ações externas de publicar/acompanhar o link e enviar a entrega, sob responsabilidade do coordenador/candidato. A publicação planejada v1.2.0 não foi executada ou verificada por este worker.

## Complemento do coordenador — publicação

Após a conclusão da QA, o coordenador publicou a release v1.2.0 no commit `f44eb84f632bb59d66acea8ede34ce8430634111`. Os dois MP4s e `FALA-POR-ETAPA.md` foram baixados sem autenticação e conferidos por SHA-256: todos HTTP 200 e idênticos aos arquivos locais. [Recibo](release-v1.2.0.json). Isso encerra a pendência de publicação; o e-mail ao avaliador não foi enviado.

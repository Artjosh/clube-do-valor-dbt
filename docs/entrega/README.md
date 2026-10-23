# Índice da entrega

O [README principal](../../README.md) contém apenas a reprodução e as decisões do projeto dbt/DuckDB. A [revisão dos requisitos](../qa/requirements-rereview.md) confronta o enunciado com a implementação e as evidências. A revisão v3 altera documentação e apresentação, preservando fontes, modelos e banco; não representa nova execução do pipeline.

## Núcleo técnico

| Artefato | Conteúdo |
|---|---|
| [README principal](../../README.md) | Instalação, comandos Windows/POSIX, modelagem, qualidade e limites do incremental |
| [Enunciado original](enunciado.html) | Cópia integral e inalterada, incluindo os CSVs embutidos |
| [Seeds](../../seeds/) e [modelos](../../models/) | 100 transações e 27 cadastros brutos; seis modelos em três camadas |
| [Schema](../../models/schema.yml) | Todas as 55 colunas de modelos e seeds documentadas |
| [Auditoria da fonte](../qa/auditoria.md) e [oracle](../qa/oracle.json) | Cálculo independente com Decimal; T035/T036 preservadas |
| [Validação independente](../qa/validacao.md) e [resultados](../qa/validation_results.json) | Reconciliação integral dos fatos e das posições |
| [Cenários incrementais](../../scripts/validation_results.json) | Idempotência, janela de reprocessamento e recuperação por full-refresh |
| [Reprodução anterior](../../scripts/qa/delivery_results.json) | Seed/run/test/docs em cópia isolada e banco novo; strict com falha esperada |
| [Revisão atual](../qa/requirements-rereview.md) | Requisitos, roteiro e conferência dos vídeos v3 |

Resultados comprovados anteriormente: seed 2/2, run 6/6, teste padrão **71 PASS / 6 WARN**; modo estrito **71 PASS / 6 FAIL**, código 1 esperado. São 98 fatos, 25 clientes, 55 posições e seis posições negativas. O fluxo financeiro BUY menos SELL é 215.915,00, sem interpretação de lucro ou valor de mercado. Os defeitos originais permanecem auditáveis. A ambiguidade entre detectar problemas e exigir todos os testes aprovados está explícita na revisão dos requisitos.

A QA da reprodução reutilizou o runtime existente; não certifica instalação limpa nem execução POSIX. Logs locais completos ficam em `target/`, ignorado pelo Git; os relatórios vinculados são evidências versionadas.

## Origem do enunciado

- Origem: arquivo fornecido localmente em `C:/Users/josh/Desktop/Teste Técnico_Engenheiro-Dados-CDV.html`.
- Destino incluído: `docs/entrega/enunciado.html`.
- Cópia realizada em 22/10/2026 sem conversão de encoding ou terminação de linha.
- SHA-256 da origem e da cópia: `42794781c81193e097686a75f14cebe6009d57647e4ab8161f3a87c1bcf99f33`.

Os hashes foram conferidos após a cópia e são iguais. O HTML mantém inclusive as referências externas de fonte tipográfica; elas não são necessárias para ler os requisitos ou extrair os CSVs, e o arquivo não foi editado para removê-las.

Comandos relativos a partir da raiz para conferência:

```powershell
Get-FileHash -Algorithm SHA256 docs/entrega/enunciado.html
python scripts/qa/audit_source.py docs/entrega/enunciado.html --seeds-dir seeds
```

```sh
sha256sum docs/entrega/enunciado.html
python scripts/qa/audit_source.py docs/entrega/enunciado.html --seeds-dir seeds
```

No macOS, pode-se substituir `sha256sum` por `shasum -a 256`. As referências absolutas dos relatórios históricos descrevem a execução original; novas auditorias devem apontar para a cópia relativa incluída.

## Vídeos v3 e fala por etapa

Dois MP4s sem legendas sobrepostas, com as mesmas imagens e dez etapas numeradas. Ambos têm **243 segundos (4min03s), H.264, 1920×1080, 30 fps e 7290 quadros**, abaixo do limite obrigatório de cinco minutos. A apresentação cobre decisões, estrutura e como executar o projeto.

| Arquivo | Áudio | Bytes |
|---|---|---:|
| [Vídeo narrado](https://github.com/Artjosh/clube-do-valor-dbt/releases/download/v1.2.0/apresentacao-cdv-v3-narrada.mp4) | Voz sintética pt-BR, AAC | 11.104.683 |
| [Vídeo sem áudio](https://github.com/Artjosh/clube-do-valor-dbt/releases/download/v1.2.0/apresentacao-cdv-v3-sem-audio.mp4) | Nenhum stream de áudio | 5.582.294 |
| [Fala por etapa (.md)](https://github.com/Artjosh/clube-do-valor-dbt/releases/download/v1.2.0/FALA-POR-ETAPA.md) | Texto e timecodes das etapas 01–10 | — |

Fontes locais: [fala por etapa](../../presentation/v3/FALA-POR-ETAPA.md), [instruções de edição e facecam](../../presentation/v3/README.md), [relatório técnico](../../presentation/v3/RELATORIO.md) e [metadados/hashes](../../presentation/v3/evidence/verification.json). Os MP4s ficam em `presentation/v3/renders/`, fora do Git, e são distribuídos como assets da [release v1.2.0](https://github.com/Artjosh/clube-do-valor-dbt/releases/tag/v1.2.0).

Foram verificados streams, duração, resolução, fps, decodificação integral, igualdade dos pacotes de vídeo e amostras das dez etapas. O áudio foi medido tecnicamente, sem alegação de escuta humana. O roteiro da etapa 08 declara que a página é **completamente desnecessária para cumprir os requisitos**, servindo apenas para visualizar o processo e os resultados. A avaliação do núcleo é local e não depende de conta ou serviço externo.

## Compartilhamento

O enunciado pede o link do vídeo junto do [repositório](https://github.com/Artjosh/clube-do-valor-dbt). Isso não exige inserir apresentação ou extensão web no README principal.

Antes de encaminhar, assistir à versão escolhida e revisar o [rascunho de e-mail](email-rascunho.txt), inclusive nome e assinatura. O vídeo sem áudio é uma base para gravar rosto e voz; a versão narrada utiliza voz sintética. Nenhum e-mail foi enviado nesta revisão.

Histórico preservado: [release v1.1.0 / vídeos v2 de 3min51s](https://github.com/Artjosh/clube-do-valor-dbt/releases/tag/v1.1.0), [fonte v2](../../presentation/v2/README.md) e [release v1.0.0 / vídeo inicial de 2min04s](https://github.com/Artjosh/clube-do-valor-dbt/releases/tag/v1.0.0).

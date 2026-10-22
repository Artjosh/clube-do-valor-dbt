# Revisão independente da entrega

Revisão de 22/10/2026, após leitura integral UTF-8 de `docs/entrega/enunciado.html`, incluindo requisitos e os dois arrays de dados. Núcleo dbt aprovado na reprodução isolada e dois vídeos v2 aprovados na conferência técnica independente, ambos com 231 segundos. Publicação v1.1.0 e envio são etapas do coordenador/usuário. Nenhum modelo, seed, macro, configuração, banco original, web ou presentation foi alterado nesta revisão.

## Matriz de requisitos e evidências

| Exigência do enunciado | Implementação / evidência | Resultado |
|---|---|---|
| Dois CSVs em seeds, preservando problemas intencionais | `seeds/transactions.csv`, `seeds/clients.csv`; oracle e auditoria de fonte | 100 transações/27 cadastros brutos; defeitos preservados |
| Estrutura e nomes dos seis modelos, três camadas | `models/staging/stg_transactions.sql`, `stg_clients.sql`; `intermediate/int_transactions.sql`; `marts/fact_transactions.sql`, `dim_clients.sql`, `mart_client_portfolio.sql` | 6/6 modelos executados, exit 0 |
| 1. Staging snake_case, tipagem e filtro de inválidos | `name` → `client_name`, limpeza textual, try_cast, `typed_transactions` e `valid_transaction` | 98 transações válidas, T021/T037 rejeitadas auditavelmente, 25 clientes canônicos |
| 2. Carteira BUY−SELL por cliente/ativo em quantidade e valor | `signed_quantity`, `signed_amount`; SUM no mart com GROUP BY client_id/asset_ticker | Todas as 55 posições reconciliadas ao oracle independente com Decimal |
| 3. Testes genéricos not_null, unique, accepted_values | `models/schema.yml`, incluindo relacionamentos adicionais | 71 PASS / 6 WARN; invariantes error; diagnósticos explícitos warn |
| 4. Singular obrigatório assert_no_negative_position.sql | `tests/assert_no_negative_position.sql`, filtro net_quantity < 0 | 6 linhas negativas; WARN normal, FAIL estrito |
| 5. Todos modelos e colunas documentados em schema.yml | Manifest/catalog gerados no isolamento | 6 modelos + 2 seeds, 55 colunas descritas; index/manifest/catalog presentes |
| 6. Bônus incremental controlado por transaction_date | fact incremental delete+insert, unique_key transaction_id, watermark data máxima −30 dias inclusive | Implementação inspecionada; casos funcionais já comprovados em [QA anterior](validacao.md), sem repetir suite inteira |
| 7. Bônus macro reutilizável | `macros/clean_text.sql`, `typed_transactions.sql`, `valid_transaction.sql` | Reuso entre staging e auditoria; dependências compiladas/executadas |
| 8. Vídeo obrigatório ≤5min, decisões/estrutura/como rodar, link junto ao repo | v2 narrada e silenciosa, roteiro/timecodes, ffprobe independente | 231s por arquivo, abaixo de 300s; decisões/estrutura/comandos revisados; links exatos v1.1.0 preparados, upload ainda a confirmar |
| dbt seed, run e test reproduzíveis pelo README | Comandos Windows/POSIX, profile local explícito, pins Python/dbt | Windows executado isoladamente; POSIX documentado, não executado |
| Publicar repo GitHub e enviar link a Fernando | URLs históricas na documentação; rascunho local para fernando@clubedovalor.com.br | Nenhum commit/push/envio efetuado por esta QA; publicação nova e envio dependem do coordenador/usuário |
| Diagrama solicitado nesta revisão | Mermaid no README e DAG dbt docs | Complemento documental, não exigência literal adicional do HTML |

## Reprodução executada

```powershell
.\.venv\Scripts\python.exe -B scripts/qa/delivery_check.py
```

Execução iniciada em `2026-10-22T22:34:31Z`. O script copiou exclusivamente `models`, `macros`, `seeds`, `tests`, `dbt_project.yml`, `profiles.yml`, `requirements.txt` e `requirements-lock.txt` para `target/delivery-check/20261022T223431942486/project`. Não copiou banco, .venv, node_modules, .git, site ou credenciais. Executou o dbt da venv existente com cwd nessa cópia, removendo overrides DBT herdados e desabilitando telemetria; DuckDB novo apenas na cópia.

| Comando na cópia (executável absoluto da venv) | Exit | Evidência |
|---|---:|---|
| dbt seed --profiles-dir . | 0 | 2 seeds success |
| dbt run --profiles-dir . | 0 | 6 modelos success |
| dbt test --profiles-dir . | 0 | 71 PASS, 6 WARN, nenhum ERROR |
| dbt docs generate --profiles-dir . | 0 | index.html, manifest.json e catalog.json gerados |
| dbt --warn-error test --profiles-dir . | 1 esperado | 71 PASS, 6 FAIL: os seis diagnósticos conhecidos |

Resultado durável: [scripts/qa/delivery_results.json](../../scripts/qa/delivery_results.json). Logs e run_results completos por comando ficam no diretório da execução sob target/delivery-check, ignorado pelo Git. Não houve reinstalação limpa de dependências nesta fase; a evidência valida ambiente/projeto/banco isolados usando o runtime já disponível. Não foram executados typecheck ou linter.

Auditoria stdlib adicional `python scripts/qa/audit_source.py docs/entrega/enunciado.html --seeds-dir seeds`: exit 0, sementes conferidas sem sobrescrita. SHA-256 do enunciado confirmado: `42794781c81193e097686a75f14cebe6009d57647e4ab8161f3a87c1bcf99f33`. Checagem dos links relativos no README, índice e nesta matriz: nenhum destino local ausente.

## Regras e interpretação

Para cada cliente/ativo, quantidade líquida = Σ quantidade BUY − Σ quantidade SELL; financeiro líquido = Σ(quantity × unit_price) BUY − Σ(quantity × unit_price) SELL. Valores financeiros foram comparados com Decimal, não float. As seis posições negativas permanecem: C1/BBDC4 −50, C3/WEGE3 −30, C5/BBDC4 −400, C6/ITUB4 −50, C7/WEGE3 −60 e C8/VALE3 −30. Financeiro total 215.915,00; quantidade 10.900 é checksum entre ativos, não uma unidade econômica agregável. Não se trata de lucro, caixa ou marcação a mercado.

T035/T036 mantêm IDs distintos apesar do mesmo payload; a suspeita gera alerta, não remoção. Clientes C1/C6 são canonizados deterministicamente sem editar seeds. O teste singular usa quantidade negativa, exatamente a interpretação de posição do modelo, e não trata financeiro negativo isoladamente como posição vendida.

O HTML pede simultaneamente execução sem erro e detecção de defeitos. A solução torna explícita essa ambiguidade: seis diagnósticos warn com linhas persistidas, invariantes error e modo strict fail. Exit 0 normal não é alegação de dados sem defeitos. A nova execução confirmou exatamente essa distinção, sem suprimir warnings.

O incremental usa chave de negócio transaction_id e controle temporal transaction_date; esses conceitos não são confundidos. A janela inclusiva de 30 dias cobre mesmo dia, idempotência, chegada atrasada/correção dentro da janela. Eventos antigos fora da janela, exclusões, invalidações e mudanças de data para fora dela requerem full-refresh; a fonte não dispõe de CDC/updated_at. Essas limitações e comandos de reconstrução constam no README e têm evidência funcional anterior, que não foi sobrescrita.

## Alterações documentais e limites

README reorganizado para avaliação dbt primeiro; site/Supabase são extensão opcional. Adicionados DAG Mermaid, fórmulas explícitas, comando de docs serve PowerShell sem ativação, referência à evidência desta reprodução e aviso de que reextração reescreve seeds. Os materiais de vídeo v1 foram identificados como históricos até confirmação dos novos arquivos; o rascunho de email continua sem envio.

Roteiro v2 (`presentation/v2/scenes.json`) lido em somente leitura: cobre origem preservada, decisões, três camadas, BUY−SELL, WARN/strict, incremental, macros, comandos e extensão web com limite explícito de validação do email. Sem inconsistência factual bloqueadora identificada. Configuração Brevo aplicada foi informada pelo coordenador; não equivale a entrega SMTP/jornada real validada. A inspeção de roteiro não certifica duração, legibilidade ou áudio do render final.

Atualização do coordenador às22:41Z: SMTP e dois templates relidos sem diferenças; login habilitado com AUTH_ENABLED=true/env revision 4, deploy appgdep_6ada9064f1bc8191b60c95ab16a9b248, formulário confirmado no Brave externo. Backend valida separadamente autorização hospedada sem email; recebimento real ainda depende de endereço autorizado. A revisão do core não executou essas operações nem reescreveu evidências históricas da versão com auth desabilitado.

## Vídeos finais

`python -B scripts/qa/delivery_video_check.py`: exit 0, ambos os arquivos passaram. Resultado e hashes independentes em [delivery_video_results.json](../../scripts/qa/delivery_video_results.json). Cada MP4 tem 231s (3min51s), H.264, 1920×1080 e 30 fps; a versão narrada tem áudio AAC e a silenciosa não contém stream de áudio. Nomes exatos: `presentation/v2/renders/apresentacao-cdv-v2-narrada.mp4` e `presentation/v2/renders/apresentacao-cdv-v2-sem-audio.mp4`.

Evidência Frontend `presentation/v2/evidence/verification.json` revisada: decodeExit 0 em ambos, pacotes de vídeo idênticos e v1 preservada. Quadros decodificados de 54s (camadas) e 149s (comandos) foram inspecionados visualmente: conteúdo legível, comandos corretos com `--profiles-dir .`, espaço inferior direito livre. Roteiro final cobre decisões, estrutura e execução; não foi realizada escuta humana integral. O pequeno problema de pontuação do roteiro escrito não afetava o comando mostrado no MP4.

URLs exatas para release v1.1.0 constam no índice e rascunho de email, identificadas como preparadas para upload pelo coordenador; esta QA não declarou publicação concluída. Primeiro recebimento de email foi posteriormente confirmado pelo coordenador às22:50Z; ajustes OTP6/HTML seguem em tarefa Backend separada, sem interferência desta revisão.

Hashes dos 23 arquivos protegidos (incluindo banco original) coincidem com o baseline antes e depois. Nenhum defeito funcional novo foi encontrado no núcleo. Links externos e instalação POSIX não foram revalidados nesta missão. Restam confirmação de publicação/acesso dos assets, revisão humana da apresentação e envio autorizado pelo usuário.

## Integração pelo coordenador

Os dois MP4s foram enviados ao rascunho da release v1.1.0; tamanhos e SHA-256 retornados pelo GitHub coincidem com a verificação independente. A publicação é coordenada com o commit final da entrega. OTP6 e HTML responsivo foram publicados na versão 5 do Site, revisão de ambiente 5, conforme [proveniência e validação atual](../web-publication.md). Essa atualização não altera os resultados históricos do core ou a autoria dos testes acima.

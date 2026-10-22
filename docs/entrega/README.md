# Índice da entrega

O núcleo dbt/DuckDB, a revisão independente e o vídeo explicativo estão concluídos. A entrega reúne o [repositório](https://github.com/Artjosh/clube-do-valor-dbt) e o vídeo na release v1.0.0. O envio ao destinatário depende do usuário.

## Artefatos concluídos

| Artefato | Conteúdo |
|---|---|
| [README principal](../../README.md) | Reprodução Windows/POSIX, regras, qualidade e limites do incremental |
| [Enunciado original](enunciado.html) | Cópia integral e inalterada, incluindo os CSVs embutidos |
| [Seeds](../../seeds/) e [modelos](../../models/) | 100 transações e 27 cadastros brutos; seis modelos em três camadas |
| [Schema](../../models/schema.yml) | Todas as 55 colunas de modelos e seeds documentadas |
| [Auditoria da fonte](../qa/auditoria.md) e [oracle](../qa/oracle.json) | Cálculo independente com Decimal, preservando T035/T036 |
| [Validação independente](../qa/validacao.md) e [evidência estruturada](../qa/validation_results.json) | Reprodução isolada e reconciliação integral de fatos e posições |
| [Evidência funcional de Dados](../../scripts/validation_results.json) | 17 verificações, incluindo idempotência e recuperação por full-refresh |
| [Apresentação](../../presentation/README.md), [roteiro](../../presentation/ROTEIRO.md) e [relatório final](../../presentation/ENTREGA.md) | Vídeo concluído, fonte editável, reprodução e evidências técnicas |

Resultados executados: seed 2/2, run 6/6, teste padrão 71 PASS e 6 WARN; teste estrito 71 PASS e 6 FAIL, código 1 esperado. Baseline: 98 fatos, 25 clientes, 55 posições, seis negativas. O financeiro líquido BUY menos SELL é 215.915,00, sem interpretação de lucro ou valor de mercado. A quantidade agregada 10.900 é apenas checksum entre ativos distintos.

Os logs e artefatos completos das execuções locais ficam em `target/evidence/` e `target/qa/`, ignorados pelo Git. Os relatórios e JSONs ligados acima são evidências duráveis incluídas no projeto. A instalação de dependências foi executada na fase de Dados; QA reutilizou esse runtime e validou os pins, sem alegar reinstalação limpa. POSIX está documentado, mas não foi executado nesta máquina.

## Origem do enunciado

- Origem: arquivo fornecido localmente em `C:/Users/josh/Desktop/Teste Técnico_Engenheiro-Dados-CDV.html`.
- Destino incluído: `docs/entrega/enunciado.html`.
- Cópia realizada em 22/10/2026 sem conversão de encoding ou terminação de linha.
- SHA-256 da origem e da cópia: `42794781c81193e097686a75f14cebe6009d57647e4ab8161f3a87c1bcf99f33`.

Os hashes foram conferidos após a cópia e são iguais. O HTML mantém inclusive as referências externas de fonte tipográfica; elas não são necessárias para ler os requisitos ou extrair os CSVs, e o arquivo não foi editado para removê-las.

Comandos relativos a partir da raiz, para conferência futura (não reexecutados nesta fase documental):

```powershell
Get-FileHash -Algorithm SHA256 docs/entrega/enunciado.html
python scripts/qa/audit_source.py docs/entrega/enunciado.html --seeds-dir seeds
```

```sh
sha256sum docs/entrega/enunciado.html
python scripts/qa/audit_source.py docs/entrega/enunciado.html --seeds-dir seeds
```

No macOS, pode-se substituir `sha256sum` por `shasum -a 256`. As referências absolutas dos relatórios históricos descrevem a execução original; novas auditorias devem apontar para a cópia relativa incluída.

## Apresentação e passos externos

O vídeo local está em `presentation/renders/apresentacao-cdv.mp4`: **124 segundos (2min04s), 1920×1080, 30 fps e 6.178.878 bytes**, comprovados pelo ffprobe e registrados no [relatório de entrega](../../presentation/ENTREGA.md). A duração está abaixo dos cinco minutos exigidos. A narração usa voz sintética local em português, sem imitar o candidato; houve verificação técnica e visual, mas não escuta humana certificada.

Links da entrega:

- [Repositório](https://github.com/Artjosh/clube-do-valor-dbt).
- [Release v1.0.0](https://github.com/Artjosh/clube-do-valor-dbt/releases/tag/v1.0.0).
- [Download do vídeo MP4](https://github.com/Artjosh/clube-do-valor-dbt/releases/download/v1.0.0/apresentacao-cdv.mp4).

O MP4 é distribuído como asset da release, separado do código versionado.

1. Assistir ao vídeo antes do envio e revisar conteúdo, pronúncia e ritmo da voz sintética.
2. Usar os links do repositório e da release acima para compartilhar código e vídeo.
3. Revisar o [rascunho de e-mail](email-rascunho.txt), que já contém os links finais, e substituir os placeholders de nome, assinatura e contato.
4. Enviar somente após autorização do usuário. O rascunho local não representa mensagem enviada; esta edição documental não publica conteúdo nem envia e-mail.

Frontend, Supabase e autenticação não fazem parte da entrega implementada. A preferência para eventual extensão web futura está registrada no README principal e não é critério de aceite do pipeline atual.

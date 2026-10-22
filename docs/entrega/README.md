# Índice da entrega

O núcleo dbt/DuckDB foi reproduzido em banco novo e projeto isolado nesta revisão. Comece pelo [README principal](../../README.md): a avaliação não depende do site, Supabase ou credenciais. A [matriz de requisitos](../qa/delivery-review.md) registra o aceite e os limites. Os dois vídeos v2 estão concluídos e validados localmente, com 231s cada; arquivos vinculados à release v1.1.0. A v1.0.0 permanece histórica. O envio depende do usuário.

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
| [Revisão da entrega](../qa/delivery-review.md) e [reprodução atual](../../scripts/qa/delivery_results.json) | Matriz do enunciado, seed/run/test/docs em cópia isolada, strict com falha esperada e hashes preservados |
| [Apresentação v2](../../presentation/v2/README.md), [roteiro](../../presentation/v2/ROTEIRO.md) e [QA independente dos MP4s](../../scripts/qa/delivery_video_results.json) | Duas versões de 231s, fonte editável e metadados/hash conferidos; v1 preservada |

Resultados executados: seed 2/2, run 6/6, teste padrão 71 PASS e 6 WARN; teste estrito 71 PASS e 6 FAIL, código 1 esperado. Baseline: 98 fatos, 25 clientes, 55 posições, seis negativas. O financeiro líquido BUY menos SELL é 215.915,00, sem interpretação de lucro ou valor de mercado. A quantidade agregada 10.900 é apenas checksum entre ativos distintos.

Os logs e artefatos completos das execuções locais ficam em `target/evidence/` e `target/qa/`, ignorados pelo Git. Os relatórios e JSONs ligados acima são evidências duráveis incluídas no projeto. A instalação de dependências foi executada na fase de Dados; QA reutilizou esse runtime e validou os pins, sem alegar reinstalação limpa. POSIX está documentado, mas não foi executado nesta máquina.

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

## Apresentação e passos externos

**Versão 2 validada:** ambos os MP4s têm **231 segundos (3min51s), H.264, 1920×1080 e 30 fps**, conferidos independentemente com ffprobe. O roteiro explica decisões, estrutura e como rodar. A narrada é a apresentação explicativa; a silenciosa é alternativa para gravação pessoal, não outro vídeo obrigatório. A sequência visual é idêntica conforme hashes de pacotes verificados pelo Frontend; a QA independente confirmou duração, resolução, fps, streams e hashes dos arquivos.

| Arquivo local | Áudio | Tamanho |
|---|---|---:|
| `presentation/v2/renders/apresentacao-cdv-v2-narrada.mp4` | AAC, voz sintética pt-BR Kokoro pf_dora | 11.622.435 bytes |
| `presentation/v2/renders/apresentacao-cdv-v2-sem-audio.mp4` | Nenhum stream de áudio | 6.371.871 bytes |

Links dos arquivos finais da release v1.1.0:

- [Release v1.1.0](https://github.com/Artjosh/clube-do-valor-dbt/releases/tag/v1.1.0).
- [Vídeo v2 narrado](https://github.com/Artjosh/clube-do-valor-dbt/releases/download/v1.1.0/apresentacao-cdv-v2-narrada.mp4).
- [Vídeo v2 sem áudio](https://github.com/Artjosh/clube-do-valor-dbt/releases/download/v1.1.0/apresentacao-cdv-v2-sem-audio.mp4).
- [Roteiro/timecodes v2](../../presentation/v2/ROTEIRO.md) e [instruções para rosto/voz](../../presentation/v2/README.md).

Os arquivos locais não foram editados por QA. Evidência independente: `python scripts/qa/delivery_video_check.py`, exit 0, [resultado estruturado](../../scripts/qa/delivery_video_results.json). Não houve escuta humana certificada. A referência a seguir é histórica.

O vídeo local está em `presentation/renders/apresentacao-cdv.mp4`: **124 segundos (2min04s), 1920×1080, 30 fps e 6.178.878 bytes**, comprovados pelo ffprobe e registrados no [relatório de entrega](../../presentation/ENTREGA.md). A duração está abaixo dos cinco minutos exigidos. A narração usa voz sintética local em português, sem imitar o candidato; houve verificação técnica e visual, mas não escuta humana certificada.

Links da entrega:

- [Repositório](https://github.com/Artjosh/clube-do-valor-dbt).
- [Dashboard Copper / Silver / Gold](https://clube-do-valor-intelligence.artjosh.chatgpt.site) — extensão opcional; entrada por OTP e dados restritos à role de analista, concedida por contrassenha. Brevo/templates configurados, login habilitado e primeiro recebimento de e-mail confirmados pelo coordenador; OTP6 e templates HTML responsivos publicados na versão 5; jornada entre aparelhos em validação. Não exigir esse acesso para avaliar o núcleo nem tratar esta revisão como certificação da jornada final de e-mail.
- [Release v1.0.0](https://github.com/Artjosh/clube-do-valor-dbt/releases/tag/v1.0.0).
- [Download do vídeo MP4](https://github.com/Artjosh/clube-do-valor-dbt/releases/download/v1.0.0/apresentacao-cdv.mp4).

O MP4 é distribuído como asset da release, separado do código versionado.

1. Assistir ao vídeo antes do envio e revisar conteúdo, pronúncia e ritmo da voz sintética.
2. Usar os links do repositório e da release acima para compartilhar código e vídeo.
3. Confirmar publicação e acesso aos links v1.1.0; revisar o [rascunho de e-mail](email-rascunho.txt), nome, assinatura e contato. Duração e arquivos locais já foram conferidos.
4. Enviar somente após autorização do usuário. O rascunho local não representa mensagem enviada; esta edição documental não publica conteúdo nem envia e-mail.

Uma extensão web foi implementada após a release v1.0.0: [dashboard Vinext](../../web/README.md), [arquitetura](../web-architecture.md) e [autenticação Supabase/PostgreSQL](../web-auth.md). Copper, Silver e Gold são níveis de análise sem cobrança. O pipeline e os dados originais foram preservados. O usuário determinou entrada aberta com OTP e dados privados: primeiro login sem acesso, role de analista somente via contrassenha. Consulte o [guia Brevo](../brevo-activation.md) para configuração e validação pendente; esta revisão não enviou e-mail. O vídeo v1.0.0 explica o pipeline e não apresenta a extensão posterior.

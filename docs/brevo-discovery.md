# Descoberta Brevo — 22/10/2026

**Credencial SMTP existente identificada e validada sem enviar e-mail.** O relay aceitou autenticação após STARTTLS, com resposta SMTP **235**, em `smtp-relay.brevo.com:587`. A API oficial confirmou remetente presente e ativo. Não foi necessário consultar Vercel/Railway nem criar uma chave.

## Proveniência e campos

Leitura autorizada, sem alterações nos projetos de origem:

| Origem local | Campos presentes | Uso |
|---|---|---|
| `C:/Users/josh/Desktop/Nicolas/cecchin-pizzas-backend/.env` | `SMTP_USER`, `SMTP_PASS`, `SMTP_REMETENTE` | Configuração SMTP recuperada |
| `C:/Users/josh/Desktop/Nicolas/cecchin-pizzas/.env` | `BREVO_API_KEY`, `BREVO_REMETENTE` | API key usada somente em memória para consultas GET; não copiada para o artefato |

A descoberta inicial inspecionou nomes/presença de campos nos arquivos `.env`, `.env.local` e exemplos disponíveis; nenhum valor foi impresso. A senha SMTP foi autenticada como SMTP, não inferida a partir da existência de uma chave API.

## Evidências sanitizadas

| Verificação | Resultado observado |
|---|---|
| GET oficial `/v3/account` | HTTP 200; relay habilitado; login do relay coincide com `SMTP_USER` local |
| GET oficial `/v3/senders` | HTTP 200; endereço `SMTP_REMETENTE` encontrado, `active:true` |
| GET oficial `/v3/senders/domains` | HTTP 200; domínio do remetente não encontrado na lista retornada |
| Conexão SMTP | Host `smtp-relay.brevo.com`, porta 587 |
| TLS | STARTTLS estabelecido com validação de certificado pelo contexto TLS padrão |
| Autenticação | AUTH aceito, código 235 |
| Envio | **Nenhum**; não foram executados MAIL FROM, RCPT TO ou DATA |
| Supabase / variáveis remotas | Nenhuma alteração nesta tarefa |
| Projetos Nicolas / sessões Claude | Nenhuma alteração ou controle de sessão |

`active:true` confirma o estado autorizado do remetente registrado. Isso não prova autenticação do domínio: a lista não trouxe o domínio correspondente. Tampouco comprova entrega, reputação, caixa de entrada ou limites efetivos de envio; esses pontos permanecem para a ativação e teste autorizados pelo coordenador.

## Artefato local protegido

A configuração mínima está em `web/.sites-runtime/brevo-recovered.json`, confirmado como ignorado pelo Git. ACL com herança desativada, proprietário igual ao usuário atual e uma única regra Allow/FullControl para esse usuário; nenhum grupo compartilhado recebeu acesso pelo arquivo.

Campos disponíveis:

- `smtp.host`, `smtp.port`, `smtp.user`, `smtp.password`, `smtp.senderEmail`, `smtp.senderName`;
- `provenance`, `observedAt` e `verification` com os resultados sanitizados acima.

O nome sugerido do remetente identifica o projeto técnico, sem alegar comunicação oficial da empresa. Os valores de login, senha e endereço só estão no arquivo protegido, não neste relatório ou nas mensagens de coordenação. A chave da API não foi persistida. Não versionar o arquivo nem imprimir seu conteúdo.

## Próxima etapa, sob responsabilidade do coordenador

Reutilizar os campos SMTP recuperados na configuração do Supabase dedicado, revisar o remetente/nome e aplicar os templates conforme [brevo-activation.md](brevo-activation.md). Esta tarefa não configurou Supabase, não ativou auth e não enviou OTP. Após transferir a configuração para o armazenamento seguro e concluir a validação autorizada, remover o artefato temporário protegido; a remoção ainda não foi feita porque ele é a entrega para o coordenador.

Nenhum typecheck, linter, migration, commit ou deploy foi executado.

## Referências oficiais consultadas

- [Brevo: integração SMTP com Supabase](https://developers.brevo.com/docs/supabase-smtp-integration) — distinção entre chave SMTP e API, relay e porta.
- [Brevo: consultar conta](https://developers.brevo.com/reference/get-account) — consulta somente leitura das informações do relay.
- [Brevo: consultar remetentes](https://developers.brevo.com/reference/get-senders) — endereço e estado ativo/autorizado.
- [Brevo: consultar domínios](https://developers.brevo.com/reference/get-domains) — estados de verificação/autenticação de domínio.

# Entrega real de e-mail e confirmação entre aparelhos

Registro de 22/10/2026, projeto dedicado `igucxanapndewkbtarfn` e Site versão 5, revisão de ambiente 5.

- O destinatário foi informado expressamente pelo usuário para testes; seu endereço e os códigos não são incluídos neste relatório.
- O primeiro envio, pelo formulário público no Brave externo, foi aceito. O usuário confirmou recebimento e pediu OTP de seis dígitos e apresentação HTML.
- O ajuste definiu `otp_length=6` no Supabase e `AUTH_OTP_LENGTH=6` no runtime. O recibo do segundo push confirmou três propriedades atualizadas: tamanho do OTP e conteúdo dos templates `confirmation` e `magic_link`. A senha SMTP permaneceu inalterada; seis configurações remotas não declaradas foram preservadas.
- O build e a publicação da versão 5 concluíram; nove verificações focadas confirmaram configuração ativa e bloqueio anônimo, conforme [resultado](web_otp6_deployment.json).
- O convite real foi aceito pela interface. Um segundo e-mail foi solicitado, agora com o HTML responsivo e OTP de seis dígitos; a interface entrou em espera por confirmação. O usuário recebeu instruções para abrir o botão no celular e confirmar o código visual do PC. Essa solicitação usa o fluxo real, sem mocks ou credenciais administrativas.

**Estado nesta atualização:** recebimento do primeiro e-mail confirmado; novo HTML/OTP6 aplicado e segundo envio aceito; a segunda solicitação expirou sem confirmação no celular, conforme a interface do PC. Não houve reenvio automático. A confirmação física exige nova solicitação quando o usuário estiver disponível. Não afirmar que a sessão final ou a concessão ao usuário foram concluídas antes dessa confirmação. Os desafios expiram em cinco minutos; uma solicitação expirada exige iniciar novamente pela interface.

O código visual de oito dígitos do PC é separado do OTP de seis dígitos do e-mail. O GET do link não consome a verificação: a página do celular exige aprovação explícita, e somente o PC que originou o desafio recebe a sessão por polling. A prova automatizada anterior desse protocolo e da autorização está em [web-auth.md](../web-auth.md) e [hosted-auth.md](hosted-auth.md); ela não substitui o teste físico pendente.

Nenhum e-mail foi enviado ao recrutador ou a terceiros não autorizados. Nenhuma chave nova foi criada, nenhum projeto Cecchin foi modificado e nenhum upgrade pago foi contratado.

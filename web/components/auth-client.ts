const messages:Record<string,string>={
 auth_not_configured:'O serviço de autenticação não está habilitado neste ambiente.',
 auth_unavailable:'O serviço de autenticação está indisponível. Tente novamente mais tarde.',
 rate_limited:'Muitas tentativas em pouco tempo. Aguarde antes de tentar novamente.',
 invalid_email:'Informe um endereço de e-mail válido.',
 invalid_email_link:'O código ou link do e-mail é inválido, expirou ou já foi utilizado. Solicite um novo.',
 challenge_expired:'Esta solicitação expirou. Inicie uma nova no computador.',
 confirmation_expired:'A confirmação expirou. Abra um novo link enviado ao seu e-mail.',
 challenge_expired_or_invalid_code:'O código não confere ou a solicitação expirou. Confira a tela do computador.',
 invalid_display_code:'Digite os oito dígitos exibidos no computador.',
 invalid_device:'Este navegador não está vinculado à solicitação. Inicie novamente nesta aba.',
 email_mismatch:'O e-mail confirmado não corresponde à solicitação. Inicie novamente.',
 invalid_origin:'Abra o endereço oficial do dashboard para continuar.',
 trusted_proxy_required:'A autenticação não está disponível nesta instalação.',
 permission_denied:'Sua conta ainda não tem acesso aos dados.',
 analytics_access_required:'Sua conta ainda não tem acesso aos dados.',
 invalid_invite_format:'Confira a contrassenha recebida e cole o código completo.',
 invalid_invite:'A contrassenha é inválida, expirou ou foi revogada. Solicite um convite válido.',
 invite_required:'Valide a contrassenha novamente antes de informar seu e-mail.',
 invalid_otp_format:'Digite todos os dígitos do código recebido por e-mail.',
 invalid_otp:'O código do e-mail é inválido ou expirou. Confira o código mais recente.',
};

export class AuthRequestError extends Error{
 constructor(message:string,public status:number,public code:string,public retryAfter:number){super(message)}
}
export async function authRequest(path:string,body?:unknown){
 const response=await fetch(path,{method:body===undefined?'GET':'POST',cache:'no-store',credentials:'same-origin',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 let result;
 try{result=await response.json()}catch{throw new Error('O serviço retornou uma resposta inválida. Tente novamente.')}
 // Session availability is explicit state even when the service answers 503.
 if(path==='/api/auth/session'&&response.status===503&&result.configured===false&&result.authenticated===false&&result.authorized===false)return result;
 if(!response.ok){const code=typeof result.error==='string'?result.error:result.error?.code||result.reason||'';throw new AuthRequestError(messages[code]||'Não foi possível concluir. Confira os dados ou tente novamente.',response.status,code,Number(response.headers.get('Retry-After'))||0)}
 return result;
}

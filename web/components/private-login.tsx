"use client";
import {FormEvent,useEffect,useRef,useState} from 'react';
import {ArrowRight,Clock3,KeyRound,Mail,ShieldCheck,Smartphone,TriangleAlert} from 'lucide-react';
import {AuthShell} from './auth-shell';
import {authRequest,AuthRequestError} from './auth-client';

type Session={configured:boolean;authenticated:boolean;authorized:boolean;permissions?:string[];user?:{email:string}};
type Challenge={challengeId:string;displayCode:string;expiresAt:string;pollInterval:number;otpLength:number};

export function DeviceLogin(){
 const [session,setSession]=useState<Session|null>(null);
 const [mode,setMode]=useState<'login'|'invite'>('login');
 const [inviteAccepted,setInviteAccepted]=useState(false),[inviteExpires,setInviteExpires]=useState(0),[inviteCode,setInviteCode]=useState('');
 const [email,setEmail]=useState(''),[otp,setOtp]=useState('');
 const [challenge,setChallenge]=useState<Challenge|null>(null);
 const [status,setStatus]=useState<'pending'|'expired'|'error'>('pending');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[remaining,setRemaining]=useState(0),[cooldown,setCooldown]=useState(0);
 const completed=useRef(false);
 function fail(e:unknown){setError(e instanceof Error?e.message:'Não foi possível continuar. Tente novamente.');if(e instanceof AuthRequestError&&e.retryAfter)setCooldown(e.retryAfter)}
 async function availability(){setError('');try{const value=await authRequest('/api/auth/session');setSession(value)}catch(e){fail(e)}}
 function finish(value:Session){if(completed.current)return;completed.current=true;setChallenge(null);setOtp('');setInviteCode('');window.location.replace(value.authorized?'/':'/acesso-negado')}
 useEffect(()=>{let alive=true;const params=new URLSearchParams(window.location.search);const invite=params.get('mode')==='invite';if(invite)setMode('invite');if(params.get('error')==='auth_unavailable')setError('Não foi possível verificar o acesso. Tente novamente quando o serviço estiver disponível.');authRequest('/api/auth/session').then(value=>{if(!alive)return;setSession(value);if(value.authenticated&&!invite)finish(value)}).catch(e=>{if(alive)fail(e)});return()=>{alive=false}},[]);
 useEffect(()=>{if(cooldown<=0)return;const timer=setTimeout(()=>setCooldown(v=>Math.max(0,v-1)),1000);return()=>clearTimeout(timer)},[cooldown]);
 useEffect(()=>{
  if(!challenge)return;
  let alive=true;let timer:ReturnType<typeof setTimeout>;
  const expires=Date.parse(challenge.expiresAt);
  const tick=()=>{const seconds=Math.max(0,Math.ceil((expires-Date.now())/1000));setRemaining(seconds);if(seconds===0){setStatus('expired');clearTimeout(timer)}};
  tick();const clock=setInterval(tick,1000);
  async function poll(){
   if(!alive||completed.current||Date.now()>=expires)return;
   try{const result=await authRequest('/api/auth/device/poll?challengeId='+encodeURIComponent(challenge!.challengeId));if(!alive||completed.current)return;
    if(result.status==='approved'){const current=await authRequest('/api/auth/session');if(alive){if(!current.authenticated)throw new Error('Não foi possível confirmar a sessão. Entre novamente.');finish(current)}return}
    if(result.status==='expired'){setStatus('expired');return}
    timer=setTimeout(poll,Math.max(3,challenge!.pollInterval||3)*1000);
   }catch(e){if(alive&&!completed.current){fail(e);setStatus('error')}}
  }
  timer=setTimeout(poll,Math.max(3,challenge.pollInterval||3)*1000);
  return()=>{alive=false;clearInterval(clock);clearTimeout(timer)};
 },[challenge]);
 function changeMode(next:'login'|'invite'){setMode(next);setChallenge(null);setInviteAccepted(false);setInviteCode('');setOtp('');setError('');setStatus('pending');window.history.replaceState({},'',next==='invite'?'/login?mode=invite':'/login')}
 async function claim(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const result=await authRequest('/api/auth/invite/claim',{code:inviteCode.trim()});if(result.accepted!==true)throw new Error('Não foi possível validar a contrassenha.');setInviteAccepted(true);setInviteExpires(Date.parse(result.expiresAt));setInviteCode('');setEmail('')}catch(e){fail(e)}finally{setBusy(false)}}
 async function start(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  if(mode==='invite'&&(!inviteAccepted||!Number.isFinite(inviteExpires)||Date.now()>=inviteExpires)){setInviteAccepted(false);throw new Error('A validação da contrassenha expirou. Informe o código novamente.')}
  const value=await authRequest('/api/auth/device/start',{email:email.trim(),useInvite:mode==='invite'});
  if(value.otpLength!==6)throw new Error('O serviço retornou um formato de código inesperado. Tente novamente.');
  setChallenge(value);setOtp('');setStatus('pending');setCooldown(60);
 }catch(e){fail(e)}finally{setBusy(false)}}
 async function verify(e:FormEvent){e.preventDefault();if(!challenge)return;setBusy(true);setError('');try{const value=await authRequest('/api/auth/device/verify',{challengeId:challenge.challengeId,code:otp});if(value.authenticated!==true)throw new Error('Não foi possível confirmar a sessão.');finish(value)}catch(e){if(!completed.current)fail(e)}finally{setBusy(false)}}
 const enabled=!!session?.configured&&!busy;
 const activeChallenge=challenge&&status==='pending';
 return <AuthShell><div className="auth-icon"><ShieldCheck size={26}/></div><span className="eyebrow">ACESSO PRIVADO</span><h2>{challenge?'Confira seu e-mail':mode==='invite'?'Entre por contrassenha':'Entre com seu e-mail'}</h2><p className="auth-description">{challenge?'Digite o código recebido por e-mail nesta aba ou abra o link no celular para aprovar este computador.':mode==='invite'?'A contrassenha é um convite de acesso. Após validar o convite, confirme seu e-mail para liberar a análise.':'Sem senha. No primeiro login, sua conta é criada automaticamente, ainda sem acesso aos dados.'}</p>
 {error&&<div role="alert" className="auth-error"><TriangleAlert size={18}/><span>{error}</span></div>}
 {session&&!session.configured?<div className="auth-unavailable"><strong>Autenticação indisponível neste ambiente</strong><p>O serviço de e-mail ainda não está habilitado. Nenhum envio ou acesso será simulado. Os dados continuam privados.</p><button className="secondary-button" onClick={availability}>Verificar disponibilidade</button></div>:<>
 {!challenge&&<div className="auth-methods" aria-label="Método de entrada"><button aria-pressed={mode==='login'} disabled={busy} onClick={()=>changeMode('login')}><Mail size={16}/>Login</button><button aria-pressed={mode==='invite'} disabled={busy} onClick={()=>changeMode('invite')}><KeyRound size={16}/>Contrassenha</button></div>}
 {challenge?<>
 <form className="auth-form" onSubmit={verify}><p className="confirmation-email">Solicitação para <strong>{email}</strong></p><label htmlFor="email-otp">Código recebido por e-mail</label><input id="email-otp" className="code-input" inputMode="numeric" autoComplete="one-time-code" required pattern={`[0-9]{${challenge.otpLength}}`} maxLength={challenge.otpLength} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} placeholder={`${challenge.otpLength} dígitos`} disabled={!activeChallenge||busy}/><button className="primary-button" disabled={!activeChallenge||busy||otp.length!==challenge.otpLength}>{busy?'Verificando…':'Confirmar código do e-mail'}<ArrowRight size={16}/></button></form>
 <details className="phone-alternative"><summary><Smartphone size={17}/>Prefere confirmar pelo celular?</summary><p>Abra o link do e-mail no celular. Compare a solicitação e digite lá os oito dígitos abaixo. Este é o código do computador, diferente do código recebido por e-mail.</p><span className="eyebrow">CÓDIGO DESTE COMPUTADOR</span><output className="device-code" aria-label="Código deste computador">{challenge.displayCode}</output><p>Confirme apenas uma solicitação iniciada por você.</p></details>
 <div className="challenge-status" role="status"><Clock3 size={15}/>{status==='expired'?'Solicitação expirada':status==='error'?'Verificação interrompida':`Aguardando confirmação · ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</div>
 <button className="text-button auth-restart" disabled={busy||cooldown>0} onClick={()=>{setChallenge(null);setOtp('');setError('');setStatus('pending')}}>{cooldown>0?`Nova solicitação em ${cooldown}s`:'Trocar e-mail ou solicitar novo código'}</button>
 </>:mode==='invite'&&!inviteAccepted?<form className="auth-form" onSubmit={claim}><label htmlFor="invite-code">Contrassenha de acesso</label><div className="auth-input"><KeyRound size={18}/><input id="invite-code" type="password" autoComplete="off" spellCheck={false} required maxLength={128} value={inviteCode} onChange={e=>setInviteCode(e.target.value)} disabled={!enabled} placeholder="Código do convite"/></div><button className="primary-button" disabled={!enabled||!inviteCode.trim()||cooldown>0}>{busy?'Validando…':cooldown>0?`Aguarde ${cooldown}s`:'Validar contrassenha'}<ArrowRight size={16}/></button><p>Seu e-mail será solicitado somente após a validação.</p></form>:<form className="auth-form" onSubmit={start}>{inviteAccepted&&<p className="invite-accepted"><ShieldCheck size={16}/>Convite validado. Confirme seu e-mail para concluir.</p>}<label htmlFor="auth-email">Seu e-mail</label><div className="auth-input"><Mail size={18}/><input id="auth-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={!enabled} placeholder="voce@exemplo.com"/></div><button className="primary-button" disabled={!enabled||cooldown>0}>{busy?'Enviando solicitação…':!session?(error?'Serviço indisponível':'Verificando disponibilidade…'):cooldown>0?`Aguarde ${cooldown}s`:'Enviar código por e-mail'}<ArrowRight size={16}/></button><p>{mode==='invite'?'O convite só concede permissão depois que você verifica o e-mail.':'Entrar confirma sua identidade. A liberação dos dados depende de uma permissão de acesso.'}</p></form>}
 {!session&&error&&<button className="secondary-button" onClick={availability}>Tentar novamente</button>}
 </>}
 <div className="auth-assurance"><ShieldCheck size={19}/><p>Códigos são temporários. Não compartilhe códigos nem aprove pedidos iniciados por outras pessoas.</p></div></AuthShell>
}

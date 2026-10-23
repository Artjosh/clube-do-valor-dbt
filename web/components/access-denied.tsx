"use client";
import {useState,type FormEvent} from 'react';
import {KeyRound,LogOut,ShieldCheck} from 'lucide-react';
import {AuthShell} from './auth-shell';
import {authRequest,AuthRequestError} from './auth-client';
export function AccessDenied(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[code,setCode]=useState('');
 async function unlock(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{
  const result=await authRequest('/api/auth/invite/activate',{code:code.trim()});
  if(result.authorized!==true)throw new Error('Não foi possível liberar o acesso.');
  setCode('');window.location.replace('/');
 }catch(e){if(e instanceof AuthRequestError&&e.status===401){window.location.replace('/login');return}setError(e instanceof Error?e.message:'Não foi possível liberar o acesso.');setBusy(false)}}
 async function logout(){setBusy(true);setError('');try{await authRequest('/api/auth/logout',{});window.location.replace('/login')}catch(e){setError(e instanceof Error?e.message:'Não foi possível sair.');setBusy(false)}}
 return <AuthShell><div className="auth-icon"><ShieldCheck size={26}/></div><span className="eyebrow">E-MAIL CONFIRMADO</span><h2>Libere o acesso aos dados</h2><p className="auth-description">Agora informe a contrassenha enviada junto com a apresentação do projeto.</p>
 <form className="auth-form" onSubmit={unlock}><label htmlFor="access-code">Contrassenha de acesso</label><div className="auth-input"><KeyRound size={18}/><input id="access-code" type="password" autoComplete="off" spellCheck={false} required maxLength={128} value={code} onChange={e=>setCode(e.target.value)} disabled={busy} placeholder="Cole a contrassenha recebida"/></div><button className="primary-button" disabled={busy||!code.trim()}>{busy?'Validando…':'Liberar acesso aos dados'}</button></form>
 {error&&<p role="alert" className="auth-error">{error}</p>}
 <div className="denied-actions"><button className="secondary-button" onClick={logout} disabled={busy}><LogOut size={16}/>Sair desta conta</button></div></AuthShell>
}
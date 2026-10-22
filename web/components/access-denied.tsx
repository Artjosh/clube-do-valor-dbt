"use client";
import {useState} from 'react';
import {KeyRound,LogOut,ShieldCheck} from 'lucide-react';
import {AuthShell} from './auth-shell';
import {authRequest} from './auth-client';
export function AccessDenied(){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function logout(){setBusy(true);setError('');try{await authRequest('/api/auth/logout',{});window.location.replace('/login')}catch(e){setError(e instanceof Error?e.message:'Não foi possível sair.');setBusy(false)}}
 return <AuthShell><div className="auth-icon"><ShieldCheck size={26}/></div><span className="eyebrow">SESSÃO IDENTIFICADA</span><h2>Acesso não liberado</h2><p className="auth-description">Você não tem acesso aos dados. Sua identidade foi confirmada, mas sua conta ainda não recebeu a permissão de análise.</p><div className="denied-actions"><a href="/login?mode=invite" className="primary-button"><KeyRound size={17}/>Entrar por contrassenha</a><button className="secondary-button" onClick={logout} disabled={busy}><LogOut size={16}/>{busy?'Saindo…':'Sair desta conta'}</button></div>{error&&<p role="alert" className="auth-error">{error}</p>}<p className="auth-description">Se recebeu um convite, valide a contrassenha e confirme seu e-mail para liberar o acesso.</p></AuthShell>
}

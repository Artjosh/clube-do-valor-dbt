"use client";
import {useEffect,useRef,useState} from 'react';
import {Check,Smartphone,TriangleAlert} from 'lucide-react';
import {AuthShell} from './auth-shell';
import {authRequest} from './auth-client';
export {DeviceLogin} from './private-login';
export function DeviceConfirm(){
 const approval=useRef<Promise<unknown>|null>(null);
 const [approved,setApproved]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  // Reuse the request across StrictMode effects: the provider token is single-use.
  approval.current??=authRequest('/api/auth/device/approve',{});
  approval.current.then(()=>{if(alive)setApproved(true)}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Não foi possível confirmar o acesso.')});
  return()=>{alive=false};
 },[]);
 return <AuthShell confirm><div className="auth-icon"><Smartphone size={26}/></div><h2>{approved?'Navegador autenticado':error?'Link indisponível':'Autenticando seu navegador…'}</h2>
 {approved?<div className="auth-success" role="status"><Check size={34}/><p>Volte à aba onde pediu o acesso. Ela continuará automaticamente.</p><p>Você já pode fechar esta página.</p></div>:error?<div role="alert" className="auth-error"><TriangleAlert size={18}/><span>{error} Volte à aba original para solicitar outro e-mail.</span></div>:<p role="status" className="auth-description">Aguarde um instante. Não é preciso digitar nada.</p>}
 </AuthShell>;
}
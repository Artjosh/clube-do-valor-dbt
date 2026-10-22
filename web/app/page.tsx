import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readAnalyticsAccess } from '@/lib/auth/guard';
import { Dashboard } from '@/components/dashboard';
import { AuthShell } from '@/components/auth-shell';
export const dynamic='force-dynamic';
export default async function Home(){
 const access=await readAnalyticsAccess((await cookies()).toString());
 if(access.status===401)redirect('/login');
 if(access.status===403)redirect('/acesso-negado');
 if(access.status!==200||!access.authenticated||!access.authorized)return <AuthShell><span className="eyebrow">ACESSO PROTEGIDO</span><h2>Acesso indisponível</h2><p className="auth-description">Não foi possível verificar sua permissão agora. Os dados permanecem protegidos.</p><a className="primary-button" href="/login">Voltar ao login</a></AuthShell>;
 const {getAnalytics}=await import('@/lib/analytics');
 return <Dashboard initialData={getAnalytics()}/>;
}

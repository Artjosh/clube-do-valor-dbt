import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {readAnalyticsAccess} from '@/lib/auth/guard';
import {AccessDenied} from '@/components/access-denied';
export const dynamic='force-dynamic';
export default async function DeniedPage(){
 const access=await readAnalyticsAccess((await cookies()).toString());
 if(access.status===401)redirect('/login');
 if(access.status===200&&access.authorized)redirect('/');
 if(access.status===503)redirect('/login?error=auth_unavailable');
 return <AccessDenied/>;
}

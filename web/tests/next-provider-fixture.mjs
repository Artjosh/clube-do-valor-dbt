// Loaded only by next-production.test.mjs; deny all real outbound requests.
import { createHash } from 'node:crypto';
const digest = value => createHash('sha256').update(value).digest('hex');
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (!target.startsWith('https://offline-provider.example.test/')) throw new Error('Offline fixture blocked outbound fetch');
  const input = JSON.parse(init.body);
  let result;
  if (target.endsWith('/auth/v1/verify')) result = { user: { id: 'offline-user', email: 'analyst@example.test', email_confirmed_at: new Date().toISOString() } };
  else if (target.includes('/auth/v1/otp')) throw new Error('Email is forbidden in this suite');
  else {
    const p = input.p_payload;
    switch (input.p_action) {
      case 'session': {
        const authorized = p.session_hash === digest('11'.repeat(32));
        result = p.session_hash === digest('33'.repeat(32)) ? { status: 'anonymous' } : {
          status: 'authenticated', email: 'analyst@example.test', role: authorized ? 'analyst' : null,
          permissions: authorized ? ['analytics:read'] : [],
        }; break;
      }
      case 'consume': result = { status: p.id === '44'.repeat(32) ? 'pending' : 'approved', authorized: true, role: 'analyst', permissions: ['analytics:read'], expires_at: new Date(Date.now() + 3600_000).toISOString() }; break;
      case 'callback_rate': result = { status: 'ok' }; break;
      case 'confirmation': result = { status: 'pending', email: 'analyst@example.test', expires_at: new Date(Date.now() + 300_000).toISOString() }; break;
      case 'prepare_approval': case 'prepare_otp': result = { status: 'pending', email: 'analyst@example.test' }; break;
      case 'approve': case 'complete_otp': result = { status: 'approved', authorized: true, role: 'analyst', permissions: ['analytics:read'], expires_at: new Date(Date.now() + 3600_000).toISOString() }; break;
      case 'logout': case 'cancel': result = { status: 'ok' }; break;
      default: throw new Error('Unexpected offline RPC action');
    }
  }
  return Response.json(result);
};

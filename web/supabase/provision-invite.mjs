// Offline only: read a 256-bit hex invitation from stdin, emit SQL containing ONLY its hash.
// Coordinator generates/stores the raw code outside Git and applies reviewed SQL separately.
import { createHash } from 'node:crypto';
let raw='';
for await (const chunk of process.stdin) { raw+=chunk; if(raw.length>256) throw new Error('Invalid invitation input'); }
const code=raw.trim().toLowerCase();
if(!/^[a-f0-9]{64}$/.test(code)) throw new Error('Expected 32 random bytes encoded as 64 hex characters');
const digest=createHash('sha256').update(`cdv-invite-v1:${code}`).digest('hex');
process.stdout.write(`-- No raw invitation secret is present in this SQL. Review before applying.\ninsert into cdv_private.analytics_invites(code_hash,label)\nvalues ('${digest}','avaliadores')\nreturning id,label,created_at;\n`);

/** Verify recorded evidence without executing new controller episodes. */
import { readFileSync } from 'node:fs';
const report=JSON.parse(readFileSync('public/learning/residual-policy.json','utf8'));
if(report.schemaVersion===3) await import('./verify-study');
else await import('./verify-audit-artifacts');

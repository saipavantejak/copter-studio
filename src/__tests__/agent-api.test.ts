import {describe,it,expect} from 'vitest';
import {sanitizePayload} from '../../api/gemini';
describe('AI gateway request limits',()=>{
 const b=()=>({model:'gemini-2.5-flash',payload:{contents:[{role:'user',parts:[{text:'hello'}]}],generationConfig:{maxOutputTokens:999999,temperature:8,responseMimeType:'application/json'},tools:[{codeExecution:{}}]}});
 it('caps output and excludes provider tools',()=>{const p=sanitizePayload(b());expect(p.generationConfig.maxOutputTokens).toBe(2048);expect(p.generationConfig.temperature).toBe(1);expect(p).not.toHaveProperty('tools');});
 it('rejects arbitrary models, oversized prompts and non-text payloads',()=>{const a=b();a.model='other';expect(()=>sanitizePayload(a)).toThrow();const c=b();c.payload.contents[0].parts[0].text='x'.repeat(70000);expect(()=>sanitizePayload(c)).toThrow();expect(()=>sanitizePayload({model:'gemini-2.5-flash',payload:{contents:[{role:'system',parts:[]}]}})).toThrow();});
});

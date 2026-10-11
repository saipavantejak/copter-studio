import {it,expect,vi,afterEach} from 'vitest';
import {hasWebGL} from '../webglSupport';
import status from '../../api/gemini-status';
import type {GatewayRequest,GatewayResponse} from '../../server/geminiGateway';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('unavailable or throwing contexts return unsupported without a renderer',()=>{
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
 expect(hasWebGL()).toBe(false);
 vi.mocked(HTMLCanvasElement.prototype.getContext).mockImplementation(()=>{throw Error('Unavailable')});expect(hasWebGL()).toBe(false);
});
it('supported context probe releases its temporary resource',()=>{
 const release=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({getExtension:()=>({loseContext:release})} as unknown as ReturnType<HTMLCanvasElement['getContext']>);
 expect(hasWebGL()).toBe(true);expect(release).toHaveBeenCalledOnce();
});
it('status returns configuration only and never contacts provider or emits key',()=>{
 vi.stubEnv('GEMINI_API_KEY','SYNTHETIC_TEST_KEY');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const res={writeHead:vi.fn(),end:vi.fn()} as unknown as GatewayResponse;
 status({method:'GET'} as GatewayRequest,res);expect(res.end).toHaveBeenCalledWith('{"configured":true}');expect(fetcher).not.toHaveBeenCalled();
});

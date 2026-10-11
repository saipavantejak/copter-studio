import type {GatewayRequest,GatewayResponse} from '../server/geminiGateway';
/** Configuration metadata only; no paid provider ping and no secret returned. */
export default function geminiStatus(req:GatewayRequest,res:GatewayResponse):void {
 res.writeHead(req.method==='GET'?200:405,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify(req.method==='GET'?{configured:!!process.env.GEMINI_API_KEY}:{error:'Method not allowed'}));
}

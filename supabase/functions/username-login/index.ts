import {createUsernameHandler} from './handler.ts';
declare const Deno: {env:{get(key:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
Deno.serve(createUsernameHandler(key=>Deno.env.get(key)));

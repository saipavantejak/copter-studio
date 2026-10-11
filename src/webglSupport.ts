/** Probe once per mounted workspace; do not construct a renderer when unsupported. */
export function hasWebGL():boolean {
 try{
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('webgl2')??canvas.getContext('webgl');
  if(!context)return false;
  context.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
 }catch{return false;}
}

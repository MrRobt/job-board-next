/** Require a canonical browser Origin matching the Host seen by the server.
 * This is an extra safeguard in addition to Next.js Server Action checks.
 */
export function isTrustedActionOrigin(origin:string|null,host:string|null):boolean{
 if(!origin||!host||host.length>253||!/^[a-zA-Z0-9.:-]+$/.test(host))return false;
 try{
  const parsed=new URL(origin);
  if(parsed.protocol!=="https:"&&parsed.protocol!=="http:")return false;
  if(parsed.username||parsed.password||parsed.pathname!=="/"||parsed.search||parsed.hash)return false;
  return parsed.host.toLowerCase()===host.toLowerCase();
 }catch{return false;}
}

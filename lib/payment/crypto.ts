import {createSign,createVerify,createDecipheriv} from "node:crypto";
export const sign=(message:string,key:string)=>createSign("RSA-SHA256").update(message,"utf8").sign(key,"base64");
export const verify=(message:string,signature:string,key:string)=>createVerify("RSA-SHA256").update(message,"utf8").verify(key,signature,"base64");
export const canonical=(params:Record<string,string>)=>Object.keys(params).filter(k=>params[k]!=="").sort().map(k=>k+"="+params[k]).join("&");
export function yuanToFen(value:string){if(!/^\d{1,8}(\.\d{1,2})?$/.test(value))throw new Error("Invalid amount");const [whole,fraction=""]=value.split(".");return Number(whole)*100+Number(fraction.padEnd(2,"0"));}
export function decryptResource(resource:{algorithm:string;ciphertext:string;nonce:string;associated_data?:string},key:string){
 if(resource.algorithm!=="AEAD_AES_256_GCM"||Buffer.byteLength(key)!==32)throw new Error("Invalid encrypted resource");
 const cipher=Buffer.from(resource.ciphertext,"base64");if(cipher.length<=16)throw new Error("Invalid ciphertext");
 const decipher=createDecipheriv("aes-256-gcm",Buffer.from(key),Buffer.from(resource.nonce));
 decipher.setAAD(Buffer.from(resource.associated_data??""));decipher.setAuthTag(cipher.subarray(-16));
 return Buffer.concat([decipher.update(cipher.subarray(0,-16)),decipher.final()]).toString("utf8");
}

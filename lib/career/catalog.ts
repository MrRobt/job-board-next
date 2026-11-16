export const packages=[{sku:"STARTER20",title:"轻量次数包",amountFen:990,credits:20},{sku:"PRO100",title:"进阶次数包",amountFen:2990,credits:100}] as const;
export type PackageSku=(typeof packages)[number]["sku"];
export function product(sku:string){return packages.find(p=>p.sku===sku);}
export function price(fen:number){return (fen/100).toFixed(2).replace(/0$/,"").replace(/\.$/,"");}

"use server";
// Legacy orders can still receive verified provider callbacks; new recruitment purchases are closed.
export async function mockPurchase(_id:string){throw new Error("Recruitment purchases disabled");}
export async function startPurchase(_id:string,_channel:string){throw new Error("Recruitment purchases disabled");}

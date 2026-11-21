export declare const offFlags: readonly string[];
export declare function evaluatePrelaunchConfig(
 environment: Readonly<Record<string,string|undefined>>
):{
 mode:"LOCAL_PREVIEW"|"PUBLIC_PRELAUNCH"|"UNSPECIFIED";
 status:"PASS"|"BLOCKED";
 violations:string[];
 limitations:string[];
};

export declare const requiredRecoveryTables:readonly string[];
export declare const requiredRecoveryColumns:readonly string[];
export declare function inspectCriticalRecoverySchema(
 tables:readonly {tableName:string}[],
 columns:readonly {tableName:string;columnName:string;dataType:string}[]
):{
 missingTables:string[];
 missingColumns:string[];
 unexpectedAmountTypes:string[][];
};

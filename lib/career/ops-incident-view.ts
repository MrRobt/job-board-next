import type {OpsIncidentKey} from "./ops-incident-policy";
import type {OpsIncidentSnapshot} from "./ops-incident-state";

const keys:readonly OpsIncidentKey[]=["REFUND_IN_DOUBT","STALE_AI_RESERVATIONS","REFUND_READY_AGED","REFUND_LEDGER_REVIEW"];
/** The page queries only the fields needed to render its public-to-admin summary. */
export const incidentPanelSelect={
 key:true,state:true,count:true,openedAt:true,lastSeenAt:true,acknowledgedAt:true
} as const;
export type OpsIncidentPanelRecord=Pick<OpsIncidentSnapshot,keyof typeof incidentPanelSelect>;
export type OpsIncidentView=Readonly<{
 key:OpsIncidentKey;label:string;priority:"CRITICAL"|"HIGH";
 state:"OPEN"|"ACKNOWLEDGED"|"RESOLVED";count:number;
 openedAt:Date;lastSeenAt:Date;acknowledgedAt:Date|null;
}>;
const label:Record<OpsIncidentKey,string>={
 REFUND_IN_DOUBT:"退款状态待核实",
 STALE_AI_RESERVATIONS:"AI 次数预留超时",
 REFUND_READY_AGED:"退款待派发积压",
 REFUND_LEDGER_REVIEW:"已验签退款成功但权益需人工核账"
};
export function toOpsIncidentView(snapshot:OpsIncidentPanelRecord):OpsIncidentView{
 if(!keys.includes(snapshot.key)||
    !["OPEN","ACKNOWLEDGED","RESOLVED"].includes(snapshot.state)||
    !Number.isSafeInteger(snapshot.count)||snapshot.count<0||
    !Number.isFinite(snapshot.openedAt?.getTime())||
    !Number.isFinite(snapshot.lastSeenAt?.getTime())||
    snapshot.lastSeenAt.getTime()<snapshot.openedAt.getTime())
  throw new Error("Invalid incident snapshot");
 if(snapshot.acknowledgedAt!==null&&!Number.isFinite(snapshot.acknowledgedAt.getTime()))
  throw new Error("Invalid acknowledgment timestamp");
 return {key:snapshot.key,label:label[snapshot.key],
  priority:snapshot.key==="REFUND_IN_DOUBT"||snapshot.key==="REFUND_LEDGER_REVIEW"?"CRITICAL":"HIGH",
  state:snapshot.state,count:snapshot.count,openedAt:snapshot.openedAt,
  lastSeenAt:snapshot.lastSeenAt,acknowledgedAt:snapshot.acknowledgedAt};
}

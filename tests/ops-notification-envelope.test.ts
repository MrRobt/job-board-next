import {test} from "node:test";
import assert from "node:assert/strict";
import {buildOpsNotificationEnvelope} from "../lib/career/ops-notification-envelope";
import {opsNotificationIdempotencyKey} from "../lib/career/ops-notification-intents";

const intent = () => ({
  idempotencyKey: opsNotificationIdempotencyKey("REFUND_IN_DOUBT",new Date(0),"NOTIFY",0),
  key: "REFUND_IN_DOUBT",
  kind: "NOTIFY",
  priority: "CRITICAL",
  count: 2,
  incidentOpenedAt: new Date(0),
  dueBucket: 0
});

test("notification envelope exports only fixed operational metadata", () => {
  const untrustedInput = {...intent(), extra: "omit this field"};
  const result = buildOpsNotificationEnvelope(untrustedInput);
  assert.deepEqual(Object.keys(result), [
    "schemaVersion", "idempotencyKey", "incident", "kind", "priority",
    "count", "episodeOpenedAt", "dueBucket"
  ]);
  assert.equal(result.count, 2);
  assert.equal(Object.hasOwn(result, "extra"), false);
});

test("notification envelope rejects invalid or inconsistent inputs", () => {
  const valid = intent();
  for (const change of [
    {key:"INVALID"}, {kind:"OTHER"}, {priority:"HIGH"}, {count:0},
    {count:1.5}, {idempotencyKey:"x"}, {dueBucket:-1},
    {dueBucket:1}, {incidentOpenedAt:new Date(NaN)}
  ]) assert.throws(() => buildOpsNotificationEnvelope({...valid,...change}));
  assert.equal(buildOpsNotificationEnvelope({...valid,kind:"ESCALATE",dueBucket:1,
    idempotencyKey:opsNotificationIdempotencyKey("REFUND_IN_DOUBT",new Date(0),"ESCALATE",1)}).kind,"ESCALATE");
  assert.throws(() => buildOpsNotificationEnvelope({...valid,count:3,idempotencyKey:"b".repeat(64)}));
});

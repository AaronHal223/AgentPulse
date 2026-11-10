import test from "node:test";
import assert from "node:assert/strict";
import { useTestDb, makeAgent, makeBuyer } from "./helpers/db";
import { getOwnedBuyer } from "../src/lib/buyers";

test("an agent cannot load another agent's client", async () => {
  const db = await useTestDb();
  const a = await makeAgent(db);
  const b = await makeAgent(db);
  const buyer = await makeBuyer(db, a.id);
  assert.equal((await getOwnedBuyer(a.id, buyer.id)).id, buyer.id);
  await assert.rejects(() => getOwnedBuyer(b.id, buyer.id), /not found/i);
});

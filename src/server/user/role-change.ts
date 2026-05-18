import { fbFirestore, fbAuth } from "@/server/lib/firebase";

export type RoleChangeError = "self" | "invalid" | "not_found" | "demote_admin";

export async function changeRole(
  targetUid: string,
  actorUid: string,
  newRole: "student" | "teacher",
  reason: string,
): Promise<{ roleChangeId: string; claimUpdateOk: boolean }> {
  if (targetUid === actorUid) throw new Error("self");
  if (newRole !== "student" && newRole !== "teacher") throw new Error("invalid");
  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const profSnap = await userRef.get();
  if (!profSnap.exists) throw new Error("not_found");
  const prof = profSnap.data() ?? {};
  if (prof.role === "admin") throw new Error("demote_admin");

  const changeRef = fs.collection("roleChanges").doc();
  const fromRole = typeof prof.role === "string" ? prof.role : "student";
  await fs.runTransaction(async (tx) => {
    tx.update(userRef, { role: newRole, updatedAt: new Date() });
    tx.set(changeRef, {
      targetUid, byUid: actorUid, fromRole, toRole: newRole, reason, createdAt: new Date(),
    });
  });

  let claimUpdateOk = false;
  try {
    await fbAuth().setCustomUserClaims(targetUid, { role: newRole });
    claimUpdateOk = true;
  } catch (err) {
    console.error("setCustomUserClaims failed", targetUid, err);
  }
  return { roleChangeId: changeRef.id, claimUpdateOk };
}

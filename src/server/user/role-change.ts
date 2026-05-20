import { fbFirestore, fbAuth } from "@/server/lib/firebase";
import { bust } from "@/server/lib/cache-bus";

export type RoleChangeError = "self" | "invalid" | "not_found" | "demote_admin";

export type AssignableRole = "student" | "council" | "teacher";

export async function changeRole(
  targetUid: string,
  actorUid: string,
  newRole: AssignableRole,
  reason: string,
): Promise<{ roleChangeId: string; claimUpdateOk: boolean }> {
  if (targetUid === actorUid) throw new Error("self");
  if (newRole !== "student" && newRole !== "council" && newRole !== "teacher") throw new Error("invalid");
  const fs = fbFirestore();
  const userRef = fs.collection("users").doc(targetUid);
  const changeRef = fs.collection("roleChanges").doc();
  await fs.runTransaction(async (tx) => {
    const profSnap = await tx.get(userRef);
    if (!profSnap.exists) throw new Error("not_found");
    const prof = profSnap.data() ?? {};
    if (prof.role === "admin") throw new Error("demote_admin");
    const fromRole = typeof prof.role === "string" ? prof.role : "student";
    const updates: Record<string, unknown> = { role: newRole, updatedAt: new Date() };
    if (newRole === "teacher") {
      updates.classGrade = 0;
      updates.classRoom = 0;
      updates.classKey = "";
    }
    tx.update(userRef, updates);
    tx.set(changeRef, {
      targetUid, byUid: actorUid, fromRole, toRole: newRole, reason, createdAt: new Date(),
    });
  });

  bust(`user:${targetUid}`);
  bust("classes");
  bust("leaderboard");

  let claimUpdateOk = false;
  try {
    await fbAuth().setCustomUserClaims(targetUid, { role: newRole });
    claimUpdateOk = true;
  } catch (err) {
    console.error("setCustomUserClaims failed", targetUid, err);
  }
  return { roleChangeId: changeRef.id, claimUpdateOk };
}

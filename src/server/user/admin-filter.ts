export type AdminProfile = {
  uid: string;
  fullName: string;
  classKey: string;
  role: "student" | "council" | "teacher" | "admin";
  totalPoints: number;
};

function containsCI(s: string, sub: string): boolean {
  if (!sub) return true;
  return s.toLowerCase().includes(sub.toLowerCase());
}

export function filterAndSortProfiles(in_: AdminProfile[], role: string, q: string): AdminProfile[] {
  const out = in_.filter((p) => {
    if (role && p.role !== role) return false;
    if (q && !containsCI(p.fullName, q)) return false;
    return true;
  });
  out.sort((a, b) => a.fullName.toLowerCase().localeCompare(b.fullName.toLowerCase()));
  return out;
}

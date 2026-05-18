export type LeaderboardEntry = {
  uid: string;
  fullName: string;
  classKey: string;
  rank: string;
  points: number;
  scans: number;
  streakDays: number;
};

type ProfileLike = {
  uid: string;
  fullName: string;
  classKey: string;
  rank: string;
  totalPoints: number;
  totalScans: number;
  streakDays: number;
};

export type BuildResult = {
  entries: LeaderboardEntry[];
  myRank: number;
  myEntry: LeaderboardEntry | null;
};

export function buildEntries(profiles: ProfileLike[], callerUid: string): BuildResult {
  const entries: LeaderboardEntry[] = profiles.map((p) => ({
    uid: p.uid,
    fullName: p.fullName,
    classKey: p.classKey,
    rank: p.rank,
    points: p.totalPoints,
    scans: p.totalScans,
    streakDays: p.streakDays,
  }));
  let myRank = -1;
  let myEntry: LeaderboardEntry | null = null;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].uid === callerUid) {
      myRank = i + 1;
      myEntry = entries[i];
      break;
    }
  }
  return { entries, myRank, myEntry };
}

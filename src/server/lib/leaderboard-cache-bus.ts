import { registerBuster, bust } from "./cache-bus";

export function registerLeaderboardCacheBuster(fn: () => void): () => void {
  return registerBuster("leaderboard", () => fn());
}

export function bustLeaderboardCaches(): void {
  bust("leaderboard");
}

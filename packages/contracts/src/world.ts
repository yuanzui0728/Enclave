export interface WorldContext {
  id: string;
  localTime: string;
  weather?: string;
  location?: string;
  season?: string;
  holiday?: string;
  recentEvents?: string[];
  timestamp: string;
}

export type PrefKind = 'mute' | 'watchlist';
export type PrefScope = 'item' | 'category';

export interface TrackingPref {
  id: string;
  kind: PrefKind;
  scope: PrefScope;
  value: string;
  createdAt: Date;
}

export interface AddPrefInput {
  kind: PrefKind;
  scope: PrefScope;
  value: string;
}

export interface TrackingPrefRepository {
  list(): Promise<TrackingPref[]>;
  listByKind(kind: PrefKind): Promise<TrackingPref[]>;
  add(input: AddPrefInput): Promise<TrackingPref>;
  remove(id: string): Promise<boolean>;
}

export interface TrackingPrefService {
  list(): Promise<TrackingPref[]>;
  add(input: AddPrefInput): Promise<TrackingPref>;
  remove(id: string): Promise<boolean>;
  /** Lowercased mute values, split by scope — used to filter active deals. */
  mutedValues(): Promise<{ items: Set<string>; categories: Set<string> }>;
}

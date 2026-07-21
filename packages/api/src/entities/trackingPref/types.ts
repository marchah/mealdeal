// Fixed value sets are TS enums — reused by the Drizzle column (`.$type`) and the Pothos GraphQL
// enum, so there's one source of truth. Members are SCREAMING_SNAKE_CASE for both key and value
// (`MUTE = 'MUTE'`): the key is the GraphQL value name, the value is what's stored in the DB.
export enum PrefKind {
  MUTE = 'MUTE',
  WATCHLIST = 'WATCHLIST',
}

export enum PrefScope {
  ITEM = 'ITEM',
  CATEGORY = 'CATEGORY',
}

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
  listPrefs: () => Promise<TrackingPref[]>;
  listPrefsByKind: (kind: PrefKind) => Promise<TrackingPref[]>;
  addPref: (input: AddPrefInput) => Promise<TrackingPref>;
  removePref: (id: string) => Promise<boolean>;
}

export interface TrackingPrefService {
  listPrefs: () => Promise<TrackingPref[]>;
  addPref: (input: AddPrefInput) => Promise<TrackingPref>;
  removePref: (id: string) => Promise<boolean>;
  /** Lowercased mute values, split by scope — used to filter active deals. */
  mutedValues: () => Promise<{ items: Set<string>; categories: Set<string> }>;
}

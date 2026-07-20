import type { Maybe } from '../../common/types';

export interface IngestRun {
  id: string;
  startedAt: Date;
  finishedAt: Maybe<Date>;
  messagesSeen: number;
  dealsAdded: number;
  messagesFailed: number;
  error: Maybe<string>;
}

export interface FinishIngestInput {
  messagesSeen: number;
  dealsAdded: number;
  messagesFailed: number;
  error?: Maybe<string>;
}

export interface IngestRunRepository {
  create(): Promise<IngestRun>;
  finish(id: string, input: FinishIngestInput): Promise<void>;
  lastCompletedAt(): Promise<Maybe<Date>>;
  count(): Promise<number>;
}

export interface IngestRunService {
  start(): Promise<string>;
  finish(id: string, input: FinishIngestInput): Promise<void>;
  lastCompletedAt(): Promise<Maybe<Date>>;
  count(): Promise<number>;
}

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
  createIngestRun: () => Promise<IngestRun>;
  finishIngestRun: (id: string, input: FinishIngestInput) => Promise<void>;
  lastIngestCompletedAt: () => Promise<Maybe<Date>>;
  countIngestRuns: () => Promise<number>;
}

export interface IngestRunService {
  startIngestRun: () => Promise<string>;
  finishIngestRun: (id: string, input: FinishIngestInput) => Promise<void>;
  lastIngestCompletedAt: () => Promise<Maybe<Date>>;
  countIngestRuns: () => Promise<number>;
}

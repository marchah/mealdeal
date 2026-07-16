export interface IngestRun {
  id: string;
  startedAt: Date;
  finishedAt: Date | null;
  messagesSeen: number;
  dealsAdded: number;
  error: string | null;
}

export interface FinishIngestInput {
  messagesSeen: number;
  dealsAdded: number;
  error?: string | null;
}

export interface IngestRunRepository {
  create(): Promise<IngestRun>;
  finish(id: string, input: FinishIngestInput): Promise<void>;
  lastCompletedAt(): Promise<Date | null>;
  count(): Promise<number>;
}

export interface IngestRunService {
  start(): Promise<string>;
  finish(id: string, input: FinishIngestInput): Promise<void>;
  lastCompletedAt(): Promise<Date | null>;
  count(): Promise<number>;
}

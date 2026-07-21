import type { FinishIngestInput, IngestRunRepository, IngestRunService } from './types';

export function ingestRunServiceFactory({
  ingestRunRepository,
}: {
  ingestRunRepository: IngestRunRepository;
}): IngestRunService {
  function lastIngestCompletedAt() {
    return ingestRunRepository.lastIngestCompletedAt();
  }

  function countIngestRuns() {
    return ingestRunRepository.countIngestRuns();
  }

  async function startIngestRun() {
    const run = await ingestRunRepository.createIngestRun();
    return run.id;
  }

  function finishIngestRun(id: string, input: FinishIngestInput) {
    return ingestRunRepository.finishIngestRun(id, input);
  }

  return { lastIngestCompletedAt, countIngestRuns, startIngestRun, finishIngestRun };
}

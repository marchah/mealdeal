import type { FinishIngestInput, IngestRunRepository, IngestRunService } from './types';

export function ingestRunServiceFactory({
  ingestRunRepository,
}: {
  ingestRunRepository: IngestRunRepository;
}): IngestRunService {
  function lastCompletedAt() {
    return ingestRunRepository.lastCompletedAt();
  }

  function count() {
    return ingestRunRepository.count();
  }

  async function start() {
    const run = await ingestRunRepository.create();
    return run.id;
  }

  function finish(id: string, input: FinishIngestInput) {
    return ingestRunRepository.finish(id, input);
  }

  return { lastCompletedAt, count, start, finish };
}

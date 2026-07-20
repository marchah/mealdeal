import type { IngestRunRepository, IngestRunService } from './types';

export function ingestRunServiceFactory({
  ingestRunRepository,
}: {
  ingestRunRepository: IngestRunRepository;
}): IngestRunService {
  return {
    async start() {
      const run = await ingestRunRepository.create();
      return run.id;
    },
    finish: (id, input) => ingestRunRepository.finish(id, input),
    lastCompletedAt: () => ingestRunRepository.lastCompletedAt(),
    count: () => ingestRunRepository.count(),
  };
}

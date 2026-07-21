import { builder } from '../../../builder';
import { StatsRef } from './type';

builder.queryFields((t) => ({
  stats: t.field({
    type: StatsRef,
    resolve: (_root, _args, ctx) => ctx.services.dashboardService.getStats(),
  }),
}));

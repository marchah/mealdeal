import { builder } from '../../../builder';
import { AppConfigRef } from './type';

builder.queryFields((t) => ({
  appConfig: t.field({
    type: AppConfigRef,
    resolve: (_root, _args, ctx) => ctx.services.appConfigService.getAppConfig(),
  }),
}));

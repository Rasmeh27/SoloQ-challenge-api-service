import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { GetHealthStatusUseCase } from './application/get-health-status.use-case';
import { HealthController } from './presentation/health.controller';

@Module({
  imports: [StorageModule],
  controllers: [HealthController],
  providers: [GetHealthStatusUseCase],
})
export class HealthModule {}

import { Global, Module } from '@nestjs/common';
import { HistoryRepository } from '../../core/database/history.repository';
import { SqliteService } from '../../core/database/sqlite.service';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { AuthService } from '../auth/auth.service';
import { SharedSourcesModule } from '../shared-sources/shared-sources.module';
import { AuditLogRepository } from './audit-log.repository';
import { DataLifecycleController } from './data-lifecycle.controller';
import { DataLifecycleService } from './data-lifecycle.service';

@Global()
@Module({
  imports: [SharedSourcesModule, AiProvidersModule],
  controllers: [DataLifecycleController],
  providers: [
    SqliteService,
    AuthService,
    HistoryRepository,
    AuditLogRepository,
    DataLifecycleService,
  ],
  exports: [AuditLogRepository, DataLifecycleService],
})
export class DataLifecycleModule {}

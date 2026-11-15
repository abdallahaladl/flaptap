import { Injectable } from '@nestjs/common';
import { ExtractionModeId, ExtractionModeMetadata } from '../tech-linguist.types';
import { AdvancedNativeModeStrategy } from './advanced-native-mode.strategy';
import { ComprehensiveModeStrategy } from './comprehensive-mode.strategy';
import { IExtractionModeStrategy } from './extraction-mode.interface';

@Injectable()
export class ExtractionModeRegistry {
  private readonly strategies = new Map<ExtractionModeId, IExtractionModeStrategy>();

  constructor(
    private readonly comprehensiveMode: ComprehensiveModeStrategy,
    private readonly advancedNativeMode: AdvancedNativeModeStrategy,
  ) {
    this.register(comprehensiveMode);
    this.register(advancedNativeMode);
  }

  private register(strategy: IExtractionModeStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  normalizeModeId(modeId?: string): ExtractionModeId {
    const normalized = String(modeId || '').trim().toLowerCase();
    if (normalized === 'advanced_native' || normalized === 'native_elite' || normalized === 'advanced-native') {
      return 'advanced_native';
    }
    return 'comprehensive';
  }

  getStrategy(modeId?: string): IExtractionModeStrategy {
    const id = this.normalizeModeId(modeId);
    return this.strategies.get(id) || this.comprehensiveMode;
  }

  listModes(): ExtractionModeMetadata[] {
    return Array.from(this.strategies.values()).map((s) => s.metadata);
  }
}

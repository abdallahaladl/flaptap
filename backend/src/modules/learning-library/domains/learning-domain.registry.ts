import { BadRequestException, Injectable } from '@nestjs/common';
import { LearningDomainMetadata } from '../learning-library.types';
import { ILearningDomainStrategy } from './learning-domain.interface';
import { NaturalAmericanEnglishDomainStrategy } from './natural-american-english.strategy';
import { ProgrammingTerminologyDomainStrategy } from './programming-terminology.strategy';
import { TechnicalVocabularyDomainStrategy } from './technical-vocabulary.strategy';

@Injectable()
export class LearningDomainRegistry {
  private readonly strategies = new Map<string, ILearningDomainStrategy>();
  private readonly orderedIds: string[] = [];

  constructor(
    naturalAmericanEnglish: NaturalAmericanEnglishDomainStrategy,
    technicalVocabulary: TechnicalVocabularyDomainStrategy,
    programmingTerminology: ProgrammingTerminologyDomainStrategy,
  ) {
    this.register(naturalAmericanEnglish);
    this.register(technicalVocabulary);
    this.register(programmingTerminology);
  }

  register(strategy: ILearningDomainStrategy): void {
    if (!this.strategies.has(strategy.id)) {
      this.orderedIds.push(strategy.id);
    }
    this.strategies.set(strategy.id, strategy);
  }

  getDefaultDomainId(): string {
    for (const id of this.orderedIds) {
      const strat = this.strategies.get(id);
      if (strat?.metadata.isDefault) return strat.id;
    }
    return this.orderedIds[0] || 'natural_american_english';
  }

  getStrategy(domainId?: string): ILearningDomainStrategy {
    const clean = String(domainId || '').trim();
    const targetId = clean || this.getDefaultDomainId();
    const strategy = this.strategies.get(targetId);
    if (!strategy) {
      throw new BadRequestException(
        `Unknown learning domain "${targetId}". Available domains: ${this.orderedIds.join(', ')}.`,
      );
    }
    return strategy;
  }

  listDomains(): LearningDomainMetadata[] {
    return this.orderedIds
      .map((id) => this.strategies.get(id)?.metadata)
      .filter((m): m is LearningDomainMetadata => Boolean(m));
  }
}

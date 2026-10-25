import { Controller, Get, Param, Delete, Post, Query } from '@nestjs/common';
import { HistoryRepository, HistoryItem } from '../../core/database/history.repository';

@Controller('api/history')
export class HistoryController {
  constructor(private readonly historyRepo: HistoryRepository) {}

  @Get()
  getAll(@Query('track') track?: string): HistoryItem[] {
    return this.historyRepo.findAll(track);
  }

  @Post('clear')
  clearHistory() {
    this.historyRepo.clearAll();
    return { success: true, message: 'All practice history and old usage have been cleared.' };
  }

  @Post('reset')
  resetWebsite() {
    return this.historyRepo.resetToDefaultShowcase();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.historyRepo.findById(id);
  }

  @Delete(':id')
  deleteItem(@Param('id') id: string) {
    return { success: this.historyRepo.delete(id) };
  }

  @Post(':id/drill')
  incrementDrill(@Param('id') id: string) {
    return this.historyRepo.incrementDrill(id);
  }
}

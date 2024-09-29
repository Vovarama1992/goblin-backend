import { Controller, Get, Param, Post, Body, Logger } from '@nestjs/common';
import { TransactionService } from './services/transaction.service';

@Controller('transactions')
export class TransactionController {
  private readonly logger = new Logger(TransactionController.name);

  constructor(private readonly transactionService: TransactionService) {}

  @Get('user/:id')
  async getUserTransactions(@Param('id') userId: number) {
    this.logger.log(
      `Запрос на получение транзакций для пользователя с ID: ${userId}`,
    );

    // Вызываем метод сервиса для получения всех транзакций пользователя
    return this.transactionService.getUserTransactions(Number(userId));
  }

  // Внутренний перевод между кошельками
  @Post('internal-transfer')
  async internalTransfer(
    @Body('fromWalletId') fromWalletId: number,
    @Body('toWalletId') toWalletId: number,
    @Body('amount') amount: number,
  ) {
    return this.transactionService.internalTransfer(
      fromWalletId,
      toWalletId,
      amount,
    );
  }

  // Внешний перевод на адрес
  @Post('external-transfer')
  async externalTransfer(
    @Body('fromWalletId') fromWalletId: number,
    @Body('externalAddress') externalAddress: string,
    @Body('amount') amount: number,
  ) {
    return this.transactionService.externalTransfer(
      fromWalletId,
      externalAddress,
      amount,
    );
  }
}

import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { TransactionService } from './services/transaction.service';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get(':id/status')
  async getTransactionStatus(@Param('id') transactionRecordId: number) {
    return this.transactionService.getTransactionStatus(transactionRecordId);
  }

  @Get('user/:id')
  async getAllUsersTransactions(@Param('id') userId: number) {
    return this.transactionService.getUserTransactions(userId);
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

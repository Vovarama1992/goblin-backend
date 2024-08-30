import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import TronWeb from 'tronweb';
import axios from 'axios';
import { TransactionType, TransactionStatus } from '@prisma/client';

@Injectable()
export class TransactionService {
  private tronWeb: TronWeb;
  private usdtContractAddress: string;

  constructor(private readonly prisma: PrismaService) {
    this.tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
    });

    this.usdtContractAddress = 'TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7';
  }

  // Получение всех транзакций пользователя через связанные кошельки
  async getUserTransactions(userId: number) {
    try {
      const wallets = await this.prisma.wallet.findMany({
        where: { userId },
        select: { id: true },
      });

      const walletIds = wallets.map((wallet) => wallet.id);

      const transactions = await this.prisma.transaction.findMany({
        where: {
          OR: [
            { fromWalletId: { in: walletIds } },
            { toWalletId: { in: walletIds } },
          ],
        },
        include: {
          fromWallet: true,
          toWallet: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return transactions;
    } catch (err) {
      throw new Error(
        `Ошибка при получении транзакций пользователя с ID ${userId}: ${err.message}`,
      );
    }
  }

  // Внутренний перевод
  async internalTransfer(
    senderWalletId: number,
    recipientWalletId: number,
    amount: number,
  ): Promise<{ transactionId: string; feeInUsdt: number }> {
    try {
      const senderWallet = await this.prisma.wallet.findUnique({
        where: { id: senderWalletId },
      });
      const recipientWallet = await this.prisma.wallet.findUnique({
        where: { id: recipientWalletId },
      });

      if (!senderWallet || !recipientWallet) {
        throw new Error(`Один из кошельков не найден.`);
      }

      return await this.executeTransfer(
        senderWallet.id,
        senderWallet.privateKey,
        recipientWallet.id,
        amount,
        TransactionType.INTERNAL,
      );
    } catch (err) {
      throw new Error(`Ошибка при внутреннем переводе: ${err.message}`);
    }
  }

  // Внешний перевод
  async externalTransfer(
    senderWalletId: number,
    recipientAddress: string,
    amount: number,
  ): Promise<{ transactionId: string; feeInUsdt: number }> {
    try {
      const senderWallet = await this.prisma.wallet.findUnique({
        where: { id: senderWalletId },
      });

      if (!senderWallet) {
        throw new Error(`Кошелек с ID ${senderWalletId} не найден.`);
      }

      return await this.executeTransfer(
        senderWallet.id,
        senderWallet.privateKey,
        recipientAddress,
        amount,
        TransactionType.EXTERNAL_OUTGOING,
      );
    } catch (err) {
      throw new Error(`Ошибка при внешнем переводе: ${err.message}`);
    }
  }

  // Общий метод для выполнения перевода USDT
  private async executeTransfer(
    senderWalletId: number,
    senderPrivateKey: string,
    recipientWalletOrAddress: number | string,
    amount: number,
    type: TransactionType,
  ): Promise<{
    transactionId: string;
    feeInUsdt: number;
    transactionRecordId: number;
  }> {
    let transactionRecord;
    try {
      let recipientWalletId: number | undefined;
      let externalAddress: string | undefined;

      if (typeof recipientWalletOrAddress === 'number') {
        recipientWalletId = recipientWalletOrAddress;
      } else {
        externalAddress = recipientWalletOrAddress;
      }

      const contract = await this.tronWeb
        .contract()
        .at(this.usdtContractAddress);

      const senderWallet = await this.prisma.wallet.findUnique({
        where: { id: senderWalletId },
      });

      let recipientAddress;
      if (recipientWalletId) {
        const recipientWallet = await this.prisma.wallet.findUnique({
          where: { id: recipientWalletId },
        });
        recipientAddress = recipientWallet?.address;
      } else {
        recipientAddress = externalAddress;
      }

      if (!recipientAddress) {
        throw new Error('Не удалось определить адрес получателя.');
      }

      const transaction = await contract
        .transfer(recipientAddress, amount)
        .send({
          feeLimit: 1000000,
          from: senderWallet.address,
        });

      transactionRecord = await this.prisma.transaction.create({
        data: {
          type: type,
          currency: 'USDT',
          amount: amount,
          fromWallet: {
            connect: { id: senderWalletId },
          },
          toWallet: recipientWalletId
            ? { connect: { id: recipientWalletId } }
            : undefined,
          externalAddress: externalAddress,
          status: TransactionStatus.PENDING,
        },
      });

      const signedTransaction = await this.tronWeb.trx.sign(
        transaction,
        senderPrivateKey,
      );

      const broadcast =
        await this.tronWeb.trx.sendRawTransaction(signedTransaction);

      if (broadcast.result) {
        const transactionInfo = await this.tronWeb.trx.getTransactionInfo(
          broadcast.txid,
        );

        const feeInTrx = transactionInfo.fee / 1e6;

        const usdtPerTrx = await this.getTrxToUsdtRate();

        const feeInUsdt = feeInTrx * usdtPerTrx;

        await this.prisma.transaction.update({
          where: { id: transactionRecord.id },
          data: {
            status: TransactionStatus.COMPLETED,
            updatedAt: new Date(),
          },
        });

        return {
          transactionId: broadcast.txid,
          transactionRecordId: transactionRecord.id,
          feeInUsdt: feeInUsdt,
        };
      } else {
        await this.prisma.transaction.update({
          where: { id: transactionRecord.id },
          data: {
            status: TransactionStatus.FAILED,
            updatedAt: new Date(),
          },
        });

        throw new Error('Не удалось отправить транзакцию.');
      }
    } catch (err) {
      if (transactionRecord) {
        await this.prisma.transaction.update({
          where: { id: transactionRecord.id },
          data: {
            status: TransactionStatus.FAILED,
            updatedAt: new Date(),
          },
        });
      }
      throw new Error(`Ошибка при выполнении перевода: ${err.message}`);
    }
  }

  // Метод для получения текущего курса TRX/USDT с использованием API CoinGecko
  private async getTrxToUsdtRate(): Promise<number> {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price',
        {
          params: {
            ids: 'tron',
            vs_currencies: 'usdt',
          },
        },
      );

      const rate = response.data.tron.usdt;
      return rate;
    } catch (err) {
      throw new Error(`Не удалось получить курс TRX/USDT: ${err.message}`);
    }
  }

  // Получение статуса транзакции
  async getTransactionStatus(transactionRecordId: number) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionRecordId },
    });

    if (!transaction) {
      throw new Error('Транзакция не найдена');
    }

    return {
      id: transaction.id,
      status: transaction.status,
      currency: transaction.currency,
      amount: transaction.amount,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}

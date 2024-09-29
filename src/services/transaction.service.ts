import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import TronWeb from 'tronweb';
import axios from 'axios';
import { WalletService } from './wallet.service';
import {
  CreateInternalTransactionDto,
  CreateExternalTransactionDto,
} from 'src/types/transaction.dto';
import { TransactionStatus, TransactionType } from '@prisma/client';
//import { TransactionType, TransactionStatus } from '@prisma/client';

@Injectable()
export class TransactionService {
  private tronWeb: TronWeb;
  private usdtContractAddress: string;
  private readonly logger = new Logger(TransactionService.name);

  // Добавляем переменную для WalletService

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    // Сохраняем WalletService как часть класса
  ) {
    this.tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
    });

    // Преобразование адреса смарт-контракта в hex-формат
    this.usdtContractAddress = this.tronWeb.address.toHex(
      'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    );
  }

  async getTransactionsByAddress(address: string) {
    try {
      const response = await axios.get(
        `https://api.tronscan.org/api/transaction?address=${address}`,
      );

      // Получаем транзакции из ответа
      const transactions = response.data.data;

      this.logger.log(
        `Найдено транзакций для адреса ${address}: ${transactions.length}`,
      );

      return transactions;
    } catch (error) {
      this.logger.error(
        `Ошибка при получении транзакций для адреса ${address}: ${error.message}`,
      );
      throw new Error(`Ошибка при получении транзакций для адреса ${address}`);
    }
  }

  async getUserTransactions(userId: number) {
    try {
      // Получаем все кошельки пользователя
      const wallets = await this.prisma.wallet.findMany({
        where: { userId },
        select: { address: true },
      });

      let allTransactions = [];

      // Проходим по всем кошелькам пользователя и используем метод getTransactionsByAddress
      for (const wallet of wallets) {
        const transactions = await this.getTransactionsByAddress(
          wallet.address,
        );

        // Добавляем транзакции в общий список
        allTransactions = allTransactions.concat(transactions);
      }

      return allTransactions;
    } catch (err) {
      this.logger.error(
        `Ошибка при получении транзакций пользователя с ID ${userId}: ${err.message}`,
      );
      throw new Error(
        `Ошибка при получении транзакций пользователя с ID ${userId}`,
      );
    }
  }

  async createInternalTransaction(dto: CreateInternalTransactionDto) {
    try {
      const transaction = await this.prisma.transaction.create({
        data: {
          type: TransactionType.INTERNAL,
          currency: dto.currency,
          amount: dto.amount,
          fromWalletId: dto.fromWalletId,
          toWalletId: dto.toWalletId,
          status: TransactionStatus.PENDING,
        },
      });

      console.log(`Внутренняя транзакция создана с ID: ${transaction.id}`);
      return transaction;
    } catch (err) {
      console.error('Ошибка при создании внутренней транзакции:', err);
      throw new Error('Ошибка при создании внутренней транзакции.');
    }
  }

  async createExternalTransaction(dto: CreateExternalTransactionDto) {
    try {
      const transaction = await this.prisma.transaction.create({
        data: {
          type: TransactionType.EXTERNAL_OUTGOING,
          currency: dto.currency,
          amount: dto.amount,
          fromWalletId: dto.fromWalletId,
          externalAddress: dto.externalAddress,
          status: TransactionStatus.PENDING,
        },
      });

      console.log(`Внешняя транзакция создана с ID: ${transaction.id}`);
      return transaction;
    } catch (err) {
      console.error('Ошибка при создании внешней транзакции:', err);
      throw new Error('Ошибка при создании внешней транзакции.');
    }
  }

  // Внутренний перевод
  async internalTransfer(
    senderWalletId: number,
    recipientWalletId: number,
    amount: number,
  ): Promise<{ transactionId: string; feeInUsdt: number }> {
    try {
      // Получаем кошелек отправителя
      const senderWallet = await this.prisma.wallet.findUnique({
        where: { id: senderWalletId },
      });

      // Получаем кошелек получателя
      const recipientWallet = await this.prisma.wallet.findUnique({
        where: { id: recipientWalletId },
      });

      if (!senderWallet || !recipientWallet) {
        throw new Error(`Один из кошельков не найден.`);
      }

      // Расшифровываем приватный ключ с использованием WalletService
      const decryptedPrivateKey = this.walletService.decryptPrivateKey(
        senderWallet.privateKey,
      );

      this.logger.log(
        `[internalTransfer] Отправитель: ${senderWallet.address}, Расшифрованный приватный ключ: ${decryptedPrivateKey}`,
      );
      this.logger.log(
        `[internalTransfer] Получатель: ${recipientWallet.address}`,
      );

      // Выполняем перевод, используя адреса
      return await this.executeTransfer(
        senderWallet.address, // Передаем адрес отправителя
        decryptedPrivateKey, // Передаем расшифрованный приватный ключ
        recipientWallet.address, // Передаем адрес получателя
        amount,
      );
    } catch (err) {
      this.logger.error(
        `[internalTransfer] Ошибка при внутреннем переводе: ${err.message}`,
      );
      throw new Error(`Ошибка при внутреннем переводе: ${err.message}`);
    }
  }

  async externalTransfer(
    senderWalletId: number,
    recipientAddress: string,
    amount: number,
  ): Promise<{ transactionId: string; feeInUsdt: number }> {
    try {
      // Получаем кошелек отправителя по его ID
      const senderWallet = await this.prisma.wallet.findUnique({
        where: { id: senderWalletId },
      });

      if (!senderWallet) {
        throw new Error(`Кошелек с ID ${senderWalletId} не найден.`);
      }

      // Выполняем перевод, используя адрес отправителя и внешний адрес получателя
      return await this.executeTransfer(
        senderWallet.address, // Передаем адрес отправителя
        senderWallet.privateKey, // Передаем приватный ключ отправителя
        recipientAddress, // Передаем внешний адрес получателя напрямую
        amount, // Передаем сумму
      );
    } catch (err) {
      throw new Error(`Ошибка при внешнем переводе: ${err.message}`);
    }
  }

  private async executeTransfer(
    senderAddress: string,
    senderPrivateKey: string,
    recipientAddress: string,
    amount: number,
  ): Promise<{
    transactionId: string;
    feeInUsdt: number;
    trackingUrl: string;
  }> {
    try {
      this.logger.log(
        `[executeTransfer] Новый Старт перевода USDT. Отправитель: ${senderAddress}, Получатель: ${recipientAddress}, Сумма: ${amount}`,
      );

      // Преобразуем адрес смарт-контракта USDT в hex-формат
      const usdtContractAddress = this.tronWeb.address.toHex(
        this.usdtContractAddress,
      );

      // Проверяем соответствие приватного ключа и адреса отправителя
      const derivedAddress =
        this.tronWeb.address.fromPrivateKey(senderPrivateKey);
      if (derivedAddress !== senderAddress) {
        this.logger.error(
          `[executeTransfer] Приватный ключ не соответствует адресу отправителя.`,
        );
        throw new Error('Приватный ключ не соответствует адресу отправителя.');
      }

      this.logger.log(
        `[executeTransfer] Приватный ключ соответствует адресу отправителя.`,
      );

      // Явная установка адреса отправителя в TronWeb
      this.tronWeb.setAddress(senderAddress);

      // Проверка баланса отправителя
      const contract = await this.tronWeb.contract().at(usdtContractAddress);
      const senderBalance = await contract.balanceOf(senderAddress).call();
      this.logger.log(
        `[executeTransfer] Баланс отправителя: ${senderBalance.toString(10)}`,
      );

      if (senderBalance < amount * 1e6) {
        throw new Error(
          'Недостаточно средств на балансе для выполнения перевода.',
        );
      }

      // Строим транзакцию для перевода USDT
      const functionSelector = 'transfer(address,uint256)';
      const parameter = [
        { type: 'address', value: recipientAddress },
        { type: 'uint256', value: amount * 1e6 }, // Указываем сумму в минимальных единицах (микро-USDT)
      ];

      this.logger.log(
        `[executeTransfer] Начало вызова triggerSmartContract...`,
      );

      let tx;
      try {
        tx = await this.tronWeb.transactionBuilder.triggerSmartContract(
          usdtContractAddress,
          functionSelector,
          {
            feeLimit: 40000000,
          },
          parameter,
          senderAddress, // Адрес отправителя
        );
      } catch (err) {
        this.logger.error(
          `[executeTransfer] Ошибка при вызове triggerSmartContract: ${err.message}`,
        );
        throw new Error(
          `Ошибка на этапе вызова triggerSmartContract: ${err.message}`,
        );
      }

      this.logger.log(
        `[executeTransfer] Транзакция создана: ${tx.transaction.txID}`,
      );

      // Подписание транзакции приватным ключом отправителя
      let signedTx;
      try {
        signedTx = await this.tronWeb.trx.sign(
          tx.transaction,
          senderPrivateKey,
        );
        this.logger.log(
          `[executeTransfer] Транзакция подписана: ${JSON.stringify(signedTx)}`,
        );
      } catch (err) {
        this.logger.error(
          `[executeTransfer] Ошибка при подписании транзакции: ${err.message}`,
        );
        throw new Error(
          `Ошибка на этапе подписания транзакции: ${err.message}`,
        );
      }

      // Отправляем подписанную транзакцию
      let broadcast;
      try {
        broadcast = await this.tronWeb.trx.sendRawTransaction(signedTx);
        this.logger.log(
          `[executeTransfer] Транзакция отправлена. TxID: ${broadcast.txid}`,
        );

        if (!broadcast.result) {
          throw new Error('Не удалось отправить транзакцию.');
        }
      } catch (err) {
        this.logger.error(
          `[executeTransfer] Ошибка при отправке транзакции: ${err.message}`,
        );
        throw new Error(`Ошибка на этапе отправки транзакции: ${err.message}`);
      }

      // Получаем информацию о транзакции
      let transactionInfo;
      try {
        transactionInfo = await this.tronWeb.trx.getTransactionInfo(
          broadcast.txid,
        );
        this.logger.log(
          `[executeTransfer] Информация о транзакции: ${JSON.stringify(transactionInfo)}`,
        );
      } catch (err) {
        this.logger.error(
          `[executeTransfer] Ошибка при получении информации о транзакции: ${err.message}`,
        );
        throw new Error(
          `Ошибка на этапе получения информации о транзакции: ${err.message}`,
        );
      }

      // Рассчитываем комиссию в TRX (если доступна информация о комиссии)
      let feeInTrx = 0;
      try {
        feeInTrx = transactionInfo.fee / 1e6 || 0;
        this.logger.log(`[executeTransfer] Комиссия в TRX: ${feeInTrx}`);
      } catch (err) {
        this.logger.error(
          `[executeTransfer] Ошибка при расчете комиссии: ${err.message}`,
        );
      }

      // Получаем курс TRX/USDT для расчета комиссии в USDT
      let usdtPerTrx;
      try {
        usdtPerTrx = await this.getTrxToUsdtRate();
        this.logger.log(`[executeTransfer] Курс TRX/USDT: ${usdtPerTrx}`);
      } catch (err) {
        this.logger.error(
          `[executeTransfer] Ошибка при получении курса TRX/USDT: ${err.message}`,
        );
        throw new Error(
          `Ошибка на этапе получения курса TRX/USDT: ${err.message}`,
        );
      }

      const feeInUsdt = feeInTrx * usdtPerTrx;

      // Формируем URL для отслеживания транзакции на TronScan
      const trackingUrl = `https://tronscan.org/#/transaction/${broadcast.txid}`;

      return {
        transactionId: broadcast.txid,
        feeInUsdt: feeInUsdt,
        trackingUrl: trackingUrl, // Добавляем URL для отслеживания транзакции
      };
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Общая ошибка при переводе USDT: ${err.message}`,
      );
      throw new Error(`Ошибка при переводе USDT: ${err.message}`);
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
      throw new Error(`Не удалось получить курс TRX/USDT: ${err}`);
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

  async calculateTransactionFee(
    fromWalletId: number,
    amount: number,
  ): Promise<{ feeInTrx: number }> {
    this.logger.log(
      `[calculateTransactionFee] Начало расчета для fromWalletId: ${fromWalletId}, amount: ${amount}`,
    );

    // Получаем кошелек отправителя
    const senderWallet = await this.prisma.wallet.findUnique({
      where: { id: fromWalletId },
    });

    if (!senderWallet) {
      throw new Error('Кошелек отправителя не найден.');
    }

    // Преобразуем адрес отправителя в hex-формат
    const hexSenderAddress = this.tronWeb.address.toHex(senderWallet.address);

    // Устанавливаем параметры
    const options = {
      feeLimit: 1000000, // Лимит комиссии
      callValue: 0, // TRX не передается, только USDT
    };

    // Устанавливаем параметры функции
    const parameter = [
      { type: 'address', value: senderWallet.address }, // Адрес отправителя
      { type: 'uint256', value: amount * 1e6 }, // Сумма в минимальных единицах USDT
    ];

    // Симулируем вызов функции `transfer` для оценки комиссии
    let transferData;
    try {
      transferData = await this.tronWeb.transactionBuilder.triggerSmartContract(
        this.usdtContractAddress, // Адрес смарт-контракта
        'transfer(address,uint256)', // Имя функции
        options, // Параметры транзакции
        parameter, // Параметры функции
        hexSenderAddress, // owner_address в hex-формате
      );
      this.logger.log(
        `[calculateTransactionFee] Симуляция успешна, данные: ${JSON.stringify(transferData)}`,
      );
    } catch (err) {
      this.logger.error(
        `[calculateTransactionFee] Ошибка при симуляции транзакции: ${err}`,
      );
      throw new Error(`Ошибка при симуляции транзакции: ${err}`);
    }

    // Проверка результата симуляции
    if (!transferData || !transferData.result || !transferData.result.result) {
      throw new Error('Не удалось симулировать транзакцию.');
    }

    // Получаем лимит комиссии (feeLimit) из данных транзакции
    const feeLimit = transferData.transaction.raw_data.fee_limit;
    if (typeof feeLimit === 'undefined') {
      throw new Error('Не удалось получить данные о лимите комиссии.');
    }

    // Переводим лимит комиссии в TRX
    const feeInTrx = feeLimit / 1e6; // TRX имеет 6 знаков после запятой

    this.logger.log(
      `[calculateTransactionFee] Оцененная комиссия: ${feeInTrx} TRX`,
    );

    return { feeInTrx };
  }
}

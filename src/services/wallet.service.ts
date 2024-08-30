import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import TronWeb from 'tronweb';
import * as crypto from 'crypto';

@Injectable()
export class WalletService {
  private tronWeb: TronWeb;

  constructor(private readonly prisma: PrismaService) {
    this.tronWeb = new TronWeb({
      fullHost: 'https://api.trongrid.io',
    });
  }

  // Метод для шифрования приватного ключа
  encryptPrivateKey(privateKey: string): string {
    const algorithm = 'aes-256-cbc';
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const encryptionData = {
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      encryptedPrivateKey: encrypted,
    };

    return JSON.stringify(encryptionData);
  }

  decryptPrivateKey(encryptedData: string): string {
    const algorithm = 'aes-256-cbc';
    const encryptionData = JSON.parse(encryptedData);
    const key = Buffer.from(encryptionData.key, 'hex');
    const iv = Buffer.from(encryptionData.iv, 'hex');
    const encryptedPrivateKey = encryptionData.encryptedPrivateKey;

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedPrivateKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Метод для создания нового TRON кошелька
  async createTronWallet(userId: number) {
    try {
      const account = await this.tronWeb.createAccount();
      const address = account.address.base58;
      const privateKey = account.privateKey;

      const encryptedPrivateKey = this.encryptPrivateKey(privateKey);

      const createdWallet = await this.prisma.wallet.create({
        data: {
          userId: userId,
          address: address,
          privateKey: encryptedPrivateKey,
          blockchain: 'TRON',
          createdAt: new Date(),
        },
      });

      return createdWallet;
    } catch (err) {
      throw new Error(
        `Ошибка при создании TRON кошелька для пользователя ${userId}: ${err.message}`,
      );
    }
  }

  // Метод для получения баланса TRX
  async getTRXBalance(walletAddress: string): Promise<string> {
    try {
      const balanceInSun = await this.tronWeb.trx.getBalance(walletAddress);
      return this.tronWeb.fromSun(balanceInSun);
    } catch (error) {
      throw new Error(
        `Ошибка при получении баланса TRX для кошелька ${walletAddress}: ${error.message}`,
      );
    }
  }

  // Метод для вычисления баланса USDT на основе транзакций
  async calculateUSDTBalance(walletId: number): Promise<number> {
    const incoming = await this.prisma.transaction.aggregate({
      where: {
        toWalletId: walletId,
        currency: 'USDT',
        status: 'COMPLETED', // Учитываем только завершенные транзакции
      },
      _sum: {
        amount: true,
      },
    });

    const outgoing = await this.prisma.transaction.aggregate({
      where: {
        fromWalletId: walletId,
        currency: 'USDT',
      },
      _sum: {
        amount: true,
      },
    });

    return (incoming._sum.amount || 0) - (outgoing._sum.amount || 0);
  }

  // Метод для получения всех кошельков пользователя с актуальными балансами
  async getUserWalletsWithBalances(userId: number) {
    const wallets = await this.prisma.wallet.findMany({
      where: { userId },
    });

    if (!wallets || wallets.length === 0) {
      throw new Error(`Кошельки для пользователя с ID ${userId} не найдены`);
    }

    const walletsWithBalances = await Promise.all(
      wallets.map(async (wallet) => {
        // Получаем баланс в TRX
        const trxBalance = await this.getTRXBalance(wallet.address);
        // Рассчитываем баланс в USDT
        const usdtBalance = await this.calculateUSDTBalance(wallet.id);

        return {
          ...wallet,
          trxBalance, // Баланс в TRX как поле верхнего уровня
          usdtBalance, // Баланс в USDT как поле верхнего уровня
        };
      }),
    );

    return walletsWithBalances;
  }
  // Метод для получения баланса конкретного кошелька
  async getWalletBalance(id: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
    });

    if (!wallet) {
      throw new Error(`Кошелек с ID ${id} не найден`);
    }

    const trxBalance = await this.getTRXBalance(wallet.address);
    const usdtBalance = await this.calculateUSDTBalance(wallet.id);

    return {
      TRX: trxBalance,
      USDT: usdtBalance,
    };
  }
}

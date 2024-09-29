export async function executeTransfer(
  senderAddress: string,
  senderPrivateKey: string,
  recipientAddress: string,
  amount: number,
): Promise<{ transactionId: string; feeInUsdt: number }> {
  try {
    this.logger.log(
      `[executeTransfer] Новый Старт перевода USDT. Отправитель: ${senderAddress}, Получатель: ${recipientAddress}, Сумма: ${amount}`,
    );

    const derivedAddress =
      this.tronWeb.address.fromPrivateKey(senderPrivateKey);
    if (derivedAddress !== senderAddress) {
      this.logger.error(
        `[executeTransfer] Приватный ключ не соответствует адресу отправителя.`,
      );
      this.logger.error(
        `[executeTransfer] Derived Address: ${derivedAddress}, Sender Address: ${senderAddress}`,
      );
      throw new Error('Приватный ключ не соответствует адресу отправителя.');
    } else {
      this.logger.log(
        `[executeTransfer] Приватный ключ соответствует адресу отправителя.`,
      );
    }

    // Получаем смарт-контракт USDT
    let contract;
    try {
      contract = await this.tronWeb.contract().at(this.usdtContractAddress);
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Ошибка на этапе получения контракта USDT: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: Contract Retrieval] Ошибка при получении контракта USDT: ${err.message + err}`,
      );
    }

    // Устанавливаем адрес отправителя
    this.tronWeb.setAddress(senderAddress);

    // Проверка баланса отправителя
    let senderBalance;
    try {
      senderBalance = await contract.balanceOf(senderAddress).call();
      this.logger.log(`[executeTransfer] Баланс отправителя: ${senderBalance}`);

      if (senderBalance < amount * 1e6) {
        throw new Error(
          '[Stage: Balance Check] Недостаточно средств на балансе для выполнения перевода.',
        );
      }
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Ошибка на этапе проверки баланса отправителя: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: Balance Check] Ошибка при проверке баланса отправителя: ${err.message + err}`,
      );
    }

    // Инициализация и отправка транзакции
    let transaction;
    try {
      transaction = await contract
        .transfer(recipientAddress, amount * 1e6)
        .send({
          feeLimit: 1000000,
          from: senderAddress,
        });
      this.logger.log(
        `[executeTransfer] Транзакция создана: ${JSON.stringify(transaction)}`,
      );
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Ошибка на этапе создания транзакции: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: Transaction Creation] Ошибка при создании транзакции: ${err.message + err}`,
      );
    }

    // Подписание транзакции
    let signedTransaction;
    try {
      signedTransaction = await this.tronWeb.trx.sign(
        transaction,
        senderPrivateKey,
      );
      this.logger.log(
        `[executeTransfer] Транзакция подписана: ${JSON.stringify(signedTransaction)}`,
      );
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Ошибка на этапе подписания транзакции: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: Transaction Signing] Ошибка при подписании транзакции: ${err.message + err}`,
      );
    }

    // Отправка подписанной транзакции
    let broadcast;
    try {
      broadcast = await this.tronWeb.trx.sendRawTransaction(signedTransaction);
      this.logger.log(
        `[executeTransfer] Транзакция отправлена. TxID: ${broadcast.txid}`,
      );

      if (!broadcast.result) {
        throw new Error('[Stage: Broadcast] Не удалось отправить транзакцию.');
      }
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Ошибка на этапе отправки транзакции: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: Broadcast] Ошибка при отправке транзакции: ${err.message + err}`,
      );
    }

    // Получение информации о транзакции
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
        `[executeTransfer] Ошибка на этапе получения информации о транзакции: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: Transaction Info] Ошибка при получении информации о транзакции: ${err.message + err}`,
      );
    }

    // Рассчитываем комиссию в TRX
    let feeInTrx;
    try {
      feeInTrx = transactionInfo.fee / 1e6;
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Ошибка на этапе расчета комиссии: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: Fee Calculation] Ошибка при расчете комиссии: ${err.message + err}`,
      );
    }

    // Получаем текущий курс TRX/USDT
    let usdtPerTrx;
    try {
      usdtPerTrx = await this.getTrxToUsdtRate();
      this.logger.log(`[executeTransfer] Курс TRX/USDT: ${usdtPerTrx}`);
    } catch (err) {
      this.logger.error(
        `[executeTransfer] Ошибка на этапе получения курса TRX/USDT: ${err.message + err}`,
      );
      throw new Error(
        `[Stage: TRX/USDT Rate] Ошибка при получении курса TRX/USDT: ${err.message + err}`,
      );
    }

    // Рассчитываем комиссию в USDT
    const feeInUsdt = feeInTrx * usdtPerTrx;

    // Возвращаем результат
    return {
      transactionId: broadcast.txid,
      feeInUsdt: feeInUsdt,
    };
  } catch (err) {
    this.logger.error(
      `[executeTransfer] Общая ошибка при переводе USDT: ${err.message + err}`,
    );
    throw new Error(
      `[Final Error] Ошибка при переводе USDT: ${err.message + err}`,
    );
  }
}

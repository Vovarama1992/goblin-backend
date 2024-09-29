declare module 'tronweb' {
  import { AxiosRequestConfig } from 'axios';

  export interface TronWebOptions {
    fullHost: string;
    privateKey?: string;
    headers?: AxiosRequestConfig['headers'];
  }

  export interface Account {
    address: {
      base58: string;
      hex: string;
    };
    privateKey: string;
    publicKey: string;
  }

  export interface Transaction {
    txID: string;
    raw_data: {
      contract: {
        parameter: {
          value: {
            amount: number;
            owner_address: string;
            to_address: string;
          };
        };
      }[];
    };
  }

  export class Contract {
    [x: string]: any;
    transfer(
      to: string,
      amount: number,
    ): {
      send(options: { feeLimit: number; from: string }): Promise<Transaction>;
    };
  }

  export class Trx {
    sign(transaction: Transaction, privateKey: string): Promise<Transaction>;
    sendRawTransaction(
      signedTransaction: Transaction,
    ): Promise<{ result: boolean; txid: string }>;
    getTransactionInfo(transactionID: string): Promise<{ fee: number }>;
    getBalance(address: string): Promise<number>;
    getTokenBalances(address: string): Promise<Record<string, string>>;
  }

  export class TronWeb {
    [x: string]: any;
    transactionBuilder: any;
    constructor(options: TronWebOptions);
    createAccount(): Promise<Account>;
    contract(): {
      at(address: string): Promise<Contract>;
    };
    trx: Trx;
    fromSun(sun: number): string;
  }

  export default TronWeb;
}

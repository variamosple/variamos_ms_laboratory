export class ResponseModel<Type> {
  constructor(
    public transactionId?: string,
    public errorCode?: number,
    public message?: string,
    public totalCount?: number,
    public data?: Type
  ) {}

  withError(errorCode: number, errorMessage: string) {
    this.errorCode = errorCode;
    this.message = errorMessage;
  }
}

export class RequestModel<Request> {
  constructor(public transactionId?: string, public data?: Request) {}
}

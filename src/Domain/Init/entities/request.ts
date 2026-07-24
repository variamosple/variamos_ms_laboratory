export class RequestAPI {
  transactionId?: string;
  data?: object;
  constructor(transactionId?: string, data?: object) {
    this.transactionId = transactionId;
    this.data = data;
  }
}

export const RequestApiSchema = {
  type: "object",
  properties: {
    transactionId: { type: "string" },
    data: { type: "object" },
    user: { type: "string" },
  },
  required: ["transactionId", "data"],
  additionalProperties: false,
};

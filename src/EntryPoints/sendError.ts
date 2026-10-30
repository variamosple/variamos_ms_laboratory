import { Response } from "express";
import { AppError } from "../Domain/Core/Entities/Errors";
import { ResponseModel } from "../Domain/Core/Entities/ResponseModel";

/** Sends an AppError with its status, and any other error as a 500 without its details. */
export function sendError(res: Response, transactionId: string, error: unknown) {
  if (error instanceof AppError) {
    const body = new ResponseModel(transactionId, error.status, error.message);
    return res.status(error.status).json(
      error.details ? { ...body, details: error.details } : body
    );
  }

  console.error(`${transactionId}:`, error);
  return res
    .status(500)
    .json(new ResponseModel(transactionId, 500, "Internal Server Error"));
}

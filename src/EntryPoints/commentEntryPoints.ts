import { Router } from "express";
import { isAuthenticated } from "@variamosple/variamos-security";
import CommentRepository from "../DataProviders/repository/Laboratory/CommentRepository";
import { sendError } from "./sendError";

/** LAB-COL-03: comments of an experiment, under /experiments/:id/comments. */
const router = Router({ mergeParams: true });
const comments = new CommentRepository();

export const COMMENTS_ROUTE = "/experiments/:id/comments";

router.get("/", isAuthenticated, async (req, res) => {
  try {
    res.json(await comments.list(req.params.id, req.user?.id!));
  } catch (error) {
    sendError(res, "listComments", error);
  }
});

router.post("/", isAuthenticated, async (req, res) => {
  try {
    res.status(201).json(await comments.add(req.params.id, req.body ?? {}, req.user?.id!));
  } catch (error) {
    sendError(res, "addComment", error);
  }
});

router.put("/:commentId", isAuthenticated, async (req, res) => {
  try {
    res.json(await comments.edit(req.params.id, req.params.commentId, req.body ?? {}, req.user?.id!));
  } catch (error) {
    sendError(res, "editComment", error);
  }
});

router.delete("/:commentId", isAuthenticated, async (req, res) => {
  try {
    res.json(await comments.remove(req.params.id, req.params.commentId, req.user?.id!));
  } catch (error) {
    sendError(res, "deleteComment", error);
  }
});

export default router;

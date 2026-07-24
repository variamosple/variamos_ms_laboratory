import { Router } from "express";
import ExperimentUseCase from "../Domain/Laboratory/ExperimentUseCase";
import { isAuthenticated } from "@variamosple/variamos-security";
import { ExperimentDetailed } from "../Domain/Laboratory/Entities/Experiment";
import { ExperimentFilter } from "../Domain/Laboratory/Entities/ExperimentFilter";

import { RequestModel } from "../Domain/Core/Entities/RequestModel";
import { ResponseModel } from "../Domain/Core/Entities/ResponseModel";

const router = Router();
const experimentUseCase = new ExperimentUseCase();

export const EXPERIMENTS_ROUTE = "/experiments";

router.get("/", isAuthenticated, async (req, res) => {
  const transactionId = "getUserExperiments";

  const { pageNumber, pageSize, name = null,  } = req.query;

  try {
    console.log("req.user =", req.user);
    console.log("req.user.id =", req.user?.id);
    const filter = ExperimentFilter.builder()
      .setUserId(req.user?.id!)
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<ExperimentFilter>(
      transactionId,
      filter
    );

    const response =
      await experimentUseCase.getUserExperiments(request);

    res.status(response.errorCode || 200).json(response);

  } catch (error) {
    console.error("Error:", error);

    res.status(500).json(
      new ResponseModel(transactionId, 500, "Internal Server Error")
    );
  }
});

router.get("/shared", isAuthenticated, async (req, res) => {
  const transactionId = "getSharedExperiments";

  const { pageNumber, pageSize, name = null } = req.query;

  try {
    const filter = ExperimentFilter.builder()
      .setUserId(req.user?.id!)
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<ExperimentFilter>(
      transactionId,
      filter
    );

    const response =
      await experimentUseCase.getSharedExperiments(request);

    res.status(response.errorCode || 200).json(response);

  } catch (error) {
    console.error("Error:", error);

    res.status(500).json(
      new ResponseModel(transactionId, 500, "Internal Server Error")
    );
  }
});

router.get("/groups", isAuthenticated, async (req, res) => {
  const transactionId = "getGroupExperiments";

  const { pageNumber, pageSize, name = null } = req.query;

  try {
    const filter = ExperimentFilter.builder()
      .setUserId(req.user?.id!)
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<ExperimentFilter>(
      transactionId,
      filter
    );

    const response =
      await experimentUseCase.getGroupExperiments(request);

    res.status(response.errorCode || 200).json(response);

  } catch (error) {
    console.error("Error:", error);

    res.status(500).json(
      new ResponseModel(transactionId, 500, "Internal Server Error")
    );
  }
});

router.get("/templates", isAuthenticated, async (req, res) => {
  const transactionId = "getTemplateExperiments";

  const { pageNumber, pageSize, name = null } = req.query;

  try {
    const filter = ExperimentFilter.builder()
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<ExperimentFilter>(
      transactionId,
      filter
    );

    const response =
      await experimentUseCase.getTemplateExperiments(request);

    res.status(response.errorCode || 200).json(response);

  } catch (error) {
    console.error("Error:", error);

    res.status(500).json(
      new ResponseModel(transactionId, 500, "Internal Server Error")
    );
  }
});

router.get("/benchmarks", isAuthenticated, async (req, res) => {
  const transactionId = "getTemplateBenchmarks";

  const { pageNumber, pageSize, name = null } = req.query;

  try {
    const filter = ExperimentFilter.builder()
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<ExperimentFilter>(
      transactionId,
      filter
    );

    const response =
      await experimentUseCase.getTemplateBenchmarks(request);

    res.status(response.errorCode || 200).json(response);

  } catch (error) {
    console.error("Error:", error);

    res.status(500).json(
      new ResponseModel(transactionId, 500, "Internal Server Error")
    );
  }
});

router.get("/archived", isAuthenticated, async (req, res) => {
  const transactionId = "getArchivedExperiments";

  const { pageNumber, pageSize, name = null } = req.query;

  try {
    const filter = ExperimentFilter.builder()
      .setUserId(req.user?.id!)
      .setName(name as string)
      .setPageNumber(pageNumber as unknown as number)
      .setPageSize(pageSize as unknown as number)
      .build();

    const request = new RequestModel<ExperimentFilter>(
      transactionId,
      filter
    );

    const response =
      await experimentUseCase.getArchivedExperiments(request);

    res.status(response.errorCode || 200).json(response);

  } catch (error) {
    console.error("Error:", error);

    res.status(500).json(
      new ResponseModel(transactionId, 500, "Internal Server Error")
    );
  }
});

router.post("/", isAuthenticated, async (req, res) => {
  const transactionId = "createExperiment";

  try {
    const experiment = req.body as ExperimentDetailed;

    const created = await experimentUseCase.saveExperiment(
      experiment,
      req.user?.id!
    );

    res.status(201).json(created);

  } catch (error) {
    console.error("Error:", error);

    res.status(500).json(
      new ResponseModel(transactionId, 500, "Internal Server Error")
    );
  }
});

router.get("/:id/detailed", isAuthenticated, async (req, res) => {
  try {
    const experiment = await experimentUseCase.getExperimentDetailed(req.params.id, req.user?.id!);

    if (!experiment) {
      return res.status(404).json({
        message: "Experiment not found",
      });
    }
    res.status(200).json(experiment);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

router.put("/:id/archive", isAuthenticated, async (req, res) => {
  try {
    const experiment = await experimentUseCase.archiveExperiment(req.params.id, req.user?.id!);

    res.status(200).json(experiment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


router.put("/:id/restore", isAuthenticated, async (req, res) => {
  try {
    const experiment = await experimentUseCase.restoreExperiment(req.params.id, req.user?.id!);

    res.status(200).json(experiment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.put("/:id", isAuthenticated, async (req, res) => {
    try {
        const experiment: ExperimentDetailed = {
            ...req.body,
            id: req.params.id,
        }
        console.log("Updating experiment id:", experiment.id);
        const updatedExperiment = await experimentUseCase.updateExperiment(experiment, req.user?.id!);
        res.status(200).json(updatedExperiment);
    } catch (error) {
        console.error("Error updating experiment:", error);

        res.status(500).json({
            message: "Failed to update experiment.",
            error,
        });
    }
});

router.post("/:id/share", isAuthenticated, async (req, res) => {
  try {
    const {
      userEmail,
      role,
    } = req.body;

    const result = await experimentUseCase.shareExperiment(
      req.params.id,
      userEmail,
      role,
      req.user?.id!
    );

    res.status(200).json(result);

  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

router.post("/:id/copy", isAuthenticated, async (req, res) => {
  try {
    const experiment = await experimentUseCase.copyExperiment(
      req.params.id,
      req.user?.id!
    );

    res.status(201).json(experiment);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

router.post("/:id/publish/template", isAuthenticated, async (req, res) => {
    try {
        const experiment = await experimentUseCase.publishAsTemplate(
            req.params.id,
            req.user!.id
        );

        res.status(200).json(experiment);
    } catch (error: any) {
        console.error(error);

        res.status(400).json({
            message: error.message,
        });
    }
});

router.post("/:id/publish/benchmark", isAuthenticated, async (req, res) => {
    try {
        const experiment = await experimentUseCase.publishAsBenchmark(
            req.params.id,
            req.user!.id
        );

        res.status(200).json(experiment);
    } catch (error: any) {
        console.error(error);

        res.status(400).json({
            message: error.message,
        });
    }
});

router.delete("/:id", isAuthenticated, async (req, res) => {
  try {
    await experimentUseCase.deleteExperiment(req.params.id, req.user?.id!);
    res.status(200).json({ message: "Experiment deleted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/:id/history", isAuthenticated, async (req, res) => {
  try {
    const history = await experimentUseCase.getExperimentHistory(req.params.id, req.user?.id!);
    res.status(200).json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/:id/version/:version", isAuthenticated, async (req, res) => {
  try {
    const version = parseInt(req.params.version, 10);
    const experimentVersion = await experimentUseCase.getExperimentVersion(req.params.id, version);
    res.status(200).json(experimentVersion);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/:id/version/:version/restore", isAuthenticated, async (req, res) => {
  try {
    const version = parseInt(req.params.version, 10);
    const restoredExperiment = await experimentUseCase.restoreExperimentVersion(req.params.id, version, req.user?.id!);
    res.status(200).json(restoredExperiment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/:id/collaborators", isAuthenticated, async (req, res) => {
  try {
    const collaborators = await experimentUseCase.getCollaborators(req.params.id, req.user?.id!);
    res.status(200).json(collaborators);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/:id/collaborators/:collaboratorId", isAuthenticated, async (req, res) => {
  try {
    await experimentUseCase.removeCollaborator(req.params.id, req.params.collaboratorId, req.user?.id!);
    res.status(200).json({ message: "Collaborator removed successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
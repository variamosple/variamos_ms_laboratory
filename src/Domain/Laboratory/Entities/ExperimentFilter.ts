import { PagedModel } from "../../Core/Entities/PagedModel";

export class ExperimentFilter extends PagedModel {
  constructor(
    public userId?: string,
    public name?: string,
    pageNumber?: number,
    pageSize?: number,
    public projectId?: string,
    /** LAB-COL-04 filters */
    public researcher?: string,
    public status?: string,
    public createdFrom?: string,
    public createdTo?: string,
    public type?: "experiment" | "template" | "benchmark"
  ) {
    super(pageNumber, pageSize);
  }

  public static builder(): ExperimentFilterBuilder {
    return new ExperimentFilterBuilder();
  }

  public static build(builder: ExperimentFilterBuilder): ExperimentFilter {
    return new ExperimentFilter(
      builder.userId,
      builder.name,
      builder.pageNumber,
      builder.pageSize,
      builder.projectId,
      builder.researcher,
      builder.status,
      builder.createdFrom,
      builder.createdTo,
      builder.type
    );
  }
}

class ExperimentFilterBuilder {
  public userId?: string;
  public name?: string;
  public pageNumber?: number;
  public pageSize?: number;
  public projectId?: string;
  public researcher?: string;
  public status?: string;
  public createdFrom?: string;
  public createdTo?: string;
  public type?: "experiment" | "template" | "benchmark";

  public setUserId(userId: string): ExperimentFilterBuilder {
    this.userId = userId;
    return this;
  }

  public setName(name: string): ExperimentFilterBuilder {
    this.name = name;
    return this;
  }

  public setPageNumber(pageNumber: number): ExperimentFilterBuilder {
    this.pageNumber = pageNumber;
    return this;
  }

  public setPageSize(pageSize: number): ExperimentFilterBuilder {
    this.pageSize = pageSize;
    return this;
  }

  public setProjectId(projectId?: string): ExperimentFilterBuilder {
    this.projectId = projectId;
    return this;
  }

  public setFilters(filters: Pick<ExperimentFilterBuilder, "researcher" | "status" | "createdFrom" | "createdTo" | "type">): ExperimentFilterBuilder {
    Object.assign(this, filters);
    return this;
  }

  public build(): ExperimentFilter {
    return ExperimentFilter.build(this);
  }
}

import { PagedModel } from "../../Core/Entities/PagedModel";

export class ExperimentFilter extends PagedModel {
  constructor(
    public userId?: string,
    public name?: string,
    pageNumber?: number,
    pageSize?: number
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
      builder.pageSize
    );
  }
}

class ExperimentFilterBuilder {
  public userId?: string;
  public name?: string;
  public pageNumber?: number;
  public pageSize?: number;

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

  public build(): ExperimentFilter {
    return ExperimentFilter.build(this);
  }
}

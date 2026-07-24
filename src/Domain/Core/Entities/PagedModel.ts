export class PagedModel {
  constructor(
    public pageNumber: number | null = 1,
    public pageSize: number | null = 20
  ) {}
}

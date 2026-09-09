export type JobListFilters = {
  status?: string;
  search?: string;
};

export type SmartBackState = {
  from?: string;
  filters?: JobListFilters;
};

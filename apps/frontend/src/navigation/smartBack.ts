export type JobListFilters = {
  status?: string;
  search?: string;
};

export type DictionaryListState = {
  dsn: string;
  schema: string;
  table: string;
  autoSaveCatalog: boolean;
};

export type SmartBackState = {
  from?: string;
  filters?: JobListFilters;
  dictionary?: DictionaryListState;
  dictionaryPanel?: unknown;
  compare?: unknown;
};

export type PresentationPropertySnapshot = {
  id: string;
  memberIds?: string[];
  outcome?: string;
  reductionBasis?: "rent" | "imu";
  societa: string;
  comune: string;
  indirizzo: string;
  foglioParticellaSub: string;
  categoria: string;
  renditaAttuale: number;
  renditaAttribuibile: number;
  imuAttuale: number | null;
  imuOttenibile: number | null;
};

export type PresentationPropertyInput = PresentationPropertySnapshot;

export type PresentationSnapshot = {
  version: 1 | 2 | 3;
  generatedAt: string;
  studio: {
    id: string;
    company: string;
    vat: string;
    comune: string;
    provincia: string;
    commercialOwner: string;
    technicalOwner: string;
  };
  immobili: PresentationPropertySnapshot[];
  // Frozen display rows; individual sources remain intact for totals and history.
  tableRows?: PresentationPropertySnapshot[];
  // Absent on historical decks: do not reinterpret their original totals.
  optimizationValue?: number;
  // Preserve historical all-IMU/legacy rent decks; new decks freeze each row's choice.
  reductionBasis?: "imu" | "per-row";
};

export type PresentationSummary = {
  id: string;
  version: 1 | 2 | 3;
  studyId: string | null;
  studyGroupId: string | null;
  propertyIds: string[];
  propertyCount: number;
  fileName: string;
  createdAt: string;
  htmlUrl: string | null;
  htmlDownloadUrl: string | null;
  pdfUrl: string;
};

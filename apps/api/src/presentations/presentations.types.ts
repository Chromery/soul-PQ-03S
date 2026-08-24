export type PresentationPropertySnapshot = {
  id: string;
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
};

export type PresentationSummary = {
  id: string;
  version: 1 | 2 | 3;
  studyId: string;
  propertyIds: string[];
  propertyCount: number;
  fileName: string;
  createdAt: string;
  htmlUrl: string | null;
  htmlDownloadUrl: string | null;
  pdfUrl: string;
};

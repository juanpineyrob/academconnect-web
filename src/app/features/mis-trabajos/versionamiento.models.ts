export interface DocumentoMini {
  id: number;
  nombreOriginal: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

export interface Versionamiento {
  id: number;
  trabajoId: number;
  numeroVersion: number;
  comentario: string | null;
  documento: DocumentoMini;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt: string | null;
  deletedBy: string | null;
}

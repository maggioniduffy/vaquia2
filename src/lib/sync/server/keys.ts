import { ATTACHMENT_EXT, type ATTACHMENT_MIMES } from "../envelope";

// Server-built storage keys (never taken from the client). They match the check constraints on
// signatures.image_path / attachments.path and the shapes /api/files authorizes.

export const signatureKey = (companyId: string, id: string) => `${companyId}/signatures/${id}.png`;

export const attachmentKey = (
  companyId: string,
  recordId: string,
  id: string,
  mime: (typeof ATTACHMENT_MIMES)[number],
) => `${companyId}/records/${recordId}/${id}.${ATTACHMENT_EXT[mime]}`;

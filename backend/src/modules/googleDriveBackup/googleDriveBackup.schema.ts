import { z } from 'zod';

// Only the user-controllable toggles may be written via the API. System-managed
// fields (connected, folderId, lastUpload*) are set by the app, never the client.
export const UpdateConfigSchema = z.object({
  enabled:                 z.boolean().optional(),
  uploadAfterManualBackup: z.boolean().optional(),
  uploadAfterAutoBackup:   z.boolean().optional(),
});

export type UpdateConfigInput = z.infer<typeof UpdateConfigSchema>;

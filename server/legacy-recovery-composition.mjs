// Explicit source-only composition of the recovered Brandicade auth/save modules.
// No production binding, route or configured identity is exported by this file.
import { createAccessRoleAuthorizer } from './access-roles.mjs';
import { createLegacyD1Reader } from './legacy-d1-readonly.mjs';
import { createLegacyD1Writer } from './legacy-d1-writer.mjs';
import { createLegacyWriteCandidateAPI } from './legacy-api-write-candidate.mjs';

export function createLegacyRecoveryAPI({
  db, access, playerRecordKey, expectedProfileName, writeEnabled = false,
} = {}) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new TypeError('Transactional D1 binding required');
  }
  if (!access || typeof access !== 'object' || Array.isArray(access)) {
    throw new TypeError('Trusted Access configuration required');
  }
  if (typeof writeEnabled !== 'boolean') {
    throw new TypeError('Explicit boolean write gate required');
  }
  const authorize = createAccessRoleAuthorizer({
    ...access,
    playerDisplayName: expectedProfileName,
  });
  const repository = createLegacyD1Reader(db, { playerRecordKey });
  const writer = createLegacyD1Writer(db, { playerRecordKey, expectedProfileName });
  return createLegacyWriteCandidateAPI({ authorize, repository, writer, writeEnabled });
}

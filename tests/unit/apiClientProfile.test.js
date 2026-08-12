import { describe, expect, it } from 'vitest';
import { apiClientProfile } from '../../lib/apiClientStore.js';

describe('apiClientProfile requested role', () => {
  const client = { id: 'scan', name: 'Scan', roles: ['*'], scopes: ['*'] };

  it('selects an explicitly requested role when the key and handler allow it', () => {
    expect(apiClientProfile(client, ['sales', 'store', 'pack'], 'store').role).toBe('store');
    expect(apiClientProfile(client, ['sales', 'store', 'pack'], 'pack').role).toBe('pack');
  });

  it('rejects a requested role outside the handler allowlist', () => {
    expect(() => apiClientProfile(client, ['sales', 'store'], 'driver')).toThrow('Forbidden');
  });

  it('rejects a role not granted to a restricted key', () => {
    expect(() => apiClientProfile({ ...client, roles: ['sales'] }, ['sales', 'store'], 'store')).toThrow('Forbidden');
  });
});

/*
 * Copyright 2024 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  jest,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
} from '@jest/globals';
import type { LdapClientConfig } from './types';
import type { authenticateWithLdap as AuthFn } from './ldapClient';

// Mock ldapts Client
const mockBind = jest.fn<(...args: any[]) => any>();
const mockUnbind = jest.fn<(...args: any[]) => any>();
const mockSearch = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('ldapts', () => ({
  Client: jest.fn<any>().mockImplementation(() => ({
    bind: mockBind,
    unbind: mockUnbind,
    search: mockSearch,
  })),
}));

let authenticateWithLdap: typeof AuthFn;

beforeAll(async () => {
  const mod = await import('./ldapClient');
  authenticateWithLdap = mod.authenticateWithLdap;
});

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn<any>().mockReturnThis(),
} as any;

const defaultConfig: LdapClientConfig = {
  url: 'ldaps://ldap.example.com:636',
  bindDN: 'cn=service,dc=example,dc=org',
  bindCredentials: 'service-password',
  searchBase: 'ou=users,dc=example,dc=org',
  usernameAttribute: 'uid',
  searchFilter: '(uid={{username}})',
  userAttributes: ['mail', 'displayName', 'memberOf'],
  tls: { rejectUnauthorized: true },
};

describe('authenticateWithLdap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUnbind.mockResolvedValue(undefined);
  });

  it('should authenticate a valid user', async () => {
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({
      searchEntries: [
        {
          dn: 'uid=jdoe,ou=users,dc=example,dc=org',
          uid: 'jdoe',
          mail: 'jdoe@example.com',
          displayName: 'John Doe',
          memberOf: ['cn=developers,ou=groups,dc=example,dc=org'],
        },
      ],
    });

    const result = await authenticateWithLdap(
      'jdoe',
      'correct-password',
      defaultConfig,
      mockLogger,
    );

    expect(result).toEqual({
      dn: 'uid=jdoe,ou=users,dc=example,dc=org',
      uid: 'jdoe',
      displayName: 'John Doe',
      email: 'jdoe@example.com',
      memberOf: ['cn=developers,ou=groups,dc=example,dc=org'],
      attributes: {
        mail: 'jdoe@example.com',
        displayName: 'John Doe',
        memberOf: ['cn=developers,ou=groups,dc=example,dc=org'],
      },
    });

    // Service account bind + user bind
    expect(mockBind).toHaveBeenCalledTimes(2);
    expect(mockBind).toHaveBeenNthCalledWith(
      1,
      'cn=service,dc=example,dc=org',
      'service-password',
    );
    expect(mockBind).toHaveBeenNthCalledWith(
      2,
      'uid=jdoe,ou=users,dc=example,dc=org',
      'correct-password',
    );
  });

  it('should throw when user is not found in LDAP', async () => {
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({ searchEntries: [] });

    await expect(
      authenticateWithLdap('unknown', 'pass', defaultConfig, mockLogger),
    ).rejects.toThrow("User 'unknown' not found in LDAP directory");
  });

  it('should throw when user password is incorrect', async () => {
    mockBind
      .mockResolvedValueOnce(undefined) // service bind OK
      .mockRejectedValueOnce(new Error('Invalid credentials')); // user bind fails

    mockSearch.mockResolvedValue({
      searchEntries: [
        {
          dn: 'uid=jdoe,ou=users,dc=example,dc=org',
          uid: 'jdoe',
        },
      ],
    });

    await expect(
      authenticateWithLdap('jdoe', 'wrong-password', defaultConfig, mockLogger),
    ).rejects.toThrow("Invalid credentials for user 'jdoe'");
  });

  it('should warn when multiple users are found', async () => {
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({
      searchEntries: [
        { dn: 'uid=jdoe,ou=users,dc=example,dc=org', uid: 'jdoe' },
        { dn: 'uid=jdoe2,ou=users,dc=example,dc=org', uid: 'jdoe' },
      ],
    });

    await authenticateWithLdap('jdoe', 'password', defaultConfig, mockLogger);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Multiple users found'),
    );
  });

  it('should work without service account bind (anonymous)', async () => {
    const anonConfig = {
      ...defaultConfig,
      bindDN: undefined,
      bindCredentials: undefined,
    };
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({
      searchEntries: [
        { dn: 'uid=jdoe,ou=users,dc=example,dc=org', uid: 'jdoe' },
      ],
    });

    await authenticateWithLdap('jdoe', 'pass', anonConfig, mockLogger);

    // Only user bind, no service account bind
    expect(mockBind).toHaveBeenCalledTimes(1);
    expect(mockBind).toHaveBeenCalledWith(
      'uid=jdoe,ou=users,dc=example,dc=org',
      'pass',
    );
  });

  it('should escape special LDAP filter characters in username', async () => {
    mockBind.mockResolvedValue(undefined);
    mockSearch.mockResolvedValue({
      searchEntries: [
        { dn: 'uid=test,ou=users,dc=example,dc=org', uid: 'test' },
      ],
    });

    await authenticateWithLdap('user*name', 'pass', defaultConfig, mockLogger);

    expect(mockSearch).toHaveBeenCalledWith(
      'ou=users,dc=example,dc=org',
      expect.objectContaining({
        filter: expect.stringContaining('\\2a'),
      }),
    );
  });
});

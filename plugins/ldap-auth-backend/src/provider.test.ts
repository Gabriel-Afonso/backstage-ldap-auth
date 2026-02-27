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
import type { createLdapProviderFactory as FactoryFn } from './provider';

// Set up mocks before importing provider
const mockAuthenticateWithLdap = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('./ldapClient', () => ({
  authenticateWithLdap: mockAuthenticateWithLdap,
}));

let createLdapProviderFactory: typeof FactoryFn;

beforeAll(async () => {
  const mod = await import('./provider');
  createLdapProviderFactory = mod.createLdapProviderFactory;
});

const mockConfig = {
  getString: jest.fn<(...args: any[]) => any>((key: string) => {
    const values: Record<string, string> = {
      url: 'ldaps://ldap.example.com:636',
      searchBase: 'ou=users,dc=example,dc=org',
    };
    return values[key];
  }),
  getOptionalString: jest.fn<(...args: any[]) => any>((key: string) => {
    const values: Record<string, string> = {
      bindDN: 'cn=service,dc=example,dc=org',
      bindCredentials: 'password',
    };
    return values[key] ?? undefined;
  }),
  getOptionalStringArray: jest.fn<(...args: any[]) => any>(() => [
    'mail',
    'displayName',
    'memberOf',
  ]),
  getOptionalBoolean: jest.fn<(...args: any[]) => any>(() => true),
} as any;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn<any>().mockReturnThis(),
} as any;

const mockResolverContext = {
  signInWithCatalogUser: jest.fn<(...args: any[]) => any>().mockResolvedValue({
    token: 'backstage-token-123',
    identity: {
      type: 'user',
      userEntityRef: 'user:default/jdoe',
      ownershipEntityRefs: ['user:default/jdoe'],
    },
  }),
} as any;

describe('createLdapProviderFactory', () => {
  let handlers: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const factory = createLdapProviderFactory({
      signInResolverFactories: {},
    });
    handlers = factory({
      config: mockConfig,
      logger: mockLogger,
      resolverContext: mockResolverContext,
      appUrl: 'http://localhost:3000',
      providerId: 'ldap',
      baseUrl: 'http://localhost:7007',
      isOriginAllowed: () => true,
    } as any);
  });

  describe('frameHandler', () => {
    it('should authenticate and return backstage identity', async () => {
      mockAuthenticateWithLdap.mockResolvedValue({
        dn: 'uid=jdoe,ou=users,dc=example,dc=org',
        uid: 'jdoe',
        displayName: 'John Doe',
        email: 'jdoe@example.com',
        memberOf: ['cn=devs,ou=groups,dc=example,dc=org'],
        attributes: {},
      });

      const req = {
        method: 'POST',
        body: { username: 'jdoe', password: 'pass' },
      } as any;
      const res = {
        status: jest.fn<any>().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await handlers.frameHandler(req, res);

      expect(mockAuthenticateWithLdap).toHaveBeenCalledWith(
        'jdoe',
        'pass',
        expect.any(Object),
        mockLogger,
      );
      expect(mockResolverContext.signInWithCatalogUser).toHaveBeenCalledWith({
        entityRef: { name: 'jdoe' },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          backstageIdentity: expect.objectContaining({
            token: 'backstage-token-123',
          }),
        }),
      );
    });

    it('should return 400 if username is missing', async () => {
      const req = { method: 'POST', body: { password: 'pass' } } as any;
      const res = {
        status: jest.fn<any>().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await handlers.frameHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing username or password in request body',
      });
    });

    it('should return 400 if password is missing', async () => {
      const req = { method: 'POST', body: { username: 'jdoe' } } as any;
      const res = {
        status: jest.fn<any>().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await handlers.frameHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should handle LDAP authentication errors', async () => {
      mockAuthenticateWithLdap.mockRejectedValue(
        new Error('Invalid credentials for user jdoe'),
      );

      const req = {
        method: 'POST',
        body: { username: 'jdoe', password: 'wrong' },
      } as any;
      const res = {
        status: jest.fn<any>().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await handlers.frameHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'AuthenticationError',
          }),
        }),
      );
    });

    it('should return 405 for GET requests', async () => {
      const req = { method: 'GET' } as any;
      const res = {
        status: jest.fn<any>().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await handlers.frameHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
    });
  });

  describe('start', () => {
    it('should return 405', async () => {
      const req = {} as any;
      const res = {
        status: jest.fn<any>().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await handlers.start(req, res);
      expect(res.status).toHaveBeenCalledWith(405);
    });
  });

  describe('logout', () => {
    it('should return 200', async () => {
      const req = {} as any;
      const res = {
        status: jest.fn<any>().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await handlers.logout(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});

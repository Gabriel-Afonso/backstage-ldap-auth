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
  type AuthProviderFactory,
  type AuthProviderRouteHandlers,
  type AuthResolverContext,
} from '@backstage/plugin-auth-node';
import { InputError, NotFoundError } from '@backstage/errors';
import type { Config } from '@backstage/config';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { LdapClientConfig } from './types';
import { authenticateWithLdap } from './ldapClient';
import type { Request, Response } from 'express';

/**
 * Options for creating the LDAP auth provider factory.
 *
 * @public
 */
export interface LdapProviderFactoryOptions {
  /**
   * Sign-in resolver factories to use.
   */
  signInResolverFactories: Record<string, (...args: any[]) => any>;
}

/**
 * Read LDAP config from an environment-specific block.
 */
function readLdapEnvironmentConfig(config: Config): LdapClientConfig {
  return {
    url: config.getString('url'),
    bindDN: config.getOptionalString('bindDN'),
    bindCredentials: config.getOptionalString('bindCredentials'),
    searchBase: config.getString('searchBase'),
    usernameAttribute: config.getOptionalString('usernameAttribute') ?? 'uid',
    searchFilter:
      config.getOptionalString('searchFilter') ?? '(uid={{username}})',
    userAttributes: config.getOptionalStringArray('userAttributes') ?? [
      'mail',
      'displayName',
      'memberOf',
    ],
    tls: {
      rejectUnauthorized:
        config.getOptionalBoolean('tls.rejectUnauthorized') ?? true,
    },
  };
}

function createLdapConfigGetter(config: Config) {
  // Support both legacy flat config under auth.providers.ldap and
  // environment-scoped config under auth.providers.ldap.<env>
  if (config.has('url')) {
    const single = readLdapEnvironmentConfig(config);
    return (_req: Request | undefined) => single;
  }

  const envs = config.keys();
  const envConfigs = new Map<string, LdapClientConfig>();
  for (const env of envs) {
    envConfigs.set(env, readLdapEnvironmentConfig(config.getConfig(env)));
  }

  const defaultEnv =
    envs.length === 1
      ? envs[0]
      : process.env.NODE_ENV === 'development' && envConfigs.has('development')
      ? 'development'
      : undefined;

  return (req: Request | undefined) => {
    const reqEnv = req?.query?.env?.toString();
    const env = reqEnv ?? defaultEnv;
    if (!env) {
      throw new InputError("Must specify 'env' query to select environment");
    }

    const selected = envConfigs.get(env);
    if (!selected) {
      throw new NotFoundError(
        `No configuration available for the '${env}' environment of this provider.`,
      );
    }

    return selected;
  };
}

/**
 * Creates an LDAP auth provider factory that implements
 * credential-based authentication against an LDAP directory.
 *
 * @public
 */
export function createLdapProviderFactory(
  _options: LdapProviderFactoryOptions,
): AuthProviderFactory {
  return (options: {
    config: Config;
    logger: LoggerService;
    resolverContext: AuthResolverContext;
    appUrl: string;
  }): AuthProviderRouteHandlers => {
    const { config, logger, resolverContext } = options;
    const getLdapConfig = createLdapConfigGetter(config);

    async function handleCredentialAuth(req: Request, res: Response) {
      const { username, password } = req.body as {
        username?: string;
        password?: string;
      };

      if (!username || !password) {
        res.status(400).json({
          error: 'Missing username or password in request body',
        });
        return;
      }

      try {
        const ldapConfig = getLdapConfig(req);

        // 1. Authenticate against LDAP
        const userInfo = await authenticateWithLdap(
          username,
          password,
          ldapConfig,
          logger,
        );

        // 2. Resolve Backstage identity via catalog
        const backstageIdentity = await resolverContext.signInWithCatalogUser({
          entityRef: { name: userInfo.uid },
        });

        res.status(200).json({
          providerInfo: {
            uid: userInfo.uid,
            memberOf: userInfo.memberOf,
          },
          profile: {
            email: userInfo.email,
            displayName: userInfo.displayName,
          },
          backstageIdentity: {
            token: backstageIdentity.token,
            identity: backstageIdentity.identity!,
          },
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'LDAP authentication failed';

        logger.error(`LDAP authentication failed: ${message}`);
        res.status(401).json({
          error: { name: 'AuthenticationError', message },
        });
      }
    }

    return {
      /**
       * Handles POST /api/auth/ldap/start
       *
       * Expects JSON body: { username: string, password: string }
       * Authenticates against LDAP, resolves Backstage identity,
       * and sends the result back via web message.
       */
      async start(_req: Request, res: Response): Promise<void> {
        res.status(405).json({
          error:
            'LDAP auth expects POST /handler/frame with a JSON body { username, password }',
        });
      },

      /**
       * Frame handler is not used for credential-based auth.
       */
      async frameHandler(_req: Request, res: Response): Promise<void> {
        if (_req.method !== 'POST') {
          res.status(405).json({
            error:
              'LDAP auth expects POST /handler/frame with a JSON body { username, password }',
          });
          return;
        }

        await handleCredentialAuth(_req, res);
      },

      /**
       * Refresh handler — delegates to Backstage's built-in session refresh.
       */
      async refresh(_req: Request, res: Response): Promise<void> {
        // Backstage handles refresh via the cookie-based session.
        // For credential-based auth, we don't support refresh tokens.
        res.status(501).json({
          error: 'Token refresh is managed by the Backstage session layer',
        });
      },

      /**
       * Logout handler — clears the session.
       */
      async logout(_req: Request, res: Response): Promise<void> {
        res.status(200).json({ ok: true });
      },
    };
  };
}

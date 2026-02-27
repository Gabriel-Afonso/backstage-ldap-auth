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

import { Client } from 'ldapts';
import type { LoggerService } from '@backstage/backend-plugin-api';
import type { LdapClientConfig, LdapUserInfo } from './types';

/**
 * Authenticates a user against an LDAP directory.
 *
 * Flow:
 * 1. Bind with service account credentials (or anonymous bind)
 * 2. Search for the user by username
 * 3. Re-bind with the found user's DN + submitted password
 * 4. Return user attributes
 *
 * @param username - The username submitted by the user
 * @param password - The password submitted by the user
 * @param config - LDAP connection and search configuration
 * @param logger - Backstage logger service
 * @returns The authenticated user's LDAP information
 * @throws Error if authentication fails
 *
 * @internal
 */
export async function authenticateWithLdap(
  username: string,
  password: string,
  config: LdapClientConfig,
  logger: LoggerService,
): Promise<LdapUserInfo> {
  const baseClientOptions: ConstructorParameters<typeof Client>[0] = {
    url: config.url,
  };
  if (config.url.startsWith('ldaps://')) {
    baseClientOptions.tlsOptions = {
      rejectUnauthorized: config.tls.rejectUnauthorized,
    };
  }

  const client = new Client(baseClientOptions);

  try {
    // Step 1: Bind with service account (or anonymous)
    if (config.bindDN && config.bindCredentials) {
      logger.info(`Binding to LDAP as service account: ${config.bindDN}`);
      await client.bind(config.bindDN, config.bindCredentials);
    }

    // Step 2: Search for the user
    const filter = config.searchFilter.replace(
      /\{\{username\}\}/g,
      escapeLdapFilter(username),
    );

    logger.info(
      `Searching for user in ${config.searchBase} with filter: ${filter}`,
    );

    const { searchEntries } = await client.search(config.searchBase, {
      filter,
      attributes: [config.usernameAttribute, ...config.userAttributes],
      scope: 'sub',
    });

    if (searchEntries.length === 0) {
      throw new Error(`User '${username}' not found in LDAP directory`);
    }

    if (searchEntries.length > 1) {
      logger.warn(`Multiple users found for '${username}', using first result`);
    }

    const userEntry = searchEntries[0];
    const userDN = userEntry.dn;

    // Step 3: Unbind service account, re-bind as the user to validate password
    await client.unbind();

    const userClient = new Client(baseClientOptions);

    try {
      await userClient.bind(userDN, password);
      logger.info(`User '${username}' authenticated successfully`);
    } catch (error) {
      throw new Error(`Invalid credentials for user '${username}'`);
    } finally {
      await userClient.unbind().catch(() => {});
    }

    // Step 4: Extract user attributes
    const uid = extractStringAttribute(userEntry, config.usernameAttribute);

    const userInfo: LdapUserInfo = {
      dn: userDN,
      uid: uid ?? username,
      displayName: extractStringAttribute(userEntry, 'displayName'),
      email: extractStringAttribute(userEntry, 'mail'),
      memberOf: extractStringArrayAttribute(userEntry, 'memberOf'),
      attributes: extractAllAttributes(userEntry, config.userAttributes),
    };

    return userInfo;
  } finally {
    await client.unbind().catch(() => {});
  }
}

/**
 * Escape special characters in an LDAP filter value
 * per RFC 4515.
 */
function escapeLdapFilter(input: string): string {
  return input.replace(/[\\*()"\0/]/g, char => {
    return `\\${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
}

function extractStringAttribute(
  entry: Record<string, unknown>,
  attribute: string,
): string | undefined {
  const value = entry[attribute];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

function extractStringArrayAttribute(
  entry: Record<string, unknown>,
  attribute: string,
): string[] | undefined {
  const value = entry[attribute];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return [value];
  }
  return undefined;
}

function extractAllAttributes(
  entry: Record<string, unknown>,
  attributes: string[],
): Record<string, string | string[] | undefined> {
  const result: Record<string, string | string[] | undefined> = {};
  for (const attr of attributes) {
    const value = entry[attr];
    if (typeof value === 'string') {
      result[attr] = value;
    } else if (Array.isArray(value)) {
      result[attr] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return result;
}

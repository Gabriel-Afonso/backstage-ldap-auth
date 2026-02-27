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

/**
 * Configuration schema for the LDAP auth provider.
 *
 * @see https://backstage.io/docs/conf/writing
 */
export interface Config {
  auth?: {
    providers?: {
      ldap?: {
        [environment: string]: {
          /**
           * LDAP server URL, e.g. ldaps://ldap.example.com:636
           */
          url: string;
          /**
           * Distinguished Name to bind as for searching users.
           * Omit for anonymous bind.
           */
          bindDN?: string;
          /**
           * Password for the bind DN.
           * @visibility secret
           */
          bindCredentials?: string;
          /**
           * Base DN under which to search for users.
           */
          searchBase: string;
          /**
           * The LDAP attribute used as the unique username.
           * @default uid
           */
          usernameAttribute?: string;
          /**
           * LDAP search filter template. Use {{username}} as placeholder.
           * @default (uid={{username}})
           */
          searchFilter?: string;
          /**
           * Additional LDAP attributes to fetch for the user.
           * @default ["mail", "displayName", "memberOf"]
           */
          userAttributes?: string[];
          /**
           * TLS configuration for the LDAP connection.
           */
          tls?: {
            /**
             * Whether to reject unauthorized TLS certificates.
             * @default true
             */
            rejectUnauthorized?: boolean;
          };
          /**
           * Sign-in resolver configuration.
           */
          signIn?: {
            resolvers: Array<{
              resolver: string;
            }>;
          };
        };
      };
    };
  };
}

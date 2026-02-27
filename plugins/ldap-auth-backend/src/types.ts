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
 * Configuration for connecting to an LDAP server.
 */
export interface LdapClientConfig {
  /** LDAP server URL, e.g. ldaps://ldap.example.com:636 */
  url: string;
  /** DN to bind as for searching (optional for anonymous bind) */
  bindDN?: string;
  /** Password / credentials for the bind DN */
  bindCredentials?: string;
  /** Base DN under which to search for users */
  searchBase: string;
  /** LDAP attribute used as the username (default: uid) */
  usernameAttribute: string;
  /** LDAP search filter template. {{username}} is replaced with the login value. */
  searchFilter: string;
  /** Additional user attributes to fetch from LDAP */
  userAttributes: string[];
  /** TLS configuration */
  tls: {
    /** Whether to reject unauthorized certificates (default: true) */
    rejectUnauthorized: boolean;
  };
}

/**
 * Represents a user's information as returned from LDAP after authentication.
 */
export interface LdapUserInfo {
  /** The user's distinguished name in LDAP */
  dn: string;
  /** The user's unique identifier (uid, sAMAccountName, etc.) */
  uid: string;
  /** The user's display name */
  displayName?: string;
  /** The user's email address */
  email?: string;
  /** The user's member-of groups (DNs or CNs) */
  memberOf?: string[];
  /** Any additional LDAP attributes returned */
  attributes: Record<string, string | string[] | undefined>;
}

/**
 * The result of a successful LDAP authentication, passed to sign-in resolvers.
 */
export interface LdapAuthResult {
  /** The authenticated user's full LDAP information */
  userInfo: LdapUserInfo;
}

/**
 * The response shape sent from the LDAP auth backend to the frontend
 * after a successful authentication.
 */
export interface LdapAuthResponse {
  profile: {
    email?: string;
    displayName?: string;
    picture?: string;
  };
  providerInfo: {
    uid: string;
    memberOf?: string[];
  };
}

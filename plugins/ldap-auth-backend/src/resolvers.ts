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
  createSignInResolverFactory,
  type SignInInfo,
} from '@backstage/plugin-auth-node';
import type { LdapAuthResult } from './types';

/**
 * Sign-in resolver that matches the LDAP `uid` to a Backstage `User` entity
 * whose `metadata.name` equals the uid.
 *
 * @public
 */
export const usernameMatchingUserEntityName = createSignInResolverFactory({
  create() {
    return async (info: SignInInfo<LdapAuthResult>, ctx) => {
      const { uid } = info.result.userInfo;

      return ctx.signInWithCatalogUser({
        entityRef: { name: uid },
      });
    };
  },
});

/**
 * Sign-in resolver that matches the LDAP user's `mail` attribute to a
 * Backstage `User` entity annotated with `backstage.io/ldap-email`.
 *
 * @public
 */
export const emailMatchingUserEntityAnnotation = createSignInResolverFactory({
  create() {
    return async (info: SignInInfo<LdapAuthResult>, ctx) => {
      const { email } = info.result.userInfo;
      if (!email) {
        throw new Error(
          'LDAP user does not have an email attribute, cannot resolve to a Backstage user',
        );
      }

      return ctx.signInWithCatalogUser({
        annotations: {
          'backstage.io/ldap-email': email,
        },
      });
    };
  },
});

/**
 * All built-in LDAP sign-in resolvers.
 *
 * @public
 */
export const ldapSignInResolvers = {
  usernameMatchingUserEntityName,
  emailMatchingUserEntityAnnotation,
};

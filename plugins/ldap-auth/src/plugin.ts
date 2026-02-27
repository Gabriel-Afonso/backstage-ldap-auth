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
  createPlugin,
  createComponentExtension,
} from '@backstage/core-plugin-api';

/**
 * Frontend plugin for LDAP authentication (legacy frontend system).
 *
 * @public
 */
export const ldapAuthPlugin = createPlugin({
  id: 'ldap-auth',
});

/**
 * The LDAP sign-in page component.
 *
 * Usage:
 * ```tsx
 * import { LdapSignInPage } from '@backstage-community/plugin-ldap-auth';
 *
 * const app = createApp({
 *   components: {
 *     SignInPage: LdapSignInPage,
 *   },
 * });
 * ```
 *
 * @public
 */
export const LdapSignInPage = ldapAuthPlugin.provide(
  createComponentExtension({
    name: 'LdapSignInPage',
    component: {
      lazy: () =>
        import('./components/LdapSignInPage').then(m => m.LdapSignInPage),
    },
  }),
);

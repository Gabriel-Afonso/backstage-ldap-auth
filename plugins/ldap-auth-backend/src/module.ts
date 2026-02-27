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

import { createBackendModule } from '@backstage/backend-plugin-api';
import { authProvidersExtensionPoint } from '@backstage/plugin-auth-node';
import { createLdapProviderFactory } from './provider';
import { ldapSignInResolvers } from './resolvers';

/**
 * Backend module that registers the LDAP authentication provider.
 *
 * Install by adding to your backend:
 * ```ts
 * backend.add(import('@backstage-community/plugin-ldap-auth-backend'));
 * ```
 *
 * @public
 */
export const authModuleLdapProvider = createBackendModule({
  pluginId: 'auth',
  moduleId: 'ldap-provider',
  register(reg) {
    reg.registerInit({
      deps: {
        providers: authProvidersExtensionPoint,
      },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'ldap',
          factory: createLdapProviderFactory({
            signInResolverFactories: { ...ldapSignInResolvers },
          }),
        });
      },
    });
  },
});

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
  ldapSignInResolvers,
  usernameMatchingUserEntityName,
  emailMatchingUserEntityAnnotation,
} from './resolvers';

describe('ldapSignInResolvers', () => {
  it('should export all resolvers', () => {
    expect(ldapSignInResolvers).toBeDefined();
    expect(ldapSignInResolvers.usernameMatchingUserEntityName).toBeDefined();
    expect(ldapSignInResolvers.emailMatchingUserEntityAnnotation).toBeDefined();
  });

  it('should export individual resolver factories', () => {
    expect(usernameMatchingUserEntityName).toBeDefined();
    expect(emailMatchingUserEntityAnnotation).toBeDefined();
  });
});

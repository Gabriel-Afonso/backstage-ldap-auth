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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { discoveryApiRef } from '@backstage/core-plugin-api';
import { TestApiProvider } from '@backstage/test-utils';
import { LdapSignInPage } from './LdapSignInPage';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

/**
 * Helper to get input elements by their stable MUI id attributes.
 * Using getElementById avoids issues with getByLabelText matching
 * both the <label> and the password toggle button's aria-label.
 */
function getUsernameInput() {
  return document.getElementById('ldap-username') as HTMLInputElement;
}

function getPasswordInput() {
  return document.getElementById('ldap-password') as HTMLInputElement;
}

function getSubmitButton() {
  return screen.getByRole('button', { name: /sign in/i });
}

describe('LdapSignInPage', () => {
  const mockOnSignInSuccess = jest.fn();

  const mockDiscoveryApi = {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/auth'),
  };

  function renderPage() {
    return render(
      <TestApiProvider apis={[[discoveryApiRef, mockDiscoveryApi as any]]}>
        <LdapSignInPage onSignInSuccess={mockOnSignInSuccess} />
      </TestApiProvider>,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the sign-in form', () => {
    renderPage();

    expect(
      screen.getByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Authenticate with your LDAP credentials'),
    ).toBeInTheDocument();
    expect(getUsernameInput()).toBeTruthy();
    expect(getPasswordInput()).toBeTruthy();
    expect(getSubmitButton()).toBeInTheDocument();
  });

  it('should show error when submitting empty form', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(getSubmitButton());

    expect(
      await screen.findByText('Please enter both username and password'),
    ).toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should call fetch with credentials on submit', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        backstageIdentity: {
          token: 'test-token',
          identity: { type: 'user', userEntityRef: 'user:default/jdoe' },
        },
      }),
    });

    renderPage();

    await user.type(getUsernameInput(), 'jdoe');
    await user.type(getPasswordInput(), 'mypassword');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:7007/api/auth/ldap/handler/frame',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: 'jdoe', password: 'mypassword' }),
        }),
      );
    });

    await waitFor(() => {
      expect(mockOnSignInSuccess).toHaveBeenCalledWith({
        token: 'test-token',
        identity: { type: 'user', userEntityRef: 'user:default/jdoe' },
      });
    });
  });

  it('should display error on failed authentication', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid credentials' } }),
    });

    renderPage();

    await user.type(getUsernameInput(), 'jdoe');
    await user.type(getPasswordInput(), 'wrong');
    await user.click(getSubmitButton());

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
    expect(mockOnSignInSuccess).not.toHaveBeenCalled();
  });

  it('should display error on network failure', async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValue(new Error('Network error'));

    renderPage();

    await user.type(getUsernameInput(), 'jdoe');
    await user.type(getPasswordInput(), 'pass');
    await user.click(getSubmitButton());

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });

  it('should toggle password visibility', async () => {
    const user = userEvent.setup();
    renderPage();

    const passwordInput = getPasswordInput();
    expect(passwordInput.type).toBe('password');

    const toggleButton = screen.getByLabelText('toggle password visibility');
    await user.click(toggleButton);

    expect(passwordInput.type).toBe('text');
  });

  it('should disable form during submission', async () => {
    const user = userEvent.setup();
    // Never-resolving promise to keep loading state
    mockFetch.mockReturnValue(new Promise(() => {}));

    renderPage();

    await user.type(getUsernameInput(), 'jdoe');
    await user.type(getPasswordInput(), 'pass');
    await user.click(getSubmitButton());

    await waitFor(() => {
      expect(getUsernameInput().disabled).toBe(true);
      expect(getPasswordInput().disabled).toBe(true);
    });
  });
});

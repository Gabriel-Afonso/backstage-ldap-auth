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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
  Alert,
  Box,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Visibility, VisibilityOff, Lock } from '@mui/icons-material';
import {
  discoveryApiRef,
  type BackstageUserIdentity,
  type DiscoveryApi,
  type IdentityApi,
  type ProfileInfo,
  type SignInPageProps,
  useApi,
} from '@backstage/core-plugin-api';

const STORAGE_KEY = 'ldap-auth-session';

type StoredLdapSession = {
  token: string;
  identity: BackstageUserIdentity;
  profile: ProfileInfo;
};

function safeParseStoredSession(
  value: string | null,
): StoredLdapSession | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<StoredLdapSession>;
    if (
      typeof parsed?.token === 'string' &&
      parsed.identity?.type === 'user' &&
      typeof parsed.identity.userEntityRef === 'string' &&
      Array.isArray(parsed.identity.ownershipEntityRefs)
    ) {
      return parsed as StoredLdapSession;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function getJwtExpiryMillis(token: string): number | undefined {
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  const payload = parts[1];
  try {
    // base64url -> base64
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      '=',
    );
    const json = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof json.exp === 'number' ? json.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function isExpired(token: string): boolean {
  const exp = getJwtExpiryMillis(token);
  // If we can't parse exp, treat it as non-expiring.
  if (!exp) return false;
  // Refresh margin
  return Date.now() > exp - 5 * 60 * 1000;
}

class StaticLdapIdentity implements IdentityApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly session: StoredLdapSession;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    session: StoredLdapSession;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.session = options.session;
  }

  async getProfileInfo(): Promise<ProfileInfo> {
    return this.session.profile;
  }

  async getBackstageIdentity(): Promise<BackstageUserIdentity> {
    return this.session.identity;
  }

  async getCredentials(): Promise<{ token?: string }> {
    return { token: this.session.token };
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
    try {
      const authBaseUrl = await this.discoveryApi.getBaseUrl('auth');
      await fetch(`${authBaseUrl}/ldap/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Props for the LdapSignInPage component.
 *
 * @public
 */
export type LdapSignInPageProps = SignInPageProps;

/**
 * A Material-UI based sign-in page that authenticates against an LDAP directory.
 *
 * It posts username/password to the backend LDAP auth endpoint and calls
 * `onSignInSuccess` with the resulting Backstage identity on success.
 *
 * @public
 */
export function LdapSignInPage(props: LdapSignInPageProps) {
  const { onSignInSuccess } = props;

  const discoveryApi = useApi(discoveryApiRef);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cachedIdentityApi = useMemo(() => {
    const stored = safeParseStoredSession(localStorage.getItem(STORAGE_KEY));
    if (!stored) return undefined;
    if (isExpired(stored.token)) {
      localStorage.removeItem(STORAGE_KEY);
      return undefined;
    }
    return new StaticLdapIdentity({ discoveryApi, session: stored });
  }, [discoveryApi]);

  useEffect(() => {
    if (cachedIdentityApi) {
      onSignInSuccess(cachedIdentityApi);
    }
  }, [cachedIdentityApi, onSignInSuccess]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      if (!username.trim() || !password) {
        setError('Please enter both username and password');
        return;
      }

      setLoading(true);

      try {
        const authBaseUrl = await discoveryApi.getBaseUrl('auth');
        const response = await fetch(`${authBaseUrl}/ldap/handler/frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: username.trim(), password }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            body.error?.message ??
              body.error ??
              `Authentication failed (${response.status})`,
          );
        }

        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message ?? data.error);
        }

        const session: StoredLdapSession = {
          token: data.backstageIdentity?.token,
          identity: data.backstageIdentity?.identity,
          profile: data.profile ?? {},
        };

        if (!session.token || !session.identity) {
          throw new Error(
            'Authentication succeeded but no identity was returned',
          );
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        setPassword('');

        onSignInSuccess(new StaticLdapIdentity({ discoveryApi, session }));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Authentication failed';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [username, password, onSignInSuccess, discoveryApi],
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        bgcolor: 'background.default',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          p: 4,
          maxWidth: 400,
          width: '100%',
          mx: 2,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            mb: 3,
          }}
        >
          <Lock sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h4" component="h1" gutterBottom>
            Sign In
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Authenticate with your LDAP credentials
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            id="ldap-username"
            label="Username"
            variant="outlined"
            fullWidth
            required
            autoFocus
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            disabled={loading}
            sx={{ mb: 2 }}
          />

          <TextField
            id="ldap-password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            variant="outlined"
            fullWidth
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={loading}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="toggle password visibility"
                    onClick={() => setShowPassword(prev => !prev)}
                    edge="end"
                    size="small"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 3 }}
          />

          <Button
            id="ldap-sign-in-button"
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            disabled={loading}
            sx={{ py: 1.5 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              'Sign In'
            )}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

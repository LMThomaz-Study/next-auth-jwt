import axios, { AxiosError } from 'axios';
import { parseCookies, setCookie } from 'nookies';
import { signOut } from '../contexts/AuthContext';

let isRefreshing = false;
let failedRequestQueue = [];

export function setupApiClient(ctx = undefined) {
  let cookies = parseCookies(ctx);

  const api = axios.create({
    baseURL: 'http://localhost:3333',
    headers: {
      Authorization: `Bearer ${cookies['next-auth-jwt.token']}`,
    },
  });

  api.interceptors.response.use(
    (response) => {
      return response;
    },
    (error: AxiosError) => {
      if (error.response.status === 401) {
        if (error.response.data?.code === 'token.expired') {
          cookies = parseCookies(ctx);

          const { 'next-auth-jwt.refreshToken': refreshTokenCookie } = cookies;

          const originalConfig = error.config;

          if (!isRefreshing) {
            isRefreshing = true;

            api
              .post('refresh', {
                refreshToken: refreshTokenCookie,
              })
              .then((response) => {
                const { token, refreshToken } = response.data;

                setCookie(ctx, 'next-auth-jwt.token', token, {
                  maxAge: 60 * 60 * 24 * 30, // 30 days
                  path: '/',
                });

                setCookie(ctx, 'next-auth-jwt.refreshToken', refreshToken, {
                  maxAge: 60 * 60 * 24 * 30, // 30 days
                  path: '/',
                });

                api.defaults.headers['Authorization'] = `Bearer ${token}`;

                failedRequestQueue.forEach((request) =>
                  request.onSuccess(token),
                );
                failedRequestQueue = [];

                if (process.browser) {
                  signOut();
                }
              })
              .catch((err) => {
                failedRequestQueue.forEach((request) => request.onFailure(err));
                failedRequestQueue = [];
              })
              .finally(() => {
                isRefreshing = false;
              });
          }

          return new Promise((resolve, reject) => {
            failedRequestQueue.push({
              onSuccess: (token: string) => {
                originalConfig.headers['Authorization'] = `Bearer ${token}`;

                resolve(api(originalConfig));
              },
              onFailure: (err: AxiosError) => {
                reject(err);
              },
            });
          });
        } else {
          if (process.browser) {
            signOut();
          }
        }
      }

      return Promise.reject(error);
    },
  );

  return api;
}

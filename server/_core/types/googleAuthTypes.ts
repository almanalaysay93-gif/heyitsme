export interface ExchangeTokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
  scope: string;
  idToken?: string;
}

export interface GetUserInfoResponse {
  openId: string;
  name: string;
  email?: string | null;
  platform?: string | null;
  loginMethod?: string | null;
}

export interface GetUserInfoWithJwtResponse {
  openId: string;
  name: string;
  email?: string | null;
  platform?: string | null;
  loginMethod?: string | null;
}

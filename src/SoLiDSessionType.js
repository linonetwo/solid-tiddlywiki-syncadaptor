// @flow

type Authorization = {
  client_id: string,
  access_token: string,
  id_token: string,
};

type Cnf = {
  jwk: Jwk,
};

type IdClaims = {
  iss: string,
  sub: string,
  aud: string,
  exp: number,
  iat: number,
  jti: string,
  nonce: string,
  azp: string,
  cnf: Cnf,
  at_hash: string,
};

type Jwk = {
  alg: string,
  e: string,
  ext: boolean,
  key_ops: string[],
  kty: string,
  n: string,
};

export type SoLiDSession = {
  credentialType: string,
  issuer: string,
  authorization: Authorization,
  sessionKey: string,
  idClaims: IdClaims,
  webId: string,
  idp: string,
};

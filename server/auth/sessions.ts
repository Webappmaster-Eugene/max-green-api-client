import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { AUTH_TTL_SECONDS } from "../../contracts/constants.js";
import { EncryptedStore } from "../../src/max/storage.js";
import {
  jwtPayloadSchema,
  userSchema,
  authStoreSchema,
} from "../../contracts/auth.js";
import type {
  AuthOptions,
  AuthStore,
  StoredAuthGrant,
  AuthGrant,
  LoginResult,
  LoginInput,
} from "../../types/auth.js";
import { UserRepository } from "./users.js";
import { hashPassword, verifyPassword } from "./password.js";
import { AppError } from "../lib/error.js";

export class AuthSessions {
  private readonly sessions = new Map<string, StoredAuthGrant>();
  private readonly store?: EncryptedStore<AuthStore>;
  private readonly key: Uint8Array;
  private readonly ttl: number;
  private readonly now: () => number;
  private readonly dummyHash = hashPassword(randomBytes(32).toString("hex"));
  constructor(
    readonly users: UserRepository,
    private readonly options: AuthOptions,
  ) {
    if (Buffer.byteLength(options.secret) < 32)
      throw new Error("AUTH_JWT_SECRET должен содержать не менее 32 байт.");
    this.key = new TextEncoder().encode(options.secret);
    this.ttl = options.ttlSeconds ?? AUTH_TTL_SECONDS;
    this.now = options.now ?? Date.now;
    if (options.storageDirectory) {
      this.store = new EncryptedStore(
        options.storageDirectory,
        "auth-sessions",
        authStoreSchema,
        { version: 1, sessions: [] },
      );
      for (const grant of this.store.read().sessions)
        this.sessions.set(grant.jti, grant);
    }
    this.sweep();
  }

  private sweep(): void {
    let changed = false;
    for (const [id, session] of this.sessions)
      if (session.expiresAt <= this.now()) {
        this.sessions.delete(id);
        changed = true;
      }
    if (changed) this.persist();
  }

  private persist(): void {
    this.store?.write({ version: 1, sessions: [...this.sessions.values()] });
  }

  async login(input: LoginInput): Promise<LoginResult> {
    this.sweep();
    const user = this.users.findLogin(input.login);
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? (await this.dummyHash),
    );
    if (
      !valid ||
      !user?.active ||
      this.users.find(user.id)?.version !== user.version
    )
      throw new AppError("Неверный логин или пароль.", 401);
    if (this.sessions.size >= 500)
      throw new AppError(
        "Слишком много активных сессий. Попробуйте позже.",
        503,
      );
    const jti = randomUUID();
    const csrf = randomBytes(32).toString("hex");
    const expiresAt = this.now() + this.ttl * 1000;
    const token = await new SignJWT({ version: user.version, csrf })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(String(user.id))
      .setJti(jti)
      .setIssuer(this.options.origin)
      .setAudience("max-client")
      .setIssuedAt(Math.floor(this.now() / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.key);
    const safe = userSchema.parse(user);
    this.sessions.set(jti, {
      user: safe,
      jti,
      csrf,
      expiresAt,
      version: user.version,
    });
    this.persist();
    return { token, session: { user: safe, expiresAt, csrfToken: csrf } };
  }

  async verify(token?: string): Promise<AuthGrant> {
    this.sweep();
    if (!token) throw new AppError("Войдите на сайт.", 401);
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: this.options.origin,
        audience: "max-client",
        requiredClaims: ["sub", "jti", "iat", "exp"],
        typ: "JWT",
        currentDate: new Date(this.now()),
      });
      const claims = jwtPayloadSchema.parse(payload);
      const session = this.sessions.get(claims.jti);
      const user = this.users.find(Number(claims.sub));
      if (
        !session ||
        !user?.active ||
        session.user.id !== user.id ||
        claims.version !== user.version ||
        session.version !== user.version ||
        session.csrf !== claims.csrf
      )
        throw new Error("Invalid session");
      return { ...session, user: userSchema.parse(user) };
    } catch {
      throw new AppError("Сессия завершена. Войдите заново.", 401);
    }
  }

  async renew(grant: AuthGrant): Promise<LoginResult | null> {
    const current = this.sessions.get(grant.jti);
    if (
      !current ||
      current.expiresAt - this.now() >
        this.ttl * 1000 - Math.min(86400000, this.ttl * 500)
    )
      return null;
    const user = this.users.find(current.user.id);
    if (!user?.active || user.version !== current.version)
      throw new AppError("Войдите на сайт.", 401);
    const expiresAt = this.now() + this.ttl * 1000;
    const token = await new SignJWT({
      version: current.version,
      csrf: current.csrf,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(String(user.id))
      .setJti(current.jti)
      .setIssuer(this.options.origin)
      .setAudience("max-client")
      .setIssuedAt(Math.floor(this.now() / 1000))
      .setExpirationTime(Math.floor(expiresAt / 1000))
      .sign(this.key);
    const updated = { ...current, expiresAt };
    this.sessions.set(current.jti, updated);
    this.persist();
    return {
      token,
      session: {
        user: userSchema.parse(user),
        expiresAt,
        csrfToken: current.csrf,
      },
    };
  }

  verifyCsrf(grant: AuthGrant, value?: string): void {
    if (
      !value ||
      !/^[a-f0-9]{64}$/.test(value) ||
      !timingSafeEqual(Buffer.from(value), Buffer.from(grant.csrf))
    )
      throw new AppError("Обновите страницу и повторите действие.", 403);
  }

  logout(jti: string): void {
    this.sessions.delete(jti);
    this.persist();
  }
  revokeUser(id: number): void {
    for (const [jti, grant] of this.sessions)
      if (grant.user.id === id) this.sessions.delete(jti);
    this.persist();
  }
  close(): void {
    this.sessions.clear();
  }
}

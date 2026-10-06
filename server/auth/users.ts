import { randomInt, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  userSchema,
  userStoreSchema,
  createUserSchema,
} from "../../contracts/auth.js";
import type {
  User,
  StoredUser,
  UserStore,
  CreateUserInput,
  BootstrapUser,
} from "../../types/auth.js";
import { hashPassword, verifyPassword } from "./password.js";
import { AppError } from "../lib/error.js";

export class UserRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    private readonly file: string | null,
    private state: UserStore,
  ) {}

  static async open(
    file: string,
    bootstrap?: BootstrapUser,
  ): Promise<UserRepository> {
    let state: UserStore;
    try {
      state = userStoreSchema.parse(JSON.parse(await readFile(file, "utf8")));
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw new Error(
          "Не удалось открыть защищённое хранилище пользователей.",
        );
      if (!bootstrap)
        throw new Error(
          "Настройте ADMIN_LOGIN и ADMIN_PASSWORD_HASH для первого запуска.",
        );
      state = userStoreSchema.parse({
        version: 1,
        users: [
          {
            id: randomInt(1, 2 ** 47),
            ...bootstrap,
            role: "admin",
            active: true,
            version: 0,
          },
        ],
      });
    }
    if (!state.users.some((u) => u.role === "admin" && u.active))
      throw new Error("Нет активного администратора.");
    const repository = new UserRepository(file, state);
    await repository.persist(state);
    return repository;
  }

  static memory(users: StoredUser[]): UserRepository {
    return new UserRepository(
      null,
      userStoreSchema.parse({ version: 1, users }),
    );
  }

  private async persist(state: UserStore): Promise<void> {
    if (!this.file) return;
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, this.file);
  }

  private async mutate<T>(
    work: (state: UserStore) => Promise<T> | T,
  ): Promise<T> {
    const job = this.queue.then(async () => {
      const next = structuredClone(this.state);
      const result = await work(next);
      await this.persist(next);
      this.state = next;
      return result;
    });
    this.queue = job.catch(() => undefined);
    return job;
  }

  find(id: number): StoredUser | undefined {
    const user = this.state.users.find((u) => u.id === id);
    return user ? { ...user } : undefined;
  }

  findLogin(login: string): StoredUser | undefined {
    const user = this.state.users.find((u) => u.login === login);
    return user ? { ...user } : undefined;
  }

  list(): User[] {
    return this.state.users.map((u) => userSchema.parse(u));
  }

  async create(input: CreateUserInput): Promise<User> {
    const parsed = createUserSchema.parse(input);
    const passwordHash = await hashPassword(parsed.password);
    return this.mutate((state) => {
      if (state.users.length >= 100)
        throw new AppError("Достигнут лимит пользователей.");
      if (state.users.some((u) => u.login === parsed.login))
        throw new AppError("Этот логин уже занят.", 409);
      let id: number;
      do {
        id = randomInt(1, 2 ** 47);
      } while (state.users.some((u) => u.id === id));
      const user: StoredUser = {
        id,
        login: parsed.login,
        role: parsed.role,
        active: true,
        passwordHash,
        version: 0,
      };
      state.users.push(user);
      return userSchema.parse(user);
    });
  }

  async setActive(id: number, active: boolean, actor: number): Promise<User> {
    return this.mutate((state) => {
      const user = state.users.find((u) => u.id === id);
      if (!user) throw new AppError("Пользователь не найден.", 404);
      if (
        !active &&
        (id === actor ||
          (user.role === "admin" &&
            state.users.filter((u) => u.role === "admin" && u.active).length <=
              1))
      )
        throw new AppError(
          "Нельзя отключить себя или последнего администратора.",
        );
      user.active = active;
      user.version++;
      return userSchema.parse(user);
    });
  }

  async setPassword(
    id: number,
    password: string,
    expectedVersion?: number,
  ): Promise<void> {
    const passwordHash = await hashPassword(password);
    await this.mutate((state) => {
      const user = state.users.find((u) => u.id === id);
      if (!user) throw new AppError("Пользователь не найден.", 404);
      if (expectedVersion !== undefined && expectedVersion !== user.version)
        throw new AppError("Пароль уже изменён. Войдите заново.", 409);
      user.passwordHash = passwordHash;
      user.version++;
    });
  }

  async changePassword(
    id: number,
    current: string,
    password: string,
  ): Promise<void> {
    const user = this.find(id);
    if (!user?.active || !(await verifyPassword(current, user.passwordHash)))
      throw new AppError("Текущий пароль неверный.", 403);
    await this.setPassword(id, password, user.version);
  }
}

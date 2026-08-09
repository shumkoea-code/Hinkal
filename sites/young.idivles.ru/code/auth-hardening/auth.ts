import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { buildOptionalOAuthProviders } from "./oauth-providers";
import { consumeCaptchaToken } from "@/lib/captcha";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "./prisma";
import bcrypt from "bcrypt";
import { isPhoneLikeLogin, phoneNational10 } from "./phone";

async function findUserByLogin(loginRaw: string) {
  const raw = loginRaw.trim();
  if (!raw) return null;

  if (raw.includes("@") || !isPhoneLikeLogin(raw)) {
    if (raw.includes("@")) {
      const email = raw.toLowerCase();
      return prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      });
    }
    return prisma.user.findFirst({
      where: { email: { equals: raw.toLowerCase(), mode: "insensitive" } },
    });
  }

  const national = phoneNational10(raw);
  if (national.length !== 10) {
    return null;
  }

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string | null;
      email: string | null;
      phone: string | null;
      password: string | null;
      image: string | null;
      role: string;
      permissions: string | null;
      blockedAt: Date | null;
      blockedReason: string | null;
      deletedAt: Date | null;
      tokenVersion: number;
      mustChangePassword: boolean;
    }>
  >`
    SELECT id, name, email, phone, password, image, role, permissions,
           "blockedAt", "blockedReason", "deletedAt", "tokenVersion", "mustChangePassword"
    FROM "User"
    WHERE length(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g')) >= 10
      AND right(regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10) = ${national}
    LIMIT 1
  `;
  return rows[0] || null;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    ...buildOptionalOAuthProviders(),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email или телефон", type: "text" },
        password: { label: "Пароль", type: "password" },
        captchaToken: { label: "Captcha", type: "text" },
        requireCaptcha: { label: "RequireCaptcha", type: "text" },
        website: { label: "Website", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Неверные данные");
        }

        const loginRaw = String(credentials.email).trim();
        const password = String(credentials.password);
        const captchaToken = credentials.captchaToken ? String(credentials.captchaToken) : "";
        const needCaptcha = String(credentials.requireCaptcha || "") === "1";
        if (needCaptcha) {
          const cap = await consumeCaptchaToken(captchaToken, String(credentials.website || ""));
          if (!cap.ok) {
            throw new Error(cap.message || "Пройдите проверку «я не робот»");
          }
        }

        const { loginRateLimiter } = await import("./rateLimit");
        const rateKey = isPhoneLikeLogin(loginRaw)
          ? `login:phone:${phoneNational10(loginRaw)}`
          : `login:${loginRaw.toLowerCase()}`;
        if (!await loginRateLimiter.checkAsync(rateKey)) {
          throw new Error("Слишком много попыток входа. Подождите несколько минут.");
        }

        let user = await findUserByLogin(loginRaw);

        const techEmail = (process.env.TECH_EMAIL || "").trim().toLowerCase();
        const loginEmail = loginRaw.includes("@") ? loginRaw.toLowerCase() : "";
        if ((!user || !user.password) && techEmail && loginEmail === techEmail) {
          const bootstrap = process.env.TECH_BOOTSTRAP_PASSWORD || "";
          const hashEnv = process.env.TECH_PASSWORD_HASH || "";
          let ok = false;
          if (hashEnv) {
            ok = await bcrypt.compare(password, hashEnv);
          } else if (bootstrap && password === bootstrap) {
            ok = true;
          }
          if (ok) {
            const hashed = await bcrypt.hash(password, 12);
            user = (await prisma.user.create({
              data: {
                email: techEmail,
                name: "Техслужба",
                password: hashed,
                role: "TECH",
                privacyAcceptedAt: new Date(),
                privacyFirstAcceptedAt: new Date(),
              },
            })) as typeof user;
          }
        }

        if (!user || !user.password) {
          throw new Error("Неверный логин или пароль");
        }

        if (techEmail && (user as { email?: string | null }).email?.toLowerCase() === techEmail && user.role !== "TECH") {
          user = (await prisma.user.update({
            where: { id: user.id },
            data: { role: "TECH" },
          })) as typeof user;
        }

        if ((user as { blockedAt?: Date | null }).blockedAt) {
          throw new Error("Аккаунт заблокирован. Обратитесь в администрацию.");
        }
        if ((user as { deletedAt?: Date | null }).deletedAt) {
          throw new Error("Аккаунт удалён.");
        }

        const passwordHash = user.password;
        if (!passwordHash) {
          throw new Error("Неверный логин или пароль");
        }
        const isPasswordValid = await bcrypt.compare(password, passwordHash);
        if (!isPasswordValid) {
          throw new Error("Неверный логин или пароль");
        }

        return user as any;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider && account.provider !== "credentials") {
        if (user?.id) {
          const row = await prisma.user.findUnique({
            where: { id: user.id },
            select: { blockedAt: true, deletedAt: true },
          });
          if (row?.blockedAt || row?.deletedAt) return false;
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.permissions = (user as any).permissions;
        token.image = user.image;
        token.phone = (user as any).phone;
        token.tv = (user as any).tokenVersion ?? 0;
        token.mustChangePassword = Boolean((user as any).mustChangePassword);
        delete token.error;
      }
      if (token.id) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              role: true,
              permissions: true,
              image: true,
              name: true,
              email: true,
              phone: true,
              blockedAt: true,
              deletedAt: true,
              tokenVersion: true,
              tokenKeepAlive: true,
              mustChangePassword: true,
            },
          });
          if (!dbUser) {
            token.error = "gone";
            return token;
          }
          if (dbUser.deletedAt) {
            token.error = "deleted";
            return token;
          }
          if (dbUser.blockedAt) {
            token.error = "blocked";
            return token;
          }

          if (trigger === "update" && session) {
            if (session.image !== undefined) token.image = session.image;
            if (session.name !== undefined) token.name = session.name;
            if (session.email !== undefined) token.email = session.email;
            if (session.phone !== undefined) token.phone = session.phone;
            // Keep-current after «завершить другие»: one-time nonce from revoke API
            const keepAlive =
              typeof (session as { keepAlive?: unknown }).keepAlive === "string"
                ? String((session as { keepAlive: string }).keepAlive)
                : "";
            if (keepAlive && dbUser.tokenKeepAlive && keepAlive === dbUser.tokenKeepAlive) {
              token.tv = dbUser.tokenVersion;
              delete token.error;
              await prisma.user.update({
                where: { id: token.id as string },
                data: { tokenKeepAlive: null },
              });
            }
          }

          if (typeof token.tv === "number" && dbUser.tokenVersion !== token.tv) {
            token.error = "revoked";
            return token;
          }
          token.role = dbUser.role;
          token.mustChangePassword = Boolean(dbUser.mustChangePassword);
          token.permissions = dbUser.permissions;
          token.image = dbUser.image;
          token.phone = dbUser.phone;
          token.tv = dbUser.tokenVersion;
          if (dbUser.name) token.name = dbUser.name;
          if (dbUser.email) token.email = dbUser.email;
          delete token.error;
        } catch {
          /* ignore */
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.error) {
        return { ...session, user: undefined as any, error: token.error };
      }
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        (session.user as any).mustChangePassword = Boolean(token.mustChangePassword);
        session.user.permissions = token.permissions as string;
        session.user.image = token.image as string;
        session.user.phone = (token.phone as string) || null;
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

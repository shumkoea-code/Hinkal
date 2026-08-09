import { prisma } from "@/lib/prisma";
import { unlockAchievement } from "@/lib/award-achievements";
import {
  COOKIES_POLICY_VERSION,
  PRIVACY_POLICY_VERSION,
  RULES_POLICY_VERSION,
  buildConsentSignature,
} from "@/lib/consent";
import { generatePublicCode } from "@/lib/public-id";
import { attributeReferralOnSignup, ensureReferralCode } from "@/lib/referrals";

export type RegistrationMeta = {
  privacyAccepted?: boolean;
  personalDataConsent?: boolean;
  birthDate?: string;
  referralCode?: string | null;
  fingerprint?: string | null;
  signupIp?: string | null;
};

export type RegistrationInput = {
  name: string;
  email: string;
  phone: string;
  /** Already bcrypt-hashed */
  passwordHash: string;
  meta?: RegistrationMeta | null;
  ip?: string | null;
};

/** Create a verified User from registration data (skip email OTP). */
export async function completeRegistration(input: RegistrationInput) {
  const meta = input.meta || {};
  const now = new Date();
  const email = input.email;
  let birthDate: Date | null = null;
  if (meta.birthDate) {
    const d = new Date(meta.birthDate);
    if (!Number.isNaN(d.getTime())) birthDate = d;
  }

  let user;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      user = await prisma.user.create({
        data: {
          name: input.name,
          email,
          phone: input.phone,
          password: input.passwordHash,
          publicCode: generatePublicCode(),
          emailVerified: now,
          phoneVerified: now,
          birthDate,
          privacyAcceptedAt: now,
          privacyFirstAcceptedAt: now,
          privacyRefusedAt: null,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
          cookiesAcceptedAt: now,
          cookiesPolicyVersion: COOKIES_POLICY_VERSION,
          rulesAcceptedAt: now,
          rulesPolicyVersion: RULES_POLICY_VERSION,
          privacySignature: buildConsentSignature({
            email,
            kind: "privacy",
            version: PRIVACY_POLICY_VERSION,
            at: now,
          }),
          cookiesSignature: buildConsentSignature({
            email,
            kind: "cookies",
            version: COOKIES_POLICY_VERSION,
            at: now,
          }),
          rulesSignature: buildConsentSignature({
            email,
            kind: "rules",
            version: RULES_POLICY_VERSION,
            at: now,
          }),
        },
      });
      break;
    } catch (e: any) {
      if (e?.code === "P2002" && attempt < 7) continue;
      throw e;
    }
  }
  if (!user) {
    throw new Error("Не удалось создать пользователя");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      privacySignature: buildConsentSignature({
        userId: user.id,
        email,
        kind: "privacy",
        version: PRIVACY_POLICY_VERSION,
        at: now,
      }),
      cookiesSignature: buildConsentSignature({
        userId: user.id,
        email,
        kind: "cookies",
        version: COOKIES_POLICY_VERSION,
        at: now,
      }),
      rulesSignature: buildConsentSignature({
        userId: user.id,
        email,
        kind: "rules",
        version: RULES_POLICY_VERSION,
        at: now,
      }),
    },
  });

  await unlockAchievement(user.id, "FIRST_STEPS").catch(() => null);
  await unlockAchievement(user.id, "PRIVACY_OK").catch(() => null);
  await unlockAchievement(user.id, "RULES_OK").catch(() => null);
  void ensureReferralCode(user.id).catch(() => null);
  void attributeReferralOnSignup({
    refereeId: user.id,
    code: meta.referralCode,
    ip: meta.signupIp || input.ip || null,
    fingerprint: meta.fingerprint,
  }).catch((e) => console.error("referral attribute", e));

  return user;
}

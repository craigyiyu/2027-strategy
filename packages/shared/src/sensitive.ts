/**
 * Sensitive-input pattern library — shared by client (pre-check) and server
 * (authoritative gate before LLM submission). Covers SEC-01/FR-011 and
 * Persona F synthetic strings. Patterns are intentionally conservative:
 * false "warning" is better than a false "blocked".
 */
import type { SensitivityCategory, SensitivityState } from './constants';

export interface SensitiveMatch {
  category: SensitivityCategory;
  state: SensitivityState;
  /** matched substring (may be partial) — for client-side highlighting only */
  fragment: string | null;
}

/** High-severity: hard block before any LLM call. */
const BLOCKED_PATTERNS: Array<{ category: SensitivityCategory; re: RegExp }> = [
  // OpenAI-style keys: sk-...
  { category: 'credential', re: /\bsk-[A-Za-z0-9_-]{12,}\b/g },
  // generic bearer tokens
  { category: 'credential', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi },
  // AWS access key id
  { category: 'credential', re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g },
  // private key armor
  { category: 'credential', re: /-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/gi },
  // password-ish: "password=" / "passwd" / "pwd" followed by value
  { category: 'credential', re: /\b(?:password|passwd|pwd|secret)\s*[=:]\s*[^\s,;]{4,}\b/gi },
  // GitHub fine-grained / PAT hints
  { category: 'credential', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  // high-entropy bare token: word-boundary token mixing letters+digits+symbol,
  // length >= 12, containing at least one of !@#$%^&* and one digit (password-like)
  {
    category: 'credential',
    re: /\b(?=[A-Za-z0-9!@#$%^&*._-]{12,64}\b)(?=.*[0-9])(?=.*[!@#$%^&*])(?=.*[A-Za-z])[A-Za-z0-9!@#$%^&*._-]+\b/g,
  },
];

/** Warning: request edit/abstraction before processing. */
const WARN_PATTERNS: Array<{ category: SensitivityCategory; re: RegExp }> = [
  // passport / identity-like numbers (synthetic Persona F: passport X0000000)
  {
    category: 'personal_data',
    re: /\b(passport|passport\s*no\.?|证件号)\s*[:\s]?[A-Z0-9]{5,}\b/gi,
  },
  // id card patterns (CN 18-digit)
  { category: 'personal_data', re: /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g },
  // generic card-like numbers (12-19 digits, lumped) — conservative
  { category: 'personal_data', re: /\b(?:\d[ -]?){13,19}\b/g },
  // guest record keywords near identifiers
  {
    category: 'personal_data',
    re: /\b(guest|guest\s*record|room)\s*[:#]?\s*[A-Z0-9]{3,}\b/gi,
  },
  // email+pass pairs and phone numbers are not blocked but personal_data only when combined with identity words
  // security detail: endpoints/paths with vulnerability context words
  {
    category: 'security_detail',
    re: /\b(unauthenticated|vulnerab\w+|exploit|CVE-\d{4}-\d{4,7})\b/gi,
  },
  // confidential financial: unpublished figures with strong context
  {
    category: 'confidential_financial',
    re: /\b(undisclosed|unpublished|confidential)\s+(financial|revenue|earnings|EBITDA)\b/gi,
  },
];

export function scanSensitive(text: string): {
  state: SensitivityState;
  category: SensitivityCategory;
  fragment: string | null;
  matches: SensitiveMatch[];
} {
  const matches: SensitiveMatch[] = [];
  for (const { category, re } of BLOCKED_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      matches.push({ category, state: 'blocked', fragment: m[0] });
      return {
        state: 'blocked',
        category,
        fragment: m[0],
        matches: [{ category, state: 'blocked', fragment: m[0] }],
      };
    }
  }
  for (const { category, re } of WARN_PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) {
      matches.push({ category, state: 'warning', fragment: m[0] });
      // collect first warning, continue to find the most severe (none blocked) — keep first
      if (matches.length === 1) {
        // keep scanning for blocked already done; report first warning
      }
    }
  }
  if (matches.length > 0) {
    const first = matches[0]!;
    return { state: 'warning', category: first.category, fragment: first.fragment, matches };
  }
  return { state: 'clear', category: 'none', fragment: null, matches };
}

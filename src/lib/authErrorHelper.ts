/**
 * Formats authentication and credential errors into clean, professional customer-facing messages.
 * Prevents internal backend identifiers (like 'Firebase', 'auth/*', etc.) from ever being exposed to customers or users.
 */
export function getCleanAuthErrorMessage(error: any): string {
  if (!error) {
    return 'An error occurred during authentication. Please try again.';
  }

  const code: string = (error.code || '').toLowerCase();
  const rawMsg: string = (error.message || '').toString();
  const msgLower: string = rawMsg.toLowerCase();

  // 1. Wrong Password or Invalid Credentials
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    msgLower.includes('invalid-credential') ||
    msgLower.includes('wrong-password') ||
    msgLower.includes('invalid credential') ||
    msgLower.includes('wrong password')
  ) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }

  // 2. User Not Found
  if (
    code.includes('user-not-found') ||
    msgLower.includes('user-not-found') ||
    msgLower.includes('user not found')
  ) {
    return 'No account found with this email. Please check your email address or create an account.';
  }

  // 3. Invalid Email Format
  if (
    code.includes('invalid-email') ||
    msgLower.includes('invalid-email') ||
    msgLower.includes('badly formatted')
  ) {
    return 'Please enter a valid email address.';
  }

  // 4. Email Already in Use (Registration)
  if (
    code.includes('email-already-in-use') ||
    msgLower.includes('email-already-in-use') ||
    msgLower.includes('already in use')
  ) {
    return 'This email address is already registered. Please sign in instead.';
  }

  // 5. Weak Password (Registration)
  if (
    code.includes('weak-password') ||
    msgLower.includes('weak-password') ||
    msgLower.includes('at least 6 characters')
  ) {
    return 'Password is too short. Please use at least 6 characters.';
  }

  // 6. Too Many Requests / Rate Limited
  if (
    code.includes('too-many-requests') ||
    msgLower.includes('too-many-requests') ||
    msgLower.includes('blocked all requests')
  ) {
    return 'Too many failed login attempts. Please wait a few moments before trying again.';
  }

  // 7. Account Disabled
  if (
    code.includes('user-disabled') ||
    msgLower.includes('user-disabled')
  ) {
    return 'This account has been suspended or disabled. Please contact customer support.';
  }

  // 8. Network Connection Failure
  if (
    code.includes('network-request-failed') ||
    msgLower.includes('network-request-failed') ||
    msgLower.includes('network error')
  ) {
    return 'Network connection issue. Please check your internet connection and try again.';
  }

  // 9. Generic cleanup: Strip any 'Firebase: Error' and '(auth/...)' tokens
  let cleaned = rawMsg
    .replace(/Firebase:?\s*/gi, '')
    .replace(/Error\s*\((auth\/[a-zA-Z0-9_-]+)\):?/gi, '')
    .replace(/\(auth\/[a-zA-Z0-9_-]+\)/gi, '')
    .trim();

  // If the word "firebase" still exists anywhere, replace with friendly default
  if (!cleaned || cleaned.toLowerCase().includes('firebase')) {
    return 'Incorrect email or password. Please verify your login details and try again.';
  }

  return cleaned;
}

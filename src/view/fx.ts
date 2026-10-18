/**
 * Randomness for looks only: coin spray, paint mist, sound noise. Nothing
 * here touches an outcome; the game server decides every result.
 */
export function fx(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

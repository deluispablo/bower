/**
 * The runner's providers (stub).
 */
export type ProviderName = 'scripted';

export function providerNamed(_name: string | undefined): ProviderName {
  return 'scripted';
}

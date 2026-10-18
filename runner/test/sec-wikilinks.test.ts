import { it } from 'vitest';
import { boundedWikilinks, FAMILIES, SIZES } from '../../testing/wikilink-worker';

for (const unit of FAMILIES) {
  it(`sec-wikilinks-runner-profile-responsive discovery ${JSON.stringify(unit)} 4096`, async () => {
    await boundedWikilinks('discovery', unit, 4096 - '\n[[CV]]'.length);
  }, 30000);
  for (const size of SIZES) {
    it(`sec-wikilinks-runner-profile-responsive selected ${JSON.stringify(unit)} ${size}`, async () => {
      await boundedWikilinks('selected', unit, size);
    }, 30000);
  }
}

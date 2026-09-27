import { reactPreset } from '@kekkai/blueprint';

export default reactPreset({
  name: 'shoal-app',
  modules: [
    { name: 'action', does: 'Compute and package the Reviewer Summary Marketplace Action source.', dependsOn: ['protocol'] },
    { name: 'app', does: 'Compose Astro routes, layouts, and page metadata.', dependsOn: ['guide'] },
    { name: 'guide', does: 'Explain Shoal endorsements and guide reviewers through joining the network.' },
    { name: 'protocol', does: 'Own Shoal protocol parsing, validation, schemas, and versioned contracts.' },
  ],
  emit: { agents: ['agents'] },
});
